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
  AUTH_ADD: "vault:auth-add",
  AUTH_LIST: "vault:auth-list",
  AUTH_CODE: "vault:auth-code",
  AUTH_REMOVE: "vault:auth-remove",
  AUTH_PARSE_URI: "vault:auth-parse-uri",
  KEY_GENERATE: "vault:key-generate",
  KEY_LIST: "vault:key-list",
  KEY_EXPORT_PRIVATE: "vault:key-export-private",
  KEY_REMOVE: "vault:key-remove",
  KEY_GET: "vault:key-get",
  KEY_UPDATE: "vault:key-update",
  BACKUP_CREATE: "vault:backup-create",
  BACKUP_LIST: "vault:backup-list",
  BACKUP_INSPECT: "vault:backup-inspect",
  BACKUP_RESTORE: "vault:backup-restore",
  BACKUP_REMOVE: "vault:backup-remove",
  SHARE_CREATE: "vault:share-create",
  SHARE_INSPECT: "vault:share-inspect",
  SHARE_OPEN: "vault:share-open",
  PREFS_GET: "vault:prefs-get",
  PREFS_UPDATE: "vault:prefs-update",
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
  authAdd: (sessionId, account) => invoke(VAULT_CHANNELS.AUTH_ADD, { sessionId, account }),
  authList: (sessionId) => invoke(VAULT_CHANNELS.AUTH_LIST, { sessionId }),
  authCode: (sessionId, id) => invoke(VAULT_CHANNELS.AUTH_CODE, { sessionId, id }),
  authRemove: (sessionId, id) => invoke(VAULT_CHANNELS.AUTH_REMOVE, { sessionId, id }),
  authParseUri: (sessionId, uri) => invoke(VAULT_CHANNELS.AUTH_PARSE_URI, { sessionId, uri }),
  keyGenerate: (sessionId, request) => invoke(VAULT_CHANNELS.KEY_GENERATE, { sessionId, request }),
  keyList: (sessionId) => invoke(VAULT_CHANNELS.KEY_LIST, { sessionId }),
  keyExportPrivate: (sessionId, id, options) => invoke(VAULT_CHANNELS.KEY_EXPORT_PRIVATE, { sessionId, id, options }),
  keyRemove: (sessionId, id) => invoke(VAULT_CHANNELS.KEY_REMOVE, { sessionId, id }),
  keyGet: (sessionId, id) => invoke(VAULT_CHANNELS.KEY_GET, { sessionId, id }),
  keyUpdate: (sessionId, id, patch) => invoke(VAULT_CHANNELS.KEY_UPDATE, { sessionId, id, ...patch }),
  backupCreate: (sessionId, options) => invoke(VAULT_CHANNELS.BACKUP_CREATE, { sessionId, ...options }),
  backupList: (sessionId) => invoke(VAULT_CHANNELS.BACKUP_LIST, { sessionId }),
  backupInspect: (sessionId, id) => invoke(VAULT_CHANNELS.BACKUP_INSPECT, { sessionId, id }),
  backupRestore: (sessionId, id, confirm) => invoke(VAULT_CHANNELS.BACKUP_RESTORE, { sessionId, id, confirm: confirm === true }),
  backupRemove: (sessionId, id) => invoke(VAULT_CHANNELS.BACKUP_REMOVE, { sessionId, id }),
  shareCreate: (sessionId, request) => invoke(VAULT_CHANNELS.SHARE_CREATE, { sessionId, ...request }),
  shareInspect: (sessionId, envelope) => invoke(VAULT_CHANNELS.SHARE_INSPECT, { sessionId, envelope }),
  shareOpen: (sessionId, envelope, credential) => invoke(VAULT_CHANNELS.SHARE_OPEN, { sessionId, envelope, ...credential }),
  preferencesGet: () => invoke(VAULT_CHANNELS.PREFS_GET),
  preferencesUpdate: (patch) => invoke(VAULT_CHANNELS.PREFS_UPDATE, patch),
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
