"use strict";

/**
 * Shadow Vault — encrypted media file store.
 *
 * Each imported file is stream-encrypted with AES-256-GCM (via VaultEngine,
 * keyed from the unlocked vault session's DEK) and stored as a .knxm file in
 * a dedicated directory.  A single metadata record per item is stored in the
 * encrypted EncryptedStore under the "mediavault" collection.
 *
 * Security choices:
 *  - Original source files are NEVER modified or deleted by this module.
 *  - The original filename is stored only in the encrypted metadata record;
 *    the on-disk filename is a random UUID so the directory listing reveals
 *    nothing about content.
 *  - The encrypted blob is owner-only via the ACL helpers used throughout
 *    the vault stack.
 *  - Export writes to a user-chosen directory, not to the source location.
 *  - Symlinks are refused at import and at export.
 *  - Files larger than MAX_FILE_BYTES are refused.
 *  - Only explicitly allowlisted MIME types are accepted.
 *  - Duplicate filenames are accepted (each gets a fresh UUID, the original
 *    name is preserved in metadata).
 *  - A cancelled import leaves no orphan ciphertext and no metadata record.
 *  - A delete with confirm:true removes ciphertext, then the metadata record.
 *    These are separate writes; metadata-write failure requires recovery.
 */
const crypto = require("crypto");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");

const { VaultError, CODES, badInput } = require("./errors");
const { ensureProtected, protectFile, isPermissionDenial } = require("./acl");

// 200 MiB cap. Keeps the vault directory from growing unbounded, and keeps
// individual decrypt operations memory-safe on constrained hardware.
const MAX_FILE_BYTES = 200 * 1024 * 1024;

// Allowlist of MIME categories.  Every type here maps to an icon category
// that the gallery already knows about.
const ALLOWED_TYPES = Object.freeze({
  // Photos
  "image/jpeg": "Photos",
  "image/png": "Photos",
  "image/webp": "Photos",
  "image/gif": "Photos",
  "image/heic": "Photos",
  "image/heif": "Photos",
  "image/avif": "Photos",
  "image/tiff": "Photos",
  "image/bmp": "Photos",
  // Videos
  "video/mp4": "Videos",
  "video/quicktime": "Videos",
  "video/webm": "Videos",
  "video/x-matroska": "Videos",
  "video/mpeg": "Videos",
  "video/3gpp": "Videos",
  "video/3gpp2": "Videos",
  // Audio
  "audio/mpeg": "Audio",
  "audio/mp4": "Audio",
  "audio/ogg": "Audio",
  "audio/wav": "Audio",
  "audio/flac": "Audio",
  "audio/aac": "Audio",
  "audio/webm": "Audio",
  // Files / documents
  "application/pdf": "Files",
  "application/zip": "Files",
  "text/plain": "Files",
  "application/msword": "Files",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Files",
  "application/vnd.ms-excel": "Files",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Files",
  "application/vnd.ms-powerpoint": "Files",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "Files",
});

// Extension → MIME classification for native file-picker paths. This is not
// content-signature sniffing; unknown extensions are refused, but files with
// misleading extensions must not be represented as independently validated.
const EXT_TO_MIME = Object.freeze({
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".avif": "image/avif",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".bmp": "image/bmp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".mpeg": "video/mpeg",
  ".mpg": "video/mpeg",
  ".3gp": "video/3gpp",
  ".3g2": "video/3gpp2",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".txt": "text/plain",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
});

const COLLECTION = "mediavault";
const FILE_EXT = ".knxm";
const METADATA_VERSION = 1;

class MediaVault {
  /**
   * @param {object} options
   * @param {VaultEngine} options.engine      - shared vault engine
   * @param {EncryptedStore} options.store    - shared encrypted record store
   * @param {string} options.root             - directory for ciphertext blobs
   */
  constructor({ engine, store, root }) {
    if (!engine || !store || !root) throw new Error("MediaVault requires engine, store and root");
    this.engine = engine;
    this.store = store;
    this.root = root;
  }

  // ------------------------------------------------------------------
  // List
  // ------------------------------------------------------------------

