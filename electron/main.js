/**
 * KNOUX CRYPT - Electron Main Process
 *
 * Security posture:
 *   - context isolation ON, node integration OFF, renderer sandboxed
 *   - a strict Content-Security-Policy is injected for every document
 *   - navigation and window.open are denied by default and validated
 *   - no privilege escalation: the app does not request administrator rights
 *   - all privileged work (vault crypto, filesystem) happens here and is
 *     exposed to the renderer only through the validated vault IPC contract
 *   - the boot view is loaded last and reveals the app window only when that
 *     window reports readiness; it carries no vault surface and is not a path
 *     around the renderer's authentication gate
 */

const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  shell,
  protocol,
  net,
  nativeImage,
  powerMonitor,
  clipboard,
} = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const { VaultService } = require("./vault/service");
const { registerVaultIpc } = require("./vault/ipc");

/**
 * The version shown to the user is read from package metadata, not repeated
 * here. It used to say "2025.1.0" in three places at once, so a bump in
 * package.json left the splash, the window title and the app-info IPC all
 * reporting a release that no longer existed.
 */
function readBuildVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    if (typeof pkg.version === "string" && pkg.version) return pkg.version;
  } catch {
    // Packaged layouts always carry package.json in the asar root; if it
    // cannot be read, fall back to what Electron itself reports.
  }
  return app.getVersion();
}

const APP_CONFIG = {
  // Display name. "KnouxCrypt™ 2025" embedded a year that went stale on
  // January 1st; the product is "KNOUX CRYPT" and the year belongs to the
  // version, not the name. productName is intentionally left alone because
  // changing it moves the NSIS install directory and leaves the previous
  // install orphaned — that needs an owner decision, not a drive-by rename.
  name: "KNOUX CRYPT",
  tagline: "Private Encryption Suite",
  version: readBuildVersion(),
  // The previous description claimed a certification-grade warfighter system.
  // That is a claim, not a property: the suite uses standard, published
  // primitives (Argon2id, AES-256-GCM, X25519), and the description now says
  // what it is instead of what it aspires to sound like.
  description: "Private Encryption Suite",
  author: "Knoux Technologies",
  minWidth: 1024,
  minHeight: 720,
  defaultWidth: 1400,
  defaultHeight: 1000,
};

// The renderer source is used in development, the packaged build otherwise.
// KNOUX_USE_BUILD=1 forces the production path so the packaged entry can be
// verified without a full electron-builder run.
const isDev = !app.isPackaged && process.env.KNOUX_USE_BUILD !== "1";
const RENDERER_DIR = path.join(__dirname, "..", "build");
const RENDERER_ENTRY = path.join(RENDERER_DIR, "index.html");
const DEV_SERVER_URL = process.env.KNOUX_DEV_SERVER_URL || "http://localhost:3000";

// Only this origin may be loaded in the app window during development.
const ALLOWED_ORIGINS = new Set([DEV_SERVER_URL]);

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // 'unsafe-inline' is for framer-motion's inline style writes, not for fonts:
  // the third-party Google Fonts request was removed, so a local encryption
  // suite no longer reaches an external origin while it starts.
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

let mainWindow = null;
let splashWindow = null;
let tray = null;
let isQuitting = false;
let journalFlushed = false;
let vaultService = null;
let unregisterVaultIpc = null;

// --- boot handoff state -----------------------------------------------------
// The boot view ends on evidence, not on a timer: either the app window reports
// readiness (preferred), its document finishes loading (fallback for a renderer
// that cannot signal), or the deadline proves nothing is coming and the boot
// view shows a recovery panel instead of animating forever.
const BOOT_DEADLINE_MS = 20000;
let bootState = { state: "opening", detail: "", version: APP_CONFIG.version };
let bootViewLoaded = false;
let bootHandoffDone = false;
let bootDeadline = null;

function assetPath(...parts) {
  // In development assets live in the source tree; in production they are
  // copied to resources/assets by electron-builder.
  const base = app.isPackaged
    ? path.join(process.resourcesPath, "assets")
    : path.join(__dirname, "assets");
  return path.join(base, ...parts);
}

