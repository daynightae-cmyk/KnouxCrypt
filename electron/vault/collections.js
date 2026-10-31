"use strict";

/**
 * Private vault collections (task 29).
 *
 * A collection is a nested, encrypted node in a small metadata tree. Items are
 * files: `addItem` encrypts the chosen file into the collections root as an
 * ordinary KnouxCrypt container, so an item is protected by exactly the same
 * authenticated format the File Cipher uses.
 *
 * Honesty constraints:
 *   - The metadata tree lives in the same encrypted store as notes and keys,
 *     so collection names, tags and item names are ciphertext at rest.
 *   - Search decrypts names in memory only. There is no plaintext index on
 *     disk, so "search is protected" is true rather than aspirational.
 *   - Destructive operations (delete a non-empty collection, overwrite an
 *     item) require explicit confirmation and are applied atomically.
 */
const crypto = require("crypto");
const fsp = require("fs/promises");
const path = require("path");

const { VaultError, CODES, badInput } = require("./errors");

const MAX_NAME = 256;
const MAX_DEPTH = 8;
const MAX_COLLECTIONS = 2000;
const MAX_TAGS = 24;
const STORE_COLLECTION = "collections";

class CollectionService {
  constructor(options = {}) {
    if (!options.store || !options.engine || !options.root) {
      throw badInput("CollectionService needs a store, an engine and a root directory");
    }
    this.store = options.store;
    this.engine = options.engine;
    this.root = options.root;
    this.itemsDir = path.join(options.root, "items");
  }

  _itemsDir() {
    return this.itemsDir;
  }

  async _read(rawKey) {
    const { records } = await this.store.list(STORE_COLLECTION, rawKey);
    return records;
  }

  async _write(rawKey, records) {
    await this.store.write(STORE_COLLECTION, rawKey, {
      version: 1,
      records,
      updatedAt: new Date().toISOString(),
    });
  }

  /** Full tree, decrypted in memory. Only reachable with an unlocked session. */
  async tree(rawKey) {
    const records = await this._read(rawKey);
    return { collections: records.map((r) => this._public(r)) };
  }

  async get(rawKey, id) {
    const records = await this._read(rawKey);
    const found = records.find((r) => r.id === id);
    if (!found) throw new VaultError(CODES.NOT_FOUND, "No such collection");
    return this._public(found);
  }

  async create(rawKey, { name, parentId, tags } = {}) {
    const label = normalizeName(name, "A collection name is required");
    const records = await this._read(rawKey);
    if (records.length >= MAX_COLLECTIONS) {
      throw new VaultError(CODES.BAD_INPUT, "The collection limit for this vault has been reached");
    }
    let depth = 0;
    if (parentId) {
      const parent = records.find((r) => r.id === parentId);
      if (!parent) throw new VaultError(CODES.NOT_FOUND, "The parent collection was not found");
      depth = parent.depth + 1;
      if (depth > MAX_DEPTH) {
        throw new VaultError(CODES.BAD_INPUT, `Collections may nest at most ${MAX_DEPTH} levels deep`);
      }
    }
    const record = {
      id: crypto.randomBytes(8).toString("hex"),
      name: label,
      parentId: parentId || null,
      depth,
      tags: normalizeTags(tags),
      items: [],
      createdAt: new Date().toISOString(),
    };
    records.push(record);
    await this._write(rawKey, records);
    return this._public(record);
  }

  async rename(rawKey, id, { name, tags } = {}) {
    const records = await this._read(rawKey);
    const record = records.find((r) => r.id === id);
    if (!record) throw new VaultError(CODES.NOT_FOUND, "No such collection");
    if (name !== undefined) record.name = normalizeName(name, "A collection name is required");
    if (tags !== undefined) record.tags = normalizeTags(tags);
    record.updatedAt = new Date().toISOString();
    await this._write(rawKey, records);
    return this._public(record);
  }

  /**
   * Delete a collection. A non-empty collection is refused unless `recursive`
   * and `confirm` are both set, so a single click cannot destroy a subtree.
   * When recursive, the descendant collections and their encrypted items are
   * removed too.
   */
  async remove(rawKey, id, { recursive = false, confirm = false } = {}) {
    const records = await this._read(rawKey);
    const target = records.find((r) => r.id === id);
    if (!target) throw new VaultError(CODES.NOT_FOUND, "No such collection");
    const descendants = descendantIds(records, id);
    const affected = [target, ...records.filter((r) => descendants.has(r.id))];
    const itemCount = affected.reduce((sum, r) => sum + r.items.length, 0);
    if ((affected.length > 1 || itemCount > 0) && !(recursive && confirm)) {
      throw new VaultError(
        CODES.CONSENT_REQUIRED,
        "This collection is not empty; confirm a recursive delete to remove it and its items",
      );
    }
    const remaining = records.filter((r) => r.id !== id && !descendants.has(r.id));
    await this._write(rawKey, remaining);
    // Remove the encrypted blobs last: the metadata is already gone, so a
    // failure here leaves an unreferenced file rather than a dangling item.
    let removedBlobs = 0;
    for (const collection of affected) {
      for (const item of collection.items) {
        if (await this._removeBlob(item)) removedBlobs += 1;
      }
    }
    return { removed: true, collections: affected.length, items: itemCount, removedBlobs };
  }

