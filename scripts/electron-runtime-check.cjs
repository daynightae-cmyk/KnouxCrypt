// Real Electron runtime check for the vault stack.
//
// This is NOT a browser test and NOT a Windows EXE test. It boots the actual
// Electron main process, builds a real BrowserWindow with the real preload,
// loads the built renderer over file://, and drives the real IPC contract from
// the renderer. It proves: assets resolve, the bridge is the only renderer
// surface, and enroll/unlock/encrypt/decrypt round-trip across the boundary.
//
// Run: npx electron --no-sandbox --ozone-platform=headless scripts/electron-runtime-check.cjs
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { VaultService } = require("../electron/vault/service");
const { registerVaultIpc } = require("../electron/vault/ipc");

const root = path.resolve(__dirname, "..");
const results = [];
let failed = 0;

function check(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failed += 1;
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "knoux-runtime-"));
  const service = new VaultService({ userDataPath: dir });
  // A real source file for the file-cipher probe (binary, larger than one frame).
  const probePayload = Buffer.concat([Buffer.from("KnouxCrypt runtime file probe — مرحبا\n", "utf8"), Buffer.alloc(300000, 0xa7)]);
  fs.writeFileSync(path.join(dir, "probe-source.bin"), probePayload);
  let win;
  registerVaultIpc(service, () => win);

  win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(root, "electron/preload.js"),
    },
  });

  const consoleErrors = [];
  win.webContents.on("console-message", (_e, level, message) => {
    if (level >= 2) consoleErrors.push(message);
  });

  try {
    await win.loadFile(path.join(root, "build/index.html"));
    await new Promise((r) => setTimeout(r, 1000));

    const probe = await win.webContents.executeJavaScript(`(async () => {
      const api = window.electronAPI;
      const out = {};
      out.bridge = !!api;
      out.rawIpc = typeof api?.ipcRenderer !== "undefined" || typeof api?.require !== "undefined";
      out.mounted = !!document.querySelector("#root > *");
      out.assetScripts = [...document.querySelectorAll("script[src]")].map(s => s.getAttribute("src"));
      out.legacySupported = api?.legacy?.isSupported;
      out.status = await api.vault.status();
      const enr = await api.vault.enroll("runtime-check-password");
      out.enrollSession = enr.data?.sessionId ? "issued" : enr.error?.code;
      const enc = await api.vault.encryptText(enr.data.sessionId, "renderer round trip");
      const dec = await api.vault.decryptText(enr.data.sessionId, enc.data.container);
      out.roundTrip = dec.data?.text;
      const guest = await api.vault.startGuest();
      const denied = await api.vault.encryptText(guest.data.sessionId, "nope");
      out.guestDenied = denied.error?.code;
      // Flip one byte in the middle of the sealed container (same length) so the
      // trailing MAC and the per-chunk GCM tag both see tampered data.
      const raw = atob(enc.data.container);
      const at = Math.floor(raw.length * 0.6);
      const flipped = raw.slice(0, at) + String.fromCharCode(raw.charCodeAt(at) ^ 0xff) + raw.slice(at + 1);
      const tampered = await api.vault.decryptText(enr.data.sessionId, btoa(flipped));
      out.tamperCode = tampered.error?.code;
      const truncated = await api.vault.decryptText(enr.data.sessionId, enc.data.container.slice(0, enc.data.container.length - 8));
      out.truncatedCode = truncated.error?.code;

      // Real file operation through the IPC contract, using paths the main
      // process can actually reach (the temp dir is created by this script).
      const base = ${JSON.stringify(dir)};
      out.fileEncrypt = await api.vault.encryptFile({
        sessionId: enr.data.sessionId,
        inputPath: base + "/probe-source.bin",
        outputPath: base + "/probe.knv",
        operationId: "runtime-file-1",
      });
      out.fileDecrypt = await api.vault.decryptFile({
        sessionId: enr.data.sessionId,
        inputPath: base + "/probe.knv",
        outputPath: base + "/probe-roundtrip.bin",
        operationId: "runtime-file-2",
      });
      // Revocation must reach the renderer without a polling call.
      out.revokedEvent = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve("timeout"), 4000);
        api.vault.onRevoked((event) => {
          clearTimeout(timer);
          resolve(event?.reason || "delivered");
        });
        api.vault.lock(enr.data.sessionId, "runtime-check");
      });
      return out;
    })()`);

    check("renderer loaded and mounted", probe.mounted === true);
    check("preload bridge present", probe.bridge === true);
    check("no raw ipcRenderer/require leaked", probe.rawIpc === false);
    check("file:// assets resolve relatively", probe.assetScripts.every((s) => s && !s.startsWith("/assets/")), probe.assetScripts.join(","));
    check("legacy disk surface fails closed", probe.legacySupported === false);
    check("vault status reachable from renderer", probe.status?.ok === true);
    check("enroll issues a session", probe.enrollSession === "issued", String(probe.enrollSession));
    check("text round-trips across IPC", probe.roundTrip === "renderer round trip", String(probe.roundTrip));
    check("guest session is refused privileged work", probe.guestDenied === "SESSION_REQUIRED", String(probe.guestDenied));
    check("tampered ciphertext is rejected", probe.tamperCode === "INTEGRITY_FAILED", String(probe.tamperCode));
    check("truncated container is rejected", probe.truncatedCode === "TRUNCATED", String(probe.truncatedCode));
    check("file encryption succeeds across IPC", probe.fileEncrypt?.ok === true, JSON.stringify(probe.fileEncrypt?.error));
    check("file decryption succeeds across IPC", probe.fileDecrypt?.ok === true, JSON.stringify(probe.fileDecrypt?.error));
    check(
      "the decrypted file matches the source byte for byte",
      fs.existsSync(path.join(dir, "probe-roundtrip.bin")) &&
        fs.readFileSync(path.join(dir, "probe-roundtrip.bin")).equals(fs.readFileSync(path.join(dir, "probe-source.bin"))),
    );
    check("the source file is preserved", fs.existsSync(path.join(dir, "probe-source.bin")));
    check("session revocation reaches the renderer", probe.revokedEvent === "runtime-check", String(probe.revokedEvent));
    check("renderer produced no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
  } catch (err) {
    check("runtime check completed without throwing", false, err.message);
  }

  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail && !r.ok ? " -> " + r.detail : ""}`);
  console.log(failed ? `FAIL: ${failed} runtime check(s) failed` : "PASS: Electron runtime vault stack verified (file:// renderer, sandboxed preload, IPC round-trip).");
  fs.rmSync(dir, { recursive: true, force: true });
  app.exit(failed ? 1 : 0);
});
