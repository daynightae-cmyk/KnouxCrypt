"use strict";

/**
 * Restricted, validated IPC contract for the vault.
 *
 * Every handler validates its payload shape before touching the service, and
 * every failure is mapped to a typed `{ ok: false, error: { code, message } }`
 * result so the renderer never sees a raw stack trace or filesystem path.
 */
const { ipcMain, dialog, BrowserWindow } = require("electron");
const { VaultError, CODES } = require("./errors");

const CHANNELS = Object.freeze({
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
  HASH_COMPUTE: "vault:hash-compute",
  HASH_COMPARE: "vault:hash-compare",
  SIGN: "vault:sign",
  SIGN_VERIFY: "vault:sign-verify",
  CERT_INSPECT: "vault:cert-inspect",
  ARCHIVE_CREATE: "vault:archive-create",
  ARCHIVE_INSPECT: "vault:archive-inspect",
  ARCHIVE_EXTRACT: "vault:archive-extract",
  METADATA_INSPECT: "vault:metadata-inspect",
  METADATA_CLEAN: "vault:metadata-clean",
  FINGERPRINT_GET: "vault:fingerprint-get",
  FINGERPRINT_COMPARE: "vault:fingerprint-compare",
  TRANSFER_LISTEN: "vault:transfer-listen",
  TRANSFER_STOP: "vault:transfer-stop",
  TRANSFER_REQUESTS: "vault:transfer-requests",
  TRANSFER_RESPOND: "vault:transfer-respond",
  TRANSFER_SEND: "vault:transfer-send",
  TRANSFER_REQUEST: "vault:transfer-request",
  TRANSFER_STATE: "vault:transfer-state",
  PICK_INPUT: "vault:pick-input",
  PICK_OUTPUT: "vault:pick-output",
  PICK_DIRECTORY: "vault:pick-directory",
  PICK_INPUTS: "vault:pick-inputs",
  PROGRESS: "vault:progress",
  REVOKED: "vault:revoked",
  CLIPBOARD_STATUS: "vault:clipboard-status",
  CLIPBOARD_COPY_DEMO: "vault:clipboard-copy-demo",
  CLIPBOARD_ARM: "vault:clipboard-arm",
  CLIPBOARD_DISARM: "vault:clipboard-disarm",
  CLIPBOARD_CLEAR_NOW: "vault:clipboard-clear-now",
  CLIPBOARD_VERIFY: "vault:clipboard-verify",
  CLIPBOARD_STATE: "vault:clipboard-state",
  RANDOM_GENERATE: "vault:random-generate",
  HMAC_COMPUTE: "vault:hmac-compute",
  HMAC_COMPARE: "vault:hmac-compare",
  PUBLIC_QR: "vault:public-qr",
});

const STORE_COLLECTIONS = Object.freeze(["notes", "passwords", "authenticator", "keys"]);

function requireCollection(value) {
  if (!STORE_COLLECTIONS.includes(value)) {
    throw new VaultError(CODES.BAD_INPUT, `collection must be one of ${STORE_COLLECTIONS.join(", ")}`);
  }
  return value;
}

function requireRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new VaultError(CODES.BAD_INPUT, "record must be an object");
  }
  return value;
}

function requireString(value, field, max = 8192) {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw new VaultError(CODES.BAD_INPUT, `${field} must be a non-empty string`);
  }
  return value;
}

function requireObject(payload) {
  if (payload === null || typeof payload !== "object") {
    throw new VaultError(CODES.BAD_INPUT, "Request payload must be an object");
  }
  return payload;
}

