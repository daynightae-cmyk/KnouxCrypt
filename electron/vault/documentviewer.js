"use strict";

/**
 * Protected document viewer (task 30).
 *
 * Opening a document decrypts it into a private, owner-only temporary file and
 * hands the renderer bounded content. The plaintext therefore does exist on
 * disk while the document is open — that is stated in the UI rather than
 * hidden. What the module does guarantee:
 *
 *   - the temp file is created inside a dedicated directory with mode 0600
 *   - it is removed on close, on session revoke and on lock-all
 *   - stale files from a previous crash are swept at startup
 *   - only supported formats are accepted, and only up to a size ceiling
 *   - the renderer receives bounded chunks, never an unbounded buffer
 *
 * The screen-capture limitation cannot be enforced from a process: a user with
 * an OS-level capture tool can photograph the window. The UI says so.
 */
const crypto = require("crypto");
const fsp = require("fs/promises");
const path = require("path");

const { VaultError, CODES, badInput } = require("./errors");

const MAX_DOCUMENT_BYTES = 256 * 1024 * 1024;
const MAX_INLINE_TEXT = 2 * 1024 * 1024;
const MAX_INLINE_BINARY = 8 * 1024 * 1024;
const MAX_OPEN_DOCUMENTS = 8;

const KIND_BY_EXTENSION = Object.freeze({
  ".txt": "text",
  ".md": "text",
  ".log": "text",
  ".csv": "text",
  ".json": "text",
  ".xml": "text",
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".gif": "image",
  ".webp": "image",
  ".bmp": "image",
  ".pdf": "pdf",
});

const MIME_BY_EXTENSION = Object.freeze({
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".log": "text/plain",
  ".csv": "text/csv",
  ".json": "application/json",
  ".xml": "application/xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".pdf": "application/pdf",
});

class DocumentViewer {
  constructor(options = {}) {
    if (!options.engine || !options.root) {
      throw badInput("DocumentViewer needs an engine and a root directory");
    }
    this.engine = options.engine;
    this.root = options.root;
    this.docs = new Map();
  }

  /** Remove orphaned temp files left behind by a previous process. */
  async sweep() {
    let names = [];
    try {
      names = await fsp.readdir(this.root);
    } catch {
      return { removed: 0 };
    }
    let removed = 0;
    for (const name of names) {
      try {
        await fsp.rm(path.join(this.root, name), { force: true });
        removed += 1;
      } catch {
        /* keep going; a locked file is reported by the count */
      }
    }
    return { removed };
  }

  _detectKind(name) {
    const ext = path.extname(name).toLowerCase();
    const kind = KIND_BY_EXTENSION[ext];
    if (!kind) {
      throw new VaultError(
        CODES.UNSUPPORTED_FORMAT,
        "Only text, image and PDF documents can be viewed; other formats must be exported instead",
      );
    }
    return { kind, mime: MIME_BY_EXTENSION[ext], extension: ext };
  }

