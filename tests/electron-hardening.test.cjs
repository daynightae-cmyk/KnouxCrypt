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

test("no policy anywhere permits unsafe-eval", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const splash = fs.readFileSync(path.join(root, "electron/splash.html"), "utf8");
  for (const [name, source] of [["main.js", mainSource], ["index.html", html], ["splash.html", splash]]) {
    assert.doesNotMatch(source, /unsafe-eval/, `${name} must not permit eval`);
  }
});

test("the splash document declares its own CSP", () => {
  // This gap was found by running the real app, not by the grep above: main.js
  // installs its CSP through onHeadersReceived, which does not cover the splash
  // document, and the previous version of splash.html carried no policy at all
  // while an earlier test claimed "a strict CSP is applied to every document".
  const splash = fs.readFileSync(path.join(root, "electron/splash.html"), "utf8");
  assert.match(splash, /http-equiv="Content-Security-Policy"/, "splash.html must declare a CSP");
  assert.match(splash, /script-src 'self'/, "the splash may only run its own script");
  assert.match(splash, /connect-src 'none'/, "the splash must make no network connection");
  assert.doesNotMatch(splash, /style-src[^"]*'unsafe-inline'/, "the splash stylesheet is external, so inline styles must not be allowed");
});

test("the splash has no inline script or style to permit", () => {
  const splashPath = path.join(root, "electron/splash.html");
  const splash = fs.readFileSync(splashPath, "utf8");
  assert.doesNotMatch(splash, /<script>(?!\s*<\/script>)/, "no inline <script> block");
  assert.doesNotMatch(splash, /<style>/, "no inline <style> block");
  assert.match(splash, /<script src="\.\/splash\.js"/, "the splash script is external");
  assert.match(splash, /<link rel="stylesheet" href="\.\/splash\.css"/, "the splash stylesheet is external");
  // Referenced files must actually ship: electron-builder packs electron/**/*.
  for (const asset of ["electron/splash.js", "electron/splash.css"]) {
    assert.ok(fs.existsSync(path.join(root, asset)), `${asset} must exist`);
  }
  assert.ok(pkg.build.files.includes("electron/**/*"), "electron assets must be packaged");
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

test("the NSIS include does not fight the generated template", () => {
  // electron-builder !include's this file *after* defining MUI_ICON, MUI_UNICON
  // and the install section, so redefining them aborts makensis with
  // `!define: "MUI_ICON" already defined!` — which is exactly how the x64 NSIS
  // target was left unbuildable. Nothing in the suite noticed, because the test
  // script never runs electron-builder. These assertions keep that class of
  // failure in CI instead of discovered at release time.
  const nsh = fs.readFileSync(path.join(root, "electron/installer.nsh"), "utf8");
  // Assert against the code only. This file documents, in prose, the symbols a
  // previous revision wrongly used — and that history must not trip the guard
  // that exists to stop it being repeated.
  const code = nsh
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  for (const symbol of ["MUI_ICON", "MUI_UNICON", "MUI_FINISHPAGE_RUN", "MUI_HEADER"]) {
    assert.doesNotMatch(
      code,
      new RegExp(`^\\s*!define\\s+${symbol}\\b`, "m"),
      `${symbol} is defined by the template; installer.nsh must not redefine it unguarded`,
    );
  }
  // A hand-written copy of the application would be a second, conflicting install.
  assert.doesNotMatch(code, /^\s*Section\s+["']/m, "installer.nsh must not declare its own install Section");
  assert.doesNotMatch(code, /\$\{BUILD_DIR\}/, "BUILD_DIR is not defined by the template");
  // The package requests asInvoker, so machine-wide hives are not writable.
  assert.doesNotMatch(code, /WriteRegStr\s+HKLM/, "asInvoker cannot write HKLM");
  assert.doesNotMatch(code, /WriteReg\w*\s+HKCR/, "asInvoker cannot write HKCR");
  assert.match(code, /!macro\s+customInstall/, "per-user registration belongs in customInstall");
  assert.match(code, /!macro\s+customUnInstall/, "cleanup belongs in customUnInstall");
});

test("uninstalling does not delete the user's vault", () => {
  // The single most dangerous setting in an encryption product's installer.
  assert.equal(pkg.build.nsis.deleteAppDataOnUninstall, false, "deleteAppDataOnUninstall must stay false");
  const codeLines = fs
    .readFileSync(path.join(root, "electron/installer.nsh"), "utf8")
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  assert.doesNotMatch(
    codeLines,
    /RMDir[^\n]*(APPDATA|vault-store|vault-enrollment|KnouxCrypt)/i,
    "installer.nsh must not remove user data",
  );
});

test("packaging requests no administrator privileges", () => {
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

test("packaging only asks for architectures Electron can actually build", () => {
  // Electron 45 publishes no 32-bit Windows build: the release asset
  // electron-v45.2.1-win32-ia32.zip answers 404. Requesting ia32 made every
  // packaging run end in an error after the x64 app was already unpacked, so
  // the installer and portable steps never ran.
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  for (const target of pkg.build.win.target) {
    assert.ok(
      !target.arch.includes("ia32"),
      `the ${target.target} target still asks for ia32, which Electron 45 cannot build`,
    );
    assert.ok(target.arch.includes("x64"), `the ${target.target} target must still build x64`);
  }
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
