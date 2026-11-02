// Captures real Electron desktop screenshots at fixed window sizes for the
// visual acceptance ledger. Uses the production entry (KNOUX_USE_BUILD=1), so
// what is captured is what the packaged app shows, not a browser approximation.
//
//   node scripts/capture-desktop.cjs [width] [height]
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

process.env.KNOUX_USE_BUILD = "1";

const root = path.resolve(__dirname, "..");
// Electron's main-process argv carries its own switches, so positional indices
// are not stable. Scan for the first two bare integers instead.
const numericArgs = process.argv.slice(1).filter((a) => /^\d{3,5}$/.test(a)).map(Number);
const WIDTH = numericArgs[0] || 1440;
const HEIGHT = numericArgs[1] || 900;
const OUT = path.join(root, "qa-evidence", "cipherglyph", `${WIDTH}x${HEIGHT}`);

// Routes to capture: the Tools workspace is where the generic-shield defect was
// visible, plus Home and two internal services.
const SHOTS = [
  { name: "01-home", path: "/home" },
  { name: "02-tools", path: "/tools" },
  { name: "03-key-forge", path: "/key-forge" },
  { name: "04-authenticator", path: "/authenticator" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

require(path.join(root, "electron/main.js"));

async function findMain() {
  for (let i = 0; i < 120; i++) {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("index.html"));
    if (w) return w;
    await sleep(250);
  }
  return null;
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`capturing at ${WIDTH}x${HEIGHT} -> ${OUT}`);

  const win = await findMain();
  if (!win) { console.error("renderer window never appeared"); app.exit(1); return; }

  win.setBounds({ width: WIDTH, height: HEIGHT });
  await sleep(1200);

  const { screen } = require("electron");
  console.log("work area:", JSON.stringify(screen.getPrimaryDisplay().workAreaSize));

  for (const shot of SHOTS) {
    // The app uses HashRouter when running under Electron (src/App.jsx:27), so
    // pushState on a file:// URL does not navigate — it produced paths like
    // "/D:/home". Drive the hash instead, which is what a real click does.
    await win.webContents.executeJavaScript(
      `(() => { location.hash = '#' + ${JSON.stringify(shot.path)}; return location.hash; })()`,
    );
    await sleep(2600);
    const info = await win.webContents.executeJavaScript(
      `(() => ({ hash: location.hash, glyphs: [...document.querySelectorAll('[data-glyph]')].map(n => n.getAttribute('data-glyph')), unmapped: document.querySelectorAll('.knoux-icon-unmapped').length, shields: [...document.querySelectorAll('svg path[d^="m12 2 9 4"]')].length }))()`,
    );
    const img = await win.webContents.capturePage();
    const file = path.join(OUT, `${shot.name}.png`);
    fs.writeFileSync(file, img.toPNG());
    console.log(
      `${shot.name}: ${path.basename(file)} ${img.getSize().width}x${img.getSize().height} ` +
        `glyphs=${info.glyphs.length} unmapped=${info.unmapped} genericShields=${info.shields} ` +
        `distinct=${new Set(info.glyphs).size}`,
    );
    fs.writeFileSync(path.join(OUT, `${shot.name}.json`), JSON.stringify(info, null, 2));
  }

  app.exit(0);
});
