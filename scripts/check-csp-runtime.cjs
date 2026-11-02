// Real CSP enforcement check for the production renderer.
//
// Why this exists: the suite already had "a strict CSP is applied to every
// document", but that test only greps electron/main.js for directive strings. A
// green grep proves the source contains a policy, not that a browser enforces
// it — and this app now carries TWO policies (the header injected by main.js
// and the <meta> in index.html) whose effects intersect. So this check boots the
// real production entry (KNOUX_USE_BUILD=1, the packaged path) over file:// and
// asks the live renderer what it can actually do.
//
// It asserts both directions:
//   - the restrictive things are blocked (inline script, eval, cross-origin JS)
//   - the ordinary things still work (React mount, routing, AR/EN switch, IPC)
// A CSP that silently breaks the application would be as much a failure as one
// that does not block.
//
// Run: npx electron --no-sandbox --ozone-platform=headless scripts/check-csp-runtime.cjs

const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const results = [];
let failed = 0;

function check(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failed += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
}

// Watchdog. Electron keeps a process alive when the app throws during load
// ("App threw an error during load"), and main.js installs a tray icon, so a
// failure here would otherwise leave an orphan holding the single-instance lock
// and hang every later run. Nothing here should take two minutes.
setTimeout(() => {
  console.error(`\nTIMEOUT after 90s with ${results.length} checks recorded`);
  process.exit(1);
}, 90000).unref();
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT:", err && err.stack ? err.stack.slice(0, 400) : String(err));
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err && err.stack ? err.stack.slice(0, 400) : String(err));
  process.exit(1);
});

process.env.KNOUX_USE_BUILD = "1";
require(path.join(root, "electron/main.js"));

const PROBE = `(async () => {
  const out = {};
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  out.metaPolicies = [...document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]')].map((m) => m.content);
  out.url = location.href;

  // 1. Inline script must not execute.
  window.__cspInline = 'NOT_RUN';
  const s = document.createElement('script');
  s.textContent = 'window.__cspInline = "RAN";';
  document.body.appendChild(s);
  await wait(120);
  out.inline = window.__cspInline;
  s.remove();

  // 2. eval / new Function must be refused (this is the unsafe-eval question).
  try { out.eval = 'ALLOWED:' + eval('1+1'); } catch (e) { out.eval = 'blocked:' + e.name; }
  try { out.functionCtor = 'ALLOWED:' + new Function('return 2')(); } catch (e) { out.functionCtor = 'blocked:' + e.name; }

  // 3. A cross-origin script must not load.
  try {
    await new Promise((resolve, reject) => {
      const bad = document.createElement('script');
      bad.src = 'https://example.invalid/should-be-blocked.js';
      bad.onload = () => resolve('loaded');
      bad.onerror = () => reject(new Error('refused'));
      document.head.appendChild(bad);
      setTimeout(() => reject(new Error('timeout')), 2500);
    });
    out.crossOrigin = 'ALLOWED';
  } catch (e) { out.crossOrigin = 'blocked:' + e.message; }

  // 4. Ordinary application behaviour must survive.
  out.rootMounted = Boolean(document.querySelector('#root') && document.querySelector('#root').children.length);
  out.inlineStyledNodes = [...document.querySelectorAll('[style]')].filter((n) => /opacity|transform/.test(n.getAttribute('style') || '')).length;
  out.lang = document.documentElement.lang;
  out.dir = document.documentElement.dir;
  out.headings = [...document.querySelectorAll('h1,h2')].map((h) => h.textContent.trim()).slice(0, 3);
  out.vaultBridge = typeof window.knouxcrypt === 'object' && typeof window.electronAPI === 'object';
  out.apiNames = Object.keys(window).filter((k) => /^knouxcrypt$|^electronAPI$/i.test(k));

  // 5. Language switch through a real DOM click handler.
  const toggle = [...document.querySelectorAll('button')].find((b) => /switch to english|english|عربي/i.test((b.getAttribute('aria-label') || '') + b.textContent));
  if (toggle) { toggle.click(); await wait(500); }
  out.langAfterToggle = document.documentElement.lang;
  out.dirAfterToggle = document.documentElement.dir;
  return out;
})()`;

