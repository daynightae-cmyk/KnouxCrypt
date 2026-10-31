/**
 * KnouxCrypt™ 2025 - Preload script
 *
 * Runs in an isolated world with `sandbox: true`. It exposes a small,
 * explicitly enumerated API surface via contextBridge. No Node primitives,
 * no filesystem, no raw ipcRenderer are ever handed to the renderer.
 */

const { contextBridge, ipcRenderer } = require("electron");

const VAULT_CHANNELS = Object.freeze({
  STATUS: "vault:status",
  ENROLL: "vault:enroll",
  UNLOCK: "vault:unlock",
  GUEST: "vault:guest",
  LOCK: "vault:lock",
  LOCK_ALL: "vault:lock-all",
  ENCRYPT_TEXT: "vault:encrypt-text",
  DECRYPT_TEXT: "vault:decrypt-text",
  ENCRYPT_FILE: "vault:encrypt-file",
  DECRYPT_FILE: "vault:decrypt-file",
  CANCEL: "vault:cancel",
  INSPECT: "vault:inspect",
  ACTIVITY: "vault:activity",
  STORE_LIST: "vault:store-list",
  STORE_PUT: "vault:store-put",
  STORE_REMOVE: "vault:store-remove",
  STORE_CLEAR: "vault:store-clear",
  PICK_INPUT: "vault:pick-input",
  PICK_OUTPUT: "vault:pick-output",
});

// Only these main -> renderer channels may be subscribed to.
const ALLOWED_EVENTS = Object.freeze([
  "vault:progress",
  "vault:revoked",
  "vault-locked",
  "encrypt-new-file",
]);

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

const vault = {
  status: () => invoke(VAULT_CHANNELS.STATUS),
  enroll: (password, options) => invoke(VAULT_CHANNELS.ENROLL, { password, ...(options || {}) }),
  unlock: (password) => invoke(VAULT_CHANNELS.UNLOCK, { password }),
  startGuest: () => invoke(VAULT_CHANNELS.GUEST),
  lock: (sessionId, reason) => invoke(VAULT_CHANNELS.LOCK, { sessionId, reason }),
  lockAll: (reason) => invoke(VAULT_CHANNELS.LOCK_ALL, { reason }),
  encryptText: (sessionId, text) => invoke(VAULT_CHANNELS.ENCRYPT_TEXT, { sessionId, text }),
  decryptText: (sessionId, container) => invoke(VAULT_CHANNELS.DECRYPT_TEXT, { sessionId, container }),
  encryptFile: (payload) => invoke(VAULT_CHANNELS.ENCRYPT_FILE, payload),
  decryptFile: (payload) => invoke(VAULT_CHANNELS.DECRYPT_FILE, payload),
  cancel: (operationId) => invoke(VAULT_CHANNELS.CANCEL, { operationId }),
  inspect: (inputPath) => invoke(VAULT_CHANNELS.INSPECT, { inputPath }),
  activity: () => invoke(VAULT_CHANNELS.ACTIVITY),
  storeList: (sessionId, collection) => invoke(VAULT_CHANNELS.STORE_LIST, { sessionId, collection }),
  storePut: (sessionId, collection, record) => invoke(VAULT_CHANNELS.STORE_PUT, { sessionId, collection, record }),
  storeRemove: (sessionId, collection, id) => invoke(VAULT_CHANNELS.STORE_REMOVE, { sessionId, collection, id }),
  storeClear: (sessionId, collection) => invoke(VAULT_CHANNELS.STORE_CLEAR, { sessionId, collection }),
  pickInputFile: () => invoke(VAULT_CHANNELS.PICK_INPUT),
  pickOutputFile: (options) => invoke(VAULT_CHANNELS.PICK_OUTPUT, options),
  onProgress: (callback) => subscribe("vault:progress", callback),
  onRevoked: (callback) => subscribe("vault:revoked", callback),
};

function subscribe(channel, callback) {
  if (!ALLOWED_EVENTS.includes(channel) || typeof callback !== "function") {
    return () => {};
  }
  const listener = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

/**
 * The legacy disk/volume screens call a broad `invoke(channel, ...)` surface
 * that has no main-process handler. Exposing a generic invoke would let any
 * renderer reach arbitrary main-process code, so instead the legacy surface is
 * reported as unsupported and every call fails closed with a typed error. The
 * legacy screens then show "unavailable" rather than fabricated disk status.
 */
const LEGACY_UNSUPPORTED = { code: "UNSUPPORTED", message: "This capability is not implemented in the desktop build." };
const legacy = {
  isSupported: false,
  unsupportedReason: LEGACY_UNSUPPORTED.message,
  invoke: async () => ({ ok: false, error: LEGACY_UNSUPPORTED }),
  on: () => () => {},
  removeListener: () => {},
};

const electronAPI = {
  app: {
    getName: () => Promise.resolve("KnouxCrypt™ 2025"),
    getVersion: () => Promise.resolve("2025.1.0"),
    isDev: () => Promise.resolve(false),
  },
  legacy,
  window: {
    minimize: () => ipcRenderer.send("window-minimize"),
    maximize: () => ipcRenderer.send("window-maximize"),
    close: () => ipcRenderer.send("window-close"),
    isMaximized: () => Promise.resolve(false),
  },
  vault,
  on: (channel, callback) => subscribe(channel, callback),
  off: (channel, callback) => {
    if (ALLOWED_EVENTS.includes(channel) && typeof callback === "function") {
      ipcRenderer.removeListener(channel, callback);
    }
  },
  removeListener: (channel, callback) => {
    if (ALLOWED_EVENTS.includes(channel) && typeof callback === "function") {
      ipcRenderer.removeListener(channel, callback);
    }
  },
  platform: process.platform,
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

contextBridge.exposeInMainWorld("knouxcrypt", {
  version: "2025.1.0",
  name: "KnouxCrypt™ 2025",
  description: "نظام التشفير العسكري المتقدم",
  isElectron: true,
  platform: process.platform,
  arch: process.arch,
});
