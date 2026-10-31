"use strict";

/**
 * Encrypted backup and recovery (task 15).
 *
 * A backup is one authenticated container (the same format the File Cipher
 * uses) whose plaintext is a manifest plus every stored collection:
 *
 *   { format, createdAt, app, manifest: [{ collection, count, sha256 }],
 *     collections: { notes: {...}, passwords: {...}, ... } }
 *
 * The manifest carries a SHA-256 per collection so a restored backup can be
 * checked against what was written, and the container's own trailing HMAC makes
 * truncation and tampering detectable. Nothing is written in plaintext, and a
 * backup cannot be read without the vault key that produced it.
 *
 * Restore is atomic: every collection is staged in memory and validated before
 * anything is written, and a failed write rolls the store back to its previous
 * contents.
 */
const crypto = require("crypto");
const fsp = require("fs/promises");
const path = require("path");

const { VaultError, CODES, badInput } = require("./errors");
const { COLLECTIONS } = require("./store");

const BACKUP_FORMAT = "KNXBK01";
const BACKUP_VERSION = 1;
const BACKUP_EXT = ".knxbak";
const MAX_BACKUPS = 50;

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

class VaultBackup {
  constructor(options = {}) {
    this.root = options.root;
    this.engine = options.engine;
    this.store = options.store;
  }

  dir() {
    return path.join(this.root, "backups");
  }

  /** Absolute path of a backup file by id. */
  pathFor(id) {
    if (typeof id !== "string" || !/^[0-9a-zA-Z-]+$/.test(id)) {
      throw badInput("A valid backup id is required");
    }
    return path.join(this.dir(), `${id}${BACKUP_EXT}`);
  }

  async ensureDir() {
    await fsp.mkdir(this.dir(), { recursive: true });
  }

