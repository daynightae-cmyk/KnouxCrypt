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
const crypto = require("crypto");
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
  // A real self-signed certificate for the certificate-inspector probe.
  let hasCert = false;
  try {
    const { execFileSync } = require("node:child_process");
    const keyFile = path.join(dir, "probe-key.pem");
    const certFile = path.join(dir, "probe-cert.pem");
    const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    fs.writeFileSync(keyFile, privateKey.export({ type: "pkcs8", format: "pem" }));
    execFileSync("openssl", [
      "req", "-x509", "-new", "-key", keyFile, "-out", certFile,
      "-not_before", "20200101000000Z", "-not_after", "20400101000000Z",
      "-subj", "/CN=runtime.knoux.test",
      "-addext", "subjectAltName=DNS:runtime.knoux.test",
    ], { stdio: "pipe" });
    hasCert = fs.existsSync(certFile);
  } catch {
    hasCert = false;
  }
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
      // Encrypted record store over the real IPC boundary (notes + credentials).
      out.storeEmpty = await api.vault.storeList(enr.data.sessionId, "notes");
      out.storePut = await api.vault.storePut(enr.data.sessionId, "notes", {
        id: "runtime-note",
        title: "Runtime note",
        body: "secret body text",
        category: "Work",
      });
      out.storePut2 = await api.vault.storePut(enr.data.sessionId, "passwords", {
        id: "runtime-cred",
        title: "Runtime credential",
        username: "runtime@example.invalid",
        password: "Public-Demo-Only!23",
      });
      const listed = await api.vault.storeList(enr.data.sessionId, "notes");
      out.storeCount = listed.data?.records?.length;
      out.storeRoundTrip = listed.data?.records?.[0]?.body;
      out.storeUnknown = (await api.vault.storeList(enr.data.sessionId, "nope")).error?.code;
      out.storeRemove = await api.vault.storeRemove(enr.data.sessionId, "notes", "runtime-note");
      out.storeAfterRemove = (await api.vault.storeList(enr.data.sessionId, "notes")).data?.records?.length;
      const guestStore = await api.vault.storePut(guest.data.sessionId, "notes", { id: "x" });
      out.guestStoreDenied = guestStore.error?.code;
      // Authenticator and Key Forge over the same live bridge.
      out.authAdd = await api.vault.authAdd(enr.data.sessionId, {
        name: "Runtime account",
        issuer: "Knoux",
        secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
      });
      const authListed = await api.vault.authList(enr.data.sessionId);
      out.authCount = authListed.data?.accounts?.length;
      out.authSecretLeaked = /GEZDGNBV/.test(JSON.stringify(authListed));
      const code = await api.vault.authCode(enr.data.sessionId, out.authAdd.data.id);
      out.authCode = code.data?.code;
      out.authCodeShape = /^[0-9]{6}$/.test(code.data?.code || "");
      out.authRemoved = (await api.vault.authRemove(enr.data.sessionId, out.authAdd.data.id)).data?.removed;
      out.keyMade = await api.vault.keyGenerate(enr.data.sessionId, { algorithm: "ED25519", name: "Runtime key" });
      const keyListed = await api.vault.keyList(enr.data.sessionId);
      out.keyCount = keyListed.data?.keys?.length;
      out.keyPrivateLeaked = /PRIVATE KEY/.test(JSON.stringify(keyListed));
      out.keyExportDenied = (await api.vault.keyExportPrivate(enr.data.sessionId, out.keyMade.data.id, {})).error?.code;
      out.keyExportAllowed = (await api.vault.keyExportPrivate(enr.data.sessionId, out.keyMade.data.id, { confirm: true })).ok;
      out.guestAuthDenied = (await api.vault.authList(guest.data.sessionId)).error?.code;
      out.guestKeyDenied = (await api.vault.keyList(guest.data.sessionId)).error?.code;
      // Batch 05 (tasks 17-20): real hashing, signatures and certificate parsing.
      out.hash = await api.vault.hashCompute({ algorithm: "SHA-256", text: "abc" });
      out.hashMatch = await api.vault.hashCompare(out.hash.data.digest, out.hash.data.digest);
      out.hashMismatch = await api.vault.hashCompare(out.hash.data.digest, "00".repeat(32));
      out.hashBadAlgo = (await api.vault.hashCompute({ algorithm: "MD5", text: "x" })).error?.code;
      const sig = await api.vault.sign(enr.data.sessionId, { keyId: out.keyMade.data.id, text: "runtime signature" });
      out.signOk = sig.ok === true;
      out.signFingerprint = sig.data?.fingerprint === out.keyMade.data.fingerprint;
      const pub = (await api.vault.keyList(enr.data.sessionId)).data.keys[0].publicPem;
      out.verifyOk = (await api.vault.signVerify(enr.data.sessionId, {
        publicPem: pub,
        algorithm: "ED25519",
        signature: sig.data.signature,
        text: "runtime signature",
      })).data?.valid;
      out.verifyTampered = (await api.vault.signVerify(enr.data.sessionId, {
        publicPem: pub,
        algorithm: "ED25519",
        signature: sig.data.signature,
        text: "runtime signature!",
      })).data?.valid;
      out.signGuest = (await api.vault.sign(guest.data.sessionId, { keyId: out.keyMade.data.id, text: "x" })).error?.code;
      out.certBad = (await api.vault.certInspect("not a certificate")).error?.code;
      if (${JSON.stringify(hasCert)}) {
        out.certInfo = await api.vault.certInspect({ inputPath: base + "/probe-cert.pem" });
      }
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
    check("an empty record store lists nothing", probe.storeEmpty?.ok === true && probe.storeEmpty?.data?.records?.length === 0);
    check("a note is written to the encrypted store over IPC", probe.storePut?.ok === true, JSON.stringify(probe.storePut?.error));
    check("a credential is written to the encrypted store over IPC", probe.storePut2?.ok === true, JSON.stringify(probe.storePut2?.error));
    check("the stored note reads back", probe.storeCount === 1 && probe.storeRoundTrip === "secret body text", `${probe.storeCount}/${probe.storeRoundTrip}`);
    // The IPC boundary validates the collection enum before the service sees it.
    check("an unknown collection is refused over IPC", probe.storeUnknown === "BAD_INPUT", String(probe.storeUnknown));
    check("a stored note can be removed over IPC", probe.storeRemove?.ok === true && probe.storeAfterRemove === 0, `${probe.storeRemove?.ok}/${probe.storeAfterRemove}`);
    check("a guest session cannot write the store", probe.guestStoreDenied === "SESSION_REQUIRED", String(probe.guestStoreDenied));
    check("no plaintext secret is left in the store file", !fs.readdirSync(dir).filter((f) => f.startsWith("store") || f.endsWith(".knvstore")).some((f) => fs.readFileSync(path.join(dir, f)).includes(Buffer.from("secret body text"))));
    check("an authenticator account is stored over IPC", probe.authAdd?.ok === true, JSON.stringify(probe.authAdd?.error));
    check("the account is listed once", probe.authCount === 1, String(probe.authCount));
    check("the authenticator secret is never returned to the renderer", probe.authSecretLeaked === false);
    check("a real TOTP code is produced", probe.authCodeShape === true, String(probe.authCode));
    check("the account can be removed over IPC", probe.authRemoved === true);
    check("a key pair is generated over IPC", probe.keyMade?.ok === true, JSON.stringify(probe.keyMade?.error));
    check("the key is listed once", probe.keyCount === 1, String(probe.keyCount));
    check("private key material is never returned to the renderer", probe.keyPrivateLeaked === false);
    check("private key export is refused without confirmation", probe.keyExportDenied === "BAD_INPUT", String(probe.keyExportDenied));
    check("private key export succeeds with confirmation", probe.keyExportAllowed === true);
    check("a guest session cannot read authenticator accounts", probe.guestAuthDenied === "SESSION_REQUIRED", String(probe.guestAuthDenied));
    check("a guest session cannot read the key store", probe.guestKeyDenied === "SESSION_REQUIRED", String(probe.guestKeyDenied));
    check("SHA-256 of \"abc\" is the published value over IPC", probe.hash?.data?.digest === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", String(probe.hash?.data?.digest));
    check("matching digests compare equal", probe.hashMatch?.data?.equal === true);
    check("different digests compare unequal", probe.hashMismatch?.data?.equal === false);
    check("a broken digest algorithm is refused", probe.hashBadAlgo === "BAD_INPUT", String(probe.hashBadAlgo));
    check("a real signature is produced over IPC", probe.signOk === true, JSON.stringify(probe.signOk));
    check("the signature reports the signing key fingerprint", probe.signFingerprint === true);
    check("the signature verifies against the public key", probe.verifyOk === true);
    check("a tampered message fails verification", probe.verifyTampered === false, String(probe.verifyTampered));
    check("a guest session cannot sign", probe.signGuest === "SESSION_REQUIRED", String(probe.signGuest));
    check("a non-certificate string is refused", probe.certBad === "BAD_INPUT", String(probe.certBad));
    if (hasCert) {
      check("a real certificate is parsed over IPC", probe.certInfo?.ok === true && /runtime\.knoux\.test/.test(probe.certInfo?.data?.subject || ""), JSON.stringify(probe.certInfo?.error || probe.certInfo?.data?.subject));
      check("the parsed certificate reports its validity window", probe.certInfo?.data?.expired === false && probe.certInfo?.data?.selfSigned === true);
    }
    check("renderer produced no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
  } catch (err) {
    check("runtime check completed without throwing", false, err.message);
  }

  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail && !r.ok ? " -> " + r.detail : ""}`);
  console.log(failed ? `FAIL: ${failed} runtime check(s) failed` : "PASS: Electron runtime vault stack verified (file:// renderer, sandboxed preload, IPC round-trip).");
  fs.rmSync(dir, { recursive: true, force: true });
  app.exit(failed ? 1 : 0);
});