  /**
   * Encrypt `inputPath` into the collections root and attach it to a
   * collection. `onDuplicate` decides what happens when an item of the same
   * name already exists: "rename" (default), "replace" or "keep".
   */
  async addItem(rawKey, { collectionId, inputPath, name, tags, onDuplicate = "rename", operationId, onProgress } = {}) {
    if (typeof inputPath !== "string" || inputPath.length === 0) throw badInput("An input file is required");
    const records = await this._read(rawKey);
    const collection = records.find((r) => r.id === collectionId);
    if (!collection) throw new VaultError(CODES.NOT_FOUND, "No such collection");

    const stat = await fsp.stat(inputPath).catch(() => {
      throw new VaultError(CODES.NOT_FOUND, "The input file was not found");
    });
    if (!stat.isFile()) throw badInput("The input path is not a regular file");

    const desired = normalizeName(name || path.basename(inputPath), "An item name is required");
    const existing = collection.items.find((i) => i.name === desired);
    if (existing && onDuplicate === "keep") {
      return { skipped: true, item: this._publicItem(existing), collectionId };
    }

    await fsp.mkdir(this._itemsDir(), { recursive: true });
    const itemId = crypto.randomBytes(8).toString("hex");
    const containerPath = path.join(this._itemsDir(), `${itemId}.knx`);
    const result = await this.engine.encryptFile({
      inputPath,
      outputPath: containerPath,
      rawKey,
      operationId,
      onProgress,
    });

    const item = {
      id: itemId,
      name: desired,
      tags: normalizeTags(tags),
      size: stat.size,
      sha256: result.meta.plaintextSha256,
      containerPath,
      addedAt: new Date().toISOString(),
    };

    if (existing && onDuplicate === "replace") {
      const index = collection.items.findIndex((i) => i.id === existing.id);
      collection.items[index] = { ...item, id: existing.id, name: desired };
      await this._removeBlob(existing);
      collection.updatedAt = new Date().toISOString();
      await this._write(rawKey, records);
      return { replaced: true, item: this._publicItem(collection.items[index]), collectionId };
    }

    let finalName = desired;
    if (existing) finalName = uniqueName(collection.items, desired);
    item.name = finalName;
    collection.items.push(item);
    collection.updatedAt = new Date().toISOString();
    await this._write(rawKey, records);
    return { item: this._publicItem(item), collectionId, renamed: finalName !== desired };
  }

  /** Move an item between collections, keeping its encrypted blob. */
  async moveItem(rawKey, { itemId, toCollectionId } = {}) {
    const records = await this._read(rawKey);
    const found = findItem(records, itemId);
    if (!found) throw new VaultError(CODES.NOT_FOUND, "No such item");
    const target = records.find((r) => r.id === toCollectionId);
    if (!target) throw new VaultError(CODES.NOT_FOUND, "The destination collection was not found");
    if (target.id === found.collection.id) return { moved: false, item: this._publicItem(found.item) };

    found.collection.items = found.collection.items.filter((i) => i.id !== itemId);
    const moved = { ...found.item, name: uniqueName(target.items, found.item.name) };
    target.items.push(moved);
    target.updatedAt = new Date().toISOString();
    found.collection.updatedAt = new Date().toISOString();
    await this._write(rawKey, records);
    return { moved: true, item: this._publicItem(moved), collectionId: target.id };
  }

  /**
   * Copy an item. The blob is re-encrypted under a fresh container rather than
   * duplicated byte-for-byte, so the copy does not share a nonce prefix with
   * its source.
   */
  async copyItem(rawKey, { itemId, toCollectionId, operationId } = {}) {
    const records = await this._read(rawKey);
    const found = findItem(records, itemId);
    if (!found) throw new VaultError(CODES.NOT_FOUND, "No such item");
    const target = records.find((r) => r.id === toCollectionId);
    if (!target) throw new VaultError(CODES.NOT_FOUND, "The destination collection was not found");

    await fsp.mkdir(this._itemsDir(), { recursive: true });
    const itemId2 = crypto.randomBytes(8).toString("hex");
    const containerPath = path.join(this._itemsDir(), `${itemId2}.knx`);
    const tmp = path.join(this._itemsDir(), `.${itemId2}.plain.${crypto.randomBytes(4).toString("hex")}.tmp`);
    try {
      await this.engine.decryptFile({ inputPath: found.item.containerPath, outputPath: tmp, rawKey, operationId });
      const result = await this.engine.encryptFile({ inputPath: tmp, outputPath: containerPath, rawKey, operationId });
      const copy = {
        ...found.item,
        id: itemId2,
        name: uniqueName(target.items, found.item.name),
        containerPath,
        sha256: result.meta.plaintextSha256,
        addedAt: new Date().toISOString(),
      };
      target.items.push(copy);
      target.updatedAt = new Date().toISOString();
      await this._write(rawKey, records);
      return { item: this._publicItem(copy), collectionId: target.id };
    } finally {
      await fsp.rm(tmp, { force: true }).catch(() => {});
    }
  }

