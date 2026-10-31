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
  PICK_INPUT: "vault:pick-input",
  PICK_OUTPUT: "vault:pick-output",
  PROGRESS: "vault:progress",
  REVOKED: "vault:revoked",
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
      if (channel !== CHANNELS.PROGRESS && channel !== CHANNELS.REVOKED) {
        ipcMain.removeHandler(channel);
      }
    }
  };
}

module.exports = { CHANNELS, registerVaultIpc, safe };