/**
 * Resolve an icon, tolerating a missing file so a packaging mistake cannot
 * prevent the app from starting.
 */
function loadIcon(name) {
  const file = assetPath(name);
  if (!fs.existsSync(file)) return undefined;
  const image = nativeImage.createFromPath(file);
  return image.isEmpty() ? undefined : image;
}

function applySecurityHeaders(session) {
  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [CSP],
        "X-Content-Type-Options": ["nosniff"],
      },
    });
  });
}

function safeOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function isAllowedNavigation(url) {
  if (url.startsWith("file://")) {
    return url.startsWith(pathToFileURL(RENDERER_DIR).href);
  }
  const origin = safeOrigin(url);
  return origin !== null && ALLOWED_ORIGINS.has(origin);
}

function hardenWindow(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    // External links open in the OS browser; the app never opens new windows.
    if (safeOrigin(url) && /^https?:$/.test(new URL(url).protocol)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, navigationUrl) => {
    if (!isAllowedNavigation(navigationUrl)) {
      event.preventDefault();
      shell.openExternal(navigationUrl).catch(() => {});
    }
  });

  win.webContents.on("will-attach-webview", (event) => event.preventDefault());

  // Deny every permission request (camera, microphone, geolocation, ...).
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  win.webContents.session.setPermissionCheckHandler(() => false);
}

function createSplashWindow() {
  const splashFile = path.join(__dirname, "splash.html");
  if (!fs.existsSync(splashFile)) {
    // No boot view in this layout: start the real window directly.
    createMainWindow({ revealOnReady: true });
    return;
  }

  splashWindow = new BrowserWindow({
    width: 600,
    height: 400,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    resizable: false,
    show: true,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // The boot document gets its own, much smaller bridge than the app
      // window: state plus two buttons, no vault surface at all.
      preload: path.join(__dirname, "splash-preload.js"),
    },
    icon: loadIcon("icon.png"),
  });
  splashWindow.setMenuBarVisibility(false);

  splashWindow.webContents.once("did-finish-load", () => {
    bootViewLoaded = true;
    pushBootState();
  });
  splashWindow.on("closed", () => {
    splashWindow = null;
    bootViewLoaded = false;
  });
  splashWindow.loadFile(splashFile);

  // Load the real window now, behind the boot view. Its own readiness ends the
  // transition; the boot view is not given a schedule of its own.
  createMainWindow({ revealOnReady: false });

  // A ceiling for a startup that stopped reporting anything, not the normal
  // handoff path — readiness normally arrives many seconds earlier.
  bootDeadline = setTimeout(() => {
    failBoot("The interface did not report that it was ready within 20 seconds.");
  }, BOOT_DEADLINE_MS);
}

/**
 * Reveal the app and retire the boot view.
 *
 * This only shows the window. It grants nothing: the vault session, the
 * enrollment and the unlock all still happen behind the renderer's own gate,
 * so an early handoff could not reach a stored secret any more than a late one
 * can.
 */
function completeBoot() {
  if (bootHandoffDone) return;
  bootHandoffDone = true;
  if (bootDeadline) {
    clearTimeout(bootDeadline);
    bootDeadline = null;
  }
  setBootState("interface_ready");
  // Show first, then close: the boot view is alwaysOnTop, so for one frame it
  // covers the real window instead of leaving the desktop visible between them.
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  splashWindow = null;
}

/**
 * Keep the boot view up and swap its animation for an accessible recovery
 * panel with the real reason. Revealing a window that never reported readiness
 * would trade a visible failure for a blank one.
 */
function failBoot(detail) {
  if (bootHandoffDone) return;
  if (bootDeadline) {
    clearTimeout(bootDeadline);
    bootDeadline = null;
  }
  setBootState("failed", detail);
}

function setBootState(state, detail = "") {
  bootState = { state, detail, version: APP_CONFIG.version };
  pushBootState();
}