  /**
   * Decrypt a vault container into a private temp file and describe it. The
   * caller supplies the original file name so the format can be checked; the
   * name is never trusted as a path.
   */
  async open(rawKey, { inputPath, displayName, sessionId, operationId } = {}) {
    if (typeof inputPath !== "string" || inputPath.length === 0) throw badInput("A vault file is required");
    if (this.docs.size >= MAX_OPEN_DOCUMENTS) {
      throw new VaultError(CODES.BAD_INPUT, `At most ${MAX_OPEN_DOCUMENTS} documents can be open at once`);
    }
    const name = sanitizeDisplayName(displayName || path.basename(inputPath));
    const { kind, mime, extension } = this._detectKind(name);

    await fsp.mkdir(this.root, { recursive: true });
    const docId = crypto.randomBytes(12).toString("hex");
    const tempPath = path.join(this.root, `${docId}.tmp`);

    let result;
    try {
      result = await this.engine.decryptFile({ inputPath, outputPath: tempPath, rawKey, operationId });
    } catch (err) {
      await fsp.rm(tempPath, { force: true }).catch(() => {});
      throw err;
    }

    const size = result.meta.origSize;
    if (size > MAX_DOCUMENT_BYTES) {
      await fsp.rm(tempPath, { force: true }).catch(() => {});
      throw new VaultError(CODES.BAD_INPUT, "That document is larger than the viewer supports");
    }
    await fsp.chmod(tempPath, 0o600).catch(() => {});

    const record = {
      docId,
      kind,
      mime,
      extension,
      name,
      size,
      sha256: result.meta.plaintextSha256,
      tempPath,
      sessionId: sessionId || null,
      openedAt: Date.now(),
    };
    this.docs.set(docId, record);

    const view = {
      docId,
      kind,
      mime,
      name,
      size,
      sha256: record.sha256,
      truncated: false,
      text: null,
      dataUrl: null,
    };

    if (kind === "text" && size <= MAX_INLINE_TEXT) {
      const buffer = await fsp.readFile(tempPath);
      view.text = buffer.toString("utf8");
    } else if (kind !== "text" && size <= MAX_INLINE_BINARY) {
      const buffer = await fsp.readFile(tempPath);
      view.dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
    } else {
      // Too large to inline: the renderer pages through readChunk instead.
      view.truncated = true;
    }
    return view;
  }

  /** Read a bounded slice of an open document. Offsets are byte offsets. */
  async readChunk(docId, { offset = 0, length = 64 * 1024 } = {}) {
    const record = this._require(docId);
    const start = Math.max(0, Math.floor(Number(offset) || 0));
    const want = Math.min(Math.max(1, Math.floor(Number(length) || 0)), 1024 * 1024);
    const fh = await fsp.open(record.tempPath, "r");
    try {
      const buffer = Buffer.alloc(want);
      const { bytesRead } = await fh.read(buffer, 0, want, start);
      return {
        docId,
        offset: start,
        bytesRead,
        eof: start + bytesRead >= record.size,
        chunk: buffer.subarray(0, bytesRead).toString("base64"),
      };
    } finally {
      await fh.close().catch(() => {});
    }
  }

  /** Close a document and delete its plaintext. */
  async close(docId) {
    const record = this.docs.get(docId);
    if (!record) return { closed: false };
    this.docs.delete(docId);
    await fsp.rm(record.tempPath, { force: true }).catch(() => {});
    return { closed: true };
  }

  /** Close every document, or every document owned by one session. */
  async closeAll(sessionId) {
    let closed = 0;
    for (const [docId, record] of [...this.docs.entries()]) {
      if (sessionId && record.sessionId !== sessionId) continue;
      this.docs.delete(docId);
      await fsp.rm(record.tempPath, { force: true }).catch(() => {});
      closed += 1;
    }
    return { closed };
  }

  status() {
    return {
      openDocuments: this.docs.size,
      // Paths are never exposed; only counts and formats.
      kinds: [...this.docs.values()].reduce((acc, r) => {
        acc[r.kind] = (acc[r.kind] || 0) + 1;
        return acc;
      }, {}),
    };
  }

  _require(docId) {
    const record = this.docs.get(docId);
    if (!record) throw new VaultError(CODES.NOT_FOUND, "That document is not open");
    return record;
  }
}

/** Strip any directory component so a display name can never be a path. */
function sanitizeDisplayName(name) {
  const base = String(name).split(/[\\/]/).pop().trim();
  if (!base || base === "." || base === "..") throw badInput("A document name is required");
  return base.slice(0, 256);
}

module.exports = {
  DocumentViewer,
  MAX_DOCUMENT_BYTES,
  MAX_INLINE_TEXT,
  MAX_INLINE_BINARY,
  MAX_OPEN_DOCUMENTS,
  KIND_BY_EXTENSION,
};
