/**
 * KnouxCrypt™ 2025 - Electron Main Process
 *
 * Security posture:
 *   - context isolation ON, node integration OFF, renderer sandboxed
 *   - a strict Content-Security-Policy is injected for every document
 *   - navigation and window.open are denied by default and validated
 *   - no privilege escalation: the app does not request administrator rights
 *   - all privileged work (vault crypto, filesystem) happens here and is
 *     exposed to the renderer only through the validated vault IPC contract
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

const APP_CONFIG = {
  name: "KnouxCrypt™ 2025",
  version: "2025.1.0",
  description: "نظام التشفير العسكري المتقدم",
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
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
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
let vaultService = null;
let unregisterVaultIpc = null;

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
  if (!fs.existsSync(splashFile)) return createMainWindow();

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
    },
    icon: loadIcon("icon.png"),
  });

  splashWindow.loadFile(splashFile);

  const splashTimer = setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    createMainWindow();
  }, 3000);
  splashWindow.on("closed", () => {
    clearTimeout(splashTimer);
    splashWindow = null;
  });
}

function createMainWindow() {
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
    backgroundColor: "#0F172A",
  });

  hardenWindow(mainWindow);
  applySecurityHeaders(mainWindow.webContents.session);

  if (isDev) {
    mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
    // A dev server may not be running (e.g. a source checkout started directly).
    // Fall back to the built renderer instead of showing a blank error page.
    mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
      if (code === -102 && url.startsWith(DEV_SERVER_URL) && fs.existsSync(RENDERER_ENTRY)) {
        console.warn(`[main] dev server unavailable (${description}); loading ${RENDERER_ENTRY}`);
        mainWindow.loadFile(RENDERER_ENTRY);
      }
    });
  } else {
    if (!fs.existsSync(RENDERER_ENTRY)) {
      dialog.showErrorBox(
        "KnouxCrypt™ — build missing",
        `The packaged renderer was not found at:\n${RENDERER_ENTRY}\n\nRun "npm run build" before packaging.`,
      );
      return;
    }
    mainWindow.loadFile(RENDERER_ENTRY);
  }

  mainWindow.once("ready-to-show", () => {
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

  const contextMenu = Menu.buildFromTemplate([
    { label: "KnouxCrypt™ 2025", enabled: false },
    { type: "separator" },
    { label: "🏠 إظهار النافذة الرئيسية", click: () => focusMainWindow() },
    {
      label: "🔒 قفل الخزنة الآن",
      click: () => {
        if (vaultService) vaultService.lockAll("tray");
        sendToRenderer("vault-locked");
      },
    },
    { type: "separator" },
    {
      label: "🚪 إنهاء البرنامج",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("KnouxCrypt™ 2025 - نظام التشفير العسكري");
  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => focusMainWindow());
}

function focusMainWindow() {
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
    title: "حول KnouxCrypt™ 2025",
    message: APP_CONFIG.name,
    detail: `الإصدار: ${APP_CONFIG.version}\n${APP_CONFIG.description}\n\nطور بواسطة: ${APP_CONFIG.author}\n\n© 2025 جميع الحقوق محفوظة`,
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
    version: APP_CONFIG.version,
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

    setupAutoUpdater();
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

app.on("will-quit", () => {
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