function pushBootState() {
  if (!splashWindow || splashWindow.isDestroyed() || !bootViewLoaded) return;
  splashWindow.webContents.send("boot:state", bootState);
}

/**
 * The boot view's whole privileged surface: retry, quit, and a readiness report
 * that only the app window itself is allowed to make.
 */
function registerBootIpc() {
  const { ipcMain } = require("electron");

  ipcMain.removeAllListeners("boot:renderer-ready");
  ipcMain.on("boot:renderer-ready", (event) => {
    // Without this the hidden boot document — or any other web content — could
    // declare the app ready and drive the handoff.
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (event.sender !== mainWindow.webContents) return;
    completeBoot();
  });

  ipcMain.removeAllListeners("boot:retry");
  ipcMain.on("boot:retry", () => {
    setBootState("retrying");
    if (!isDev && !fs.existsSync(RENDERER_ENTRY)) {
      // Retrying cannot fix a missing build, and reloading the window that was
      // left on about:blank would fire did-finish-load for that blank document
      // and reveal an empty window. Stay in recovery with the same reason.
      failBoot(`The packaged renderer was not found at ${RENDERER_ENTRY}. Run "npm run build" before packaging.`);
      return;
    }
    if (!mainWindow || mainWindow.isDestroyed()) {
      createMainWindow({ revealOnReady: false });
    } else {
      bootHandoffDone = false;
      if (bootDeadline) clearTimeout(bootDeadline);
      bootDeadline = setTimeout(() => {
        failBoot("The interface still did not report that it was ready within 20 seconds.");
      }, BOOT_DEADLINE_MS);
      mainWindow.webContents.reload();
    }
  });

  ipcMain.removeAllListeners("boot:quit");
  ipcMain.on("boot:quit", () => {
    isQuitting = true;
    app.quit();
  });
}

/**
 * @param {{revealOnReady?: boolean}} options `revealOnReady: false` is used
 *   while the boot view is up: the window loads hidden and `completeBoot()`
 *   shows it, so nothing is ever revealed before it has reported itself.
 */
function createMainWindow(options) {
  const { revealOnReady = true } = options || {};
  if (mainWindow && !mainWindow.isDestroyed()) return focusMainWindow();

  mainWindow = new BrowserWindow({
    width: APP_CONFIG.defaultWidth,
    height: APP_CONFIG.defaultHeight,
    minWidth: APP_CONFIG.minWidth,
    minHeight: APP_CONFIG.minHeight,
    show: false,
    frame: false,
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 20, y: 20 },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      preload: path.join(__dirname, "preload.js"),
    },
    icon: loadIcon("icon.png"),
    // #080411 is --crypt-obsidian, the colour shell.css paints html/body with.
    // The window used to open on the legacy slate theme's colour, so startup
    // flashed blue-gray before the violet app painted over it.
    backgroundColor: "#080411",
  });

  hardenWindow(mainWindow);
  applySecurityHeaders(mainWindow.webContents.session);

  // Readiness plumbing for the boot handoff. Both signals are facts about this
  // window, reported by Electron, not a schedule the boot view invents.
  mainWindow.webContents.once("did-finish-load", () => {
    // The renderer's own handshake is preferred; this fallback covers a build
    // whose root component no longer signals, so a working app can never be
    // held behind the boot view until the deadline.
    completeBoot();
  });
  mainWindow.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame) return;
    if (isDev && code === -102 && url.startsWith(DEV_SERVER_URL) && fs.existsSync(RENDERER_ENTRY)) {
      console.warn(`[main] dev server unavailable (${description}); loading ${RENDERER_ENTRY}`);
      mainWindow.loadFile(RENDERER_ENTRY);
      return;
    }
    failBoot(`The interface failed to load (${description}, code ${code}).`);
  });

  if (isDev) {
    mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    if (!fs.existsSync(RENDERER_ENTRY)) {
      const detail = `The packaged renderer was not found at ${RENDERER_ENTRY}. Run "npm run build" before packaging.`;
      if (splashWindow && !splashWindow.isDestroyed()) {
        // The boot view is up: its recovery panel is the accessible place for
        // this, so do not stack a modal dialog on top of it.
        failBoot(detail);
        return;
      }
      dialog.showErrorBox(`${APP_CONFIG.name} — build missing`, detail);
      return;
    }
    mainWindow.loadFile(RENDERER_ENTRY);
  }

  mainWindow.once("ready-to-show", () => {
    if (!revealOnReady) return;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });

  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
    if (process.platform !== "darwin") {
      showNotification("KnouxCrypt™ يعمل في الخلفية", "انقر على أيقونة الصينية للوصول السريع");
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  setupMenu();
  setupSystemTray();
}

