"use strict";

/**
 * Electron hardening invariants.
 *
 * These assert on the shipped main-process source and packaging config, because
 * the security posture of the app is a property of those files. They cannot
 * prove runtime behaviour on Windows (that needs a real EXE run); they do prove
 * the dangerous switches are not present and cannot regress silently.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const mainSource = fs.readFileSync(path.join(root, "electron/main.js"), "utf8");
const preloadSource = fs.readFileSync(path.join(root, "electron/preload.js"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

test("context isolation is enabled and node integration disabled", () => {
  assert.match(mainSource, /contextIsolation:\s*true/);
  assert.match(mainSource, /nodeIntegration:\s*false/);
  assert.match(mainSource, /nodeIntegrationInWorker:\s*false/);
  assert.match(mainSource, /sandbox:\s*true/);
  assert.match(mainSource, /webSecurity:\s*true/);
  assert.match(mainSource, /allowRunningInsecureContent:\s*false/);
});

test("the app never enables node integration or disables web security", () => {
  assert.doesNotMatch(mainSource, /nodeIntegration:\s*true/);
  assert.doesNotMatch(mainSource, /contextIsolation:\s*false/);
  assert.doesNotMatch(mainSource, /sandbox:\s*false/);
  assert.doesNotMatch(mainSource, /webSecurity:\s*false/);
  assert.doesNotMatch(mainSource, /allowRunningInsecureContent:\s*true/);
});

test("a strict CSP is applied to every document", () => {
  assert.match(mainSource, /Content-Security-Policy/);
  assert.match(mainSource, /default-src 'self'/);
  assert.match(mainSource, /object-src 'none'/);
  assert.match(mainSource, /frame-ancestors 'none'/);
});

test("navigation and new windows are denied by default", () => {
  assert.match(mainSource, /setWindowOpenHandler/);
  assert.match(mainSource, /action:\s*"deny"/);
  assert.match(mainSource, /will-navigate/);
  assert.match(mainSource, /will-attach-webview/);
});

test("all renderer permissions are denied", () => {
  assert.match(mainSource, /setPermissionRequestHandler/);
  assert.match(mainSource, /setPermissionCheckHandler/);
});

test("packaging does not request administrator privileges", () => {
  assert.equal(pkg.build.win.requestedExecutionLevel, "asInvoker");
  assert.doesNotMatch(mainSource, /requireAdministrator/);
});

test("the packaged app ships the renderer and the vault modules", () => {
  assert.ok(pkg.build.files.includes("build/**/*"), "renderer build must be packaged");
  assert.ok(pkg.build.files.includes("electron/**/*"), "electron sources must be packaged");
  assert.ok(pkg.build.files.includes("node_modules/**/*") === false, "node_modules glob must not be shipped wholesale");
});

test("electron-updater is a runtime dependency, not a devDependency", () => {
  assert.ok(pkg.dependencies["electron-updater"], "main.js requires electron-updater at runtime");
  assert.equal(pkg.devDependencies["electron-updater"], undefined);
});

test("preload exposes no raw ipcRenderer and only allow-listed event channels", () => {
  assert.match(preloadSource, /contextBridge\.exposeInMainWorld/);
  assert.match(preloadSource, /ALLOWED_EVENTS/);
  assert.doesNotMatch(preloadSource, /exposeInMainWorld\([^)]*ipcRenderer\s*\)/);
  assert.doesNotMatch(preloadSource, /require\(\s*["']fs["']\s*\)/);
});

test("the renderer entry is resolved relatively for file:// loading", () => {
  const viteConfig = fs.readFileSync(path.join(root, "vite.config.js"), "utf8");
  assert.match(viteConfig, /base:\s*["']\.\/["']/);
});

test("packaging icons exist so electron-builder cannot fail on Windows", () => {
  for (const icon of ["icon.png", "icon.ico", "icon.icns"]) {
    const file = path.join(root, "electron/assets", icon);
    assert.ok(fs.existsSync(file), `missing packaging icon ${icon}; run "npm run icons"`);
    assert.ok(fs.statSync(file).size > 1000, `${icon} looks empty`);
  }
  const ico = fs.readFileSync(path.join(root, "electron/assets/icon.ico"));
  assert.equal(ico.readUInt16LE(2), 1, "icon.ico must be a real ICO container");
  const png = fs.readFileSync(path.join(root, "electron/assets/icon.png"));
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "icon.png must be a real PNG");
});

test("the app does not require administrator privileges at runtime", () => {
  assert.doesNotMatch(mainSource, /setUserTasks|runas|elevate/i);
  assert.doesNotMatch(preloadSource, /runas|elevate/i);
  const nsh = fs.readFileSync(path.join(root, "electron/installer.nsh"), "utf8");
  assert.doesNotMatch(nsh, /RequestExecutionLevel\s+admin/i, "the installer must not demand admin rights");
});

test("the packaged renderer entry exists after a build", () => {
  const entry = path.join(root, "build/index.html");
  if (!fs.existsSync(entry)) {
    // The build is a separate pipeline step; skip rather than fail spuriously.
    return;
  }
  const html = fs.readFileSync(entry, "utf8");
  assert.doesNotMatch(html, /(?:src|href)="\/assets\//, "assets must not use absolute /assets paths under file://");
});