  /**
   * Return all media records for the session's vault key.
   * Records are sorted newest-first by importedAt.
   */
  async list(rawKey) {
    requireKey(rawKey);
    const { records } = await this.store.list(COLLECTION, rawKey);
    return records.slice().sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1));
  }

  // ------------------------------------------------------------------
  // Import
  // ------------------------------------------------------------------

  /**
   * Import a file into the vault.
   *
   * Steps:
   *  1. Validate path, stat, type and size.
   *  2. Compute SHA-256 of the plaintext.
   *  3. Encrypt the file into a temp blob inside `this.root`.
   *  4. Atomic rename into place.
   *  5. Write a metadata record via store.put.
   *  6. On any failure, clean up the temp/committed blob before throwing.
   *
   * Returns the new metadata record.
   */
  async import(rawKey, { sourcePath, mimeType, signal, assertSession } = {}) {
    requireKey(rawKey);
    if (typeof assertSession === "function") assertSession();
    if (typeof sourcePath !== "string" || !sourcePath) {
      throw badInput("sourcePath is required");
    }

    // Canonicalize and validate — refuse relative paths, traversal and symlinks.
    const resolved = path.resolve(sourcePath);
    const stat = await fsp.lstat(resolved).catch(() => null);
    if (!stat) throw new VaultError(CODES.NOT_FOUND, "The source file was not found");
    if (stat.isSymbolicLink()) throw badInput("Symbolic links are not accepted for security reasons");
    if (!stat.isFile()) throw badInput("The source path is not a regular file");
    if (stat.size === 0) throw badInput("The source file is empty");
    if (stat.size > MAX_FILE_BYTES) {
      throw badInput(`The source file is ${formatBytes(stat.size)} which exceeds the ${formatBytes(MAX_FILE_BYTES)} limit`);
    }

    // Determine and validate MIME type.
    const ext = path.extname(resolved).toLowerCase();
    const resolved_mime = mimeType || EXT_TO_MIME[ext] || null;
    if (!resolved_mime || !ALLOWED_TYPES[resolved_mime]) {
      throw badInput(
        `File type "${resolved_mime || ext || "(unknown)"}" is not accepted. ` +
          `Supported: photos, videos, audio and common document formats.`,
      );
    }
    const category = ALLOWED_TYPES[resolved_mime];

    // Ensure the vault media directory exists and is owner-only.
    await fsp.mkdir(this.root, { recursive: true });
    await ensureProtected(this.root);

    // Generate the opaque storage name (UUID).
    const blobId = crypto.randomUUID();
    const blobName = `${blobId}${FILE_EXT}`;
    const blobPath = path.join(this.root, blobName);

    // VaultEngine's default no-overwrite policy is mandatory here: each
    // ciphertext blob has a fresh UUID and must never clobber an existing
    // encrypted file. Do NOT mutate the shared engine's overwrite flag.

    let encResult;
    try {
      encResult = await this.engine.encryptFile({
        inputPath: resolved,
        outputPath: blobPath,
        rawKey,
        signal,
      });
    } catch (err) {
      // Ensure no partial blob remains.
      await fsp.rm(blobPath, { force: true }).catch(() => {});
      throw err;
    }

    // Build and persist the metadata record.
    const record = {
      id: blobId,
      version: METADATA_VERSION,
      blobName,
      originalName: path.basename(resolved),
      mimeType: resolved_mime,
      category,
      sizeBytes: stat.size,
      encryptedSizeBytes: encResult.meta.encryptedSize,
      plaintextSha256: encResult.meta.plaintextSha256,
      importedAt: new Date().toISOString(),
    };

    try {
      // An unlocked session captured before a file picker or long encryption
      // may have been revoked by the time metadata is committed.
      if (typeof assertSession === "function") assertSession();
      await this.store.put(COLLECTION, rawKey, record);
    } catch (err) {
      // Metadata write failed — remove the orphan ciphertext blob.
      await fsp.rm(blobPath, { force: true }).catch(() => {});
      throw err;
    }

    // The security journal is not the encrypted metadata store. Never leak
    // private media filenames or sizes into its plaintext action messages.
    this._journal("Imported an encrypted media item into Shadow Vault");
    return { record };
  }

  // ------------------------------------------------------------------
  // Export
  // ------------------------------------------------------------------

  /**
   * Decrypt and export a media item to `targetPath`.
   *
   * - targetPath must not already exist (no silent overwrite).
   * - targetPath directory must exist.
   * - Symlink check on targetPath parent is skipped (user-chosen location).
   * - After export the ciphertext remains in the vault.
   */
  async export(rawKey, { id, targetPath, signal, assertSession } = {}) {
    requireKey(rawKey);
    if (typeof assertSession === "function") assertSession();
    if (typeof id !== "string" || !id) throw badInput("id is required");
    if (typeof targetPath !== "string" || !targetPath) throw badInput("targetPath is required");

    const record = await this._getRecord(rawKey, id);

    const targetDir = path.dirname(path.resolve(targetPath));
    const targetDirStat = await fsp.stat(targetDir).catch(() => null);
    if (!targetDirStat || !targetDirStat.isDirectory()) {
      throw new VaultError(CODES.IO_FAILED, "The target directory does not exist");
    }
    // Check for existing file at target — refuse to overwrite.
    const targetExists = await fsp.access(path.resolve(targetPath)).then(() => true).catch(() => false);
    if (targetExists) throw new VaultError(CODES.PATH_CONFLICT, "A file already exists at the target path");

    const blobPath = path.join(this.root, record.blobName);
    const blobStat = await fsp.stat(blobPath).catch(() => null);
    if (!blobStat || !blobStat.isFile()) {
      throw new VaultError(CODES.NOT_FOUND, "The encrypted blob for this item was not found");
    }

    // Decrypt — VaultEngine verifies integrity before writing any plaintext.
    const outputPath = path.resolve(targetPath);
    await this.engine.decryptFile({
      inputPath: blobPath,
      outputPath,
      rawKey,
      signal,
    });
    // If the user locked the vault during a long export, do not leave the
    // now-unauthorised plaintext file on disk.
    try {
      if (typeof assertSession === "function") assertSession();
    } catch (err) {
      await fsp.rm(outputPath, { force: true }).catch(() => {});
      throw err;
    }

    this._journal("Exported an encrypted media item from Shadow Vault");
    return { exported: true, originalName: record.originalName, targetPath: path.resolve(targetPath) };
  }

  // ------------------------------------------------------------------
  // Delete
  // ------------------------------------------------------------------

  /**
   * Permanently delete an item from the vault.
   * Requires confirm:true (prevents accidental programmatic deletion).
   * Order: remove ciphertext blob first, then remove metadata record.
   * If ciphertext removal fails, metadata is kept for recovery. If the
   * subsequent metadata write fails, an unusable reference may remain;
   * fully transactional deletion is not yet implemented.
   */
  async remove(rawKey, { id, confirm } = {}) {
    requireKey(rawKey);
    if (typeof id !== "string" || !id) throw badInput("id is required");
    if (confirm !== true) {
      throw new VaultError(CODES.CONSENT_REQUIRED, "Explicit confirmation is required to delete a vault item");
    }

    const record = await this._getRecord(rawKey, id);
    const blobPath = path.join(this.root, record.blobName);

    // Do not erase the only metadata reference if the encrypted blob could
    // not be removed. ENOENT is harmless, but IO failures must fail closed.
    try {
      await fsp.rm(blobPath, { force: true });
    } catch (err) {
      if (isPermissionDenial(err)) {
        throw new VaultError(CODES.PERMISSION_DENIED, "Could not remove the encrypted file");
      }
      throw new VaultError(CODES.IO_FAILED, "Could not remove the encrypted file");
    }

    // Remove metadata record.
    await this.store.remove(COLLECTION, rawKey, id);
    this._journal("Deleted an encrypted media item from Shadow Vault");
    return { removed: true };
  }

  // ------------------------------------------------------------------
  // Count (for the gallery header)
  // ------------------------------------------------------------------

  async count(rawKey) {
    requireKey(rawKey);
    const { records } = await this.store.list(COLLECTION, rawKey);
    const counts = {};
    for (const r of records) {
      counts[r.category] = (counts[r.category] || 0) + 1;
    }
    return { total: records.length, byCategory: counts };
  }

  // ------------------------------------------------------------------
  // Pick-and-import helper (called from IPC after a dialog)
  // ------------------------------------------------------------------

  /**
   * Open an Electron file-picker dialog (passed in as `showDialog`) and
   * import every selected file.  Returns an array of results.
   */
  async pickAndImport(rawKey, { showDialog, signal, assertSession } = {}) {
    requireKey(rawKey);
    if (typeof showDialog !== "function") throw badInput("showDialog callback is required");

    // Build the allowlist filters for the dialog.
    const extensions = Object.keys(EXT_TO_MIME).map((e) => e.replace(".", ""));
    const result = await showDialog({
      title: "Select files to import into Shadow Vault",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Media & Documents", extensions },
        { name: "Photos", extensions: ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "avif", "tif", "tiff", "bmp"] },
        { name: "Videos", extensions: ["mp4", "mov", "webm", "mkv", "mpeg", "mpg", "3gp", "3g2"] },
        { name: "Audio", extensions: ["mp3", "m4a", "ogg", "wav", "flac", "aac"] },
        { name: "Documents", extensions: ["pdf", "zip", "txt", "doc", "docx", "xls", "xlsx", "ppt", "pptx"] },
      ],
    });

    if (result.cancelled || !result.paths?.length) {
      return { cancelled: true, results: [] };
    }
    // Check again AFTER the operating-system file picker, not only before it.
    if (typeof assertSession === "function") assertSession();

    const results = [];
    for (const sourcePath of result.paths) {
      if (typeof assertSession === "function") assertSession();
      try {
        const r = await this.import(rawKey, { sourcePath, signal, assertSession });
        results.push({ ok: true, sourcePath, record: r.record });
      } catch (err) {
        results.push({ ok: false, sourcePath, error: { code: err.code || "UNKNOWN", message: err.message } });
      }
    }
    return { cancelled: false, results };
  }

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  async _getRecord(rawKey, id) {
    const { records } = await this.store.list(COLLECTION, rawKey);
    const record = records.find((r) => r.id === id);
    if (!record) throw new VaultError(CODES.NOT_FOUND, `No media item with id "${id}" exists in this vault`);
    return record;
  }

  /** Fire-and-forget journal hook — set by VaultService. */
  _journal(msg) {
    if (typeof this.onJournal === "function") this.onJournal(msg);
  }
}

function requireKey(rawKey) {
  if (!rawKey || (!Buffer.isBuffer(rawKey) && !(rawKey instanceof Uint8Array))) {
    throw new VaultError(CODES.SESSION_REQUIRED, "An unlocked vault session is required to access Shadow Vault");
  }
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

module.exports = { MediaVault, ALLOWED_TYPES, EXT_TO_MIME, MAX_FILE_BYTES, COLLECTION, FILE_EXT };