function setupSystemTray() {
  // On Linux a Tray requires a display server and a StatusNotifier host; GTK
  // aborts the whole process (not a catchable exception) when there is none.
  // Skip the tray in headless/CI runs instead of crashing the app.
  if (process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return;

  const icon = loadIcon("tray-icon.png") || loadIcon("icon.png");
  if (!icon) return;
  try {
    tray = new Tray(icon);
  } catch {
    tray = null;
    return;
  }

  // Plain text labels: Win32 menus render emoji inconsistently (often as
  // monochrome glyphs or tofu boxes), and a lock glyph here would be a generic
  // icon standing in for the product's own.
  const contextMenu = Menu.buildFromTemplate([
    { label: `${APP_CONFIG.name} — ${APP_CONFIG.tagline}`, enabled: false },
    { type: "separator" },
    { label: "إظهار النافذة الرئيسية", click: () => focusMainWindow() },
    {
      label: "قفل الخزنة الآن",
      click: () => {
        if (vaultService) vaultService.lockAll("tray");
        sendToRenderer("vault-locked");
      },
    },
    { type: "separator" },
    {
      label: "إنهاء البرنامج",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  // The tooltip states what the suite is rather than what it used to claim to
  // be: the old Arabic tagline asserted a certified military system, which this
  // project has never had.
  tray.setToolTip(`${APP_CONFIG.name} — ${APP_CONFIG.tagline}`);
  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => focusMainWindow());
}

function focusMainWindow() {
  // While the boot view is still up the main window is deliberately hidden and
  // unverified. A second-instance launch, a tray click or an OS "activate" must
  // raise the boot view instead of revealing a renderer that has not reported
  // readiness.
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.moveTop();
    splashWindow.focus();
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function sendToRenderer(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

function focusAndSend(channel) {
  focusMainWindow();
  sendToRenderer(channel);
}

function setupMenu() {
  const template = [
    {
      label: "ملف",
      submenu: [
        {
          label: "تشفير ملف جديد",
          accelerator: "CmdOrCtrl+N",
          click: () => focusAndSend("encrypt-new-file"),
        },
        { type: "separator" },
        {
          label: "قفل الخزنة",
          accelerator: "CmdOrCtrl+L",
          click: () => {
            if (vaultService) vaultService.lockAll("menu");
            sendToRenderer("vault-locked");
          },
        },
        { type: "separator" },
        {
          label: "إنهاء",
          accelerator: process.platform === "darwin" ? "Cmd+Q" : "Ctrl+Q",
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ],
    },
    {
      label: "تحرير",
      submenu: [
        { label: "تراجع", accelerator: "CmdOrCtrl+Z", role: "undo" },
        { label: "إعادة", accelerator: "Shift+CmdOrCtrl+Z", role: "redo" },
        { type: "separator" },
        { label: "قص", accelerator: "CmdOrCtrl+X", role: "cut" },
        { label: "نسخ", accelerator: "CmdOrCtrl+C", role: "copy" },
        { label: "لصق", accelerator: "CmdOrCtrl+V", role: "paste" },
        { label: "تحديد الكل", accelerator: "CmdOrCtrl+A", role: "selectall" },
      ],
    },
    {
      label: "عرض",
      submenu: [
        { label: "إعادة تحميل", accelerator: "CmdOrCtrl+R", role: "reload" },
        { label: "تكبير فعلي", accelerator: "CmdOrCtrl+0", role: "resetzoom" },
        { label: "تكبير", accelerator: "CmdOrCtrl+Plus", role: "zoomin" },
        { label: "تصغير", accelerator: "CmdOrCtrl+-", role: "zoomout" },
        { type: "separator" },
        { label: "ملء الشاشة", accelerator: "F11", role: "togglefullscreen" },
      ],
    },
    {
      label: "نافذة",
      submenu: [
        { label: "تصغير", accelerator: "CmdOrCtrl+M", role: "minimize" },
        { label: "إغلاق", accelerator: "CmdOrCtrl+W", role: "close" },
      ],
    },
    {
      label: "مساعدة",
      submenu: [
        { label: "حول KnouxCrypt™", click: () => showAboutDialog() },
        { label: "التحقق من التحديثات", click: () => checkForUpdates() },
        { type: "separator" },
        { label: "موقع الويب", click: () => shell.openExternal("https://knouxcrypt.com") },
      ],
    },
  ];

  if (process.platform === "darwin") {
    template.unshift({
      label: APP_CONFIG.name,
      submenu: [
        { label: `حول ${APP_CONFIG.name}`, role: "about" },
        { type: "separator" },
        { label: "الخدمات", role: "services", submenu: [] },
        { type: "separator" },
        { label: `إخفاء ${APP_CONFIG.name}`, accelerator: "Command+H", role: "hide" },
        { label: "إخفاء الآخرين", accelerator: "Command+Shift+H", role: "hideothers" },
        { label: "إظهار الكل", role: "unhide" },
        { type: "separator" },
        { label: "إنهاء", accelerator: "Command+Q", click: () => app.quit() },
      ],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function showAboutDialog() {
  dialog.showMessageBox(mainWindow || undefined, {
    type: "info",
    title: `حول ${APP_CONFIG.name}`,
    message: `${APP_CONFIG.name} — ${APP_CONFIG.tagline}`,
    // The version and description are read from package metadata at startup, so
    // this dialog cannot advertise a release that no longer exists. The year is
    // the current one rather than a literal that went stale.
    detail: `الإصدار: ${APP_CONFIG.version}\n${APP_CONFIG.description}\n\nطور بواسطة: ${APP_CONFIG.author}\n\n© ${new Date().getFullYear()} جميع الحقوق محفوظة`,
    buttons: ["موافق"],
  });
}

function showNotification(title, body) {
  const { Notification } = require("electron");
  if (Notification.isSupported()) {
    new Notification({ title, body, icon: loadIcon("icon.png") }).show();
  }
}

function checkForUpdates() {
  // Updates are only checked when the app is packaged and a publisher is set.
  if (!app.isPackaged) return;
  autoUpdater.checkForUpdatesAndNotify().catch(() => {});
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;
  autoUpdater.on("error", () => {});
  autoUpdater.on("update-available", () => {
    dialog.showMessageBox(mainWindow || undefined, {
      type: "info",
      title: "تحديث متاح",
      message: "يتوفر إصدار جديد من KnouxCrypt™",
      detail: "سيتم تنزيل التحديث في الخلفية وسيتم إشعارك عند الانتهاء.",
      buttons: ["موافق"],
    });
  });
  autoUpdater.on("update-downloaded", () => {
    dialog
      .showMessageBox(mainWindow || undefined, {
        type: "info",
        title: "التحديث جاهز",
        message: "تم تنزيل التحديث وهو جاهز للتثبيت",
        detail: "سيتم إعادة تشغيل التطبيق لتطبيق التحديث.",
        buttons: ["إعادة التشغيل الآن", "لاحقاً"],
      })
      .then((result) => {
        if (result.response === 0) autoUpdater.quitAndInstall();
      });
  });
}

/**
 * Minimal, validated window-control channel used by the frameless titlebar.
 * The renderer may only ask for these three named actions.
 */
function registerWindowControls() {
  const { ipcMain } = require("electron");
  const actions = {
    "window-minimize": () => mainWindow && !mainWindow.isDestroyed() && mainWindow.minimize(),
    "window-maximize": () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    },
    "window-close": () => mainWindow && !mainWindow.isDestroyed() && mainWindow.close(),
  };
  for (const [channel, fn] of Object.entries(actions)) {
    ipcMain.removeAllListeners(channel);
    ipcMain.on(channel, () => fn());
  }
  ipcMain.handle("app-info", () => ({
    name: APP_CONFIG.name,
    tagline: APP_CONFIG.tagline,
    version: APP_CONFIG.version,
    description: APP_CONFIG.description,
    isDev,
    platform: process.platform,
  }));
}

function registerAppProtocol() {
  // A read-only handler scoped to the packaged renderer directory.
  protocol.handle("knouxcrypt", (request) => {
    let relative;
    try {
      relative = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, "");
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    const resolved = path.resolve(RENDERER_DIR, relative);
    if (resolved !== RENDERER_DIR && !resolved.startsWith(RENDERER_DIR + path.sep)) {
      return new Response("Forbidden", { status: 403 });
    }
    return net.fetch(pathToFileURL(resolved).href);
  });
}

// Only one instance may hold the vault session.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => focusMainWindow());

  app.whenReady().then(() => {
    registerAppProtocol();

    vaultService = new VaultService({
      userDataPath: app.getPath("userData"),
      // The clipboard guard gets the real OS clipboard here. In tests the
      // service is built without an adapter, so no display server is required.
      clipboardAdapter: {
        writeText: (value) => clipboard.writeText(value),
        readText: () => clipboard.readText(),
        clear: () => clipboard.clear(),
      },
    });
    unregisterVaultIpc = registerVaultIpc(vaultService, () => mainWindow);
    registerWindowControls();

    // Remove any decrypted document temp files left behind by a previous
    // crash before the user can open a new one.
    vaultService.viewerSweep().catch(() => {});

    setupAutoUpdater();
    registerBootIpc();
    createSplashWindow();

    // Real session-lock controls (task 14). Locking on OS suspend and on screen
    // lock is what actually protects a session that is left unattended; it is
    // not a cosmetic indicator. These events are OS-provided, not app-guessed.
    if (powerMonitor) {
      const lockForReason = async (reason, preference) => {
        if (!vaultService) return;
        if (preference) {
          try {
            const { values } = await vaultService.preferencesGet();
            if (values && values[preference] === false) return;
          } catch {
            // Fall through and lock: failing closed is the safe default.
          }
        }
        vaultService.lockAll(reason);
      };
      powerMonitor.on("suspend", () => lockForReason("suspend", "lockOnSuspend"));
      powerMonitor.on("lock-screen", () => lockForReason("screen-lock", "lockOnSuspend"));
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
      else focusMainWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
  if (vaultService) vaultService.lockAll("quit");
});

app.on("will-quit", (event) => {
  // The security journal persists asynchronously, so a write can still be in
  // flight here. Give it one chance to flush before the process exits, but
  // never let a stuck journal block quit for longer than a short deadline.
  if (vaultService && typeof vaultService.close === "function" && !journalFlushed) {
    event.preventDefault();
    journalFlushed = true;
    const deadline = new Promise((resolve) => setTimeout(resolve, 1500));
    Promise.race([vaultService.close(), deadline])
      .catch(() => {})
      .then(() => app.quit());
    return;
  }
  if (unregisterVaultIpc) unregisterVaultIpc();
});

// Security-relevant hardening for every renderer that is created.
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-attach-webview", (event) => event.preventDefault());
});

process.on("uncaughtException", (error) => {
  // Never surface a raw stack trace to the user.
  dialog.showErrorBox("خطأ في التطبيق", "حدث خطأ غير متوقع. تم تسجيل التفاصيل محلياً.");
  console.error("[main] uncaught exception:", error && error.message);
});

module.exports = {
  app,
  get mainWindow() {
    return mainWindow;
  },
  APP_CONFIG,
};
