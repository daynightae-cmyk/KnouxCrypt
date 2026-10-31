"use strict";

/**
 * Encrypted record store (tasks 05-08).
 *
 * Notes, journals and credentials are persisted as one sealed vault container
 * per collection, encrypted with the session's vault key. Nothing is written in
 * plaintext and nothing is written at all while the vault is locked.
 *
 * The container format is the same authenticated one the File Cipher uses, so
 * tampering, truncation and reordering are detected on read rather than
 * silently accepted.
 */
const crypto = require("crypto");
const fsp = require("fs/promises");
const path = require("path");

const { VaultError, CODES, badInput } = require("./errors");

const COLLECTIONS = Object.freeze(["notes", "passwords", "authenticator", "keys", "collections"]);
const STORE_VERSION = 1;
const MAX_RECORDS = 5000;
const MAX_RECORD_BYTES = 256 * 1024;

class EncryptedStore {
  constructor(options = {}) {
    this.root = options.root;
    this.engine = options.engine;
    this.overwrite = true; // the store owns its own files
  }

  pathFor(collection) {
    if (!COLLECTIONS.includes(collection)) {
      throw badInput(`Unknown collection "${collection}"`);
    }
    return path.join(this.root, `${collection}.knx`);
  }

  async read(collection, rawKey) {
    const file = this.pathFor(collection);
    let sealed;
    try {
      sealed = await fsp.readFile(file);
    } catch (err) {
      if (err.code === "ENOENT") return { version: STORE_VERSION, records: [] };
      throw new VaultError(CODES.IO_FAILED, "Could not read the encrypted store");
    }
    if (sealed.length === 0) return { version: STORE_VERSION, records: [] };

    // decryptBuffer throws INTEGRITY_FAILED/TRUNCATED on a damaged container.
    const { plaintext } = this.engine.decryptBuffer(sealed, { rawKey });
    let parsed;
    try {
      parsed = JSON.parse(plaintext.toString("utf8"));
    } catch {
      throw new VaultError(CODES.INTEGRITY_FAILED, "The encrypted store is not valid JSON");
    }
    if (!parsed || !Array.isArray(parsed.records)) {
      throw new VaultError(CODES.INTEGRITY_FAILED, "The encrypted store has an unexpected shape");
    }
    if (parsed.version !== STORE_VERSION) {
      throw new VaultError(CODES.UNSUPPORTED_FORMAT, `Unsupported store version ${parsed.version}`);
    }
    return parsed;
  }

  async write(collection, rawKey, document) {
    const payload = Buffer.from(JSON.stringify(document), "utf8");
    if (payload.length > MAX_RECORD_BYTES * MAX_RECORDS) {
      throw new VaultError(CODES.BAD_INPUT, "The store has grown past its supported size");
    }
    const { bytes } = this.engine.encryptBuffer(payload, { rawKey });
    const file = this.pathFor(collection);
    await fsp.mkdir(this.root, { recursive: true });
    const tmp = path.join(this.root, `.${path.basename(file)}.${crypto.randomBytes(6).toString("hex")}.tmp`);
    try {
      // Write, fsync, then rename so a crash cannot leave a half-written store.
      const fh = await fsp.open(tmp, "w", 0o600);
      try {
        await fh.write(bytes, 0, bytes.length, 0);
        await fh.sync();
      } finally {
        await fh.close();
      }
      await fsp.rename(tmp, file);
    } catch (err) {
      await fsp.rm(tmp, { force: true }).catch(() => {});
      if (err instanceof VaultError) throw err;
      throw new VaultError(CODES.IO_FAILED, "Could not write the encrypted store");
    }
    return { bytes: bytes.length, records: document.records.length };
  }

  async list(collection, rawKey) {
    const doc = await this.read(collection, rawKey);
    return { records: doc.records, version: doc.version };
  }

  async put(collection, rawKey, record) {
    validateRecord(record);
    const doc = await this.read(collection, rawKey);
    const index = doc.records.findIndex((r) => r.id === record.id);
    if (index === -1) {
      if (doc.records.length >= MAX_RECORDS) {
        throw new VaultError(CODES.BAD_INPUT, "The store is full");
      }
      doc.records.unshift(record);
    } else {
      doc.records[index] = record;
    }
    doc.updatedAt = new Date().toISOString();
    await this.write(collection, rawKey, doc);
    return { record, created: index === -1 };
  }

  async remove(collection, rawKey, id) {
    const doc = await this.read(collection, rawKey);
    const before = doc.records.length;
    doc.records = doc.records.filter((r) => r.id !== id);
    if (doc.records.length === before) return { removed: false };
    doc.updatedAt = new Date().toISOString();
    await this.write(collection, rawKey, doc);
    return { removed: true };
  }
}

function validateRecord(record) {
  if (!record || typeof record !== "object") throw badInput("A record object is required");
  if (typeof record.id !== "string" || record.id.length === 0 || record.id.length > 128) {
    throw badInput("record.id must be a non-empty string");
  }
  const serialized = JSON.stringify(record);
  if (Buffer.byteLength(serialized, "utf8") > MAX_RECORD_BYTES) {
    throw new VaultError(CODES.BAD_INPUT, "Record is too large");
  }
  return record;
}

module.exports = { EncryptedStore, COLLECTIONS, STORE_VERSION, MAX_RECORDS, MAX_RECORD_BYTES };
