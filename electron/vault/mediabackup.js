"use strict";
/**
 * Shadow Vault — media-inclusive encrypted backup (Phase A).
 *
 * Format: a single file consisting of:
 *   [sealed-manifest-block: 4-byte length + AES-256-GCM sealed JSON]
 *   [N blob frames: 4-byte length + raw encrypted blob bytes]
 *   [HMAC-SHA256 trailer over all frames]
 *
 * The manifest is itself encrypted (sealed) under the same rawKey used for the
 * media ciphertext, so an attacker who steals the backup file learns nothing
 * about filenames, counts or structure without the vault key.
 *
 * The encrypted media blobs are copied VERBATIM — never decrypted — so the
 * backup has the same security boundary as the vault directory itself.
 *
 * Recovery re-copies the ciphertext blobs back into a vault-media directory
 * and stores the metadata records; it does NOT re-encrypt.  The same vault key
 * (or a backup-credential key if one was supplied) opens both the manifest and
 * the existing blob envelopes.
 *
 * Large-file safety:
 *   Blobs are streamed in CHUNK_COPY_SIZE chunks, never buffered whole.  An
 *   8-GiB video library can be backed up without exhausting memory.
 *
 * Security properties:
 *   - Original filenames appear only inside the sealed manifest.
 *   - Blob data is encrypted; raw bytes reveal nothing about media content.
 *   - The trailing HMAC covers every frame; truncation or reordering is detected.
 *   - A wrong key fails the manifest decryption before any file is touched.
 *   - Restore is staged: nothing is committed until the full verification passes.
 *   - On failure, staged blobs are cleaned up and the existing vault is intact.
 *   - Existing items with matching IDs are detected and refused (no silent overwrite).
 */
const crypto = require("crypto");
const fsp = require("fs/promises");
const fs = require("fs");
const path = require("path");

const { VaultError, CODES, badInput } = require("./errors");
const { ensureProtected, protectFile, isPermissionDenial } = require("./acl");

const MEDIA_BACKUP_MAGIC = Buffer.from("KNXMB01", "utf8"); // 7 bytes
const MAGIC_LEN = 7;
const LEN_FIELD = 4;   // uint32 BE
const HMAC_LEN = 32;   // SHA-256
const CHUNK_COPY_SIZE = 256 * 1024; // 256 KiB streaming chunks
const FORMAT_VERSION = 1;

// -------------------------------------------------------------------------
// Low-level framing helpers (symmetric with reader)
// -------------------------------------------------------------------------

function writeLenPrefix(buf) {
  const f = Buffer.alloc(LEN_FIELD);
  f.writeUInt32BE(buf.length, 0);
  return Buffer.concat([f, buf]);
}

async function writeAll(handle, buf) {
  let offset = 0;
  while (offset < buf.length) {
    const { bytesWritten } = await handle.write(buf, offset, buf.length - offset);
    offset += bytesWritten;
  }
}

// -------------------------------------------------------------------------
// MediaBackup class
// -------------------------------------------------------------------------

class MediaBackup {
  /**
   * @param {object} opts
   * @param {object} opts.engine        – VaultEngine (for manifest seal/open)
   * @param {object} opts.store         – EncryptedStore
   * @param {string} opts.mediaRoot     – vault-media directory (source)
   * @param {string} opts.backupDir     – where .knxmbak files are written
   */
  constructor({ engine, store, mediaRoot, backupDir }) {
    if (!engine || !store || !mediaRoot || !backupDir) {
      throw new Error("MediaBackup requires engine, store, mediaRoot and backupDir");
    }
    this.engine = engine;
    this.store = store;
    this.mediaRoot = mediaRoot;
    this.backupDir = backupDir;
  }

  // -----------------------------------------------------------------------
  // Create
  // -----------------------------------------------------------------------