/** A share package is either an envelope object or its base64/JSON text form. */
function requireEnvelope(payload) {
  const value = payload.envelope !== undefined ? payload.envelope : payload.bytes;
  if (typeof value === "string") {
    const text = value.length > 0 && /^[A-Za-z0-9+/=\s]+$/.test(value) && !value.trim().startsWith("{")
      ? Buffer.from(value, "base64").toString("utf8")
      : value;
    if (text.length === 0 || text.length > 32 * 1024 * 1024) {
      throw new VaultError(CODES.BAD_INPUT, "The share package is empty or too large");
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new VaultError(CODES.BAD_INPUT, "The share package is not valid JSON");
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  throw new VaultError(CODES.BAD_INPUT, "A share package is required");
}

/**
 * Wrap a handler so it always resolves to a discriminated result object.
 */
function safe(handler) {
  return async (event, payload) => {
    try {
      const data = await handler(event, payload);
      return { ok: true, data };
    } catch (err) {
      if (err instanceof VaultError) {
        return { ok: false, error: { code: err.code, message: err.message, details: err.details } };
      }
      return { ok: false, error: { code: CODES.IO_FAILED, message: "Unexpected vault failure" } };
    }
  };
}

function registerVaultIpc(service, getWindow) {
  service.onProgress = (progress) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(CHANNELS.PROGRESS, progress);
  };

  service.onRevoked = (event) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(CHANNELS.REVOKED, event);
  };

  service.onTransfer = (event) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(CHANNELS.TRANSFER_STATE, event);
  };

  service.onClipboard = (event) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(CHANNELS.CLIPBOARD_STATE, event);
  };
  // The inbound request carries the short authentication string the user must
  // read out, so it goes to the renderer as its own event rather than being
  // polled for.
  service.transfer.onRequest = (request) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(CHANNELS.TRANSFER_REQUEST, request);
  };

  ipcMain.handle(CHANNELS.STATUS, safe(async () => service.status()));

  ipcMain.handle(
    CHANNELS.ENROLL,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.enroll(requireString(p.password, "password"), {
        name: typeof p.name === "string" ? p.name : undefined,
      });
    }),
  );

  ipcMain.handle(
    CHANNELS.UNLOCK,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.unlock(requireString(p.password, "password"));
    }),
  );

  ipcMain.handle(CHANNELS.GUEST, safe(async () => service.createGuestSession()));

  ipcMain.handle(
    CHANNELS.LOCK,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.lock(requireString(p.sessionId, "sessionId"), p.reason);
    }),
  );

  ipcMain.handle(CHANNELS.LOCK_ALL, safe(async (event, payload) => service.lockAll(payload?.reason)));

  ipcMain.handle(
    CHANNELS.ENCRYPT_TEXT,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.encryptText(requireString(p.sessionId, "sessionId"), requireString(p.text, "text", 1_000_000));
    }),
  );

  ipcMain.handle(
    CHANNELS.DECRYPT_TEXT,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.decryptText(
        requireString(p.sessionId, "sessionId"),
        requireString(p.container, "container", 8_000_000),
      );
    }),
  );

  ipcMain.handle(
    CHANNELS.ENCRYPT_FILE,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.encryptFile({
        sessionId: requireString(p.sessionId, "sessionId"),
        inputPath: requireString(p.inputPath, "inputPath"),
        outputPath: requireString(p.outputPath, "outputPath"),
        operationId: requireString(p.operationId, "operationId", 128),
      });
    }),
  );

  ipcMain.handle(
    CHANNELS.DECRYPT_FILE,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.decryptFile({
        sessionId: requireString(p.sessionId, "sessionId"),
        inputPath: requireString(p.inputPath, "inputPath"),
        outputPath: requireString(p.outputPath, "outputPath"),
        operationId: requireString(p.operationId, "operationId", 128),
      });
    }),
  );

  ipcMain.handle(
    CHANNELS.CANCEL,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.cancel(requireString(p.operationId, "operationId", 128));
    }),
  );

  ipcMain.handle(
    CHANNELS.INSPECT,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.inspect(requireString(p.inputPath, "inputPath"));
    }),
  );

  ipcMain.handle(CHANNELS.ACTIVITY, safe(async () => ({ activity: service.activity.slice(0, 20) })));

  ipcMain.handle(
    CHANNELS.STORE_LIST,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.storeList(requireString(p.sessionId, "sessionId"), requireCollection(p.collection));
    }),
  );

  ipcMain.handle(
    CHANNELS.STORE_PUT,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.storePut(
        requireString(p.sessionId, "sessionId"),
        requireCollection(p.collection),
        requireRecord(p.record),
      );
    }),
  );

  ipcMain.handle(
    CHANNELS.STORE_REMOVE,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.storeRemove(
        requireString(p.sessionId, "sessionId"),
        requireCollection(p.collection),
        requireString(p.id, "id", 128),
      );
    }),
  );

  ipcMain.handle(
    CHANNELS.STORE_CLEAR,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.storeClear(requireString(p.sessionId, "sessionId"), requireCollection(p.collection));
    }),
  );

  // Authenticator: the secret crosses the boundary once on add, and never comes
  // back. Codes are computed in the main process so a secret never has to live
  // in renderer memory.
  ipcMain.handle(
    CHANNELS.AUTH_ADD,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      const account = requireObject(p.account);
      return service.authAdd(requireString(p.sessionId, "sessionId"), {
        name: requireString(account.name, "name", 256),
        issuer: account.issuer === undefined ? "" : requireString(account.issuer, "issuer", 256),
        secret: requireString(account.secret, "secret", 512),
        digits: account.digits,
        period: account.period,
        algorithm: account.algorithm,
      });
    }),
  );

  ipcMain.handle(
    CHANNELS.AUTH_LIST,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.authList(requireString(p.sessionId, "sessionId"));
    }),
  );

  ipcMain.handle(
    CHANNELS.AUTH_CODE,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.authCode(requireString(p.sessionId, "sessionId"), requireString(p.id, "id", 128));
    }),
  );

  ipcMain.handle(
    CHANNELS.AUTH_REMOVE,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.authRemove(requireString(p.sessionId, "sessionId"), requireString(p.id, "id", 128));
    }),
  );

  ipcMain.handle(
    CHANNELS.AUTH_PARSE_URI,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.authParseUri(requireString(p.sessionId, "sessionId"), requireString(p.uri, "uri", 2048));
    }),
  );

  ipcMain.handle(
    CHANNELS.KEY_GENERATE,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      const request = requireObject(p.request);
      return service.keyGenerate(requireString(p.sessionId, "sessionId"), {
        algorithm: requireString(request.algorithm, "algorithm", 64),
        name: requireString(request.name, "name", 256),
        purpose: request.purpose === undefined ? "general" : requireString(request.purpose, "purpose", 64),
      });
    }),
  );

  ipcMain.handle(
    CHANNELS.KEY_LIST,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.keyList(requireString(p.sessionId, "sessionId"));
    }),
  );

  ipcMain.handle(
    CHANNELS.KEY_EXPORT_PRIVATE,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      const options = p.options === undefined ? {} : requireObject(p.options);
      return service.keyExportPrivate(
        requireString(p.sessionId, "sessionId"),
        requireString(p.id, "id", 128),
        { confirm: options.confirm === true },
      );
    }),
  );

  ipcMain.handle(
    CHANNELS.KEY_REMOVE,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.keyRemove(requireString(p.sessionId, "sessionId"), requireString(p.id, "id", 128));
    }),
  );


  ipcMain.handle(
    CHANNELS.KEY_GET,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.keyGet(requireString(p.sessionId, "sessionId"), requireString(p.id, "id", 128));
    }),
  );

  ipcMain.handle(
    CHANNELS.KEY_UPDATE,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.keyUpdate(requireString(p.sessionId, "sessionId"), requireString(p.id, "id", 128), {
        name: typeof p.name === "string" ? p.name : undefined,
        purpose: typeof p.purpose === "string" ? p.purpose : undefined,
      });
    }),
  );

  ipcMain.handle(
    CHANNELS.BACKUP_CREATE,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      const request = {};
      if (Array.isArray(p.collections)) request.collections = p.collections.map((name) => requireCollection(name));
      return service.backupCreate(requireString(p.sessionId, "sessionId"), request);
    }),
  );

  ipcMain.handle(
    CHANNELS.BACKUP_LIST,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.backupList(requireString(p.sessionId, "sessionId"));
    }),
  );

  ipcMain.handle(
    CHANNELS.BACKUP_INSPECT,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.backupInspect(requireString(p.sessionId, "sessionId"), requireString(p.id, "id", 128));
    }),
  );

  ipcMain.handle(
    CHANNELS.BACKUP_RESTORE,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.backupRestore(requireString(p.sessionId, "sessionId"), requireString(p.id, "id", 128), {
        confirm: p.confirm === true,
      });
    }),
  );

  ipcMain.handle(
    CHANNELS.BACKUP_REMOVE,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.backupRemove(requireString(p.sessionId, "sessionId"), requireString(p.id, "id", 128));
    }),
  );

  ipcMain.handle(
    CHANNELS.SHARE_CREATE,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      const request = {
        model: typeof p.model === "string" ? p.model : undefined,
        payload: typeof p.payload === "string" ? p.payload.slice(0, 1024 * 1024) : undefined,
        sender: typeof p.sender === "string" ? p.sender.slice(0, 128) : undefined,
        expiresAt: typeof p.expiresAt === "string" ? p.expiresAt : null,
      };
      if (typeof p.passphrase === "string") request.passphrase = p.passphrase;
      if (typeof p.recipientPublicPem === "string") request.recipientPublicPem = p.recipientPublicPem.slice(0, 16384);
      return service.shareCreate(requireString(p.sessionId, "sessionId"), request);
    }),
  );

  ipcMain.handle(
    CHANNELS.SHARE_INSPECT,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.shareInspect(requireString(p.sessionId, "sessionId"), requireEnvelope(p));
    }),
  );

  ipcMain.handle(
    CHANNELS.SHARE_OPEN,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      const credential = {};
      if (typeof p.passphrase === "string") credential.passphrase = p.passphrase;
      if (typeof p.privatePem === "string") credential.privatePem = p.privatePem.slice(0, 16384);
      return service.shareOpen(requireString(p.sessionId, "sessionId"), requireEnvelope(p), credential);
    }),
  );

  ipcMain.handle(CHANNELS.PREFS_GET, safe(async () => service.preferencesGet()));

  ipcMain.handle(
    CHANNELS.PREFS_UPDATE,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      const patch = {};
      if ("idleLockSeconds" in p) patch.idleLockSeconds = p.idleLockSeconds;
      if ("retentionDays" in p) patch.retentionDays = p.retentionDays;
      if ("lockOnSuspend" in p) patch.lockOnSuspend = p.lockOnSuspend;
      if ("clearClipboard" in p) patch.clearClipboard = p.clearClipboard;
      return service.preferencesUpdate(patch);
    }),
  );

  ipcMain.handle(
    CHANNELS.HASH_COMPUTE,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      const request = {};
      if (typeof p.algorithm === "string") request.algorithm = p.algorithm;
      if (typeof p.text === "string") request.text = p.text.slice(0, 4 * 1024 * 1024);
      if (typeof p.inputPath === "string") request.inputPath = p.inputPath;
      return service.hashCompute(request);
    }),
  );

  ipcMain.handle(
    CHANNELS.HASH_COMPARE,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.hashCompare(requireString(p.left, "left", 256), requireString(p.right, "right", 256));
    }),
  );

  ipcMain.handle(
    CHANNELS.SIGN,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      const request = { keyId: requireString(p.keyId, "keyId", 128) };
      if (typeof p.text === "string") request.text = p.text.slice(0, 4 * 1024 * 1024);
      if (typeof p.inputPath === "string") request.inputPath = p.inputPath;
      return service.signatureSign(requireString(p.sessionId, "sessionId"), request);
    }),
  );

  ipcMain.handle(
    CHANNELS.SIGN_VERIFY,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      const request = {};
      if (typeof p.publicPem === "string") request.publicPem = p.publicPem.slice(0, 16384);
      if (typeof p.algorithm === "string") request.algorithm = p.algorithm;
      if (typeof p.signature === "string") request.signature = p.signature.slice(0, 16384);
      if (typeof p.text === "string") request.text = p.text.slice(0, 4 * 1024 * 1024);
      if (typeof p.inputPath === "string") request.inputPath = p.inputPath;
      if (typeof p.keyId === "string") request.keyId = p.keyId;
      // Verification needs a session only when it resolves a stored key.
      const sessionId = p.keyId ? requireString(p.sessionId, "sessionId") : (typeof p.sessionId === "string" ? p.sessionId : "");
      return service.signatureVerify(sessionId, request);
    }),
  );

  ipcMain.handle(
    CHANNELS.CERT_INSPECT,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      const request = {};
      if (typeof p.pem === "string") request.pem = p.pem.slice(0, 128 * 1024);
      if (typeof p.inputPath === "string") request.inputPath = p.inputPath;
      if (!request.pem && !request.inputPath) throw new VaultError(CODES.BAD_INPUT, "A PEM certificate or file path is required");
      return service.certificateInspect(request);
    }),
  );

  ipcMain.handle(
    CHANNELS.ARCHIVE_CREATE,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      const sessionId = requireString(p.sessionId, "sessionId");
      const inputPaths = Array.isArray(p.inputPaths) ? p.inputPaths.filter((v) => typeof v === "string").slice(0, 4096) : [];
      if (!inputPaths.length) throw new VaultError(CODES.BAD_INPUT, "Select at least one file to archive");
      const outputPath = requireString(p.outputPath, "outputPath");
      return service.archiveCreate({
        sessionId,
        inputPaths,
        outputPath,
        compression: p.compression !== false,
        operationId: typeof p.operationId === "string" ? p.operationId : undefined,
      });
    }),
  );

  ipcMain.handle(
    CHANNELS.ARCHIVE_INSPECT,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.archiveInspect(requireString(p.sessionId, "sessionId"), requireString(p.inputPath, "inputPath"));
    }),
  );

  ipcMain.handle(
    CHANNELS.ARCHIVE_EXTRACT,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.archiveExtract(requireString(p.sessionId, "sessionId"), {
        inputPath: requireString(p.inputPath, "inputPath"),
        outputDir: requireString(p.outputDir, "outputDir"),
      });
    }),
  );

  ipcMain.handle(
    CHANNELS.METADATA_INSPECT,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.metadataInspect({ inputPath: requireString(p.inputPath, "inputPath") });
    }),
  );

  ipcMain.handle(
    CHANNELS.METADATA_CLEAN,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      const remove = Array.isArray(p.remove)
        ? p.remove.filter((v) => ["gps", "dates", "camera", "icc", "xmp", "comment"].includes(v))
        : [];
      return service.metadataClean({
        inputPath: requireString(p.inputPath, "inputPath"),
        outputPath: requireString(p.outputPath, "outputPath"),
        remove,
      });
    }),
  );

  ipcMain.handle(
    CHANNELS.FINGERPRINT_GET,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      const request = {};
      if (typeof p.sessionId === "string") request.sessionId = p.sessionId;
      if (typeof p.keyId === "string") request.keyId = p.keyId;
      if (typeof p.pem === "string") request.pem = p.pem.slice(0, 128 * 1024);
      if (typeof p.inputPath === "string") request.inputPath = p.inputPath;
      return service.fingerprintGet(request);
    }),
  );

  ipcMain.handle(
    CHANNELS.FINGERPRINT_COMPARE,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.fingerprintCompare(String(p.left || ""), String(p.right || ""));
    }),
  );

  ipcMain.handle(
    CHANNELS.TRANSFER_LISTEN,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.transferListen({
        sessionId: requireString(p.sessionId, "sessionId"),
        port: Number.isInteger(p.port) ? p.port : 0,
        // Loopback is the only supported bind; the service refuses anything else.
        bindHost: "127.0.0.1",
      });
    }),
  );

  ipcMain.handle(CHANNELS.TRANSFER_STOP, safe(async () => service.transferStop()));
  ipcMain.handle(CHANNELS.TRANSFER_REQUESTS, safe(async () => service.transferRequests()));

  ipcMain.handle(
    CHANNELS.TRANSFER_RESPOND,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.transferRespond({
        sessionId: requireString(p.sessionId, "sessionId"),
        requestId: requireString(p.requestId, "requestId"),
        accept: p.accept === true,
        outputDir: typeof p.outputDir === "string" ? p.outputDir : undefined,
      });
    }),
  );

  ipcMain.handle(
    CHANNELS.TRANSFER_SEND,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      const files = Array.isArray(p.files) ? p.files.filter((v) => typeof v === "string").slice(0, 1024) : [];
      return service.transferSend({
        sessionId: requireString(p.sessionId, "sessionId"),
        host: typeof p.host === "string" && p.host ? p.host : "127.0.0.1",
        port: Number.isInteger(p.port) ? p.port : 0,
        code: typeof p.code === "string" ? p.code : "",
        files,
        sender: typeof p.sender === "string" ? p.sender : "This device",
      });
    }),
  );

  ipcMain.handle(CHANNELS.CLIPBOARD_STATUS, safe(async () => service.clipboardStatus()));

  ipcMain.handle(
    CHANNELS.CLIPBOARD_COPY_DEMO,
    safe(async (event, payload) => {
      const p = payload ? requireObject(payload) : {};
      return service.clipboardCopyDemo(typeof p.sessionId === "string" ? p.sessionId : undefined);
    }),
  );

  ipcMain.handle(
    CHANNELS.CLIPBOARD_ARM,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.clipboardArm({
        sessionId: typeof p.sessionId === "string" ? p.sessionId : undefined,
        seconds: Number(p.seconds),
        // Confirmation is a strict boolean: a truthy string must not arm it.
        confirm: p.confirm === true,
      });
    }),
  );

  ipcMain.handle(
    CHANNELS.CLIPBOARD_DISARM,
    safe(async (event, payload) => {
      const p = payload ? requireObject(payload) : {};
      return service.clipboardDisarm(typeof p.reason === "string" ? p.reason : undefined);
    }),
  );

  ipcMain.handle(CHANNELS.CLIPBOARD_CLEAR_NOW, safe(async () => service.clipboardClearNow()));
  ipcMain.handle(CHANNELS.CLIPBOARD_VERIFY, safe(async () => service.clipboardVerifyDemo()));

  ipcMain.handle(
    CHANNELS.RANDOM_GENERATE,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.randomGenerate({
        type: typeof p.type === "string" ? p.type : "hex",
        length: Number.isInteger(p.length) ? p.length : undefined,
      });
    }),
  );

  ipcMain.handle(
    CHANNELS.HMAC_COMPUTE,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.hmacCompute({
        algorithm: typeof p.algorithm === "string" ? p.algorithm : "SHA-256",
        message: typeof p.message === "string" ? p.message.slice(0, 4 * 1024 * 1024) : "",
        // The key is passed through untouched; it is never logged or echoed back.
        key: typeof p.key === "string" ? p.key.slice(0, 8192) : "",
        keyEncoding: typeof p.keyEncoding === "string" ? p.keyEncoding : "utf8",
        encoding: p.encoding === "base64" ? "base64" : "hex",
      });
    }),
  );

  ipcMain.handle(
    CHANNELS.HMAC_COMPARE,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      return service.hmacCompare(String(p.left || "").slice(0, 512), String(p.right || "").slice(0, 512));
    }),
  );

  ipcMain.handle(
    CHANNELS.PUBLIC_QR,
    safe(async (event, payload) => {
      const p = requireObject(payload);
      const request = {};
      if (typeof p.sessionId === "string") request.sessionId = p.sessionId;
      if (typeof p.keyId === "string") request.keyId = p.keyId;
      if (typeof p.text === "string") request.text = p.text.slice(0, 4096);
      if (typeof p.errorCorrectionLevel === "string") request.errorCorrectionLevel = p.errorCorrectionLevel;
      return service.publicKeyQr(request);
    }),
  );

  ipcMain.handle(
    CHANNELS.PICK_DIRECTORY,
    safe(async (event, payload) => {
      const p = payload ? requireObject(payload) : {};
      const result = await dialog.showOpenDialog(getWindow(), {
        title: p.title || "Choose a folder",
        properties: ["openDirectory", "createDirectory"],
      });
      return { cancelled: result.canceled, path: result.filePaths[0] || null };
    }),
  );

  ipcMain.handle(
    CHANNELS.PICK_INPUTS,
    safe(async (event, payload) => {
      const p = payload ? requireObject(payload) : {};
      const result = await dialog.showOpenDialog(getWindow(), {
        title: p.title || "Select files",
        properties: ["openFile", "multiSelections"],
      });
      return { cancelled: result.canceled, paths: result.filePaths || [] };
    }),
  );

  ipcMain.handle(
    CHANNELS.PICK_INPUT,
    safe(async () => {
      const result = await dialog.showOpenDialog(getWindow(), {
        title: "Select a file to encrypt",
        properties: ["openFile"],
      });
      return { cancelled: result.canceled, path: result.filePaths[0] || null };
    }),
  );

  ipcMain.handle(
    CHANNELS.PICK_OUTPUT,
    safe(async (event, payload) => {
      const p = payload ? requireObject(payload) : {};
      const result = await dialog.showSaveDialog(getWindow(), {
        title: p.title || "Choose an output file",
        defaultPath: typeof p.defaultPath === "string" ? p.defaultPath : undefined,
        filters: Array.isArray(p.filters) ? p.filters : undefined,
      });
      return { cancelled: result.canceled, path: result.filePath || null };
    }),
  );

  return () => {
    for (const channel of Object.values(CHANNELS)) {
      if (
        channel !== CHANNELS.PROGRESS &&
        channel !== CHANNELS.REVOKED &&
        channel !== CHANNELS.TRANSFER_REQUEST &&
        channel !== CHANNELS.TRANSFER_STATE &&
        channel !== CHANNELS.CLIPBOARD_STATE
      ) {
        ipcMain.removeHandler(channel);
      }
    }
  };
}

module.exports = { CHANNELS, registerVaultIpc, safe };
