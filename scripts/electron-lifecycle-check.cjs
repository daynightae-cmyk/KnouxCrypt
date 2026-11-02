// Real Electron lifecycle check for the production entry path.
//
// Boots the actual electron/main.js with KNOUX_USE_BUILD=1 (the packaged path),
// watches the boot view hand off to the app window, and asserts that the main
// window loaded build/index.html, mounted the React tree and received the
// preload bridge. This is a headless run, not a Windows EXE test.
//
// The invariants it checks changed together with the startup design. The boot
// view used to run a fixed 3-second timer and only then create the main window,
// so "no renderer window exists yet" was the ordering proof. Now both windows
// are created up front and the renderer loads behind the boot view, which means
// the meaningful claim is about *visibility*: nothing may be revealed before its
// own document has finished loading. That is what this measures, per window,
// from events rather than from sleeps.
//
// Run: npx electron --no-sandbox --ozone-platform=headless scripts/electron-lifecycle-check.cjs
const { app, BrowserWindow } = require("electron");
const path = require("path");

const root = path.resolve(__dirname, "..");
const results = [];
let failed = 0;

function check(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failed += 1;
}

process.env.KNOUX_USE_BUILD = "1";

const started = Date.now();
const timeline = new Map();

// Attached before main.js exists, so no window can be missed.
app.on("web-contents-created", (_event, contents) => {
  const record = timeline.get(contents.id) || { created: Date.now() - started };
  contents.on("did-finish-load", () => {
    const entry = timeline.get(contents.id) || {};
    entry.finishedLoad = Date.now() - started;
    entry.url = contents.getURL();
    timeline.set(contents.id, entry);
  });
  contents.on("did-fail-load", (_e, code, description, url, isMainFrame) => {
    if (!isMainFrame) return;
    const entry = timeline.get(contents.id) || {};
    entry.failedLoad = { code, description, url, at: Date.now() - started };
    timeline.set(contents.id, entry);
  });
  timeline.set(contents.id, record);
});

require(path.join(root, "electron/main.js"));

// Independent witness of the renderer handshake. It is attached inside this
// script's own whenReady handler on purpose: main.js is required first, so its
// handler — and the removeAllListeners() in registerBootIpc() — has already run
// by then. Registering at module scope meant the witness was silently removed
// before the renderer ever signalled, which read as "the handshake never fires".
const { ipcMain } = require("electron");
let handshakeAt = null;

const snapshot = () =>
  BrowserWindow.getAllWindows().map((w) => ({
    id: w.webContents.id,
    title: w.getTitle(),
    url: w.webContents.getURL(),
    visible: w.isVisible(),
  }));

async function waitFor(predicate, timeoutMs, intervalMs = 50) {
  const startedAt = Date.now();
  for (;;) {
    const shot = snapshot();
    const hit = predicate(shot);
    if (hit) return { hit, ms: Date.now() - startedAt, shot };
    if (Date.now() - startedAt >= timeoutMs) return { hit: null, ms: Date.now() - startedAt, shot };
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** Poll a window's visibility so the first observed shown-frame is timestamped
 *  against the same epoch as the load events recorded above. */
async function waitForVisible(webContentsId, timeoutMs) {
  const startedAt = Date.now();
  for (;;) {
    const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.id === webContentsId);
    if (win && win.isVisible()) return { at: Date.now() - started, waited: Date.now() - startedAt };
    if (Date.now() - startedAt >= timeoutMs) return { at: null };
    await new Promise((r) => setTimeout(r, 25));
  }
}

app.whenReady().then(async () => {
  ipcMain.on("boot:renderer-ready", () => {
    if (handshakeAt === null) handshakeAt = Date.now() - started;
  });
  try {
    // --- the boot view ---
    const bootSeen = await waitFor(
      (s) => s.find((w) => w.url.includes("splash.html") && w.visible === true),
      12000,
    );
    check("boot view is shown first", !!bootSeen.hit, `visible after ${bootSeen.ms}ms ${bootSeen.hit ? "" : JSON.stringify(bootSeen.shot)}`);

    // The claim that replaced "no renderer window exists yet": the app window is
    // created alongside the boot view now, so what must hold is that it is not
    // *shown* while the boot view is still up.
    const rendererUpEarly = bootSeen.shot.some((w) => w.url.includes("index.html") && w.visible === true);
    check("renderer window is not visible while the boot view is up", !rendererUpEarly, JSON.stringify(bootSeen.shot));

    // --- the handoff ---
    const mainEntry = await waitFor(() => {
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes("index.html"));
      return win || null;
    }, 30000);
    const shown = mainEntry.hit ? await waitForVisible(mainEntry.hit.webContents.id, 30000) : { at: null, waited: null };
    // Window destruction is asynchronous: close() leaves the window listed for a
    // frame after the app window is already visible, so "the boot view is gone"
    // has to be waited for rather than sampled in the same tick.
    const bootGone = await waitFor((s) => (s.some((w) => w.url.includes("splash.html")) ? null : true), 8000);
    const after = snapshot();

    check("main window is revealed", shown.at !== null, `waited ${shown.waited}ms after the window was found`);
    check("boot view closes on handoff", !!bootGone.hit, `gone after ${bootGone.ms}ms ${bootGone.hit ? "" : JSON.stringify(after)}`);

    const record = timeline.get(mainEntry.hit?.webContents.id) || {};
    if (shown.at !== null) {
      // Readiness-driven, asserted: the window appeared no earlier than the
      // moment its own document finished loading. Both numbers are offsets from
      // the same `started` epoch, so they are directly comparable.
      check(
        "window is revealed only after its document finished loading",
        typeof record.finishedLoad === "number" && shown.at >= record.finishedLoad - 50,
        `revealedAt=${shown.at}ms finishedLoad=${record.finishedLoad}ms`,
      );
      // Reported, not asserted: how long the boot view actually stayed up. The
      // old build held it at exactly 3000ms regardless of readiness.
      console.log(`  INFO  boot view lifetime: visible at ${bootSeen.ms}ms, app revealed at ${shown.at}ms, document loaded at ${record.finishedLoad}ms, renderer handshake at ${handshakeAt}ms`);
    }
    check("renderer document reported no load failure", !record.failedLoad, JSON.stringify(record.failedLoad || {}));

    // --- the renderer itself ---
    const main = mainEntry.hit;
    if (main) {
      check(
        "main window loaded the built renderer over file://",
        main.webContents.getURL().startsWith("file://") && main.webContents.getURL().endsWith("build/index.html"),
        main.webContents.getURL(),
      );
      const mounted = await main.webContents.executeJavaScript("!!document.querySelector('#root > *')");
      const bridge = await main.webContents.executeJavaScript("typeof window.electronAPI === 'object' && typeof window.electronAPI.vault === 'object'");
      const raw = await main.webContents.executeJavaScript("typeof window.electronAPI.ipcRenderer");
      const readySignal = await main.webContents.executeJavaScript("typeof window.electronAPI.window.ready === 'function'");
      check("React tree mounted", mounted === true);
      check("preload vault bridge present", bridge === true);
      check("no raw ipcRenderer in the renderer", raw === "undefined", raw);
      check("startup readiness handshake is exposed", readySignal === true);
    }
  } catch (err) {
    check("lifecycle check completed without throwing", false, err.message);
  }

  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail && !r.ok ? " -> " + r.detail : ""}`);
  console.log(
    failed
      ? `FAIL: ${failed} lifecycle check(s) failed`
      : "PASS: production Electron entry verified (boot view -> readiness-driven reveal, built renderer, sandboxed preload).",
  );
  app.exit(failed ? 1 : 0);
});
