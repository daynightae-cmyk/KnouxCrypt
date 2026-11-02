"use strict";

/**
 * Startup identity tests.
 *
 * These guard the things that were actually wrong, in the form that makes them
 * stay wrong-proof rather than screenshot-proof:
 *
 *   - the boot view showed a `🔐` emoji and a blue-gray theme instead of the
 *     official stag-K, and its eye glow was a separate drawing that could drift
 *     from the in-app emblem;
 *   - it rotated invented status text on a 500 ms timer and animated a progress
 *     bar to a fixed width, none of which measured anything;
 *   - it held the user for exactly 3000 ms whether or not the renderer was ready,
 *     and showed nothing when the renderer failed;
 *   - the version was hardcoded in four places, so a bump left stale release
 *     strings behind;
 *   - every app, tray, taskbar, installer and shortcut icon came from a
 *     generator that drew "a gradient disc with a white padlock".
 *
 * A grep proves a string is absent; it does not prove the thing works. So the
 * identity-critical claims (the emblem paints, the CSP holds, the handoff is
 * readiness-driven) are also measured in real Electron by
 * scripts/check-csp-runtime.cjs and scripts/electron-lifecycle-check.cjs, and
 * this file covers the drift guards those runs cannot see.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const readBytes = (...parts) => fs.readFileSync(path.join(root, ...parts));
const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

const EMOJI = {
  lock: "\u{1F510}",
  lockWithPen: "\u{1F50F}",
  closedLock: "\u{1F512}",
  openLock: "\u{1F513}",
  shield: "\u{1F6E1}",
};

test("the boot view carries the official emblem, byte for byte", () => {
  const source = readBytes("src", "assets", "knoux-stag.png");
  const boot = readBytes("electron", "stag-k.png");
  assert.equal(
    sha256(boot),
    sha256(source),
    "electron/stag-k.png must be the official emblem unchanged, not a re-export or a redraw",
  );
  // 1254x1254, read out of the IHDR rather than trusted from a filename.
  assert.equal(boot.readUInt32BE(16), 1254);
  assert.equal(boot.readUInt32BE(20), 1254);
  assert.match(read("electron", "splash.html"), /src="\.\/stag-k\.png"/);
});

test("the boot eye masks cannot drift from the in-app emblem", () => {
  // The glow is only credible if it sits on the same traced contours the app
  // uses. Two hand-copied path strings will diverge; this makes that a failure.
  const emblem = read("src", "components", "entry", "StagEmblem.jsx");
  const splash = read("electron", "splash.html");
  const left = emblem.match(/export const LEFT_EYE = '([^']+)'/);
  const right = emblem.match(/export const RIGHT_EYE = '([^']+)'/);
  assert.ok(left && right, "StagEmblem.jsx must keep exporting the traced eye paths");
  assert.ok(splash.includes(left[1]), "the boot view's left eye must be the same path");
  assert.ok(splash.includes(right[1]), "the boot view's right eye must be the same path");
  // Same palette, so the ignition matches the emblem the user sees afterwards.
  for (const stop of ["#ffffff", "#f7e9ff", "#bc65ff"]) {
    assert.ok(splash.includes(stop), `the eye gradient must keep the ${stop} stop from StagEmblem`);
  }
  // The occlusion layer that lets the source's painted eyes go dark.
  assert.match(splash, /class="boot-eye-shutter" fill="#090511"/);
});

test("the boot view fabricates nothing", () => {
  const splashHtml = read("electron", "splash.html");
  const splashJs = read("electron", "splash.js");
  const splashCss = read("electron", "splash.css");

  for (const forbidden of ["loading-bar", "loading-progress", "particle", "loadingTexts"]) {
    assert.ok(!splashHtml.includes(forbidden), `splash.html must not resurrect "${forbidden}"`);
    assert.ok(!splashJs.includes(forbidden), `splash.js must not resurrect "${forbidden}"`);
    assert.ok(!splashCss.includes(forbidden), `splash.css must not resurrect "${forbidden}"`);
  }
  // The five invented Arabic status lines the old timer rotated through.
  for (const claim of ["تهيئة خوارزميات", "فحص الأمان", "تحميل الواجهة", "تطبيق الإعدادات", "النظام جاهز"]) {
    assert.ok(!splashHtml.includes(claim) && !splashJs.includes(claim), `"${claim}" is not a measured state`);
  }
  // No timed rotation of text, and no self-restart, in the boot controller.
  assert.doesNotMatch(splashJs, /setInterval/, "the boot view must not run a status timer");
  assert.doesNotMatch(splashJs, /Math\.random/, "the boot view must not invent motion");
  // Only states the main process can actually be in.
  for (const state of ["opening", "retrying", "interface_ready", "failed"]) {
    assert.ok(splashJs.includes(state), `the controller must handle the real "${state}" state`);
  }
});

test("the boot view is a transition, not a second cinematic intro", () => {
  const css = read("electron", "splash.css");
  // SplashEntry.jsx owns the long introduction. The boot view ignites once.
  assert.doesNotMatch(css, /animation:[^;]*infinite/, "the boot view must not loop its ignition");
  assert.match(css, /prefers-reduced-motion: reduce/);
  // Reduced motion resolves to the finished pose, not a frozen half-open eye.
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.boot-eye-aperture \{ transform: scaleY\(1\)/);
  assert.match(reduced, /\.boot-eye-envelope \{ opacity: \.88/);
});

test("the boot window exposes no vault surface and cannot bypass the gate", () => {
  const preload = read("electron", "splash-preload.js");
  const main = read("electron", "main.js");
  // The app bridge is a different file with a much larger surface.
  // Assert on the channels the bridge actually touches, not on prose: the file
  // explains in comments that it carries no vault surface, and a word match
  // would trip over its own documentation.
  const channels = [...preload.matchAll(/ipcRenderer\.(?:send|on|invoke)\(\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    [...new Set(channels)].sort(),
    ["boot:quit", "boot:retry", "boot:state"],
    `the boot bridge may only touch the boot channels, saw ${JSON.stringify(channels)}`,
  );
  assert.ok(!main.includes('require("./preload")'), "the boot preload must not import the app preload");
  const bootWindowBlock = main.slice(main.indexOf("function createSplashWindow"), main.indexOf("/**\n * Reveal the app"));
  assert.match(bootWindowBlock, /splash-preload\.js/, "the boot window must use the narrow preload");
  assert.doesNotMatch(bootWindowBlock, /nodeIntegration: true|contextIsolation: false|sandbox: false/);

  // Readiness may only be declared by the app window's own frame.
  const handoff = main.slice(main.indexOf("function registerBootIpc"));
  assert.match(handoff, /event\.sender !== mainWindow\.webContents/, "the handshake must be sender-checked");
  // And the handoff reveals; it never authenticates.
  const complete = main.slice(main.indexOf("function completeBoot"), main.indexOf("function failBoot"));
  assert.doesNotMatch(complete, /unlock|enroll|sessionId/, "the handoff must not touch the session");
  assert.match(complete, /mainWindow\.show\(\)/);
});

test("startup is readiness-driven, not a fixed wait", () => {
  const main = read("electron", "main.js");
  assert.doesNotMatch(main, /setTimeout\([^)]*\},\s*3000\)/, "the 3-second splash timer must stay gone");
  assert.match(main, /createMainWindow\(\{ revealOnReady: false \}\)/, "the app window loads behind the boot view");
  // Asserted on the function that owns the listeners, so the distance between
  // the event and the call does not matter and a comment cannot break it.
  const createMain = main.slice(main.indexOf("function createMainWindow"), main.indexOf("function setupSystemTray"));
  assert.match(createMain, /did-finish-load[\s\S]*?completeBoot\(\)/, "a loaded document is a readiness signal");
  assert.match(createMain, /did-fail-load[\s\S]*?failBoot\(/, "a failed load must reach the recovery state");
  // Chromium renders its own error page in the same webContents after a failed
  // load, and that page fires did-finish-load. Without this guard the failed
  // renderer would be revealed as if it were the app — which the acceptance
  // suite caught in the renderer-failure mode.
  assert.match(createMain, /if \(mainLoadFailed\) return;/, "a failed document must never be revealed as the app");
  // The deadline is a failure detector, and it is long enough not to be the
  // normal path; the old code used 3000 ms as the *success* path.
  const deadline = main.match(/const BOOT_DEADLINE_MS = (\d+)/);
  assert.ok(deadline && Number(deadline[1]) >= 15000, "the ceiling must only catch a dead startup");
  // Recovery is reachable and accessible, not an infinite animation.
  const splash = read("electron", "splash.html");
  assert.match(splash, /id="bootRecovery"[^>]*hidden/);
  assert.match(splash, /<button id="bootRetry"/);
  assert.match(splash, /<button id="bootQuit"/);
  assert.match(splash, /role="status" aria-live="polite"/);
  assert.match(splash, /vault and encrypted files are untouched/);
});

test("no identity surface falls back to a lock emoji or a padlock", () => {
  const files = [
    ["electron", "splash.html"],
    ["electron", "splash.js"],
    ["electron", "splash.css"],
    ["electron", "main.js"],
    ["scripts", "generate-icons.cjs"],
    ["index.html"],
  ];
  for (const parts of files) {
    const text = read(...parts);
    for (const [name, glyph] of Object.entries(EMOJI)) {
      assert.ok(!text.includes(glyph), `${parts.join("/")} must not use the ${name} emoji as a mark`);
    }
  }
  // The retired generator must not still be able to draw the old logo. The
  // word describing it may appear in comments; the artwork may not.
  const retired = read("electron", "assets", "generate-icons.js");
  assert.doesNotMatch(retired, /<circle|<svg|shackle|writeFileSync/, "the retired generator must keep no artwork and write no files");
  assert.match(retired, /neutralised: true/);
});

test("the version the user sees comes from package metadata", () => {
  const pkg = JSON.parse(read("package.json"));
  const main = read("electron", "main.js");
  const preload = read("electron", "preload.js");
  assert.ok(pkg.version, "package.json must carry the version");
  // No duplicated literal that a release bump would leave behind.
  assert.doesNotMatch(main, /version:\s*["']20/, "main.js must not hardcode a version string");
  assert.doesNotMatch(preload, /["']2025\.1\.0["']/, "preload.js must not hardcode a version string");
  assert.match(main, /function readBuildVersion\(\)/);
  assert.match(main, /JSON\.parse\(fs\.readFileSync\(path\.join\(__dirname, "\.\.", "package\.json"\)/);
  assert.match(main, /app\.getVersion\(\)/, "with a fallback so the field can never be blank");
  // And the boot view prints whatever it was told rather than a literal.
  assert.match(read("electron", "splash.html"), /id="bootVersion"[^>]*>\s*<\/p>/, "the markup must ship the field empty");
});

test("unsupported capability claims are gone from the identity surfaces", () => {
  const surfaces = [
    "electron/main.js",
    "electron/splash.html",
    "electron/installer.nsh",
    "index.html",
    "metadata.json",
    "package.json",
    "src/config/AppConfig.ts",
  ];
  for (const file of surfaces) {
    const text = read(...file.split("/"));
    assert.ok(!/التشفير العسكري|Military-Grade|Military Grade/i.test(text), `${file} must not claim a military grade`);
    // The suite encrypts files and vaults locally; it has never done whole-disk.
    assert.ok(!/Disk Encryption/i.test(text), `${file} must not claim disk encryption`);
  }
  // Internal enum identifiers are deliberately untouched: renaming
  // `encryptionLevel: "military"` would invalidate stored preferences for no
  // user-visible gain. This asserts the distinction was made on purpose.
  assert.match(read("src", "config", "AppConfig.ts"), /encryptionLevel: "military"/);
});

test("every shipped icon is derived from the official emblem", () => {
  const generator = require("../scripts/generate-icons.cjs");
  const { decodePng, renderIcon, alphaBoundingBox, SOURCE } = generator;

  const mark = decodePng(fs.readFileSync(SOURCE));
  const bbox = alphaBoundingBox(mark);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "knoux-icons-"));
  try {
    // Regenerate the shipped 512 and compare decoded pixels. Byte comparison
    // would tie the guard to a specific zlib build; pixels are the contract.
    const expected = renderIcon(512, mark, bbox, { fill: 0.84, alphaGain: 1 });
    const shipped = decodePng(readBytes("electron", "assets", "icon.png"));
    assert.equal(shipped.width, 512);
    assert.equal(shipped.height, 512);
    assert.equal(
      sha256(shipped.data),
      sha256(expected),
      "electron/assets/icon.png is stale: run `npm run icons` after changing the emblem or the generator",
    );

    // The container the Windows build actually consumes.
    const ico = readBytes("electron", "assets", "icon.ico");
    assert.equal(ico.readUInt16LE(2), 1, "icon.ico must be an icon directory");
    const sizes = [];
    for (let i = 0; i < ico.readUInt16LE(4); i++) {
      const o = 6 + i * 16;
      const size = ico[o] === 0 ? 256 : ico[o];
      const len = ico.readUInt32LE(o + 8);
      const offset = ico.readUInt32LE(o + 12);
      const png = ico.subarray(offset, offset + len);
      assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${size}px entry must be a PNG`);
      const decoded = decodePng(png);
      assert.equal(decoded.width, size, `${size}px entry has the wrong width`);
      let opaque = 0;
      for (let p = 3; p < decoded.data.length; p += 4) if (decoded.data[p] > 200) opaque++;
      assert.ok(opaque / (size * size) > 0.6, `${size}px entry is mostly empty`);
      sizes.push(size);
    }
    for (const needed of [16, 32, 48, 256]) {
      assert.ok(sizes.includes(needed), `the shell needs a ${needed}px entry`);
    }

    // Packaging must still point at these files, not at a hand-made icon.
    const pkg = JSON.parse(read("package.json"));
    assert.equal(pkg.build.win.icon, "electron/assets/icon.ico");
    assert.equal(pkg.build.nsis.installerIcon, "electron/assets/icon.ico");
    assert.equal(pkg.build.nsis.uninstallerIcon, "electron/assets/icon.ico");
    assert.equal(pkg.build.mac.icon, "electron/assets/icon.icns");
    assert.equal(pkg.build.linux.icon, "electron/assets/icon.png");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("the web build has a real favicon", () => {
  // index.html referenced /favicon.ico while no public directory existed, so
  // every browser tab showed the default globe.
  assert.ok(fs.existsSync(path.join(root, "public", "favicon.ico")), "public/favicon.ico must exist");
  const html = read("index.html");
  assert.match(html, /<link rel="icon" href="\/favicon\.ico"/);
  assert.doesNotMatch(html, /type="image\/svg\+xml" href="\/favicon\.ico"/, "the type must match the file");
  assert.match(html, /<title>KNOUX CRYPT — Private Encryption Suite<\/title>/);
});

test("the window background matches the app's own obsidian, not the legacy slate", () => {
  const main = read("electron", "main.js");
  const shell = read("src", "components", "shell", "shell.css");
  const token = shell.match(/--crypt-obsidian:\s*(#[0-9a-fA-F]{6})/);
  assert.ok(token, "shell.css must define --crypt-obsidian");
  assert.ok(
    main.toLowerCase().includes(`backgroundcolor: "${token[1].toLowerCase()}"`),
    `main.js must paint ${token[1]} so startup cannot flash the old #0F172A`,
  );
  assert.doesNotMatch(main, /#0F172A/i, "the legacy slate background must be gone");
});
