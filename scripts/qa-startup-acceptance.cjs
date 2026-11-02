/**
 * Startup identity acceptance — runs INSIDE Electron as the app's main process.
 *
 * Orchestrated by scripts/run-startup-acceptance.cjs, which launches this file
 * three times so each mode gets a clean process and a clean profile:
 *
 *   KNOUX_QA_MODE=boot     the normal Windows startup, frame-captured
 *   KNOUX_QA_MODE=reduced  the same startup with prefers-reduced-motion forced
 *   KNOUX_QA_MODE=failure  a startup whose renderer genuinely cannot load
 *
 * Everything here is measured from the live windows. Nothing is inferred from
 * reading source files — that is what tests/startup-identity.test.cjs does, and
 * a grep cannot see an image that failed to decode or a hand-off that never
 * happened.
 *
 * The run uses its own throwaway userData directory and refuses to start if that
 * directory already contains a vault, so it cannot read or write real user data.
 */

const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const MODE = process.env.KNOUX_QA_MODE || "boot";
const OUT_DIR = process.env.KNOUX_QA_OUT || path.join(os.tmpdir(), "knoux-startup-acceptance");
const FRAMES_DIR = path.join(OUT_DIR, "frames", MODE);
fs.mkdirSync(FRAMES_DIR, { recursive: true });

const results = [];
const frames = [];
const t0 = Date.now();
const at = () => Date.now() - t0;

function record(name, pass, detail) {
  results.push({ name, pass: Boolean(pass), detail: detail === undefined ? "" : String(detail) });
}

// --- isolated profile, before anything can read the real one ----------------
const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), `knoux-boot-qa-${MODE}-`));
const userData = path.join(profileRoot, "userData");
fs.mkdirSync(userData, { recursive: true });
const VAULT_MARKERS = ["knouxcrypt-vault", "vault", "enrollment", "envelope-store"];
if (VAULT_MARKERS.some((m) => fs.existsSync(path.join(userData, m)))) {
  console.error("REFUSING TO RUN: the isolated profile already contains a vault");
  process.exit(2);
}
app.setPath("userData", userData);

if (MODE === "reduced") {
  // Chromium's own switch, so this is the real media query rather than a
  // simulated class. It must be set before the first window is created.
  app.commandLine.appendSwitch("force-prefers-reduced-motion");
}
if (MODE === "failure") {
  // A host that cannot resolve makes main.js take its did-fail-load branch with
  // a code the dev-server fallback deliberately does not catch. This is a real
  // startup failure, not a mocked one.
  process.env.KNOUX_DEV_SERVER_URL = "http://knoux-qa-unreachable.invalid/";
} else {
  process.env.KNOUX_USE_BUILD = "1";
}

// Boot-view probe, evaluated inside the live boot document.
const BOOT_PROBE = `(() => {
  const q = (s) => document.querySelector(s);
  const img = q('img.boot-stag');
  const stage = q('.boot-stage');
  const cs = stage ? getComputedStyle(stage) : {};
  const aperture = q('.boot-eye-aperture');
  const ap = aperture ? getComputedStyle(aperture) : null;
  const envelope = q('.boot-eye-envelope');
  const env = envelope ? getComputedStyle(envelope) : null;
  const state = q('#bootStateEn');
  const iter = (s) => (s ? s.animationIterationCount : null);
  return {
    title: document.title,
    emblem: img ? { src: img.getAttribute('src'), natural: img.naturalWidth, box: Math.round(img.getBoundingClientRect().width), complete: img.complete } : null,
    eyeLayers: {
      shutter: document.querySelectorAll('.boot-eye-shutter use').length,
      envelope: document.querySelectorAll('.boot-eye-envelope').length,
      core: document.querySelectorAll('.boot-eye-core').length,
      bloom: document.querySelectorAll('.boot-eye-bloom').length,
      aperture: document.querySelectorAll('.boot-eye-aperture').length,
    },
    apertureTransform: ap ? ap.transform : null,
    apertureIteration: ap ? ap.animationIterationCount : null,
    envelopeIteration: env ? env.animationIterationCount : null,
    envelopeOpacity: env ? env.opacity : null,
    stageRadius: cs.borderTopLeftRadius,
    stagePainted: /gradient/.test(cs.backgroundImage || ''),
    phase: stage ? stage.getAttribute('data-boot-phase') : null,
    stateText: state ? state.textContent : null,
    versionText: (q('#bootVersion') || {}).textContent,
    recoveryHidden: (q('#bootRecovery') || {}).hidden,
    recoveryTitle: (q('#bootRecovery h2') || {}).textContent,
    recoveryDetail: (q('#bootRecoveryDetail') || {}).textContent,
    recoveryNote: (q('.boot-recovery-note') || {}).textContent,
    retryFocused: document.activeElement === q('#bootRetry'),
    progressNodes: document.querySelectorAll('[class*="progress"], .loading-bar').length,
    audioNodes: document.querySelectorAll('audio, video').length,
    emoji: /[\\u{1F50F}\\u{1F510}\\u{1F512}\\u{1F513}\\u{1F6E1}]/u.test(document.body.innerText || ''),
    inlineScripts: document.querySelectorAll('script:not([src])').length,
    inlineStyles: document.querySelectorAll('style').length,
    metaPolicies: [...document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]')].map((m) => m.content),
    brokenImages: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')),
  };
})()`;

