"use strict";

/**
 * NSIS installer QA: install -> run -> open a vault -> uninstall -> verify the
 * vault survives.
 *
 * Verifies the x64 installer actually installs, the installed program runs and
 * can open a real vault, customInstall's per-user registry entries land, the
 * uninstaller is produced and removes the program and its own registry keys,
 * and — the point of the exercise — uninstalling does NOT destroy the user's
 * sealed data (nsis.deleteAppDataOnUninstall is false, and an encryption tool
 * must never wipe a vault as a side effect of removing the program).
 *
 * Safety model, learned the hard way on the first version of this harness:
 * the app's userData directory is NOT derived from the product name. Electron
 * used %APPDATA%\knouxcrypt (package.json "name"), while productName is
 * "KnouxCrypt™ 2025", and the uninstaller is "Uninstall <shortcut>.exe" rather
 * than "Uninstall.exe". Hard-coding either path risked both a false verdict and
 * operating on real user data. So the harness instead:
 *   - snapshots %APPDATA% and REFUSES to run if any existing directory already
 *     contains a vault-enrollment.json (that would be somebody's real vault);
 *   - discovers the directory the app actually created by diffing afterwards;
 *   - finds the uninstaller by pattern.
 *
 * Run: node scripts/qa-windows-installer.cjs [--cleanup]
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const INSTALL_DIR = process.env.KNOUX_QA_INSTALL || path.join("D:\\Temp", "KnouxCrypt-QA-install");
const PORT = 9224;
const PASSWORD = "QA-installer-2026-passphrase";
const APPDATA = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");

const results = [];
let failures = 0;

function check(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  [${String(detail).slice(0, 200)}]` : ""}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findInstaller() {
  if (!fs.existsSync(DIST)) return null;
  const f = fs.readdirSync(DIST).find((n) => /Setup-.*\.exe$/i.test(n) && !/__uninstaller/.test(n));
  return f ? path.join(DIST, f) : null;
}

/** Every %APPDATA% subdirectory that currently holds a vault enrollment record. */
function vaultDirs() {
  const hits = [];
  let entries = [];
  try { entries = fs.readdirSync(APPDATA, { withFileTypes: true }); } catch { return hits; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const p = path.join(APPDATA, e.name);
    if (fs.existsSync(path.join(p, "vault-enrollment.json"))) hits.push(p);
    // Also catch a vault-store without a record, which would still be real data.
    else if (fs.existsSync(path.join(p, "vault-store"))) hits.push(p);
  }
  return hits;
}

function appDataSnapshot() {
  try { return new Set(fs.readdirSync(APPDATA)); } catch { return new Set(); }
}

function killPid(pid) {
  try { cp.execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { encoding: "utf8" }); return true; }
  catch { return false; }
}

function regQuery(key) {
  try { return cp.execFileSync("reg", ["query", key], { encoding: "utf8" }); } catch { return null; }
}

function httpJson(url) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), 6000);
    fetch(url).then((r) => r.json()).then((j) => { clearTimeout(t); resolve(j); }).catch((e) => { clearTimeout(t); reject(e); });
  });
}

async function waitForCdp(matcher, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const list = await httpJson(`http://127.0.0.1:${PORT}/json`);
      const hit = list.find(matcher);
      if (hit) return hit;
    } catch { /* not listening yet */ }
    await sleep(400);
  }
  return null;
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let seq = 0;
    ws.addEventListener("open", () =>
      resolve({
        ws,
        send(method, params = {}) {
          return new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
        },
      }),
    );
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const { res, rej } = pending.get(m.id);
        pending.delete(m.id);
        if (m.error) rej(new Error(m.error.message)); else res(m.result);
      }
    });
    ws.addEventListener("error", () => reject(new Error("websocket error")));
    setTimeout(() => reject(new Error("websocket open timeout")), 15000);
  });
}

