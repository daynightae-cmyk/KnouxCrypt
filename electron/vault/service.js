"use strict";

/**
 * Facade that the Electron main process exposes over IPC.
 *
 * It wires the session manager (who may operate) to the engine (how bytes are
 * protected) and records a real, in-memory operation log so Home can show
 * actual activity instead of fabricated status.
 */
const crypto = require("crypto");
const path = require("path");

const { VaultError, CODES } = require("./errors");
const { VaultEngine } = require("./engine");
const { VaultSessionManager } = require("./session");

class VaultService {
  constructor(options = {}) {
    this.userDataPath = options.userDataPath;
    this.manager =
      options.manager ||
      new VaultSessionManager({
        enrollmentPath: path.join(options.userDataPath || ".", "vault-enrollment.json"),
        idleLockMs: options.idleLockMs,
      });
    this.engine =
      options.engine ||
      new VaultEngine({ kdfParams: { kdfId: 0, iterations: 0 }, chunkSize: options.chunkSize });
    this.activity = [];
    this.operations = new Map();
    // The session manager is the single choke point for every revocation path
    // (user lock, lock-all, idle sweep, quit), so forward its notification.
    this.manager.onRevoke = (event) => this._emitRevoked(event.sessionId, event.reason);
  }

  _record(type, detail) {
    const entry = {
      id: crypto.randomBytes(8).toString("hex"),
      type,
      detail,
      at: new Date().toISOString(),
    };
    this.activity.unshift(entry);
    if (this.activity.length > 50) this.activity.length = 50;
    return entry;
  }

  /**
   * Resolve the raw key for a session, then build a raw-key engine so no
   * password is ever needed after unlock.
   */
  _engineFor(sessionId) {
    const dek = this.manager.getDek(sessionId);
    return { engine: this.engine, rawKey: dek };
  }

  async status() {
    const base = await this.manager.status();
    return {
      ...base,
      engine: { algorithm: "AES-256-GCM", kdf: "HKDF-SHA256", format: "KNXVLT01" },
      activity: this.activity.slice(0, 20),
    };
  }

  async enroll(password, options = {}) {
    const result = await this.manager.enroll(password, options);
    this._record("enroll", "Vault enrolled on this device");
    return result;
  }

  async unlock(password) {
    const result = await this.manager.unlock(password);
    this._record("unlock", "Vault unlocked");
    return result;
  }

  createGuestSession() {
    const result = this.manager.createGuestSession();
    this._record("guest", "Guest preview session started (no key)");
    return result;
  }

  lock(sessionId, reason) {
    const ok = this.manager.revoke(sessionId, reason || "user");
    if (ok) this._record("lock", "Vault session locked");
    return { locked: ok };
  }

  lockAll(reason) {
    const count = this.manager.lockAll(reason || "user");
    if (count) this._record("lock", `Locked ${count} session(s)`);
    return { locked: count };
  }

  /**
   * Tell the renderer a session is gone. Without this a screen that holds a
   * session id would only discover revocation on its next failed call.
   */
  _emitRevoked(sessionId, reason) {
    if (!this.onRevoked) return;
    try {
      this.onRevoked({ sessionId, reason, at: new Date().toISOString() });
    } catch {
      // A renderer notification must never fail the lock operation itself.
    }
  }

  async encryptText(sessionId, text) {
    const { rawKey } = this._engineFor(sessionId);
    if (typeof text !== "string" || text.length === 0) {
      throw new VaultError(CODES.BAD_INPUT, "Text must be a non-empty string");
    }
    const { bytes, meta } = this.engine.encryptBuffer(Buffer.from(text, "utf8"), { rawKey });
    this.manager.touch(sessionId);
    this._record("encrypt-text", `Encrypted ${meta.origSize} bytes of text`);
    return { container: bytes.toString("base64"), meta };
  }

  async decryptText(sessionId, containerBase64) {
    const { rawKey } = this._engineFor(sessionId);
    let bytes;
    try {
      bytes = Buffer.from(String(containerBase64), "base64");
    } catch {
      throw new VaultError(CODES.BAD_INPUT, "Container is not valid base64");
    }
    const { plaintext, meta } = this.engine.decryptBuffer(bytes, { rawKey });
    this.manager.touch(sessionId);
    this._record("decrypt-text", `Decrypted ${meta.origSize} bytes of text`);
    return { text: plaintext.toString("utf8"), meta };
  }

  async encryptFile({ sessionId, inputPath, outputPath, operationId }) {
    const { rawKey } = this._engineFor(sessionId);
    const controller = new AbortController();
    if (operationId) this.operations.set(operationId, controller);
    try {
      const result = await this.engine.encryptFile({
        inputPath,
        outputPath,
        rawKey,
        signal: controller.signal,
        onProgress: (p) => this._emitProgress(operationId, "encrypt", p),
      });
      this.manager.touch(sessionId);
      this._record("encrypt-file", `Encrypted ${path.basename(inputPath)}`);
      return { ...result, operationId };
    } finally {
      if (operationId) this.operations.delete(operationId);
    }
  }

  async decryptFile({ sessionId, inputPath, outputPath, operationId }) {
    const { rawKey } = this._engineFor(sessionId);
    const controller = new AbortController();
    if (operationId) this.operations.set(operationId, controller);
    try {
      const result = await this.engine.decryptFile({
        inputPath,
        outputPath,
        rawKey,
        signal: controller.signal,
        onProgress: (p) => this._emitProgress(operationId, "decrypt", p),
      });
      this.manager.touch(sessionId);
      this._record("decrypt-file", `Decrypted ${path.basename(inputPath)}`);
      return { ...result, operationId };
    } finally {
      if (operationId) this.operations.delete(operationId);
    }
  }

  cancel(operationId) {
    const controller = this.operations.get(operationId);
    if (!controller) return { cancelled: false };
    controller.abort();
    return { cancelled: true };
  }

  async inspect(inputPath) {
    return this.engine.inspect(inputPath);
  }

  _emitProgress(operationId, direction, progress) {
    if (!operationId || !this.onProgress) return;
    this.onProgress({ operationId, direction, ...progress });
  }
}

module.exports = { VaultService };