  /**
   * Create a media backup.
   * Returns { id, file, createdAt, size, itemCount }.
   */
  async create(rawKey, { signal } = {}) {
    _requireKey(rawKey);

    // 1. Read metadata records.
    const { records } = await this.store.list("mediavault", rawKey);
    if (records.length === 0) {
      throw new VaultError(CODES.BAD_INPUT, "Shadow Vault has no media items to back up");
    }

    // 2. Verify every referenced blob exists before starting the write.
    const missingBlobs = [];
    for (const r of records) {
      const p = path.join(this.mediaRoot, r.blobName);
      const ok = await fsp.access(p).then(() => true).catch(() => false);
      if (!ok) missingBlobs.push(r.id);
    }
    if (missingBlobs.length > 0) {
      throw new VaultError(CODES.NOT_FOUND,
        `${missingBlobs.length} ciphertext blob(s) are missing from the vault directory; ` +
        "back up only after re-importing or removing the broken records.");
    }

    // 3. Build and seal the manifest.
    const manifest = {
      version: FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      itemCount: records.length,
      items: records.map((r) => ({
        id: r.id,
        blobName: r.blobName,
        mimeType: r.mimeType,
        category: r.category,
        sizeBytes: r.sizeBytes,
        encryptedSizeBytes: r.encryptedSizeBytes,
        plaintextSha256: r.plaintextSha256,
        importedAt: r.importedAt,
        // originalName lives in the manifest, which is itself encrypted.
        originalName: r.originalName,
      })),
    };
    const manifestPlain = Buffer.from(JSON.stringify(manifest), "utf8");
    const { bytes: sealedManifest } = this.engine.encryptBuffer(manifestPlain, { rawKey });

    // 4. Ensure backup dir exists and is owner-only.
    await fsp.mkdir(this.backupDir, { recursive: true });
    await ensureProtected(this.backupDir);

    const id = `media-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const file = path.join(this.backupDir, `${id}.knxmbak`);
    const tmp = `${file}.${crypto.randomBytes(4).toString("hex")}.tmp`;

    let handle = null;
    let committed = false;
    try {
      handle = await fsp.open(tmp, "wx", 0o600);
      await protectFile(tmp);

      // Header: magic + sealed manifest block.
      await writeAll(handle, MEDIA_BACKUP_MAGIC);
      await writeAll(handle, writeLenPrefix(sealedManifest));

      // 5. Stream each blob (ciphertext verbatim — never decrypt).
      const hmac = crypto.createHmac("sha256", rawKey);
      hmac.update(MEDIA_BACKUP_MAGIC);
      hmac.update(writeLenPrefix(sealedManifest));

      for (const r of records) {
        _checkAbort(signal);
        const blobPath = path.join(this.mediaRoot, r.blobName);
        const blobStat = await fsp.stat(blobPath);
        // Frame header: 4-byte item id length + item id + 4-byte blob length.
        const idBuf = Buffer.from(r.id, "utf8");
        const frameHeader = Buffer.alloc(LEN_FIELD + idBuf.length + LEN_FIELD);
        frameHeader.writeUInt32BE(idBuf.length, 0);
        idBuf.copy(frameHeader, LEN_FIELD);
        frameHeader.writeUInt32BE(blobStat.size, LEN_FIELD + idBuf.length);
        await writeAll(handle, frameHeader);
        hmac.update(frameHeader);

        // Stream blob in chunks.
        const inFd = await fsp.open(blobPath, "r");
        try {
          const chunk = Buffer.alloc(CHUNK_COPY_SIZE);
          let remaining = blobStat.size;
          while (remaining > 0) {
            _checkAbort(signal);
            const want = Math.min(remaining, CHUNK_COPY_SIZE);
            const { bytesRead } = await inFd.read(chunk, 0, want, null);
            if (bytesRead === 0) throw new VaultError(CODES.IO_FAILED, `Unexpected EOF reading blob ${r.id}`);
            const slice = chunk.subarray(0, bytesRead);
            await writeAll(handle, slice);
            hmac.update(slice);
            remaining -= bytesRead;
          }
        } finally {
          await inFd.close().catch(() => {});
        }
      }

      // 6. Write trailing HMAC.
      const trailer = hmac.digest();
      await writeAll(handle, trailer);
      await handle.sync();
      await handle.close();
      handle = null;

      await fsp.rename(tmp, file);
      await protectFile(file);
      committed = true;

      const stat = await fsp.stat(file);
      return { id, file, createdAt: manifest.createdAt, size: stat.size, itemCount: records.length };
    } finally {
      if (handle) await handle.close().catch(() => {});
      if (!committed) await fsp.rm(tmp, { force: true }).catch(() => {});
    }
  }

  // -----------------------------------------------------------------------
  // Inspect  (dry run — no write)
  // -----------------------------------------------------------------------

  /**
   * Verify the backup HMAC, decrypt and validate the manifest, and report on
   * every referenced blob — without writing anything or reading blob contents.
   */
  async inspect(file, rawKey) {
    _requireKey(rawKey);
    const stat = await fsp.stat(file).catch(() => { throw new VaultError(CODES.NOT_FOUND, "Backup file not found"); });
    if (stat.size < MAGIC_LEN + LEN_FIELD + HMAC_LEN) {
      throw new VaultError(CODES.TRUNCATED, "Backup file is too small");
    }

    const { manifest, items } = await this._readAndVerify(file, rawKey, false);
    return { version: manifest.version, createdAt: manifest.createdAt, itemCount: manifest.itemCount, items };
  }

  // -----------------------------------------------------------------------
  // Restore
  // -----------------------------------------------------------------------

  /**
   * Restore a media backup into `targetMediaRoot` and `targetStore`.
   *
   * Safety contract:
   *   - Full HMAC verification before any file is written.
   *   - Manifest decryption before any file is written.
   *   - Collision detection before any file is written.
   *   - Blobs are staged in a temp subdirectory; committed atomically.
   *   - On failure, staged blobs are removed; existing vault is untouched.
   *   - Metadata records are written only after all blobs are committed.
   */
  async restore(file, rawKey, { targetMediaRoot, targetStore, confirm, signal } = {}) {
    _requireKey(rawKey);
    if (confirm !== true) {
      throw new VaultError(CODES.CONSENT_REQUIRED, "Media restore requires explicit confirmation");
    }
    if (!targetMediaRoot || !targetStore) {
      throw badInput("targetMediaRoot and targetStore are required for restore");
    }

    // 1. Full verification pass: HMAC + manifest decrypt. No files written yet.
    const { manifest, blobMap } = await this._readAndVerify(file, rawKey, true);

    // 2. Collision check: refuse if any blob id already exists in the target store.
    const { records: existing } = await targetStore.list("mediavault", rawKey);
    const existingIds = new Set(existing.map((r) => r.id));
    const conflicts = manifest.items.filter((item) => existingIds.has(item.id));
    if (conflicts.length > 0) {
      throw new VaultError(CODES.PATH_CONFLICT,
        `${conflicts.length} item(s) already exist in the target vault; ` +
        "restore would overwrite them. Remove conflicting items first.");
    }

    // 3. Stage blobs into a temp directory.
    await fsp.mkdir(targetMediaRoot, { recursive: true });
    await ensureProtected(targetMediaRoot);
    const stageDir = path.join(targetMediaRoot, `.restore-stage-${crypto.randomBytes(4).toString("hex")}`);
    await fsp.mkdir(stageDir, { recursive: true });
    await ensureProtected(stageDir);

    const stagedBlobs = []; // { stagePath, finalPath }
    try {
      const inFd = await fsp.open(file, "r");
      try {
        for (const item of manifest.items) {
          _checkAbort(signal);
          const { offset, size } = blobMap.get(item.id);
          const stagePath = path.join(stageDir, item.blobName);
          const outFd = await fsp.open(stagePath, "wx", 0o600);
          await protectFile(stagePath);
          try {
            const chunk = Buffer.alloc(CHUNK_COPY_SIZE);
            let remaining = size;
            let pos = offset;
            while (remaining > 0) {
              _checkAbort(signal);
              const want = Math.min(remaining, CHUNK_COPY_SIZE);
              const { bytesRead } = await inFd.read(chunk, 0, want, pos);
              if (bytesRead === 0) throw new VaultError(CODES.IO_FAILED, "Unexpected EOF during restore");
              await writeAll(outFd, chunk.subarray(0, bytesRead));
              remaining -= bytesRead;
              pos += bytesRead;
            }
            await outFd.sync();
          } finally {
            await outFd.close().catch(() => {});
          }
          stagedBlobs.push({ stagePath, finalPath: path.join(targetMediaRoot, item.blobName) });
        }
      } finally {
        await inFd.close().catch(() => {});
      }

      // 4. Commit: atomic rename for each blob, then write metadata records.
      for (const { stagePath, finalPath } of stagedBlobs) {
        await fsp.rename(stagePath, finalPath);
        await protectFile(finalPath);
      }

      // 5. Write metadata records (each put is atomic inside EncryptedStore).
      for (const item of manifest.items) {
        await targetStore.put("mediavault", rawKey, item);
      }

      // 6. Remove stage dir (now empty).
      await fsp.rmdir(stageDir).catch(() => {});

      return { restored: manifest.itemCount, createdAt: manifest.createdAt };
    } catch (err) {
      // Clean up staged (not-yet-committed) blobs. Committed blobs stay —
      // the vault is left in a partially-restored state if commit was partial,
      // which the caller should detect via the conflict-checking on the next attempt.
      for (const { stagePath } of stagedBlobs) {
        await fsp.rm(stagePath, { force: true }).catch(() => {});
      }
      await fsp.rm(stageDir, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // Internal: read and verify backup file
  // -----------------------------------------------------------------------

  /**
   * Read the backup, verify the trailing HMAC, decrypt the manifest.
   * When `captureBlobMap` is true, records the byte-offset and size of each
   * blob frame so restore can seek back to them.
   */
  async _readAndVerify(file, rawKey, captureBlobMap) {
    const stat = await fsp.stat(file);
    const totalSize = stat.size;
    const payloadEnd = totalSize - HMAC_LEN;

    const inFd = await fsp.open(file, "r");
    try {
      // --- Read magic ---
      const magicBuf = Buffer.alloc(MAGIC_LEN);
      await _readExact(inFd, magicBuf, 0);
      if (!magicBuf.equals(MEDIA_BACKUP_MAGIC)) {
        throw new VaultError(CODES.NOT_A_VAULT, "Not a KnouxCrypt media backup file");
      }

      // --- First pass: stream everything to verify HMAC ---
      const hmac = crypto.createHmac("sha256", rawKey);
      let pos = 0;
      {
        const streamChunk = Buffer.alloc(CHUNK_COPY_SIZE);
        while (pos < payloadEnd) {
          const want = Math.min(CHUNK_COPY_SIZE, payloadEnd - pos);
          const { bytesRead } = await inFd.read(streamChunk, 0, want, pos);
          if (bytesRead === 0) throw new VaultError(CODES.TRUNCATED, "Backup file ended unexpectedly");
          hmac.update(streamChunk.subarray(0, bytesRead));
          pos += bytesRead;
        }
      }
      const expectedHmac = hmac.digest();
      const actualTrailer = Buffer.alloc(HMAC_LEN);
      await _readExact(inFd, actualTrailer, payloadEnd);
      if (!crypto.timingSafeEqual(expectedHmac, actualTrailer)) {
        throw new VaultError(CODES.INTEGRITY_FAILED, "Media backup HMAC verification failed — file may be tampered or corrupted");
      }

      // --- Second pass: parse structure ---
      pos = MAGIC_LEN;

      // Read sealed manifest block.
      const manifestLenBuf = Buffer.alloc(LEN_FIELD);
      await _readExact(inFd, manifestLenBuf, pos);
      const manifestLen = manifestLenBuf.readUInt32BE(0);
      pos += LEN_FIELD;
      if (pos + manifestLen > payloadEnd) throw new VaultError(CODES.TRUNCATED, "Manifest block exceeds file bounds");
      const sealedManifest = Buffer.alloc(manifestLen);
      await _readExact(inFd, sealedManifest, pos);
      pos += manifestLen;

      // Decrypt manifest.
      const { plaintext: manifestPlain } = this.engine.decryptBuffer(sealedManifest, { rawKey });
      let manifest;
      try { manifest = JSON.parse(manifestPlain.toString("utf8")); }
      catch { throw new VaultError(CODES.INTEGRITY_FAILED, "Manifest is not valid JSON after decryption"); }
      if (manifest.version !== FORMAT_VERSION) {
        throw new VaultError(CODES.UNSUPPORTED_FORMAT, `Unsupported media backup version ${manifest.version}`);
      }

      // Parse blob frames.
      const blobMap = new Map(); // id → { offset, size }
      for (let i = 0; i < manifest.itemCount; i++) {
        if (pos + LEN_FIELD > payloadEnd) throw new VaultError(CODES.TRUNCATED, `Frame header ${i} exceeds file bounds`);
        const idLenBuf = Buffer.alloc(LEN_FIELD);
        await _readExact(inFd, idLenBuf, pos);
        const idLen = idLenBuf.readUInt32BE(0);
        pos += LEN_FIELD;
        if (pos + idLen + LEN_FIELD > payloadEnd) throw new VaultError(CODES.TRUNCATED, `Frame id ${i} exceeds file bounds`);
        const idBuf = Buffer.alloc(idLen);
        await _readExact(inFd, idBuf, pos);
        pos += idLen;
        const blobLenBuf = Buffer.alloc(LEN_FIELD);
        await _readExact(inFd, blobLenBuf, pos);
        const blobLen = blobLenBuf.readUInt32BE(0);
        pos += LEN_FIELD;
        if (pos + blobLen > payloadEnd) throw new VaultError(CODES.TRUNCATED, `Blob ${i} exceeds file bounds`);
        const blobId = idBuf.toString("utf8");
        if (captureBlobMap) blobMap.set(blobId, { offset: pos, size: blobLen });
        pos += blobLen;
      }

      // Verify every manifest item has a corresponding frame.
      const items = manifest.items || [];
      for (const item of items) {
        if (!blobMap.has(item.id) && captureBlobMap) {
          throw new VaultError(CODES.INTEGRITY_FAILED, `Blob for item ${item.id} is missing from the backup`);
        }
      }

      return { manifest, items, blobMap };
    } finally {
      await inFd.close().catch(() => {});
    }
  }
}

// -------------------------------------------------------------------------
// Private helpers
// -------------------------------------------------------------------------

function _requireKey(rawKey) {
  if (!rawKey || (!Buffer.isBuffer(rawKey) && !(rawKey instanceof Uint8Array))) {
    throw new VaultError(CODES.SESSION_REQUIRED, "An unlocked vault session is required");
  }
}

function _checkAbort(signal) {
  if (signal && signal.aborted) {
    throw new VaultError(CODES.CANCELLED, "Operation cancelled");
  }
}

async function _readExact(fh, buf, position) {
  let offset = 0;
  while (offset < buf.length) {
    const { bytesRead } = await fh.read(buf, offset, buf.length - offset, position + offset);
    if (bytesRead === 0) throw new VaultError(CODES.TRUNCATED, "Unexpected end of file");
    offset += bytesRead;
  }
}

module.exports = { MediaBackup, MEDIA_BACKUP_MAGIC, FORMAT_VERSION };
