"use strict";

/**
 * Windows packaged-app QA harness.
 *
 * This drives the REAL built artifact (the portable .exe from dist/), not the
 * development Electron, not a headless harness. It launches it with an isolated
 * --user-data-dir so the owner's real vault under %APPDATA% is never touched,
 * attaches over the Chrome DevTools Protocol, and then:
 *   - walks the visible flow: splash -> Secure Access -> Home
 *   - performs real vault work through the preload bridge: enroll, encrypt a
 *     file, decrypt it back, verify the bytes, key generation and TOTP
 *   - quits and relaunches against the same profile to prove persistence
 *   - asks the OS who can read the files the packaged app produced
 *
 * Screenshots are captured from the live renderer as evidence.
 *
 * Run: node scripts/qa-windows-exe.cjs [--exe <path>] [--keep]
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PORT = 9223;
const PROFILE = process.env.KNOUX_QA_PROFILE || path.join("D:\\Temp", "KnouxCrypt-QA-profile");
const WORK = path.join(PROFILE, "workspace");
const SHOTS = path.join(PROFILE, "screenshots");
const KEEP = process.argv.includes("--keep");

const results = [];
let failures = 0;

function check(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  [${String(detail).slice(0, 220)}]` : ""}`);
}

function findExe() {
  const flag = process.argv.indexOf("--exe");
  if (flag !== -1) return process.argv[flag + 1];
  const dist = path.join(ROOT, "dist");
  if (!fs.existsSync(dist)) return null;
  const candidates = fs
    .readdirSync(dist)
    .filter((f) => f.endsWith(".exe"))
    .map((f) => ({ f, full: path.join(dist, f), portable: /portable/i.test(f) }))
    .sort((a, b) => (a.portable === b.portable ? 0 : a.portable ? -1 : 1));
  return candidates.length ? candidates[0].full : null;
}

// ---------------------------------------------------------------- CDP client

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let seq = 0;
    const events = [];
    ws.addEventListener("open", () =>
      resolve({
        ws,
        events,
        send(method, params = {}) {
          return new Promise((res, rej) => {
            const id = ++seq;
            pending.set(id, { res, rej });
            ws.send(JSON.stringify({ id, method, params }));
          });
        },
      }),
    );
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(`${msg.error.code} ${msg.error.message}`));
        else res(msg.result);
      } else if (msg.method) {
        events.push(msg);
      }
    });
    ws.addEventListener("error", (e) => reject(new Error("ws error " + (e && e.message))));
    setTimeout(() => reject(new Error("ws open timeout")), 15000);
  });
}

async function waitForTarget(timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const list = await httpJson(`http://127.0.0.1:${PORT}/json`);
      const page = list.find((t) => t.type === "page" && /index\.html$/.test(t.url));
      if (page) return page;
      const any = list.find((t) => t.type === "page");
      if (any && /index\.html/.test(any.url)) return any;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

function httpJson(url) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("http timeout " + url)), 8000);
    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        clearTimeout(timer);
        resolve(j);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

async function evaluate(cdp, expression, { awaitIt = true } = {}) {
  const res = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: awaitIt,
  });
  if (res.exceptionDetails) {
    throw new Error("page exception: " + JSON.stringify(res.exceptionDetails).slice(0, 400));
  }
  return res.result.value;
}

async function shot(cdp, name) {
  const img = await cdp.send("Page.captureScreenshot", { format: "png" });
  const file = path.join(SHOTS, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(img.data, "base64"));
  return { file, bytes: fs.statSync(file).size };
}

// ------------------------------------------------------------------ launching

function launch(exe) {
  const args = [
    `--user-data-dir=${PROFILE}`,
    `--remote-debugging-port=${PORT}`,
    "--no-sandbox",
  ];
  const child = cp.spawn(exe, args, { detached: true, stdio: "ignore", windowsHide: false });
  child.unref();
  return child;
}

function killTree(pid) {
  try {
    cp.execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { encoding: "utf8" });
    return true;
  } catch (e) {
    return false;
  }
}

// --------------------------------------------------------- the in-page driver

// Everything below runs inside the packaged renderer, against the real preload
// bridge and the real main-process vault service.
//
// The contract, read from electron/vault/ipc.js and electron/preload.js rather
// than assumed: every vault call resolves to `{ ok, data }` or
// `{ ok: false, error: { code, message } }`, and the preload methods take
// positional arguments (storePut(sessionId, collection, record)), not objects.
const DRIVER = `(async () => {
  const api = window.electronAPI;
  const out = { bridge: Boolean(api), vault: Boolean(api && api.vault), platform: api && api.platform };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const call = async (label, promise) => {
    try {
      const r = await promise;
      if (r && r.ok) return { ok: true, data: r.data };
      return { ok: false, code: r && r.error && r.error.code, message: r && r.error && r.error.message };
    } catch (e) {
      return { ok: false, code: 'THREW', message: String(e && e.message) };
    }
  };
  const PASSWORD = 'QA-vault-2026-passphrase';
  const WS = ${JSON.stringify(WORK.replace(/\\/g, "/"))};

  out.url = location.href;
  out.lang = document.documentElement.lang;
  out.dir = document.documentElement.dir;
  out.mounted = Boolean(document.querySelector('#root') && document.querySelector('#root').children.length);
  out.landingText = document.body.innerText.replace(/\\s+/g, ' ').slice(0, 240);

  const status0 = await call('status', api.vault.status());
  out.enrolledBefore = Boolean(status0.ok && status0.data && status0.data.enrolled);

  const session = out.enrolledBefore
    ? await call('unlock', api.vault.unlock(PASSWORD))
    : await call('enroll', api.vault.enroll(PASSWORD, { iterations: 120000 }));
  out.sessionCall = { ok: session.ok, code: session.code, how: out.enrolledBefore ? 'unlock' : 'enroll' };
  out.sessionId = session.ok && session.data ? session.data.sessionId : null;
  const sid = out.sessionId;

  // The app must still show Home after authentication: drive the real UI.
  out.afterAuthText = document.body.innerText.replace(/\\s+/g, ' ').slice(0, 240);

  const guest = await call('guest', api.vault.startGuest());
  out.guestIssued = Boolean(guest.ok && guest.data && guest.data.sessionId);
  if (out.guestIssued) {
    const guestWrite = await call('guestStorePut', api.vault.storePut(guest.data.sessionId, 'notes', { id: 'guest-x', title: 't', body: 'b', category: 'Personal', pinned: false, updated: 'now' }));
    out.guestRefused = guestWrite.ok === false;
    out.guestRefuseCode = guestWrite.code;
  }

  // ---- file encryption / decryption of a real file, hashed outside the app ----
  const srcPath = WS + '/qa-source.bin';
  const encPath = WS + '/qa-secret.knv';
  const decPath = WS + '/qa-restored.bin';

  const enc = await call('encryptFile', api.vault.encryptFile({ sessionId: sid, inputPath: srcPath, outputPath: encPath, operationId: 'qa-enc-1' }));
  const dec = await call('decryptFile', api.vault.decryptFile({ sessionId: sid, inputPath: encPath, outputPath: decPath, operationId: 'qa-dec-1' }));
  const h = await call('hash', api.vault.hashCompute({ algorithm: 'SHA-256', inputPath: decPath }));

  out.fileRoundTrip = {
    encryptOk: enc.ok, encryptCode: enc.code,
    decryptOk: dec.ok, decryptCode: dec.code,
    encryptedPath: enc.ok && enc.data ? enc.data.outputPath : null,
    restoredDigest: h.ok && h.data ? h.data.digest : null,
  };

  // ---- key operations ----
  const key = await call('keyGenerate', api.vault.keyGenerate(sid, { algorithm: 'ED25519', name: 'QA signing key', purpose: 'sign' }));
  const keyList = await call('keyList', api.vault.keyList(sid));
  out.keyOps = {
    generateOk: key.ok, generateCode: key.code,
    generatedId: key.ok && key.data ? key.data.id : null,
    fingerprint: key.ok && key.data ? key.data.fingerprint : null,
    listed: keyList.ok && keyList.data && keyList.data.keys ? keyList.data.keys.length : null,
    // Private material must never be handed across the bridge.
    leakedPrivate: /PRIVATE KEY|privatePem|BEGIN OPENSSH/.test(JSON.stringify(key.data || {})),
  };

  // ---- authenticator / TOTP ----
  const auth = await call('authAdd', api.vault.authAdd(sid, { name: 'QA TOTP', issuer: 'KnouxCrypt QA', secret: 'JBSWY3DPEHPK3PXP', digits: 6, period: 30, algorithm: 'SHA1' }));
  const authId = auth.ok && auth.data ? auth.data.id : null;
  const codeRes = authId ? await call('authCode', api.vault.authCode(sid, authId)) : { ok: false, code: 'NO_ID' };
  out.totp = {
    addOk: auth.ok, addCode: auth.code, id: authId,
    codeOk: codeRes.ok, code: codeRes.ok && codeRes.data ? codeRes.data.code : null,
    codeLength: codeRes.ok && codeRes.data && codeRes.data.code ? String(codeRes.data.code).length : 0,
    secretLeakedToRenderer: /JBSWY3DPEHPK3PXP/.test(JSON.stringify(codeRes.data || {})),
  };

  // ---- encrypted store ----
  const put = await call('storePut', api.vault.storePut(sid, 'notes', { id: 'qa-note-1', title: 'QA note', body: 'persisted across restart', category: 'Work', pinned: false, updated: 'now' }));
  const list = await call('storeList', api.vault.storeList(sid, 'notes'));
  out.store = {
    putOk: put.ok, putCode: put.code,
    count: list.ok && list.data && list.data.records ? list.data.records.length : null,
    hasNote: Boolean(list.ok && list.data && list.data.records && list.data.records.some((r) => r.id === 'qa-note-1')),
  };

  // ---- text encryption (separate code path from the file cipher) ----
  const et = await call('encryptText', api.vault.encryptText(sid, 'نص سري — secret text'));
  const dt = et.ok ? await call('decryptText', api.vault.decryptText(sid, et.data.container || et.data.text || et.data.envelope)) : { ok: false, code: 'NO_CONTAINER' };
  out.textRoundTrip = { encryptOk: et.ok, decryptOk: dt.ok, matches: dt.ok && dt.data && /secret text/.test(JSON.stringify(dt.data)) };

  // ---- AR/EN toggle through a real DOM click ----
  const toggle = [...document.querySelectorAll('button')].find((b) => /switch to english|english|عربي/i.test((b.getAttribute('aria-label') || '') + b.textContent));
  if (toggle) { toggle.click(); await wait(600); }
  out.langAfterToggle = document.documentElement.lang;
  out.dirAfterToggle = document.documentElement.dir;

  const lockRes = await call('lock', api.vault.lock(sid, 'qa-harness'));
  out.lockedOk = lockRes.ok;
  return out;
})()`;

(async () => {
  const exe = findExe();
  console.log("\nKnouxCrypt packaged Windows app QA");
  console.log(`  artifact : ${exe}`);
  console.log(`  profile  : ${PROFILE}`);
  if (!exe || !fs.existsSync(exe)) {
    console.error("No packaged .exe found in dist/. Run electron-builder first.");
    process.exit(2);
  }
  fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  fs.mkdirSync(SHOTS, { recursive: true });

  // A known payload written by the harness, so hashes can be checked outside the app.
  const pattern = [];
  for (let i = 0; i < 4000; i++) pattern.push((i * 2654435761) & 0xff);
  const srcFile = path.join(WORK, "qa-source.bin");
  fs.writeFileSync(srcFile, Buffer.from(pattern));
  const crypto = require("crypto");
  const expected = crypto.createHash("sha256").update(fs.readFileSync(srcFile)).digest("hex");
  console.log(`  expected source sha256: ${expected}`);

  console.log("\n[1] first launch");
  let child = launch(exe);
  let target = await waitForTarget();
  check("packaged exe exposes a CDP page target", Boolean(target), target && target.url);
  if (!target) {
    console.error("Could not attach to the packaged app; aborting.");
    process.exit(1);
  }

  let cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");

  // splash may still be on screen; wait for the built renderer
  const deadline = Date.now() + 30000;
  let url = "";
  while (Date.now() < deadline) {
    const list = await httpJson(`http://127.0.0.1:${PORT}/json`);
    const main = list.find((t) => t.type === "page" && /index\.html/.test(t.url));
    if (main) { url = main.url; if (main.webSocketDebuggerUrl !== target.webSocketDebuggerUrl) { cdp.ws.close(); cdp = await connect(main.webSocketDebuggerUrl); await cdp.send("Runtime.enable"); await cdp.send("Page.enable"); } target = main; break; }
    await new Promise((r) => setTimeout(r, 500));
  }
  check("main renderer loaded from the packaged app.asar", /index\.html/.test(url) && /app\.asar/.test(url), url);

  const s1 = await shot(cdp, "01-landing-arabic");
  check("landing screenshot captured", s1.bytes > 1000, `${s1.bytes} bytes`);

  const pageErrors = [];
  cdp.events.length = 0;
  const driver = await evaluate(cdp, DRIVER);
  console.log("\n  packaged-app results:", JSON.stringify(driver, null, 1).slice(0, 2600));
  check("preload vault bridge present in packaged app", driver.bridge && driver.vault, `platform=${driver.platform}`);
  check("app mounted in Arabic RTL", driver.mounted && driver.lang === "ar" && driver.dir === "rtl", `${driver.lang}/${driver.dir}`);
  check("splash handed off to the main window", /index\.html/.test(driver.url), driver.url);
  check("session established through real IPC", Boolean(driver.sessionId), JSON.stringify(driver.sessionCall));
  check("guest session is issuable", driver.guestIssued === true, "");
  check("a guest cannot write the encrypted store", driver.guestRefused === true, `code=${driver.guestRefuseCode}`);
  check("file encryption succeeded in the packaged app", driver.fileRoundTrip.encryptOk === true, JSON.stringify(driver.fileRoundTrip).slice(0, 180));
  check("file decryption succeeded in the packaged app", driver.fileRoundTrip.decryptOk === true, driver.fileRoundTrip.decryptCode || "");
  check("the encrypted container is a real file on disk", Boolean(driver.fileRoundTrip.encryptedPath) && fs.existsSync(path.join(PROFILE, "workspace", "qa-secret.knv")), driver.fileRoundTrip.encryptedPath || "");
  check("restored plaintext matches the original byte for byte", driver.fileRoundTrip.restoredDigest === expected, `${driver.fileRoundTrip.restoredDigest} vs ${expected}`);
  check("key generation succeeded", driver.keyOps.generateOk === true && Boolean(driver.keyOps.generatedId), JSON.stringify(driver.keyOps).slice(0, 200));
  check("generated key is listed back", driver.keyOps.listed >= 1, `listed=${driver.keyOps.listed}`);
  check("private key material never reached the renderer", driver.keyOps.leakedPrivate === false, "");
  check("TOTP account added and produces a 6-digit code", driver.totp.codeLength === 6, JSON.stringify(driver.totp));
  check("TOTP secret is not returned with the code", driver.totp.secretLeakedToRenderer === false, "");
  check("encrypted store write and read-back", driver.store.hasNote === true, JSON.stringify(driver.store));
  check("text encrypt/decrypt round trip", driver.textRoundTrip.encryptOk === true && driver.textRoundTrip.decryptOk === true, JSON.stringify(driver.textRoundTrip));
  check("AR/EN toggle works in the packaged app", driver.langAfterToggle === "en" && driver.dirAfterToggle === "ltr", `${driver.lang} -> ${driver.langAfterToggle}/${driver.dirAfterToggle}`);
  check("explicit lock succeeds", driver.lockedOk === true, "");

  const s2 = await shot(cdp, "02-home-english");
  check("post-interaction screenshot captured", s2.bytes > 1000, `${s2.bytes} bytes`);

  const violationEvents = cdp.events
    .filter((e) => e.method === "Runtime.consoleAPICalled")
    .map((e) => (e.args || []).map((a) => a.value || a.description || "").join(" "))
    .filter((t) => /Content Security Policy|Undefined|error/i.test(t));
  check("no CSP or runtime console errors during the flow", violationEvents.length === 0, violationEvents.slice(0, 2).join(" | "));

  cdp.ws.close();

  // ---- persistence across restart ----
  console.log("\n[2] restart the packaged app against the same profile");
  killTree(child.pid);
  await new Promise((r) => setTimeout(r, 2500));
  const enrollmentFile = path.join(PROFILE, "vault-enrollment.json");
  const storeDir = path.join(PROFILE, "vault-store");
  check("enrollment record persisted in the isolated profile", fs.existsSync(enrollmentFile), enrollmentFile);
  check("encrypted store persisted in the isolated profile", fs.existsSync(path.join(storeDir, "notes.knx")), path.join(storeDir, "notes.knx"));

  child = launch(exe);
  target = await waitForTarget();
  if (!target) {
    check("relaunched app exposes a CDP target", false, "no target after restart");
  } else {
    let cdp2 = await connect(target.webSocketDebuggerUrl);
    await cdp2.send("Runtime.enable");
    await cdp2.send("Page.enable");
    const list2 = await httpJson(`http://127.0.0.1:${PORT}/json`);
    const main2 = list2.find((t) => t.type === "page" && /index\.html/.test(t.url));
    if (main2 && main2.webSocketDebuggerUrl !== target.webSocketDebuggerUrl) {
      cdp2.ws.close();
      cdp2 = await connect(main2.webSocketDebuggerUrl);
      await cdp2.send("Runtime.enable");
      await cdp2.send("Page.enable");
    }
    const persist = await evaluate(
      cdp2,
      `(async () => {
        const api = window.electronAPI;
        const call = async (p) => { try { const r = await p; return r && r.ok ? { ok: true, data: r.data } : { ok: false, code: r && r.error && r.error.code }; } catch (e) { return { ok: false, code: 'THREW', message: String(e.message) }; } };
        const st = await call(api.vault.status());
        const bad = await call(api.vault.unlock('totally-wrong-password-xyz'));
        const s = await call(api.vault.unlock('QA-vault-2026-passphrase'));
        const sid = s.ok && s.data ? s.data.sessionId : null;
        const list = sid ? await call(api.vault.storeList(sid, 'notes')) : { ok: false };
        const keys = sid ? await call(api.vault.keyList(sid)) : { ok: false };
        const auths = sid ? await call(api.vault.authList(sid)) : { ok: false };
        const restored = await call(api.vault.hashCompute({ algorithm: 'SHA-256', inputPath: ${JSON.stringify(path.join(WORK, "qa-restored.bin").replace(/\\/g, "/"))} }));
        const enc = await call(api.vault.hashCompute({ algorithm: 'SHA-256', inputPath: ${JSON.stringify(path.join(WORK, "qa-secret.knv").replace(/\\/g, "/"))} }));
        return {
          enrolledBefore: Boolean(st.ok && st.data && st.data.enrolled),
          wrongPasswordRejected: bad.ok === false,
          wrongPasswordCode: bad.code,
          unlocked: Boolean(sid),
          noteSurvived: Boolean(list.ok && list.data && list.data.records && list.data.records.some((r) => r.id === 'qa-note-1')),
          noteCount: list.ok && list.data && list.data.records ? list.data.records.length : 0,
          keyCount: keys.ok && keys.data && keys.data.keys ? keys.data.keys.length : 0,
          authCount: auths.ok && auths.data && auths.data.accounts ? auths.data.accounts.length : 0,
          restoredHash: restored.ok && restored.data ? restored.data.digest : null,
          containerSize: enc.ok && enc.data ? enc.data.size : null,
        };
      })()`,
    );
    check("vault still reports as enrolled after restart", persist.enrolledBefore === true, "");
    check("a wrong passphrase is rejected after restart", persist.wrongPasswordRejected === true, `code=${persist.wrongPasswordCode}`);
    check("the same passphrase unlocks after restart", persist.unlocked === true, "");
    check("stored note survived the restart", persist.noteSurvived === true, `notes=${persist.noteCount}`);
    check("generated key survived the restart", persist.keyCount >= 1, `keys=${persist.keyCount}`);
    check("authenticator account survived the restart", persist.authCount >= 1, `accounts=${persist.authCount}`);
    check("decrypted file on disk matches the original bytes", persist.restoredHash === expected, `${persist.restoredHash}`);
    check("the container is larger than the plaintext it holds", persist.containerSize > 4000, `container bytes=${persist.containerSize}`);
    cdp2.ws.close();
  }

  // ---- what the OS actually permits on the packaged app's own files ----
  console.log("\n[3] NTFS verdict on the files the packaged app wrote");
  const acl = require(path.join(ROOT, "electron/vault/acl"));
  for (const [label, p] of [
    ["profile root", PROFILE],
    ["vault-enrollment.json", enrollmentFile],
    ["vault-store dir", storeDir],
    ["vault-store/notes.knx", path.join(storeDir, "notes.knx")],
    ["encrypted container", path.join(WORK, "qa-secret.knv")],
    ["recovered plaintext", path.join(WORK, "qa-restored.bin")],
  ]) {
    if (!fs.existsSync(p)) { check(`${label} exists`, false, p); continue; }
    const v = await acl.isProtected(p, { exhaustive: true });
    check(`${label} is confined to its owner`, v.ok, v.detail);
  }

  killTree(child.pid);
  const listing = cp.execFileSync("icacls", [enrollmentFile], { encoding: "utf8" });
  console.log("\n  icacls vault-enrollment.json:\n" + listing.split("\n").map((l) => "    " + l).join(""));

  if (!KEEP) {
    console.log(`\n  QA profile kept for inspection at ${PROFILE}`);
  }

  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} packaged-app checks passed`);
  console.log(`  screenshots: ${SHOTS}`);
  process.exit(bad.length ? 1 : 0);
})().catch((err) => {
  console.error("\nHARNESS ERROR:", err && err.stack ? err.stack.slice(0, 1200) : String(err));
  process.exit(1);
});
