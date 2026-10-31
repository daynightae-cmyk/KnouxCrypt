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
const fsp = require("fs/promises");

const { VaultError, CODES } = require("./errors");
const { VaultEngine } = require("./engine");
const { VaultSessionManager } = require("./session");
const { EncryptedStore } = require("./store");
const { VaultBackup } = require("./backup");
const { ShareService } = require("./share");
const { Preferences } = require("./preferences");
const totp = require("./totp");
const inspect = require("./inspect");
const archive = require("./archive");
const metadata = require("./metadata");
const { TransferService } = require("./transfer");
const { ClipboardGuard, DEMO_PLACEHOLDER, TIMER_CHOICES } = require("./clipboard");
const { CollectionService } = require("./collections");
const { DocumentViewer } = require("./documentviewer");
const { RotationService } = require("./rotation");
const { SecurityAdvisor } = require("./posture");
const { PairingService } = require("./pairing");
const { AutofillPreview } = require("./autofill");
const passwordaudit = require("./passwordaudit");
const labs = require("./labs");

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

// Helpers for the archive and metadata tasks. Writing always goes through a
// temp file and a rename so an aborted write can never leave a half-written
// output where the caller expects a complete one.
async function atomicWrite(targetPath, bytes) {
  const dir = path.dirname(targetPath);
  const tmp = path.join(dir, `.${path.basename(targetPath)}.knoux-${crypto.randomBytes(6).toString("hex")}.tmp`);
  try {
    await fsp.writeFile(tmp, bytes, { mode: 0o600 });
    await fsp.rename(tmp, targetPath);
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    throw new VaultError(CODES.IO_FAILED, "The output file could not be written");
  }
}

async function readFileOrThrow(inputPath, notFound, failed) {
  if (typeof inputPath !== "string" || !inputPath) {
    throw new VaultError(CODES.BAD_INPUT, "A file path is required");
  }
  try {
    return await fsp.readFile(inputPath);
  } catch (err) {
    if (err.code === "ENOENT") throw new VaultError(CODES.NOT_FOUND, notFound);
    throw new VaultError(CODES.IO_FAILED, failed);
  }
}