(async () => {
  const installer = findInstaller();
  console.log("\nKnouxCrypt NSIS installer QA");
  console.log(`  installer   : ${installer}`);
  console.log(`  install dir : ${INSTALL_DIR}`);
  console.log(`  %APPDATA%   : ${APPDATA}`);
  if (!installer) { console.error("No Setup .exe in dist/. Build it first."); process.exit(2); }

  // ---- hard safety gate: never operate near a real vault ----
  const preExisting = vaultDirs();
  check("no pre-existing vault anywhere in %APPDATA%", preExisting.length === 0, preExisting.join(", ") || "none");
  if (preExisting.length) {
    console.error("\nAborting: %APPDATA% already contains vault data. This harness must not touch it.");
    process.exit(3);
  }
  const beforeNames = appDataSnapshot();

  fs.rmSync(INSTALL_DIR, { recursive: true, force: true });

  // ---------------------------------------------------------------- install
  console.log("\n[1] silent install");
  let installError = null;
  try {
    // NSIS requires /D to be the final parameter and unquoted.
    cp.execFileSync(installer, ["/S", `/D=${INSTALL_DIR}`], { encoding: "utf8", timeout: 420000 });
  } catch (e) {
    installError = `${e.code || e.status || ""} ${String(e.message).slice(0, 100)}`.trim();
  }

  const listInstalled = () => (fs.existsSync(INSTALL_DIR) ? fs.readdirSync(INSTALL_DIR) : []);
  for (let i = 0; i < 90; i++) {
    const items = listInstalled();
    if (items.some((n) => /^Uninstall .*\.exe$/i.test(n)) && items.some((n) => /\.exe$/i.test(n) && !/^Uninstall /i.test(n))) break;
    await sleep(1000);
  }
  const items = listInstalled();
  const appExe = items.find((n) => /\.exe$/i.test(n) && !/^Uninstall /i.test(n));
  const uninstallExe = items.find((n) => /^Uninstall .*\.exe$/i.test(n));
  check("installer produced the application executable", Boolean(appExe), appExe || `none of ${items.length} entries (${installError || "no error"})`);
  check("installer produced an uninstaller", Boolean(uninstallExe), uninstallExe || "MISSING");
  check("installer shipped resources/app.asar", fs.existsSync(path.join(INSTALL_DIR, "resources", "app.asar")), "");
  check("install tree is complete", items.length >= 15, `${items.length} entries`);

  const regInstall = regQuery("HKCU\\Software\\KnouxTechnologies\\KnouxCrypt2025");
  check("customInstall wrote the per-user registry key", Boolean(regInstall) && /InstallPath/.test(regInstall), regInstall ? "present" : "absent");
  const regProtocol = regQuery("HKCU\\Software\\Classes\\knouxcrypt");
  check("customInstall registered the knouxcrypt:// handler", Boolean(regProtocol) && /URL:KnouxCrypt/.test(regProtocol), "");
  check("registry recorded the version from the build", Boolean(regInstall) && regInstall.includes("2025.1.0"), "");

  const startMenu = path.join(APPDATA, "Microsoft", "Windows", "Start Menu", "Programs");
  const findShortcuts = () => {
    const hits = [];
    const walk = (dir) => {
      let ents = [];
      try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/knoux/i.test(e.name) && /\.lnk$/i.test(e.name)) hits.push(p);
      }
    };
    walk(startMenu);
    return hits;
  };
  const shortcutsBefore = findShortcuts();
  check("a start-menu shortcut was created", shortcutsBefore.length > 0, shortcutsBefore[0] || "none");

  // --------------------------------------------------- run the INSTALLED app
  console.log("\n[2] run the installed program and open a real vault");
  const installedExePath = appExe ? path.join(INSTALL_DIR, appExe) : null;
  const app = installedExePath
    ? cp.spawn(installedExePath, [`--remote-debugging-port=${PORT}`, "--no-sandbox"], { detached: true, stdio: "ignore" })
    : null;
  if (app) app.unref();

  const page = await waitForCdp((t) => t.type === "page" && /index\.html/.test(t.url), 90000);
  check("installed app exposes a CDP target", Boolean(page), page && page.url);
  check("installed app runs from the install directory", Boolean(page) && page.url.includes(INSTALL_DIR.replace(/\\/g, "/")), page && page.url);

  let enrollmentBytes = null;
  let dataDir = null;
  let storeBefore = null;

  if (page) {
    const cdp = await connect(page.webSocketDebuggerUrl);
    await cdp.send("Runtime.enable");
    // A CDP target existing does not mean React has mounted. The first version
    // of this check raced it and reported "renderer not mounted" against a
    // perfectly healthy app, so wait for the tree instead of guessing a delay.
    let mounted = false;
    const mountDeadline = Date.now() + 30000;
    while (!mounted && Date.now() < mountDeadline) {
      const probe = await cdp.send("Runtime.evaluate", {
        expression: "Boolean(document.querySelector('#root') && document.querySelector('#root').children.length)",
        returnByValue: true,
      });
      mounted = probe.result.value === true;
      if (!mounted) await sleep(500);
    }
    const res = await cdp.send("Runtime.evaluate", {
      expression: `(async () => {
        const api = window.electronAPI;
        const call = async (p) => { try { const r = await p; return r && r.ok ? { ok: true, data: r.data } : { ok: false, code: r && r.error && r.error.code }; } catch (e) { return { ok: false, code: 'THREW', message: String(e.message) }; } };
        const st = await call(api.vault.status());
        const en = (st.data && st.data.enrolled) ? await call(api.vault.unlock('${PASSWORD}')) : await call(api.vault.enroll('${PASSWORD}', { iterations: 120000 }));
        const sid = en.ok && en.data ? en.data.sessionId : null;
        let notes = 0;
        if (sid) {
          await call(api.vault.storePut(sid, 'notes', { id: 'installer-note', title: 'from installed app', body: 'must survive uninstall', category: 'Work', pinned: false, updated: 'now' }));
          const list = await call(api.vault.storeList(sid, 'notes'));
          notes = list && list.ok && list.data ? list.data.records.length : 0;
        }
        return { mounted: Boolean(document.querySelector('#root') && document.querySelector('#root').children.length), lang: document.documentElement.lang, dir: document.documentElement.dir, sid: Boolean(sid), enrollCode: en.code || null, notes };
      })()`,
      returnByValue: true,
      awaitPromise: true,
    });
    const info = res.result.value || {};
    check("installed renderer mounted", mounted === true, `lang=${info.lang}/${info.dir}`);
    check("installed app opens a vault over real IPC", info.sid === true, info.enrollCode || "");
    check("installed app writes the encrypted store", info.notes >= 1, `notes=${info.notes}`);

    // Discover where the app actually put its data.
    for (let i = 0; i < 40 && !dataDir; i++) {
      const nowNames = appDataSnapshot();
      const fresh = [...nowNames].filter((n) => !beforeNames.has(n));
      for (const n of fresh) {
        const p = path.join(APPDATA, n);
        if (fs.existsSync(path.join(p, "vault-enrollment.json")) || fs.existsSync(path.join(p, "vault-store"))) { dataDir = p; break; }
      }
      if (!dataDir && fresh.length === 0) {
        // The directory may have pre-existed as a plain Electron profile; look
        // for a vault record created in the last minute instead.
        for (const p of vaultDirs()) dataDir = p;
      }
      if (!dataDir) await sleep(500);
    }
    check("the installed app created vault data under %APPDATA%", Boolean(dataDir), dataDir || "not found");
    cdp.ws.close();
  }

  if (dataDir) {
    const enrollmentPath = path.join(dataDir, "vault-enrollment.json");
    const storePath = path.join(dataDir, "vault-store", "notes.knx");
    enrollmentBytes = fs.existsSync(enrollmentPath) ? fs.readFileSync(enrollmentPath) : null;
    storeBefore = fs.existsSync(storePath) ? fs.readFileSync(storePath) : null;
    check("enrollment record was written", Boolean(enrollmentBytes) && enrollmentBytes.length > 100, `${enrollmentBytes ? enrollmentBytes.length : 0} bytes`);
    check("sealed store was written", Boolean(storeBefore) && storeBefore.length > 50, `${storeBefore ? storeBefore.length : 0} bytes`);
    const dirListingBefore = fs.readdirSync(dataDir).sort().join(",");
    console.log(`      userData dir: ${dataDir}\n      contents    : ${dirListingBefore.slice(0, 160)}`);
  }

  killPid(app && app.pid);
  await sleep(3000);

  // ---------------------------------------------------------------- uninstall
  console.log("\n[3] silent uninstall");
  const uninstallerPath = uninstallExe ? path.join(INSTALL_DIR, uninstallExe) : null;
  if (!uninstallerPath) {
    check("uninstaller available to run", false, "no uninstaller was produced by the installer");
  } else {
    let uninstallError = null;
    try {
      // The uninstaller copies itself to %TEMP% and detaches, so a non-zero or
      // thrown result here is worth keeping rather than discarding: on the run
      // that found the blocking confirmation dialog, this error was the only
      // evidence of why nothing had been removed.
      cp.execFileSync(uninstallerPath, ["/S"], { encoding: "utf8", timeout: 180000 });
    } catch (e) {
      uninstallError = `${e.code || e.status || ""} ${String(e.message).slice(0, 140)}`.trim();
    }
    for (let i = 0; i < 90; i++) {
      if (!fs.existsSync(path.join(INSTALL_DIR, appExe))) break;
      await sleep(1000);
    }
    console.log(`      uninstaller result: ${uninstallError || "returned cleanly"}`);
    const remaining = listInstalled();
    check("uninstall removed the application executable", !remaining.includes(appExe), remaining.includes(appExe) ? "STILL PRESENT" : "gone");
    check("uninstall removed app.asar", !fs.existsSync(path.join(INSTALL_DIR, "resources", "app.asar")), "");
    check("uninstall removed the uninstaller", !remaining.includes(uninstallExe), "");
    check("customUnInstall removed the registry key", regQuery("HKCU\\Software\\KnouxTechnologies\\KnouxCrypt2025") === null, regQuery("HKCU\\Software\\KnouxTechnologies\\KnouxCrypt2025") ? "STILL PRESENT" : "gone");
    check("customUnInstall removed the protocol handler", regQuery("HKCU\\Software\\Classes\\knouxcrypt") === null, "");
    const shortcutsAfter = findShortcuts();
    check("uninstall removed the start-menu shortcut", shortcutsAfter.length === 0, shortcutsAfter.join(",") || "none left");

    // ---- the point of the whole exercise ----
    check("VAULT DATA SURVIVED the uninstall", Boolean(dataDir) && fs.existsSync(path.join(dataDir, "vault-enrollment.json")), dataDir || "no dir");
    if (enrollmentBytes && dataDir) {
      const after = fs.existsSync(path.join(dataDir, "vault-enrollment.json")) ? fs.readFileSync(path.join(dataDir, "vault-enrollment.json")) : null;
      check("the enrollment record is byte-identical after uninstall", Boolean(after) && after.equals(enrollmentBytes), "");
    }
    if (storeBefore && dataDir) {
      const afterStore = fs.existsSync(path.join(dataDir, "vault-store", "notes.knx")) ? fs.readFileSync(path.join(dataDir, "vault-store", "notes.knx")) : null;
      check("the sealed store is byte-identical after uninstall", Boolean(afterStore) && afterStore.equals(storeBefore), "");
    }

    // The vault must still be openable by the (now uninstalled) program's data,
    // i.e. the record is intact and still confined to its owner.
    if (dataDir) {
      const acl = require(path.join(ROOT, "electron/vault/acl"));
      const v = await acl.isProtected(path.join(dataDir, "vault-enrollment.json"), { exhaustive: true });
      check("surviving enrollment is still confined to its owner", v.ok, v.detail);
    }
  }

  console.log(`\n  QA data dir kept for inspection: ${dataDir || "(none)"}`);
  console.log(`  QA install dir: ${INSTALL_DIR}`);
  if (process.argv.includes("--cleanup")) {
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(INSTALL_DIR, { recursive: true, force: true });
    check("--cleanup removed the vault this test created", !dataDir || !fs.existsSync(dataDir), "");
  } else if (dataDir) {
    console.log("  re-run with --cleanup to remove the vault this test created");
  }

  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} installer checks passed`);
  process.exit(bad.length ? 1 : 0);
})().catch((err) => {
  console.error("\nHARNESS ERROR:", err && err.stack ? err.stack.slice(0, 1200) : String(err));
  process.exit(1);
});