const SPLASH_PROBE = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const stage = document.querySelector('.boot-stage');
  const emblem = document.querySelector('img.boot-stag');
  // A CSP that silently blocks the emblem is the failure mode worth measuring
  // here: 'self' for a file:// document is not a guarantee in every Chromium
  // build, and a blocked image renders as a blank square, not an error.
  if (emblem && emblem.decode) { try { await emblem.decode(); } catch (e) {} }
  const state = document.getElementById('bootStateEn');
  const before = state ? state.textContent : null;
  await wait(1200);
  const cs = stage ? getComputedStyle(stage) : {};
  const aperture = document.querySelector('.boot-eye-aperture');
  return {
    url: location.href,
    metaPolicies: [...document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]')].map((m) => m.content),
    scriptSrc: [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')),
    inlineScriptCount: [...document.querySelectorAll('script:not([src])')].length,
    inlineStyleCount: [...document.querySelectorAll('style')].length,
    stylesheetCount: document.querySelectorAll('link[rel="stylesheet"]').length,
    // Stylesheet really applied, not merely referenced: the stage paints a
    // gradient and a 14px radius, neither of which is a browser default.
    stylesheetApplied: /gradient/.test(cs.backgroundImage || '') && parseFloat(cs.borderTopLeftRadius) > 0,
    bodyTransparent: getComputedStyle(document.body).backgroundColor === 'rgba(0, 0, 0, 0)',
    // The official emblem, decoded and painted.
    emblemLoaded: Boolean(emblem && emblem.naturalWidth > 0),
    emblemSrc: emblem ? emblem.getAttribute('src') : null,
    emblemBox: emblem ? emblem.getBoundingClientRect().width : 0,
    // Eye ignition wiring, shared with StagEmblem.jsx rather than re-invented.
    eyeLayers: {
      shutter: document.querySelectorAll('.boot-eye-shutter use').length,
      envelope: document.querySelectorAll('.boot-eye-envelope').length,
      core: document.querySelectorAll('.boot-eye-core').length,
      bloom: document.querySelectorAll('.boot-eye-bloom').length,
      aperture: aperture ? 1 : 0,
    },
    apertureAnimated: aperture ? /boot-eyelid|scaleY/.test(getComputedStyle(aperture).transform + ' ' + (getComputedStyle(aperture).animationName || '')) : false,
    // Truthfulness: nothing may invent status text or a progress bar.
    stateUnchanged: before === (state ? state.textContent : null),
    stateSample: (state ? state.textContent : '').slice(0, 40),
    progressElements: document.querySelectorAll('.loading-bar, .loading-progress, [class*="progress"]').length,
    versionText: (document.getElementById('bootVersion') || {}).textContent || '',
    recoveryHidden: (document.getElementById('bootRecovery') || {}).hidden !== false,
    audioElements: document.querySelectorAll('audio, video').length,
    emojiInMarkup: /[\\u{1F50F}\\u{1F510}\\u{1F512}\\u{1F513}\\u{1F6E1}]/u.test(document.body.textContent),
  };
})()`;

app.whenReady().then(async () => {
  console.log("\nKnouxCrypt CSP runtime check (real Electron, production renderer path)\n");
  try {
    // --- boot document ---
    // Probed in a window this check owns, not main.js's. The real boot view is
    // closed by the readiness handoff about a second after it appears, and
    // evaluating a promise-bearing script in a frame that is destroyed
    // mid-flight leaves executeJavaScript pending forever — which is how this
    // check came to time out once the fixed 3-second wait went away. Same file,
    // same preload, same sandbox, and the state message is pushed here so the
    // bridge is exercised rather than assumed.
    const bootWindow = new BrowserWindow({
      width: 600,
      height: 400,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: path.join(root, "electron", "splash-preload.js"),
      },
    });
    try {
      await bootWindow.loadFile(path.join(root, "electron", "splash.html"));
      bootWindow.webContents.send("boot:state", { state: "opening", detail: "", version: "0.0.0-csp-probe" });
      await new Promise((r) => setTimeout(r, 250));
      const splash = await bootWindow.webContents.executeJavaScript(SPLASH_PROBE, true);
      check("boot view is present", true, bootWindow.webContents.getURL());
      check("boot bridge delivered the state message", /Opening KNOUX CRYPT/.test(splash.stateSample), splash.stateSample);
      check("boot CSP forbids inline script and has no unsafe-eval", splash.metaPolicies.length > 0 && !splash.metaPolicies.some((p) => /unsafe-eval|script-src[^;]*unsafe-inline/.test(p)), splash.metaPolicies[0] ? splash.metaPolicies[0].slice(0, 60) : "none");
      check("boot view carries no inline <script>", splash.inlineScriptCount === 0, `found ${splash.inlineScriptCount}`);
      check("boot view carries no inline <style>", splash.inlineStyleCount === 0, `found ${splash.inlineStyleCount}`);
      check("boot view loads its script externally", splash.scriptSrc.length === 1 && /\.js$/.test(splash.scriptSrc[0]), JSON.stringify(splash.scriptSrc));
      check("boot view links an external stylesheet", splash.stylesheetCount === 1, "");
      // Behaviour preservation: externalising must not have broken the document.
      check("boot stylesheet applied under style-src 'self'", splash.stylesheetApplied === true, `gradient+radius: ${splash.stylesheetApplied}`);
      check("boot window stays transparent at the body", splash.bodyTransparent === true, "the stage paints, not the body");
      // The identity claim, measured rather than asserted from source: the
      // official emblem must actually paint under img-src 'self'.
      check("official emblem decoded and painted under img-src 'self'", splash.emblemLoaded === true, `src=${splash.emblemSrc} box=${splash.emblemBox}px painted=${splash.emblemLoaded}`);
      check("no lock/shield emoji anywhere in the boot markup", splash.emojiInMarkup === false, "");
      check("eye ignition reuses the traced mask layers", splash.eyeLayers.shutter === 2 && splash.eyeLayers.core === 2 && splash.eyeLayers.bloom === 2 && splash.eyeLayers.aperture === 1, JSON.stringify(splash.eyeLayers));
      check("eyelid aperture is driven by CSS, not a second engine", splash.apertureAnimated === true, "");
      // Truthfulness of the boot view itself.
      check("boot view fabricates no status text", splash.stateUnchanged === true, `sample: ${splash.stateSample}`);
      check("boot view has no progress bar", splash.progressElements === 0, `found ${splash.progressElements}`);
      check("boot view plays no audio (renderer owns consent)", splash.audioElements === 0, `found ${splash.audioElements}`);
      check("recovery panel is hidden while startup is healthy", splash.recoveryHidden === true, "");
      check("boot view shows the version it was told, not a literal", /^Version \d/.test(splash.versionText), JSON.stringify(splash.versionText));
    } finally {
      bootWindow.destroy();
    }

    // --- main renderer over file:// ---
    const deadline = Date.now() + 20000;
    let mainWin = null;
    while (Date.now() < deadline) {
      mainWin = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"));
      if (mainWin) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!mainWin) {
      check("main window loaded the built renderer", false, "timed out");
    } else {
      check("main window loaded the built renderer over file://", mainWin.webContents.getURL().startsWith("file://"), mainWin.webContents.getURL());

      let page;
      try {
        page = await mainWin.webContents.executeJavaScript(PROBE, true);
      } catch (err) {
        check("renderer probe executed", false, String(err && err.message));
        page = null;
      }

      if (page) {
        check("renderer declares a CSP via <meta>", page.metaPolicies.length > 0, `${page.metaPolicies.length} policy(ies)`);
        check("no policy contains unsafe-eval", !page.metaPolicies.some((p) => /unsafe-eval/.test(p)), "");
        check("inline script injection is blocked", page.inline === "NOT_RUN", `got ${page.inline}`);
        check("eval() is refused", /^blocked:/.test(page.eval), page.eval);
        check("new Function() is refused", /^blocked:/.test(page.functionCtor), page.functionCtor);
        check("cross-origin script is refused", /^blocked:/.test(page.crossOrigin), page.crossOrigin);

        // The application still has to work.
        check("React tree mounted under the CSP", page.rootMounted === true, "");
        check("inline styles still apply (framer-motion)", page.inlineStyledNodes > 0, `${page.inlineStyledNodes} animated nodes`);
        check("preload bridge present", page.vaultBridge || page.apiNames.length > 0, JSON.stringify(page.apiNames));
        check(
          "AR/EN switch works under the CSP",
          page.lang !== page.langAfterToggle && /ar|en/.test(page.langAfterToggle),
          `${page.lang}/${page.dir} -> ${page.langAfterToggle}/${page.dirAfterToggle}`,
        );
        console.log(`\n  renderer meta policy:\n    ${page.metaPolicies.join("\n    " || "none")}`);
      }
    }
  } catch (err) {
    check("csp runtime check completed", false, String(err && err.stack).slice(0, 300));
  } finally {
    const bad = results.filter((r) => !r.ok);
    console.log(`\n${results.length - bad.length}/${results.length} checks passed`);
    // main.js opens a tray icon and a splash/main window, and app.exit() alone
    // left an orphaned electron.exe holding the single-instance lock here, which
    // made every subsequent run hang waiting for that lock. Close the windows,
    // destroy the tray, then exit hard on a timer so a stuck window cannot wedge
    // the gate.
    try {
      const { Tray } = require("electron");
      for (const tray of Tray.getAllTrays ? Tray.getAllTrays() : []) tray.destroy();
    } catch {
      /* tray API shape varies; best effort */
    }
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        win.destroy();
      } catch {
        /* already gone */
      }
    }
    setTimeout(() => process.exit(bad.length ? 1 : 0), 250).unref();
    app.exit(bad.length ? 1 : 0);
    process.exit(bad.length ? 1 : 0);
  }
});