  async removeItem(rawKey, itemId) {
    const records = await this._read(rawKey);
    const found = findItem(records, itemId);
    if (!found) throw new VaultError(CODES.NOT_FOUND, "No such item");
    found.collection.items = found.collection.items.filter((i) => i.id !== itemId);
    found.collection.updatedAt = new Date().toISOString();
    await this._write(rawKey, records);
    await this._removeBlob(found.item);
    return { removed: true };
  }

  /**
   * Decrypt an item to a chosen destination. Requires explicit confirmation
   * because it writes plaintext outside the vault.
   */
  async exportItem(rawKey, { itemId, outputPath, confirm, operationId } = {}) {
    if (confirm !== true) {
      throw new VaultError(CODES.CONSENT_REQUIRED, "Exporting an item writes plaintext; confirm to continue");
    }
    const records = await this._read(rawKey);
    const found = findItem(records, itemId);
    if (!found) throw new VaultError(CODES.NOT_FOUND, "No such item");
    const result = await this.engine.decryptFile({
      inputPath: found.item.containerPath,
      outputPath,
      rawKey,
      operationId,
    });
    return { outputPath: result.outputPath, sha256: result.meta.plaintextSha256 };
  }

  /**
   * Search names and tags. The search runs over decrypted metadata in memory;
   * nothing is indexed on disk.
   */
  async search(rawKey, { query, tag } = {}) {
    const records = await this._read(rawKey);
    const needle = String(query || "").trim().toLowerCase();
    const wantTag = String(tag || "").trim().toLowerCase();
    const matches = [];
    for (const collection of records) {
      const collectionHit =
        !needle || collection.name.toLowerCase().includes(needle);
      if (collectionHit && (!wantTag || collection.tags.includes(wantTag))) {
        matches.push({ kind: "collection", id: collection.id, name: collection.name, tags: collection.tags });
      }
      for (const item of collection.items) {
        const itemHit = !needle || item.name.toLowerCase().includes(needle);
        const tagHit = !wantTag || item.tags.includes(wantTag);
        if (itemHit && tagHit) {
          matches.push({
            kind: "item",
            id: item.id,
            name: item.name,
            tags: item.tags,
            collectionId: collection.id,
            size: item.size,
          });
        }
      }
    }
    return { matches, scanned: records.length };
  }

  async _removeBlob(item) {
    if (!item || !item.containerPath) return false;
    try {
      await fsp.rm(item.containerPath, { force: true });
      return true;
    } catch {
      return false;
    }
  }

  _public(record) {
    return {
      id: record.id,
      name: record.name,
      parentId: record.parentId,
      depth: record.depth,
      tags: record.tags,
      itemCount: record.items.length,
      items: record.items.map((i) => this._publicItem(i)),
      createdAt: record.createdAt,
    };
  }

  _publicItem(item) {
    return {
      id: item.id,
      name: item.name,
      tags: item.tags,
      size: item.size,
      sha256: item.sha256,
      addedAt: item.addedAt,
    };
  }
}

function normalizeName(value, message) {
  const label = String(value ?? "").trim();
  if (!label) throw badInput(message);
  if (label.length > MAX_NAME) throw badInput("That name is too long");
  return label;
}

function normalizeTags(tags) {
  if (tags === undefined || tags === null) return [];
  if (!Array.isArray(tags)) throw badInput("Tags must be a list");
  const cleaned = [];
  for (const tag of tags) {
    const value = String(tag).trim().toLowerCase();
    if (!value) continue;
    if (value.length > 64) throw badInput("A tag is too long");
    if (!cleaned.includes(value)) cleaned.push(value);
    if (cleaned.length > MAX_TAGS) throw badInput("Too many tags");
  }
  return cleaned;
}

function descendantIds(records, id) {
  const out = new Set();
  let frontier = [id];
  while (frontier.length) {
    const next = [];
    for (const parent of frontier) {
      for (const record of records) {
        if (record.parentId === parent && !out.has(record.id)) {
          out.add(record.id);
          next.push(record.id);
        }
      }
    }
    frontier = next;
  }
  return out;
}

function findItem(records, itemId) {
  for (const collection of records) {
    const item = collection.items.find((i) => i.id === itemId);
    if (item) return { collection, item };
  }
  return null;
}

/** Append " (2)", " (3)" … until the name is free within the collection. */
function uniqueName(items, name) {
  if (!items.some((i) => i.name === name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 2; n < 10000; n += 1) {
    const candidate = `${stem} (${n})${ext}`;
    if (!items.some((i) => i.name === candidate)) return candidate;
  }
  throw new VaultError(CODES.BAD_INPUT, "Unable to derive a unique name");
}

module.exports = { CollectionService, MAX_DEPTH, MAX_COLLECTIONS, STORE_COLLECTION };
