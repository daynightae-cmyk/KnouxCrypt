/**
 * Before/after identity comparison, captured from the real thing.
 *
 * The old boot view and the old icon are not described from memory: they are
 * extracted from git at the pre-change commit and rendered in the same Electron
 * build that renders the new ones. That produces a genuine side-by-side of
 * "what the user saw" against "what the user sees now", which is the only
 * honest way to show an identity replacement.
 *
 * Run: npx electron --no-sandbox scripts/identity-before-after.cjs
 */
"use strict";

const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const BEFORE_COMMIT = process.env.KNOUX_BEFORE_COMMIT || "53bcdd38aa04a1ca621cede119594cb353d9d4c9";
const OUT = process.env.KNOUX_QA_OUT || path.join(os.tmpdir(), "knoux-startup-acceptance");
const COMPARE_DIR = path.join(OUT, "comparison");
fs.mkdirSync(COMPARE_DIR, { recursive: true });

const { decodePng, encodePng } = require(path.join(ROOT, "scripts", "generate-icons.cjs"));

const gitShow = (rev, file) =>
  execFileSync("git", ["show", `${rev}:${file}`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function capture(win, name) {
  // capturePage() fails with an UnknownVizError when the window has not been
  // composited yet, which is exactly the case for a frameless transparent one
  // that was created a moment ago. Give the compositor time, and make sure the
  // window is really on screen before sampling it.
  win.show();
  win.focus();
  await wait(1800);
  const image = await win.capturePage();
  fs.writeFileSync(path.join(COMPARE_DIR, name), image.toPNG());
  return image.getSize();
}

/** Compose a sheet: columns of images on one backdrop, scaled to a common height. */
function composeSheet(cells, width, cellWidth, cellHeight) {
  const sheet = Buffer.alloc(width * cellHeight * 4);
  for (let i = 3; i < sheet.length; i += 4) sheet[i] = 255;
  cells.forEach((cell, index) => {
    const x0 = index * cellWidth;
    for (let y = 0; y < cellHeight; y++) {
      const sy = Math.min(cell.height - 1, Math.floor((y / cellHeight) * cell.height));
      for (let x = 0; x < cellWidth; x++) {
        const sx = Math.min(cell.width - 1, Math.floor((x / cellWidth) * cell.width));
        const s = (sy * cell.width + sx) * 4;
        const a = cell.data[s + 3] / 255;
        const d = (y * width + x0 + x) * 4;
        sheet[d] = Math.round(cell.data[s] * a + sheet[d] * (1 - a));
        sheet[d + 1] = Math.round(cell.data[s + 1] * a + sheet[d + 1] * (1 - a));
        sheet[d + 2] = Math.round(cell.data[s + 2] * a + sheet[d + 2] * (1 - a));
        sheet[d + 3] = 255;
      }
    }
  });
  return sheet;
}

// Destroying the first capture window must not end the process: the default
// "window-all-closed" behaviour quits the app, which is what made the second
// capture fail with ERR_FAILED.
app.on("window-all-closed", (event) => {
  if (event && typeof event.preventDefault === "function") event.preventDefault();
});

app.whenReady().then(async () => {
  const report = { beforeCommit: BEFORE_COMMIT, captures: [], sheets: [] };

  // --- the old boot view, extracted from git and rendered as it was ---
  const oldDir = fs.mkdtempSync(path.join(os.tmpdir(), "knoux-old-boot-"));
  for (const file of ["splash.html", "splash.css", "splash.js"]) {
    fs.writeFileSync(path.join(oldDir, file), gitShow(BEFORE_COMMIT, `electron/${file}`));
  }
  const oldWin = new BrowserWindow({
    width: 600,
    height: 400,
    show: true,
    frame: false,
    transparent: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  await oldWin.loadFile(path.join(oldDir, "splash.html"));
  const oldSize = await capture(oldWin, "before-boot.png");
  report.captures.push({ file: "before-boot.png", size: oldSize });
  oldWin.destroy();

  // --- the new boot view, same renderer, same window ---
  const newWin = new BrowserWindow({
    width: 600,
    height: 400,
    show: true,
    frame: false,
    transparent: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(ROOT, "electron", "splash-preload.js"),
    },
  });
  newWin.webContents.on("did-fail-load", (_e, code, description, url) => {
    console.log(`  new boot view failed to load: ${description} (${code}) ${url}`);
  });
  newWin.webContents.on("console-message", (_e, level, message) => {
    console.log(`  new boot view console: ${message}`);
  });
  await newWin.loadFile(path.join(ROOT, "electron", "splash.html"));
  newWin.webContents.send("boot:state", { state: "opening", detail: "", version: require(path.join(ROOT, "package.json")).version });
  const newSize = await capture(newWin, "after-boot.png");
  report.captures.push({ file: "after-boot.png", size: newSize });

  // --- the icons, old and new, at the size Windows actually shows ---
  const oldIcon = decodePng(gitShow(BEFORE_COMMIT, "electron/assets/icon.png"));
  const newIcon = decodePng(fs.readFileSync(path.join(ROOT, "electron", "assets", "icon.png")));
  fs.writeFileSync(path.join(COMPARE_DIR, "before-icon.png"), encodePng(oldIcon.width, oldIcon.height, oldIcon.data));
  fs.writeFileSync(path.join(COMPARE_DIR, "after-icon.png"), encodePng(newIcon.width, newIcon.height, newIcon.data));
  report.captures.push({ file: "before-icon.png", size: { width: oldIcon.width, height: oldIcon.height } });
  report.captures.push({ file: "after-icon.png", size: { width: newIcon.width, height: newIcon.height } });

  // --- one sheet with both boot views side by side ---
  const bootSheet = composeSheet(
    [
      { data: decodePng(fs.readFileSync(path.join(COMPARE_DIR, "before-boot.png"))).data, width: oldSize.width, height: oldSize.height },
      { data: decodePng(fs.readFileSync(path.join(COMPARE_DIR, "after-boot.png"))).data, width: newSize.width, height: newSize.height },
    ],
    oldSize.width + newSize.width,
    oldSize.width,
    oldSize.height,
  );
  fs.writeFileSync(path.join(COMPARE_DIR, "boot-before-after.png"), encodePng(oldSize.width + newSize.width, oldSize.height, bootSheet));

  // --- and one sheet with both icons on a light background, so the
  //     transparency difference is visible rather than asserted ---
  const iconSheet = composeSheet(
    [
      { data: oldIcon.data, width: oldIcon.width, height: oldIcon.height },
      { data: newIcon.data, width: newIcon.width, height: newIcon.height },
    ],
    oldIcon.width + newIcon.width,
    oldIcon.width,
    oldIcon.height,
  );
  fs.writeFileSync(path.join(COMPARE_DIR, "icon-before-after.png"), encodePng(oldIcon.width + newIcon.width, oldIcon.height, iconSheet));
  report.sheets = ["boot-before-after.png", "icon-before-after.png"];

  fs.writeFileSync(path.join(COMPARE_DIR, "report.json"), JSON.stringify(report, null, 2));
  console.log(`identity comparison written to ${COMPARE_DIR}`);
  for (const c of report.captures) console.log(`  ${c.file}  ${c.size.width}x${c.size.height}`);
  for (const w of BrowserWindow.getAllWindows()) w.destroy();
  fs.rmSync(oldDir, { recursive: true, force: true });
  app.exit(0);
});