async function readHead(inputPath, length) {
  const fh = await fsp.open(inputPath, "r");
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buf, 0, length, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

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
    this.backup =
      options.backup ||
      new VaultBackup({
        root: path.join(options.userDataPath || ".", "vault-store"),
        engine: this.engine,
        store: this.store,
      });
    this.share = options.share || new ShareService({ engine: this.engine });
    this.preferences =
      options.preferences ||
      new Preferences({
        file: path.join(options.userDataPath || ".", "privacy-preferences.json"),
        onChange: (snapshot) => {
          if (this.manager && typeof this.manager.setIdleLockMs === "function" && snapshot.values) {
            this.manager.setIdleLockMs(snapshot.values.idleLockSeconds * 1000);
          }
        },
      });
    // Local transfer is owned by the vault service so a revoked session can
    // tear down any listener that is still open.
    this.transfer = options.transfer || new TransferService({ userDataPath: options.userDataPath });
    this.transfer.onState = (event) => {
      this._record("transfer", `Transfer ${event.state}`);
      this._emitTransfer(event);
    };

    // The clipboard guard is constructed with the Electron clipboard adapter by
    // the main process. Tests inject a plain in-memory adapter instead, so the
    // countdown and clear path run without a display server.
    this.clipboard =
      options.clipboard ||
      new ClipboardGuard({
        adapter: options.clipboardAdapter || null,
        onEvent: (event) => {
          this._record("clipboard", `Clipboard ${event.state}`);
          this._emitClipboard(event);
        },
      });

    // Tasks 29-32: collections, protected viewer, key rotation, package
    // inspector. Each owns its own subdirectory under the vault store root.
    this.collections =
      options.collections ||
      new CollectionService({
        store: this.store,
        engine: this.engine,
        root: path.join(options.userDataPath || ".", "vault-collections"),
      });
    this.viewer =
      options.viewer ||
      new DocumentViewer({
        engine: this.engine,
        root: path.join(options.userDataPath || ".", "vault-documents"),
      });
    this.rotation =
      options.rotation ||
      new RotationService({
        manager: this.manager,
        store: this.store,
        engine: this.engine,
        userDataPath: options.userDataPath,
        collections: this.collections,
      });

    // Tasks 33-36: Android Autofill preview, offline advisor, device pairing
    // and the password audit. The advisor and the audit are pure functions over
    // real local state; pairing is loopback-only key agreement; the Autofill
    // preview persists only its own preview toggles.
    this.autofill =
      options.autofill ||
      new AutofillPreview({ file: path.join(options.userDataPath || ".", "autofill-preview.json") });
    this.advisor =
      options.advisor ||
      new SecurityAdvisor({
        status: () => this.status(),
        preferences: () => this.preferences.snapshot(),
        runtimeSignals: () => ({
          backups: this._backupCount,
          transferListening: Boolean(this.transfer.serverInfo),
          transferAddress: this.transfer.serverInfo ? `${this.transfer.serverInfo.host}:${this.transfer.serverInfo.port}` : null,
          clipboardLeases: this.clipboard.status().activeLeases || 0,
        }),
      });
    this.pairing = options.pairing || new PairingService();
    this._backupCount = 0;
    this._backupsScanned = false;

    // The session manager is the single choke point for every revocation path
    // (user lock, lock-all, idle sweep, quit), so forward its notification,
    // stop any open transfer listener and disarm any clipboard timer at the
    // same time.
    this.manager.onRevoke = (event) => {
      this._emitRevoked(event.sessionId, event.reason);
      this.transfer.stop().catch(() => {});
      this.clipboard.onSessionRevoked(event.sessionId);
      // A revoked session must not leave decrypted documents on disk.
      this.viewer.closeAll(event.sessionId).catch(() => {});
    };
  }

  _emitTransfer(event) {
    if (this.onTransfer) {
      try {
        this.onTransfer(event);
      } catch {
        /* ignore */
      }
    }
  }

  _emitClipboard(event) {
    if (this.onClipboard) {
      try {
        this.onClipboard(event);
      } catch {
        /* ignore */
      }
    }
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

  /** Key Detail (task 13): one key with public material and fingerprint only. */
  async keyGet(sessionId, id) {
    const rawKey = this.manager.getDek(sessionId);
    const { records } = await this.store.list("keys", rawKey);
    const record = records.find((r) => r.id === id);
    if (!record) throw new VaultError(CODES.NOT_FOUND, "No such key");
    this.manager.touch(sessionId);
    return {
      id: record.id,
      name: record.name,
      algorithm: record.algorithm,
      purpose: record.purpose,
      fingerprint: record.fingerprint,
      publicPem: record.publicPem,
      hasPrivate: Boolean(record.privatePem || record.secret),
      createdAt: record.createdAt,
    };
  }

  /** Rename / repurpose a key without touching its material. */
  async keyUpdate(sessionId, id, { name, purpose } = {}) {
    const rawKey = this.manager.getDek(sessionId);
    const { records } = await this.store.list("keys", rawKey);
    const record = records.find((r) => r.id === id);
    if (!record) throw new VaultError(CODES.NOT_FOUND, "No such key");
    if (name !== undefined) {
      const label = String(name).trim();
      if (!label) throw new VaultError(CODES.BAD_INPUT, "A key name is required");
      record.name = label.slice(0, 256);
    }
    if (purpose !== undefined) record.purpose = String(purpose).trim().slice(0, 64) || "general";
    await this.store.put("keys", rawKey, record);
    this.manager.touch(sessionId);
    this._record("key-update", "Updated key metadata");
    return this.keyGet(sessionId, id);
  }

  // ---- task 15: encrypted backup and recovery ------------------------------

  async backupCreate(sessionId, { collections } = {}) {
    const rawKey = this.manager.getDek(sessionId);
    const result = await this.backup.create(rawKey, collections ? { collections } : {});
    this.manager.touch(sessionId);
    this._record("backup-create", `Created an encrypted backup (${result.manifest.length} collection(s))`);
    return result;
  }

  async backupList(sessionId) {
    this.manager.getDek(sessionId);
    this.manager.touch(sessionId);
    return this.backup.list();
  }

  /** Dry-run: decrypt and verify without writing anything. */
  async backupInspect(sessionId, id) {
    const rawKey = this.manager.getDek(sessionId);
    this.manager.touch(sessionId);
    return this.backup.inspect(this.backup.pathFor(id), rawKey);
  }

  async backupRestore(sessionId, id, { confirm } = {}) {
    const rawKey = this.manager.getDek(sessionId);
    const result = await this.backup.restore(this.backup.pathFor(id), rawKey, { confirm });
    this.manager.touch(sessionId);
    this._record("backup-restore", `Restored an encrypted backup (${result.totalRecords} record(s))`);
    return result;
  }

  async backupRemove(sessionId, id) {
    this.manager.getDek(sessionId);
    const result = await this.backup.remove(id);
    this.manager.touch(sessionId);
    this._record("backup-remove", "Removed a backup file");
    return result;
  }

  // ---- task 16: encrypted package sharing ----------------------------------

  async shareCreate(sessionId, request = {}) {
    this.manager.getDek(sessionId);
    this.manager.touch(sessionId);
    const { model, passphrase, recipientPublicPem, payload, expiresAt, sender } = request;
    if (model === "recipient-key") {
      const result = this.share.createForRecipient({ recipientPublicPem, payload, expiresAt, sender });
      this._record("share-create", "Created a recipient-key share package");
      return { model: result.envelope.model, envelope: result.envelope, bytes: result.bytes.toString("base64"), fingerprint: result.fingerprint };
    }
    if (model === "shared-secret") {
      const result = this.share.createSharedSecret({ passphrase, payload, expiresAt, sender });
      this._record("share-create", "Created a shared-secret share package");
      return { model: result.envelope.model, envelope: result.envelope, bytes: result.bytes.toString("base64"), fingerprint: result.fingerprint };
    }
    throw new VaultError(CODES.BAD_INPUT, `Unsupported share model "${model}"`);
  }

  shareInspect(sessionId, envelope) {
    this.manager.getDek(sessionId);
    this.manager.touch(sessionId);
    return this.share.inspect(envelope);
  }

  shareOpen(sessionId, envelope, credential = {}) {
    this.manager.getDek(sessionId);
    this.manager.touch(sessionId);
    const result = this.share.open(envelope, credential);
    this._record("share-open", "Opened a share package");
    return result;
  }

  // ---- task 14: privacy preferences ----------------------------------------

  async preferencesGet() {
    return this.preferences.load();
  }

  async preferencesUpdate(patch) {
    const snapshot = await this.preferences.update(patch);
    this._record("preferences-update", "Updated local privacy preferences");
    return snapshot;
  }

  // ---- tasks 17-20: inspection and authenticity ----------------------------

  /**
   * Hash Integrity (task 17). Hashing and comparison are read-only, so they
   * work without an unlocked vault; the comparison is constant-time.
   */
  async hashCompute({ algorithm, text, inputPath } = {}) {
    const result = await inspect.hash({ algorithm, text, inputPath });
    this._record("hash-compute", `Hashed ${result.size} bytes with ${result.algorithm}`);
    return result;
  }

  hashCompare(left, right) {
    const verdict = inspect.compareDigests(left, right);
    this._record("hash-compare", verdict.equal ? "Digests matched" : "Digests differed");
    return verdict;
  }

  /** Signing requires an unlocked vault so key material never leaves it. */
  async signatureSign(sessionId, { keyId, text, inputPath } = {}) {
    const rawKey = this.manager.getDek(sessionId);
    const { records } = await this.store.list("keys", rawKey);
    const record = records.find((r) => r.id === keyId);
    if (!record) throw new VaultError(CODES.NOT_FOUND, "No such key");
    if (!record.privatePem) {
      throw new VaultError(CODES.BAD_INPUT, "That key has no signing private material");
    }
    const result = await inspect.sign({
      algorithm: record.algorithm,
      privatePem: record.privatePem,
      text,
      inputPath,
    });
    this.manager.touch(sessionId);
    this._record("signature-sign", `Signed ${result.size} bytes with a ${record.algorithm} key`);
    return {
      keyId: record.id,
      fingerprint: record.fingerprint,
      algorithm: result.algorithm,
      digest: result.digest,
      signature: result.signature,
      size: result.size,
    };
  }

  /**
   * Verification is public-key only. It needs no vault session when the caller
   * supplies the public key; using a stored key by id requires an unlocked
   * session because that material lives in the encrypted store.
   */
  async signatureVerify(sessionId, { keyId, publicPem, algorithm, signature, text, inputPath } = {}) {
    let pem = publicPem;
    let alg = algorithm;
    let fingerprint = null;
    if (!pem && keyId) {
      const rawKey = this.manager.getDek(sessionId);
      const { records } = await this.store.list("keys", rawKey);
      const record = records.find((r) => r.id === keyId);
      if (!record) throw new VaultError(CODES.NOT_FOUND, "No such key");
      pem = record.publicPem;
      alg = record.algorithm;
      fingerprint = record.fingerprint;
      this.manager.touch(sessionId);
    }
    if (!pem) throw new VaultError(CODES.BAD_INPUT, "A public key is required to verify");
    const result = await inspect.verify({ algorithm: alg, publicPem: pem, signature, text, inputPath });
    this._record("signature-verify", result.valid ? "Signature verified" : "Signature did not verify");
    return { ...result, fingerprint };
  }

  async certificateInspect({ pem, inputPath } = {}) {
    let text = pem;
    if (!text && inputPath) {
      const bytes = await fsp.readFile(inputPath).catch((err) => {
        if (err.code === "ENOENT") throw new VaultError(CODES.NOT_FOUND, "The certificate file was not found");
        throw new VaultError(CODES.IO_FAILED, "The certificate file could not be read");
      });
      text = bytes.toString("utf8");
    }
    const result = inspect.inspectCertificate(text);
    this._record("certificate-inspect", `Parsed a certificate for ${result.subject}`);
    return result;
  }

  // ---- task 21: encrypted archive -----------------------------------------

  /**
   * Build a ZIP from real files, then seal it with the vault engine. The caller
   * supplies a destination, so nothing is written without a chosen path.
   */
  async archiveCreate({ sessionId, inputPaths, outputPath, compression = true, operationId } = {}) {
    const { rawKey } = this._engineFor(sessionId);
    if (!Array.isArray(inputPaths) || inputPaths.length === 0) {
      throw new VaultError(CODES.BAD_INPUT, "Select at least one file to archive");
    }
    if (inputPaths.length > archive.MAX_ENTRIES) {
      throw new VaultError(CODES.BAD_INPUT, `An archive may hold at most ${archive.MAX_ENTRIES} files`);
    }
    if (typeof outputPath !== "string" || !outputPath) {
      throw new VaultError(CODES.BAD_INPUT, "Choose where to write the archive");
    }
    if (inputPaths.includes(outputPath)) {
      throw new VaultError(CODES.BAD_INPUT, "The archive cannot be written over one of its own inputs");
    }

    const taken = new Set();
    const entries = [];
    let total = 0;
    for (const inputPath of inputPaths) {
      let bytes;
      try {
        bytes = await fsp.readFile(inputPath);
      } catch (err) {
        if (err.code === "ENOENT") throw new VaultError(CODES.NOT_FOUND, "An input file was not found");
        throw new VaultError(CODES.IO_FAILED, "An input file could not be read");
      }
      if (bytes.length > archive.MAX_ENTRY_BYTES) {
        throw new VaultError(CODES.BAD_INPUT, "An input file is too large to archive");
      }
      total += bytes.length;
      if (total > archive.MAX_TOTAL_BYTES) throw new VaultError(CODES.BAD_INPUT, "The selected files are too large");
      entries.push({ name: archive.entryNameFor(inputPath, taken), data: bytes });
    }

    const zip = archive.buildZip(entries, { compression });
    const { bytes, meta } = this.engine.encryptBuffer(zip, { rawKey });
    await atomicWrite(outputPath, bytes);
    this.manager.touch(sessionId);
    this._record("archive-create", `Created an encrypted archive of ${entries.length} file(s)`);
    return {
      outputPath,
      fileCount: entries.length,
      plaintextSize: zip.length,
      encryptedSize: bytes.length,
      compression: Boolean(compression),
      operationId: operationId || null,
      meta,
    };
  }

  /** Decrypt an archive and list what is inside without extracting. */
  async archiveInspect(sessionId, inputPath) {
    const { rawKey } = this._engineFor(sessionId);
    const container = await readFileOrThrow(inputPath, "The archive was not found", "The archive could not be read");
    const { plaintext, meta } = this.engine.decryptBuffer(container, { rawKey });
    const entries = archive.listZip(plaintext).map((e) => ({
      name: e.name,
      size: e.uncompSize,
      method: e.method === 8 ? "deflate" : "store",
    }));
    this.manager.touch(sessionId);
    this._record("archive-inspect", `Listed ${entries.length} entr(ies) in an archive`);
    return {
      inputPath,
      fileCount: entries.length,
      totalSize: entries.reduce((sum, e) => sum + e.size, 0),
      entries,
      meta,
    };
  }

  /**
   * Decrypt an archive and write its entries into a chosen directory. Entry
   * names are validated before any write, so a hostile archive cannot escape
   * the destination.
   */
  async archiveExtract(sessionId, { inputPath, outputDir } = {}) {
    const { rawKey } = this._engineFor(sessionId);
    if (typeof outputDir !== "string" || !outputDir) {
      throw new VaultError(CODES.BAD_INPUT, "Choose a destination folder");
    }
    const container = await readFileOrThrow(inputPath, "The archive was not found", "The archive could not be read");
    const { plaintext } = this.engine.decryptBuffer(container, { rawKey });
    const entries = archive.extractZip(plaintext);

    await fsp.mkdir(outputDir, { recursive: true });
    const written = [];
    for (const entry of entries) {
      const base = path.basename(archive.assertSafeEntryName(entry.name));
      const target = path.join(outputDir, base);
      const exists = await fsp
        .access(target)
        .then(() => true)
        .catch(() => false);
      if (exists) {
        throw new VaultError(CODES.BAD_INPUT, `Refusing to overwrite the existing file "${base}"`);
      }
      await atomicWrite(target, entry.data);
      written.push({ name: base, size: entry.data.length });
    }
    this.manager.touch(sessionId);
    this._record("archive-extract", `Extracted ${written.length} file(s) from an archive`);
    return { outputDir, files: written };
  }

  // ---- task 24: metadata inspection and cleaning --------------------------

  /**
   * Read metadata from a real file. This never mutates the source: it only
   * reports what is present, so the user can decide what to strip.
   */
  async metadataInspect({ inputPath } = {}) {
    if (typeof inputPath !== "string" || !inputPath) {
      throw new VaultError(CODES.BAD_INPUT, "Choose a file to inspect");
    }
    const stat = await fsp.stat(inputPath).catch((err) => {
      if (err.code === "ENOENT") throw new VaultError(CODES.NOT_FOUND, "The file was not found");
      throw new VaultError(CODES.IO_FAILED, "The file could not be read");
    });
    if (!stat.isFile()) throw new VaultError(CODES.BAD_INPUT, "That path is not a regular file");

    const head = await readHead(inputPath, 1024 * 1024);
    const kind = metadata.sniffKind(head);
    const tags = kind === "jpeg" ? metadata.readJpegTags(head) : [];
    const present = kind === "jpeg" ? metadata.presentGroups(head) : new Set();

    // GPS lives inside EXIF alongside the capture date and camera details, so
    // the three are reported together and the UI must say so.
    const groups = [
      { id: "gps", label: "GPS location", present: present.has("gps") },
      { id: "dates", label: "Date and time", present: present.has("dates") },
      { id: "camera", label: "Camera and lens", present: present.has("camera") },
      { id: "icc", label: "Colour profile", present: present.has("icc") },
      { id: "xmp", label: "Editing history", present: present.has("xmp") },
    ];

    this._record("metadata-inspect", `Inspected metadata in ${path.basename(inputPath)}`);
    return {
      inputPath,
      name: path.basename(inputPath),
      format: kind,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      tags,
      groups,
      cleanable: kind === "jpeg",
    };
  }

  /**
   * Write a copy of the file with the selected metadata groups removed. The
   * original is only ever read. Removing metadata from a JPEG is a byte-exact
   * segment filter, so no image re-encoding (and therefore no quality loss)
   * happens. Formats we cannot rewrite safely are refused rather than faked.
   */
  async metadataClean({ inputPath, outputPath, remove = [] } = {}) {
    if (typeof inputPath !== "string" || !inputPath) {
      throw new VaultError(CODES.BAD_INPUT, "Choose a file to clean");
    }
    if (typeof outputPath !== "string" || !outputPath) {
      throw new VaultError(CODES.BAD_INPUT, "Choose where to write the clean copy");
    }
    if (path.resolve(inputPath) === path.resolve(outputPath)) {
      throw new VaultError(CODES.BAD_INPUT, "The clean copy must be a different file; the original is never modified");
    }
    const requested = Array.isArray(remove) ? remove.filter((r) => typeof r === "string") : [];
    if (requested.length === 0) throw new VaultError(CODES.BAD_INPUT, "Select at least one metadata group to remove");

    const bytes = await readFileOrThrow(inputPath, "The file was not found", "The file could not be read");
    if (metadata.sniffKind(bytes.subarray(0, 1024 * 1024)) !== "jpeg") {
      throw new VaultError(CODES.BAD_INPUT, "Only JPEG metadata can be removed byte-exactly today");
    }
    const before = metadata.readJpegTags(bytes);
    const cleaned = metadata.stripJpegSegments(bytes, new Set(requested));
    if (!cleaned) throw new VaultError(CODES.IO_FAILED, "The JPEG structure could not be rewritten safely");

    const beforeTags = before.length;
    const afterTags = metadata.readJpegTags(cleaned).length;
    const beforeGroups = metadata.presentGroups(bytes);
    const afterGroups = metadata.presentGroups(cleaned);
    const removed = [...beforeGroups].filter((g) => !afterGroups.has(g));
    await atomicWrite(outputPath, cleaned);
    this._record("metadata-clean", `Wrote a metadata-cleaned copy of ${path.basename(inputPath)}`);
    return {
      inputPath,
      outputPath,
      requestedGroups: requested,
      removedGroups: removed,
      removedSegments: beforeTags - afterTags,
      originalSize: bytes.length,
      cleanedSize: cleaned.length,
      originalUntouched: true,
    };
  }

  // ---- task 23: fingerprint verification ----------------------------------

  /**
   * Fingerprint a public key or certificate. Accepts a stored key id, raw PEM,
   * or the contents of a key file the user picked.
   */
  async fingerprintGet({ sessionId, keyId, pem, inputPath } = {}) {
    let material = pem;
    let source = "provided";
    let name = null;
    let algorithm = null;

    if (!material && inputPath) {
      const bytes = await readFileOrThrow(inputPath, "The key file was not found", "The key file could not be read");
      material = bytes.toString("utf8");
      source = "file";
      name = path.basename(inputPath);
    }
    if (!material && keyId) {
      const rawKey = this.manager.getDek(sessionId);
      const { records } = await this.store.list("keys", rawKey);
      const record = records.find((r) => r.id === keyId);
      if (!record) throw new VaultError(CODES.NOT_FOUND, "No such key");
      if (!record.publicPem) {
        throw new VaultError(CODES.BAD_INPUT, "That key has no public material to fingerprint");
      }
      material = record.publicPem;
      source = "vault";
      name = record.name;
      algorithm = record.algorithm;
      this.manager.touch(sessionId);
    }
    if (!material) throw new VaultError(CODES.BAD_INPUT, "Provide a key id, PEM material or a key file");

    const result = inspect.fingerprintOf(material);
    this._record("fingerprint-get", `Fingerprinted ${source} public material`);
    return { ...result, source, name, algorithm };
  }

  /** Compare two fingerprints and report where they diverge. */
  fingerprintCompare(left, right) {
    const result = inspect.compareFingerprints(left, right);
    this._record("fingerprint-compare", result.equal ? "Fingerprints matched" : "Fingerprints did not match");
    return result;
  }

  // ---- task 22: local transfer --------------------------------------------

  /**
   * Start listening for a transfer from another device. Requires an unlocked
   * session, because accepting files writes into this device's storage.
   */
  async transferListen({ sessionId, port = 0, bindHost = "127.0.0.1" } = {}) {
    this.manager.getDek(sessionId);
    const info = await this.transfer.listen({ port, bindHost, sessionId });
    this.manager.touch(sessionId);
    this._record("transfer-listen", `Listening for a local transfer on port ${info.port}`);
    return info;
  }

  transferStop() {
    return this.transfer.stop();
  }

  transferRequests() {
    return { requests: this.transfer.listRequests() };
  }

  /**
   * Accept or decline an inbound request. Accepting is what starts the
   * handshake; declining closes the socket with nothing written.
   */
  async transferRespond({ sessionId, requestId, accept, outputDir } = {}) {
    this.manager.getDek(sessionId);
    const result = await this.transfer.respond({ requestId, accept, outputDir });
    this.manager.touch(sessionId);
    this._record("transfer-respond", accept === true ? "Accepted a local transfer" : "Declined a local transfer");
    return result;
  }

  /** Send files to a peer. Resolves only once the receiver has acknowledged. */
  async transferSend({ sessionId, host, port, code, files, sender } = {}) {
    this.manager.getDek(sessionId);
    const result = await this.transfer.send({ host, port, code, files, sender });
    this.manager.touch(sessionId);
    this._record("transfer-send", `Sent ${result.files} file(s) to a local peer`);
    return result;
  }

  _emitProgress(operationId, direction, progress) {
    if (!operationId || !this.onProgress) return;
    this.onProgress({ operationId, direction, ...progress });
  }

  // ---- tasks 25-28: privacy labs ------------------------------------------

  /**
   * Clipboard Guard (task 25). The guard is real: it manages time-limited
   * leases over the operating-system clipboard and only clears a value it
   * wrote itself. Arming needs explicit confirmation every time because a
   * timed clear is destructive to whatever the user copies next.
   */
  clipboardStatus() {
    const base = this.clipboard.status();
    const prefs = this.preferences.snapshot().values;
    return { ...base, clearClipboardPreferred: prefs.clearClipboard === true };
  }

  clipboardCopy({ sessionId, text, seconds, confirm } = {}) {
    if (sessionId) this.manager.getDek(sessionId);
    const result = this.clipboard.copy({ text, seconds, confirm, sessionId });
    if (result && typeof result.then === "function") {
      return result.then((lease) => {
        this._record("clipboard", `Leased clipboard content for ${lease.seconds}s`);
        return lease;
      });
    }
    this._record("clipboard", `Leased clipboard content for ${result.seconds}s`);
    return result;
  }

  clipboardDisarm(leaseId, reason) {
    const result = this.clipboard.disarm(leaseId, reason || "user");
    if (result.disarmed) this._record("clipboard", "Clipboard lease disarmed");
    return result;
  }

  clipboardClearNow(leaseId) {
    const result = this.clipboard.clearNow(leaseId);
    this._record("clipboard", "Clipboard lease cleared on demand");
    return result;
  }

  clipboardVerify(leaseId) {
    return this.clipboard.verify(leaseId);
  }

  /**
   * Secure Random (task 26). Real CSPRNG output with unbiased rejection
   * sampling for word and character selection. `entropyBits` reports the
   * generator's theoretical entropy; it is not a certification of the
   * operating-system entropy source, and the UI says so.
   */
  randomGenerate({ type, length } = {}) {
    const result = labs.randomBytes({ type, length });
    this._record("random", `Generated ${result.length} ${result.type} unit(s)`);
    return result;
  }

  /**
   * HMAC Authenticity (task 27). Real HMAC over text or a streamed file. The
   * key is used and discarded: it is never stored, logged or returned. Only the
   * resulting MAC crosses the IPC boundary. A match proves integrity and key
   * knowledge, not sender identity.
   */
  async hmacCompute({ algorithm, message, key, keyEncoding, encoding, inputPath } = {}) {
    const result = await labs.hmacCompute({ algorithm, message, key, keyEncoding, encoding, inputPath });
    this._record("hmac", `Computed a ${result.algorithm} MAC over ${result.messageBytes} bytes (${result.source})`);
    return result;
  }

  hmacCompare(left, right) {
    const verdict = labs.hmacCompare(left, right);
    this._record("hmac", verdict.equal ? "MAC values matched" : "MAC values differed");
    return verdict;
  }

  /**
   * Public Key QR (task 28). Produces a real QR matrix for public data only.
   * A stored vault key can be selected by id, in which case the public PEM is
   * read from the encrypted store and the private material is never touched.
   */
  async publicKeyQr({ sessionId, keyId, text, errorCorrectionLevel } = {}) {
    let payload = typeof text === "string" ? text.trim() : "";
    let fingerprint = null;
    if (!payload && keyId) {
      const rawKey = this.manager.getDek(sessionId);
      const { records } = await this.store.list("keys", rawKey);
      const record = records.find((r) => r.id === keyId);
      if (!record) throw new VaultError(CODES.NOT_FOUND, "No such key");
      if (!record.publicPem) throw new VaultError(CODES.BAD_INPUT, "That key has no public material to share");
      payload = record.publicPem;
      fingerprint = record.fingerprint;
      this.manager.touch(sessionId);
    }
    const result = labs.publicKeyQr({ text: payload, errorCorrectionLevel });
    this._record("public-qr", `Rendered a ${result.size}x${result.size} public QR code`);
    return { ...result, payload, fingerprint };
  }

  // ---- task 29: private vault collections ---------------------------------

  /** Every method below takes the DEK from the live session; guests are refused. */
  async collectionsTree(sessionId) {
    const rawKey = this.manager.getDek(sessionId);
    this.manager.touch(sessionId);
    return this.collections.tree(rawKey);
  }

  async collectionsGet(sessionId, id) {
    const rawKey = this.manager.getDek(sessionId);
    this.manager.touch(sessionId);
    return this.collections.get(rawKey, id);
  }

  async collectionsCreate(sessionId, request = {}) {
    const rawKey = this.manager.getDek(sessionId);
    const result = await this.collections.create(rawKey, request);
    this.manager.touch(sessionId);
    this._record("collection-create", `Created collection "${result.name}"`);
    return result;
  }

  async collectionsRename(sessionId, id, patch = {}) {
    const rawKey = this.manager.getDek(sessionId);
    const result = await this.collections.rename(rawKey, id, patch);
    this.manager.touch(sessionId);
    this._record("collection-rename", "Renamed a collection");
    return result;
  }

  async collectionsRemove(sessionId, id, options = {}) {
    const rawKey = this.manager.getDek(sessionId);
    const result = await this.collections.remove(rawKey, id, options);
    this.manager.touch(sessionId);
    this._record("collection-remove", `Removed ${result.collections} collection(s)`);
    return result;
  }

  async collectionsAddItem(sessionId, request = {}) {
    const rawKey = this.manager.getDek(sessionId);
    const operationId = request.operationId || crypto.randomBytes(8).toString("hex");
    const controller = new AbortController();
    this.operations.set(operationId, controller);
    try {
      const result = await this.collections.addItem(rawKey, {
        ...request,
        operationId,
        onProgress: (p) => this._emitProgress(operationId, "encrypt", p),
      });
      this.manager.touch(sessionId);
      this._record("collection-item-add", `Encrypted an item into a collection`);
      return { ...result, operationId };
    } finally {
      this.operations.delete(operationId);
    }
  }

  async collectionsMoveItem(sessionId, request = {}) {
    const rawKey = this.manager.getDek(sessionId);
    const result = await this.collections.moveItem(rawKey, request);
    this.manager.touch(sessionId);
    this._record("collection-item-move", "Moved an item between collections");
    return result;
  }

  async collectionsCopyItem(sessionId, request = {}) {
    const rawKey = this.manager.getDek(sessionId);
    const operationId = request.operationId || crypto.randomBytes(8).toString("hex");
    const controller = new AbortController();
    this.operations.set(operationId, controller);
    try {
      const result = await this.collections.copyItem(rawKey, { ...request, operationId });
      this.manager.touch(sessionId);
      this._record("collection-item-copy", "Copied an item between collections");
      return { ...result, operationId };
    } finally {
      this.operations.delete(operationId);
    }
  }

  async collectionsRemoveItem(sessionId, itemId) {
    const rawKey = this.manager.getDek(sessionId);
    const result = await this.collections.removeItem(rawKey, itemId);
    this.manager.touch(sessionId);
    this._record("collection-item-remove", "Removed an item from a collection");
    return result;
  }

  async collectionsExportItem(sessionId, request = {}) {
    const rawKey = this.manager.getDek(sessionId);
    const operationId = request.operationId || crypto.randomBytes(8).toString("hex");
    const controller = new AbortController();
    this.operations.set(operationId, controller);
    try {
      const result = await this.collections.exportItem(rawKey, { ...request, operationId });
      this.manager.touch(sessionId);
      this._record("collection-item-export", "Exported a collection item as plaintext");
      return result;
    } finally {
      this.operations.delete(operationId);
    }
  }

  async collectionsSearch(sessionId, query = {}) {
    const rawKey = this.manager.getDek(sessionId);
    this.manager.touch(sessionId);
    return this.collections.search(rawKey, query);
  }

  // ---- task 30: protected document viewer ---------------------------------

  async viewerOpen(sessionId, request = {}) {
    const rawKey = this.manager.getDek(sessionId);
    const operationId = request.operationId || crypto.randomBytes(8).toString("hex");
    const controller = new AbortController();
    this.operations.set(operationId, controller);
    try {
      const result = await this.viewer.open(rawKey, { ...request, sessionId, operationId });
      this.manager.touch(sessionId);
      this._record("viewer-open", `Opened a protected ${result.kind} document`);
      return { ...result, operationId };
    } finally {
      this.operations.delete(operationId);
    }
  }

  async viewerReadChunk(docId, options = {}) {
    return this.viewer.readChunk(docId, options);
  }

  async viewerClose(docId) {
    const result = await this.viewer.close(docId);
    this._record("viewer-close", "Closed a protected document");
    return result;
  }

  viewerStatus() {
    return this.viewer.status();
  }

  /** Sweep plaintext temp files left by a previous process. Called at startup. */
  async viewerSweep() {
    const result = await this.viewer.sweep();
    if (result.removed > 0) this._record("viewer-sweep", `Removed ${result.removed} stale document file(s)`);
    return result;
  }

  // ---- task 31: vault key rotation ----------------------------------------

  async rotationPreflight(sessionId) {
    const rawKey = this.manager.getDek(sessionId);
    this.manager.touch(sessionId);
    return this.rotation.preflight(rawKey);
  }

  async rotationStatus() {
    const journal = await this.rotation.journal();
    if (!journal) return { inProgress: false };
    return {
      inProgress: true,
      rotationId: journal.rotationId,
      mode: journal.mode,
      stage: journal.stage,
      startedAt: journal.startedAt,
      completedCollections: journal.completedCollections,
      error: journal.error || null,
    };
  }

  async rotationStart(sessionId, request = {}) {
    const result = await this.rotation.rotate(sessionId, request);
    this.manager.touch(sessionId);
    this._record("rotation-start", `Rotated the vault key (${result.mode} mode)`);
    return result;
  }

  async rotationResume(sessionId, request = {}) {
    const result = await this.rotation.resume(sessionId, request);
    this.manager.touch(sessionId);
    this._record("rotation-resume", "Resumed an interrupted key rotation");
    return result;
  }

  async rotationRollback(confirm) {
    const result = await this.rotation.rollback(confirm);
    this._record("rotation-rollback", "Rolled back a key rotation");
    return result;
  }

  // ---- task 32: ciphertext package inspector ------------------------------

  /** Header-only parse. The result is explicitly unauthenticated. */
  async packageInspect(inputPath) {
    const result = await this.engine.inspectPackage(inputPath);
    this._record("package-inspect", "Parsed a ciphertext package header");
    return result;
  }

  /** Authenticated verification with the live vault key. */
  async packageVerify(sessionId, inputPath) {
    const rawKey = this.manager.getDek(sessionId);
    const operationId = crypto.randomBytes(8).toString("hex");
    const controller = new AbortController();
    this.operations.set(operationId, controller);
    try {
      const result = await this.engine.verifyPackage({
        inputPath,
        rawKey,
        signal: controller.signal,
        onProgress: (p) => this._emitProgress(operationId, "verify", p),
      });
      this.manager.touch(sessionId);
      this._record("package-verify", `Verified a ciphertext package (${result.frames} frame(s))`);
      return { ...result, operationId };
    } finally {
      this.operations.delete(operationId);
    }
  }

  // ---- task 33: Android Autofill preview ----------------------------------

  /** Preview toggles only. The capability report always says native Autofill is absent. */
  async autofillGet() {
    const snapshot = await this.autofill.load();
    this._record("autofill", "Read the Autofill preview state");
    return snapshot;
  }

  async autofillUpdate(patch = {}) {
    const snapshot = await this.autofill.update(patch);
    this._record("autofill", "Updated the Autofill preview toggles");
    return snapshot;
  }

  // ---- task 34: offline security advisor ----------------------------------

  advisorFilters() {
    return this.advisor.filters();
  }

  /** Real local-state review. It never scans the operating system. */
  async advisorReview(filter) {
    if (!this._backupsScanned) {
      try {
        const { backups } = await this.backup.list();
        this._backupCount = Array.isArray(backups) ? backups.length : 0;
      } catch {
        this._backupCount = 0;
      }
      this._backupsScanned = true;
    }
    const report = await this.advisor.review({ filter: filter || "All" });
    this._record("advisor", `Produced a local readiness review (${report.counts.observed} observed row(s))`);
    return report;
  }

  // ---- task 35: multi-device pairing (loopback only) ----------------------

  /** Ephemeral X25519 agreement between two roles in this process. No socket. */
  pairingStart(request = {}) {
    const session = this.pairing.start(request);
    this._record("pairing", "Started a loopback pairing session");
    return session;
  }

  pairingStatus(sessionId) {
    return this.pairing.status(sessionId);
  }

  pairingConfirm(sessionId, request = {}) {
    const result = this.pairing.confirm(sessionId, request);
    this._record("pairing", "Confirmed a pairing authentication phrase");
    return result;
  }

  pairingCancel(sessionId) {
    const result = this.pairing.cancel(sessionId);
    this._record("pairing", "Cancelled a pairing session");
    return result;
  }

  pairingList() {
    return this.pairing.list();
  }

  // ---- task 36: password strength audit -----------------------------------

  /** Offline estimate over the given text. Nothing is stored or transmitted. */
  passwordAudit(input) {
    const result = passwordaudit.audit(input);
    // The input itself is never recorded; only its length and score.
    this._record("password-audit", `Audited a ${result.length}-character string (score ${result.score}/4)`);
    return result;
  }
}

module.exports = { VaultService };