  /**
   * Build a backup container from the named collections. Returns the bytes and
   * the manifest that was sealed into them.
   */
  async build(rawKey, { collections = COLLECTIONS } = {}) {
    const names = collections.filter((name) => COLLECTIONS.includes(name));
    if (names.length === 0) throw badInput("A backup must include at least one collection");

    const payload = {};
    const manifest = [];
    for (const name of names) {
      const document = await this.store.read(name, rawKey);
      const records = document.records || [];
      payload[name] = document;
      manifest.push({
        collection: name,
        count: records.length,
        sha256: sha256(Buffer.from(JSON.stringify(records), "utf8")),
      });
    }

    const body = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      app: "KnouxCrypt Desktop",
      manifest,
      collections: payload,
    };
    const plaintext = Buffer.from(JSON.stringify(body), "utf8");
    const { bytes } = this.engine.encryptBuffer(plaintext, { rawKey });
    return { bytes, manifest, createdAt: body.createdAt, size: bytes.length };
  }

  /** Write a backup to the backups directory and return its metadata. */
  async create(rawKey, options = {}) {
    await this.ensureDir();
    const { bytes, manifest, createdAt } = await this.build(rawKey, options);
    const id = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const file = path.join(this.dir(), `${id}${BACKUP_EXT}`);

    // Write to a temp file then rename so a crash cannot leave a half-written
    // backup that later looks like a corrupt one.
    const tmp = `${file}.tmp`;
    await fsp.writeFile(tmp, bytes, { mode: 0o600 });
    await fsp.rename(tmp, file);
    await this._prune();
    return { id, file, createdAt, size: bytes.length, manifest };
  }

  /** Remove the oldest backups past the retention limit. */
  async _prune() {
    const files = (await this._listFiles()).sort();
    while (files.length > MAX_BACKUPS) {
      const oldest = files.shift();
      await fsp.rm(path.join(this.dir(), oldest), { force: true });
    }
  }

  async _listFiles() {
    try {
      const entries = await fsp.readdir(this.dir());
      return entries.filter((name) => name.endsWith(BACKUP_EXT));
    } catch (err) {
      if (err.code === "ENOENT") return [];
      throw new VaultError(CODES.IO_FAILED, "Could not read the backup directory");
    }
  }

  /** Metadata for every backup file, without needing the key. */
  async list() {
    const files = (await this._listFiles()).sort().reverse();
    const out = [];
    for (const name of files) {
      const file = path.join(this.dir(), name);
      const stat = await fsp.stat(file);
      out.push({
        id: name.replace(BACKUP_EXT, ""),
        file,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    }
    return { backups: out };
  }

  /**
   * Decrypt and validate a backup without writing anything (dry run). Throws
   * with a specific code when the key is wrong or the file is damaged.
   */
  async inspect(file, rawKey) {
    let sealed;
    try {
      sealed = await fsp.readFile(file);
    } catch (err) {
      if (err.code === "ENOENT") throw new VaultError(CODES.NOT_FOUND, "No such backup file");
      throw new VaultError(CODES.IO_FAILED, "Could not read the backup file");
    }
    if (sealed.length === 0) throw new VaultError(CODES.TRUNCATED, "The backup file is empty");

    // decryptBuffer throws AUTH_FAILED / INTEGRITY_FAILED / TRUNCATED as needed.
    const { plaintext } = this.engine.decryptBuffer(sealed, { rawKey });
    let body;
    try {
      body = JSON.parse(plaintext.toString("utf8"));
    } catch {
      throw new VaultError(CODES.INTEGRITY_FAILED, "The backup is not valid JSON");
    }
    if (body.format !== BACKUP_FORMAT) {
      throw new VaultError(CODES.UNSUPPORTED_FORMAT, "Not a KnouxCrypt backup");
    }
    if (body.version !== BACKUP_VERSION) {
      throw new VaultError(CODES.UNSUPPORTED_FORMAT, `Unsupported backup version ${body.version}`);
    }
    if (!Array.isArray(body.manifest) || !body.collections) {
      throw new VaultError(CODES.INTEGRITY_FAILED, "The backup manifest is missing");
    }

    // Verify each collection against the manifest checksum that was sealed in.
    const report = [];
    for (const entry of body.manifest) {
      const document = body.collections[entry.collection];
      if (!document || !Array.isArray(document.records)) {
        throw new VaultError(CODES.INTEGRITY_FAILED, `Collection ${entry.collection} is missing from the backup`);
      }
      const digest = sha256(Buffer.from(JSON.stringify(document.records), "utf8"));
      if (digest !== entry.sha256) {
        throw new VaultError(CODES.INTEGRITY_FAILED, `Collection ${entry.collection} does not match its checksum`);
      }
      if (document.records.length !== entry.count) {
        throw new VaultError(CODES.INTEGRITY_FAILED, `Collection ${entry.collection} has an unexpected record count`);
      }
      report.push({ collection: entry.collection, count: entry.count, sha256: entry.sha256 });
    }

    return {
      format: body.format,
      version: body.version,
      createdAt: body.createdAt,
      app: body.app,
      manifest: report,
      totalRecords: report.reduce((sum, item) => sum + item.count, 0),
    };
  }

  /**
   * Restore a backup into the store atomically.
   *
   * Every collection is validated before the first write. If any write fails,
   * the collections touched so far are restored to their previous contents, so
   * a failed restore cannot leave the vault half-replaced.
   */
  async restore(file, rawKey, { confirm } = {}) {
    if (confirm !== true) {
      throw new VaultError(CODES.BAD_INPUT, "Restore requires explicit confirmation");
    }
    const summary = await this.inspect(file, rawKey);

    // Re-read to get the payload (inspect already proved it is intact).
    const sealed = await fsp.readFile(file);
    const { plaintext } = this.engine.decryptBuffer(sealed, { rawKey });
    const body = JSON.parse(plaintext.toString("utf8"));

    const previous = new Map();
    const written = [];
    try {
      for (const entry of body.manifest) {
        const name = entry.collection;
        if (!COLLECTIONS.includes(name)) {
          throw new VaultError(CODES.UNSUPPORTED_FORMAT, `Unknown collection ${name} in backup`);
        }
        previous.set(name, await this.store.read(name, rawKey));
        await this.store.write(name, rawKey, body.collections[name]);
        written.push(name);
      }
    } catch (err) {
      // Roll back every collection that was replaced before the failure.
      for (const name of written.reverse()) {
        try {
          await this.store.write(name, rawKey, previous.get(name));
        } catch {
          // A rollback failure must not mask the original error.
        }
      }
      throw err;
    }

    return { restored: summary.manifest, totalRecords: summary.totalRecords, createdAt: summary.createdAt };
  }

  async remove(id) {
    const file = path.join(this.dir(), `${id}${BACKUP_EXT}`);
    try {
      await fsp.rm(file, { force: true });
      return { removed: true };
    } catch {
      throw new VaultError(CODES.IO_FAILED, "Could not remove the backup");
    }
  }
}

module.exports = { VaultBackup, BACKUP_FORMAT, BACKUP_VERSION, BACKUP_EXT, MAX_BACKUPS };
