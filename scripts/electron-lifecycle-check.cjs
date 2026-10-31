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

app.whenReady().then(async () => {
  try {
    await new Promise((r) => setTimeout(r, 700));
    const duringSplash = snapshot();
    const splash = duringSplash.find((w) => w.url.includes("splash.html"));
    check("splash window is shown first", !!splash && splash.visible === true, JSON.stringify(duringSplash));

    await new Promise((r) => setTimeout(r, 4000));
    const after = snapshot();
    const main = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"));
    check("main window replaces the splash", !!main, JSON.stringify(after));
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
