// Real Electron lifecycle check for the production entry path.
//
// Boots the actual electron/main.js with KNOUX_USE_BUILD=1 (the packaged path),
// observes the splash window, waits for the timed hand-off, and asserts that
// the main window loaded build/index.html, mounted the React tree and received
// the preload bridge. This is a Linux headless run, not a Windows EXE test.
//
// Run: KNOUX_USE_BUILD=1 npx electron --no-sandbox --ozone-platform=headless scripts/electron-lifecycle-check.cjs
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const results = [];
let failed = 0;

function check(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failed += 1;
}

process.env.KNOUX_USE_BUILD = "1";
require(path.join(root, "electron/main.js"));

const snapshot = () =>
  BrowserWindow.getAllWindows().map((w) => ({
    title: w.getTitle(),
    url: w.webContents.getURL(),
    visible: w.isVisible(),
  }));

// Bounded polling instead of fixed sleeps. The previous version slept 700ms and
// then 4000ms, so on a busy machine it reported "splash window is shown first"
// as a failure while looking at a window whose URL had simply not been set yet
// — a measurement artifact that looked exactly like a real regression, and that
// gave no timing information either way. Polling keeps the assertion (the splash
// must appear, must be visible, must precede the renderer, and must be replaced
// by it) and reports how long each phase actually took.
async function waitFor(predicate, timeoutMs, intervalMs = 100) {
  const started = Date.now();
  for (;;) {
    const shot = snapshot();
    const hit = predicate(shot);
    if (hit) return { hit, ms: Date.now() - started, shot };
    if (Date.now() - started >= timeoutMs) return { hit: null, ms: Date.now() - started, shot };
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

app.whenReady().then(async () => {
  try {
    const splashSeen = await waitFor((s) => s.find((w) => w.url.includes("splash.html") && w.visible === true), 12000);
    check("splash window is shown first", !!splashSeen.hit, `visible after ${splashSeen.ms}ms ${splashSeen.hit ? "" : JSON.stringify(splashSeen.shot)}`);

    // The ordering claim, asserted rather than implied by a sleep: at the moment
    // the splash became visible, no window may already be showing the renderer.
    const rendererAlreadyUp = splashSeen.shot.some((w) => w.url.includes("index.html"));
    check("no renderer window exists before the splash hands off", splashSeen.hit !== null && rendererAlreadyUp === false, JSON.stringify(splashSeen.shot));

    const mainSeen = await waitFor((s) => s.find((w) => w.url.includes("index.html")), 30000);
    const after = snapshot();
    const main = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"));
    check("main window replaces the splash", !!mainSeen.hit, `${mainSeen.ms}ms after splash ${splashSeen.ms}ms ${mainSeen.hit ? "" : JSON.stringify(after)}`);
    check("splash window is closed", !after.some((w) => w.url.includes("splash.html")), JSON.stringify(after));

    if (main) {
      check("main window loaded the built renderer over file://", main.webContents.getURL().startsWith("file://") && main.webContents.getURL().endsWith("build/index.html"), main.webContents.getURL());
      const mounted = await main.webContents.executeJavaScript("!!document.querySelector('#root > *')");
      const bridge = await main.webContents.executeJavaScript("typeof window.electronAPI === 'object' && typeof window.electronAPI.vault === 'object'");
      const raw = await main.webContents.executeJavaScript("typeof window.electronAPI.ipcRenderer");
      check("React tree mounted", mounted === true);
      check("preload vault bridge present", bridge === true);
      check("no raw ipcRenderer in the renderer", raw === "undefined", raw);
    }
  } catch (err) {
    check("lifecycle check completed without throwing", false, err.message);
  }

  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail && !r.ok ? " -> " + r.detail : ""}`);
  console.log(failed ? `FAIL: ${failed} lifecycle check(s) failed` : "PASS: production Electron entry verified (splash -> main window, built renderer, sandboxed preload).");
  app.exit(failed ? 1 : 0);
});
