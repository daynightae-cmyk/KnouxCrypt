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
const { EncryptedStore } = require("./store");
const totp = require("./totp");

// Explicitly supported key algorithms. Anything absent is refused rather than
// silently downgraded, so a caller cannot ask for a weak or unknown algorithm.
const KEY_ALGORITHMS = Object.freeze({
  ED25519: { kind: "pair", type: "ed25519", options: {} },
  "P-256": {
    kind: "pair",
    type: "ec",
    options: { namedCurve: "prime256v1" },
  },
  "P-384": {
    kind: "pair",
    type: "ec",
    options: { namedCurve: "secp384r1" },
  },
  RSA_2048: {
    kind: "pair",
    type: "rsa",
    options: { modulusLength: 2048, publicExponent: 0x10001 },
  },
  RSA_4096: {
    kind: "pair",
    type: "rsa",
    options: { modulusLength: 4096, publicExponent: 0x10001 },
  },
  HMAC_256: { kind: "secret" },
});

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
    this.store =
      options.store ||
      new EncryptedStore({ root: path.join(options.userDataPath || ".", "vault-store"), engine: this.engine });
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

  // ---- encrypted record store (notes, credentials) ------------------------

  /**
   * Read a collection. Guest sessions hold no key, so this fails closed rather
   * than returning anything at all.
   */
  async storeList(sessionId, collection) {
    const rawKey = this.manager.getDek(sessionId);
    const { records } = await this.store.list(collection, rawKey);
    this.manager.touch(sessionId);
    return { collection, records };
  }

  async storePut(sessionId, collection, record) {
    const rawKey = this.manager.getDek(sessionId);
    const result = await this.store.put(collection, rawKey, record);
    this.manager.touch(sessionId);
    this._record(result.created ? "store-create" : "store-update", `${result.created ? "Added" : "Updated"} a record in ${collection}`);
    return { collection, created: result.created, id: record.id };
  }

  async storeRemove(sessionId, collection, id) {
    const rawKey = this.manager.getDek(sessionId);
    const result = await this.store.remove(collection, rawKey, id);
    this.manager.touch(sessionId);
    if (result.removed) this._record("store-delete", `Removed a record from ${collection}`);
    return { collection, removed: result.removed };
  }

  async storeClear(sessionId, collection) {
    const rawKey = this.manager.getDek(sessionId);
    await this.store.write(collection, rawKey, { version: 1, records: [], updatedAt: new Date().toISOString() });
    this.manager.touch(sessionId);
    this._record("store-clear", `Cleared the ${collection} store`);
    return { collection, cleared: true };
  }

  /**
   * Authenticator (task 10).
   *
   * The Base32 secret is written into the encrypted store and is never returned
   * over IPC. The renderer asks for a code for an account id and receives only
   * the digits and the step lifetime, so a secret never has to live in renderer
   * memory or the DOM.
   */
  async authAdd(sessionId, { name, issuer, secret, digits, period, algorithm }) {
    const rawKey = this.manager.getDek(sessionId);
    const normalised = {
      id: crypto.randomBytes(8).toString("hex"),
      name: String(name || "").trim(),
      issuer: String(issuer || "").trim(),
      secret: totp.decodeSecret(secret) && secret.replace(/[\s-]/g, "").toUpperCase(),
      digits: totp.normaliseDigits(digits),
      period: totp.normalisePeriod(period),
      algorithm: totp.normaliseAlgorithm(algorithm),
      createdAt: new Date().toISOString(),
    };
    if (!normalised.name) throw new VaultError(CODES.BAD_INPUT, "An account name is required");
    // Refuse duplicates so a re-import cannot silently shadow an account.
    const { records } = await this.store.list("authenticator", rawKey);
    const duplicate = records.find(
      (r) => r.secret === normalised.secret && r.name === normalised.name,
    );
    if (duplicate) throw new VaultError(CODES.BAD_INPUT, "That account is already stored");
    await this.store.put("authenticator", rawKey, normalised);
    this.manager.touch(sessionId);
    this._record("auth-add", `Added an authenticator account`);
    return { id: normalised.id, name: normalised.name, issuer: normalised.issuer };
  }

  /** Account metadata only; the secret stays inside the main process. */
  async authList(sessionId) {
    const rawKey = this.manager.getDek(sessionId);
    const { records } = await this.store.list("authenticator", rawKey);
    this.manager.touch(sessionId);
    return {
      accounts: records.map((r) => ({
        id: r.id,
        name: r.name,
        issuer: r.issuer,
        digits: r.digits,
        period: r.period,
        algorithm: r.algorithm,
        createdAt: r.createdAt,
      })),
    };
  }

  async authCode(sessionId, id) {
    const rawKey = this.manager.getDek(sessionId);
    const { records } = await this.store.list("authenticator", rawKey);
    const record = records.find((r) => r.id === id);
    if (!record) throw new VaultError(CODES.NOT_FOUND, "No such authenticator account");
    const now = Date.now();
    const code = totp.totp(record.secret, now, {
      digits: record.digits,
      period: record.period,
      algorithm: record.algorithm,
    });
    this.manager.touch(sessionId);
    return {
      id: record.id,
      code,
      digits: record.digits,
      period: record.period,
      algorithm: record.algorithm,
      remaining: totp.remainingSeconds(now, record.period),
    };
  }

  async authRemove(sessionId, id) {
    const rawKey = this.manager.getDek(sessionId);
    const result = await this.store.remove("authenticator", rawKey, id);
    this.manager.touch(sessionId);
    if (result.removed) this._record("auth-remove", "Removed an authenticator account");
    return { removed: result.removed };
  }

  /**
   * Parse an otpauth:// URI without storing it. The renderer shows the parsed
   * account for confirmation, so a mistyped or unexpected URI is visible before
   * anything is written.
   */
  authParseUri(sessionId, uri) {
    this.manager.getDek(sessionId);
    const parsed = totp.parseOtpauthUri(uri);
    this.manager.touch(sessionId);
    return parsed;
  }

  /**
   * Key Forge (task 12).
   *
   * Generates a real key pair with Node/OpenSSL for an explicit supported
   * algorithm. Private material is sealed in the encrypted store and is never
   * returned unless the caller explicitly asks to export it, which is recorded.
   */
  async keyGenerate(sessionId, { algorithm, name, purpose }) {
    const rawKey = this.manager.getDek(sessionId);
    const spec = KEY_ALGORITHMS[algorithm];
    if (!spec) {
      throw new VaultError(CODES.BAD_INPUT, `Unsupported algorithm "${algorithm}"`);
    }
    const label = String(name || "").trim();
    if (!label) throw new VaultError(CODES.BAD_INPUT, "A key name is required");

    let publicPem;
    let privatePem;
    let secret;
    if (spec.kind === "secret") {
      secret = crypto.randomBytes(32);
    } else {
      const { publicKey, privateKey } = crypto.generateKeyPairSync(spec.type, spec.options);
      publicPem = publicKey.export({ type: "spki", format: "pem" });
      privatePem = privateKey.export({ type: "pkcs8", format: "pem" });
    }

    const fingerprint = secret
      ? crypto.createHash("sha256").update(secret).digest("hex")
      : crypto.createHash("sha256").update(publicPem).digest("hex");

    const record = {
      id: crypto.randomBytes(8).toString("hex"),
      name: label,
      algorithm,
      purpose: String(purpose || "general").trim() || "general",
      publicPem: publicPem || null,
      privatePem: privatePem || null,
      secret: secret ? secret.toString("base64") : null,
      fingerprint,
      createdAt: new Date().toISOString(),
    };
    await this.store.put("keys", rawKey, record);
    this.manager.touch(sessionId);
    this._record("key-generate", `Generated a ${algorithm} key`);
    return {
      id: record.id,
      name: record.name,
      algorithm,
      purpose: record.purpose,
      fingerprint,
      publicPem: record.publicPem,
      createdAt: record.createdAt,
    };
  }

  /** Inventory without any private material. */
  async keyList(sessionId) {
    const rawKey = this.manager.getDek(sessionId);
    const { records } = await this.store.list("keys", rawKey);
    this.manager.touch(sessionId);
    return {
      keys: records.map((r) => ({
        id: r.id,
        name: r.name,
        algorithm: r.algorithm,
        purpose: r.purpose,
        fingerprint: r.fingerprint,
        publicPem: r.publicPem,
        hasPrivate: Boolean(r.privatePem || r.secret),
        createdAt: r.createdAt,
      })),
    };
  }

  /**
   * Exporting private material is a deliberate, recorded act. Without
   * `confirm: true` the call fails, so a key can never leave the vault by
   * accident.
   */
  async keyExportPrivate(sessionId, id, { confirm } = {}) {
    if (confirm !== true) {
      throw new VaultError(CODES.BAD_INPUT, "Private key export requires explicit confirmation");
    }
    const rawKey = this.manager.getDek(sessionId);
    const { records } = await this.store.list("keys", rawKey);
    const record = records.find((r) => r.id === id);
    if (!record) throw new VaultError(CODES.NOT_FOUND, "No such key");
    if (!record.privatePem && !record.secret) {
      throw new VaultError(CODES.BAD_INPUT, "This key has no exportable private material");
    }
    this.manager.touch(sessionId);
    this._record("key-export", `Exported private material for a ${record.algorithm} key`);
    return {
      id: record.id,
      algorithm: record.algorithm,
      privatePem: record.privatePem,
      secret: record.secret,
    };
  }

  async keyRemove(sessionId, id) {
    const rawKey = this.manager.getDek(sessionId);
    const result = await this.store.remove("keys", rawKey, id);
    this.manager.touch(sessionId);
    if (result.removed) this._record("key-remove", "Removed a key");
    return { removed: result.removed };
  }

  _emitProgress(operationId, direction, progress) {
    if (!operationId || !this.onProgress) return;
    this.onProgress({ operationId, direction, ...progress });
  }
}

module.exports = { VaultService };