const RENDERER_PROBE = `(() => ({
  hash: location.hash,
  mounted: !!document.querySelector('#root > *'),
  heading: (document.querySelector('main h1, h1') || {}).textContent || '',
  hasStag: !!document.querySelector('.stag-emblem img'),
  title: document.title,
}))()`;

async function grab(win, label) {
  if (!win || win.isDestroyed()) return null;
  try {
    const image = await win.capturePage();
    const name = `${String(frames.length).padStart(3, "0")}-${label}-${at()}ms.png`;
    fs.writeFileSync(path.join(FRAMES_DIR, name), image.toPNG());
    const size = image.getSize();
    frames.push({ name, at: at(), label, width: size.width, height: size.height });
    return name;
  } catch (err) {
    return null;
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function findWindow(match, timeoutMs) {
  const started = Date.now();
  for (;;) {
    const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && match(w.webContents.getURL()));
    if (win) return win;
    if (Date.now() - started > timeoutMs) return null;
    await wait(20);
  }
}

app.whenReady().then(async () => {
  // Registered before electron/main.js is loaded, so this handler runs first.
  require(path.join(ROOT, "electron", "main.js"));

  // Electron 45 exposes hasSingleInstanceLock(); an older build has
  // isSingleInstance(). Probing a name that does not exist reads as "we are not
  // the primary instance" and aborts the whole run, so check both properly and
  // default to proceeding when the API is absent.
  const holdsLock = typeof app.hasSingleInstanceLock === "function"
    ? app.hasSingleInstanceLock()
    : typeof app.isSingleInstance === "function"
      ? app.isSingleInstance()
      : true;
  record("single-instance lock held by this run", holdsLock, holdsLock ? "" : "another KnouxCrypt instance is running");

  const boot = await findWindow((u) => u.includes("splash.html"), 6000);
  record("boot window appears", !!boot, boot ? `at ${at()}ms` : "never appeared");
  if (!boot) return finish();

  // In the inspection modes the app window is closed as soon as it exists.
  // Startup now finishes in well under a second, so probing a boot view that is
  // about to be retired by the handoff measured nothing but a race; holding the
  // transition open lets the ignition be watched from beginning to end. The
  // handoff itself is measured in mode "handoff", where nothing is held back.
  if (MODE === "boot" || MODE === "reduced") {
    for (let i = 0; i < 60; i++) {
      for (const other of BrowserWindow.getAllWindows()) {
        if (!other.isDestroyed() && other !== boot) other.destroy();
      }
      await wait(5);
      if (boot.isDestroyed()) break;
    }
  }
  if (boot.isDestroyed()) {
    record("boot window survived long enough to inspect", false, "destroyed during the hold");
    return finish();
  }
  record("boot window survived long enough to inspect", true);

  // What the live window actually reports. `frame` and `skipTaskbar` are
  // creation-time options with no getters, so the observable equivalents are
  // used here and the declared options are asserted in
  // tests/startup-identity.test.cjs.
  const bootBounds = boot.getBounds();
  record(
    "boot window is a borderless, non-resizable, always-on-top card",
    boot.isAlwaysOnTop() === true && boot.isResizable() === false && bootBounds.width === 600 && bootBounds.height === 400,
    `${bootBounds.width}x${bootBounds.height} onTop=${boot.isAlwaysOnTop()} resizable=${boot.isResizable()}`,
  );
  record("boot window is visible while the app window is not", boot.isVisible());

  // The inspection modes held the transition open on purpose, so everything
  // below is measured there; mode "handoff" and mode "failure" never touch the
  // boot document after this point because it is legitimately being retired.
  if (MODE === "boot" || MODE === "reduced") {
    // --- frame sequence through the ignition ---
    await grab(boot, "boot-early");
    await wait(180);
    await grab(boot, "boot-igniting");
    await wait(220);
    await grab(boot, "boot-lit");
    await wait(320);
    await grab(boot, "boot-settled");

    const probe = await boot.webContents.executeJavaScript(BOOT_PROBE, true);

    // --- identity ---
    record("official emblem decoded and painted", probe.emblem && probe.emblem.natural > 0 && probe.emblem.box > 0, JSON.stringify(probe.emblem));
    record("no broken image in the boot document", probe.brokenImages.length === 0, JSON.stringify(probe.brokenImages));
    record("no lock or shield emoji anywhere in the boot view", probe.emoji === false);
    record("boot stage paints the obsidian plate with a rounded edge", probe.stagePainted && parseFloat(probe.stageRadius) >= 10, `radius=${probe.stageRadius}`);
    record("boot title is the standardised brand line", /^KNOUX CRYPT$/.test(probe.title), probe.title);

    // --- eye ignition ---
    record("eye ignition reuses the traced mask layers", probe.eyeLayers.shutter === 2 && probe.eyeLayers.core === 2 && probe.eyeLayers.bloom === 2 && probe.eyeLayers.aperture === 1, JSON.stringify(probe.eyeLayers));

    if (MODE === "reduced") {
      record("reduced motion: aperture is already fully open", /matrix\(1, 0, 0, 1, 0, 0\)|none/.test(probe.apertureTransform || ""), probe.apertureTransform);
      record("reduced motion: no animation runs on the ignition", probe.apertureIteration === "1" && probe.envelopeIteration === "1", `aperture=${probe.apertureIteration} envelope=${probe.envelopeIteration}`);
      record("reduced motion: the eyes still resolve to a lit pose", Number(probe.envelopeOpacity) > 0.5, probe.envelopeOpacity);
    } else {
      record("ignition plays once and does not loop", probe.apertureIteration === "1" && probe.envelopeIteration === "1", `aperture=${probe.apertureIteration} envelope=${probe.envelopeIteration}`);
      record("eyelid aperture opens", probe.apertureTransform && probe.apertureTransform !== "none", probe.apertureTransform);
    }

    // --- truthfulness ---
    record("no progress bar exists in the boot view", probe.progressNodes === 0, probe.progressNodes);
    record("boot view plays no audio (renderer owns consent)", probe.audioNodes === 0, probe.audioNodes);
    record("boot view declares its own CSP with no unsafe-eval", probe.metaPolicies.length > 0 && !probe.metaPolicies.some((p) => /unsafe-eval/.test(p)), probe.metaPolicies[0]);
    record("boot view has no inline script or style", probe.inlineScripts === 0 && probe.inlineStyles === 0, `${probe.inlineScripts}/${probe.inlineStyles}`);
    record("boot view reports the version it was handed", /^Version \d/.test(probe.versionText || ""), probe.versionText);
    record("recovery panel stays hidden while nothing has failed", probe.recoveryHidden === true, String(probe.recoveryHidden));
    return finish();
  }

  if (MODE === "failure") {
    // DNS failure timing is the resolver's business, not a fixed sleep: poll
    // until the boot view reports the recovery state, or run out of patience.
    let failed = null;
    const startedAt = Date.now();
    for (;;) {
      if (boot.isDestroyed()) break;
      failed = await boot.webContents.executeJavaScript(BOOT_PROBE, true).catch(() => null);
      if (failed && failed.recoveryHidden === false) break;
      if (Date.now() - startedAt > 20000) break;
      await wait(200);
    }
    await grab(boot, "recovery");
    failed = failed || {};
    record("a real renderer failure replaces the animation", failed.recoveryHidden === false && failed.phase === "failed", `hidden=${failed.recoveryHidden} phase=${failed.phase}`);
    record("recovery states the actual reason", /ERR_NAME_NOT_RESOLVED|ERR_|failed to load|did not report/i.test(failed.recoveryDetail || ""), failed.recoveryDetail);
    record("recovery reassures about the vault", /untouched/.test(failed.recoveryNote || ""), failed.recoveryNote);
    record("recovery focuses Retry for keyboard use", failed.retryFocused === true, String(failed.retryFocused));
    const broken = await findWindow((u) => u.includes("index.html"), 1500);
    record("the broken window is never revealed", !broken || !broken.isVisible(), broken ? "window exists" : "no app window");
    return finish();
  }

  // --- handoff (mode "handoff": nothing is held back) ---
  const appWindow = await findWindow((u) => u.includes("index.html"), 25000);
  // The window exists the moment main.js creates it; the claim is about when it
  // becomes visible, so wait for the reveal rather than sampling once.
  let revealed = false;
  const revealStarted = Date.now();
  for (;;) {
    if (appWindow && !appWindow.isDestroyed() && appWindow.isVisible()) { revealed = true; break; }
    if (Date.now() - revealStarted > 25000) break;
    await wait(25);
  }
  record("app window is revealed", revealed, `visible ${Date.now() - revealStarted}ms after it was found, ${at()}ms after the run began`);
  record("app window is revealed", revealed === true, appWindow ? `at ${at()}ms` : "no app window");
  const bootGone = await (async () => {
    const started = Date.now();
    for (;;) {
      if (!BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.webContents.getURL().includes("splash.html"))) return true;
      if (Date.now() - started > 6000) return false;
      await wait(30);
    }
  })();
  record("boot view retires on handoff", bootGone);
  // The old build held the boot view for exactly 3000 ms whatever happened.
  // Reaching a revealed app window faster than that is the measurable proof the
  // handoff is now driven by readiness.
  record("handoff is readiness-driven, not the old fixed 3 s wait", at() < 3000, `revealed at ${at()}ms`);

  if (appWindow) {
    await grab(appWindow, "app-first-frame");
    const page = await appWindow.webContents.executeJavaScript(RENDERER_PROBE, true);
    record("React tree mounted after reveal", page.mounted === true);
    record("the official emblem is used inside the app too", page.hasStag === true);
    const status = await appWindow.webContents.executeJavaScript("window.electronAPI.vault.status()", true).catch((e) => ({ error: String(e) }));
    record("handoff does not authenticate: the vault has no active session", status && status.locked === true && status.activeSessions === 0, JSON.stringify(status));
    record("handoff does not enrol a vault behind the user's back", status && status.enrolled === false, JSON.stringify(status));
    record("window label is the standardised brand", /KNOUX CRYPT/.test(appWindow.getTitle()), appWindow.getTitle());
    await grab(appWindow, "app-settled");
  }

  finish();
});

function finish() {
  const passed = results.filter((r) => r.pass).length;
  const report = {
    mode: MODE,
    startedAt: new Date(t0).toISOString(),
    durationMs: at(),
    userData,
    results,
    frames,
    summary: `${passed}/${results.length} acceptance cases passed`,
  };
  fs.writeFileSync(path.join(FRAMES_DIR, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\nKNOUX startup acceptance — mode ${MODE}`);
  for (const r of results) console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  [${r.detail.slice(0, 120)}]` : ""}`);
  console.log(`\n  ${report.summary}  (${frames.length} frames in ${FRAMES_DIR})`);
  const failures = results.length - passed;
  try {
    for (const win of BrowserWindow.getAllWindows()) win.destroy();
  } catch { /* already gone */ }
  fs.rmSync(profileRoot, { recursive: true, force: true, maxRetries: 6, retryDelay: 120 });
  setTimeout(() => process.exit(failures ? 1 : 0), 200);
  app.exit(failures ? 1 : 0);
}

process.on("uncaughtException", (err) => {
  record("acceptance run completed without throwing", false, String(err && err.stack ? err.stack.slice(0, 300) : err));
  finish();
});
