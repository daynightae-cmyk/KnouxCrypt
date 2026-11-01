"use strict";

/**
 * Streaming authenticated file/text encryption engine.
 *
 * Deliberately free of Electron dependencies so it can be unit tested with
 * plain Node and reused by the main process only.
 */
const crypto = require("crypto");
const fsp = require("fs/promises");
const path = require("path");

const { VaultError, CODES, badInput } = require("./errors");
const { protectFile, isPermissionDenial } = require("./acl");
const {
  KDF,
  DEFAULT_PBKDF2_ITERATIONS,
  randomSalt,
  deriveMasterKey,
  hkdf,
  expandKeys,
} = require("./kdf");
const container = require("./container");

const FRAME_LEN_BYTES = 4;
const CONTENT_MAC_INFO = "knoux-vault/v1/content-mac";

/**
 * A credential is either a password (KDF applied per the header) or a 32-byte
 * raw key (vault-managed data-encryption key, no password KDF).
 */
function normalizeCredential(credential) {
  if (credential == null) return { password: "", rawKey: null };
  if (typeof credential === "string") return { password: credential, rawKey: null };
  if (Buffer.isBuffer(credential) || credential instanceof Uint8Array) {
    const rawKey = Buffer.from(credential);
    if (rawKey.length !== 32) throw badInput("Raw key must be 32 bytes");
    return { password: "", rawKey };
  }
  if (typeof credential === "object" && credential.rawKey) {
    const rawKey = Buffer.from(credential.rawKey);
    if (rawKey.length !== 32) throw badInput("Raw key must be 32 bytes");
    return { password: "", rawKey };
  }
  throw badInput("Credential must be a password string or a 32-byte key");
}

function validatePassword(password) {
  if (typeof password !== "string" || password.length === 0) {
    throw badInput("A non-empty password is required");
  }
  if (Buffer.byteLength(password, "utf8") > 4096) {
    throw badInput("Password is unreasonably long");
  }
}

function resolveKdfParams(cred, headerParams) {
  if (cred.rawKey) {
    return { kdfId: KDF.RAW_KEY, rawKey: cred.rawKey };
  }
  return { kdfId: headerParams.kdfId, ...headerParams.kdfParams };
}

/**
 * Derive the container subkeys. Returns encKey, macKey (header MAC) and the
 * content-MAC key, all HKDF-separated from the master key.
 */
function deriveSubkeys(cred, salt, headerParams) {
  if (!cred.rawKey) validatePassword(cred.password);
  const master = deriveMasterKey(cred.password, salt, resolveKdfParams(cred, headerParams));
  const { encKey, macKey } = expandKeys(master, salt);
  const contentMacKey = hkdf(encKey, salt, CONTENT_MAC_INFO);
  return { encKey, macKey, contentMacKey };
}

function tempPathFor(targetPath) {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  return path.join(dir, `.${base}.knoux-${crypto.randomBytes(6).toString("hex")}.tmp`);
}

/**
 * Read exactly `length` bytes at an explicit file offset. Returns null when the
 * file ends exactly at `position` before any byte is read.
 */
async function readAt(fh, position, length) {
  const chunks = [];
  let read = 0;
  while (read < length) {
    const want = Math.min(length - read, 1024 * 1024);
    const buf = Buffer.alloc(want);
    let offset = 0;
    while (offset < want) {
      const { bytesRead } = await fh.read(buf, offset, want - offset, position + read + offset);
      if (bytesRead === 0) {
        if (read === 0 && offset === 0) return null;
        throw new VaultError(CODES.TRUNCATED, "Unexpected end of vault file");
      }
      offset += bytesRead;
    }
    chunks.push(buf);
    read += want;
  }
  return Buffer.concat(chunks);
}

class VaultEngine {
  constructor(options = {}) {
    this.kdfParams = options.kdfParams || { kdfId: KDF.PBKDF2_SHA256, iterations: DEFAULT_PBKDF2_ITERATIONS };
    this.chunkSize = options.chunkSize || container.DEFAULT_CHUNK_SIZE;
    this.overwrite = options.overwrite === true;
  }

  _checkAbort(signal) {
    if (signal && signal.aborted) {
      throw new VaultError(CODES.CANCELLED, "Operation cancelled by the user");
    }
  }

  /**
   * Encrypt an in-memory buffer (used for text and for tests).
   */
  encryptBuffer(plaintext, credential, options = {}) {
    const cred = normalizeCredential(credential);
    const input = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(String(plaintext), "utf8");
    const kdfParams = cred.rawKey
      ? { kdfId: KDF.RAW_KEY, rawKey: cred.rawKey }
      : options.kdfParams || this.kdfParams;
    const salt = randomSalt();
    const noncePrefix = crypto.randomBytes(container.NONCE_LEN - 4);
    const chunkSize = options.chunkSize || this.chunkSize;
    const plaintextSha256 = crypto.createHash("sha256").update(input).digest();

    const headerPrefix = container.buildHeader({
      kdfId: kdfParams.kdfId,
      cipherId: container.CIPHER_AES_256_GCM,
      salt,
      noncePrefix,
      chunkSize,
      kdfParams,
      origSize: input.length,
      plaintextSha256,
    });

    const { encKey, macKey, contentMacKey } = deriveSubkeys(cred, salt, {
      kdfId: kdfParams.kdfId,
      kdfParams: { iterations: kdfParams.iterations || 0 },
    });

    const frames = [];
    const contentMac = crypto.createHmac("sha256", contentMacKey);
    let index = 0;
    for (let offset = 0; offset < input.length; offset += chunkSize) {
      const frame = container.encryptChunk(
        encKey,
        container.chunkNonce(noncePrefix, index),
        input.subarray(offset, offset + chunkSize),
      );
      const lengthField = Buffer.alloc(FRAME_LEN_BYTES);
      lengthField.writeUInt32BE(frame.length, 0);
      contentMac.update(lengthField);
      contentMac.update(frame);
      frames.push(lengthField, frame);
      index += 1;
    }
    const sentinel = Buffer.alloc(FRAME_LEN_BYTES);
    sentinel.writeUInt32BE(container.SENTINEL, 0);
    contentMac.update(sentinel);
    frames.push(sentinel);

    const sealedHeader = container.sealHeader(headerPrefix, macKey);
    const bytes = Buffer.concat([sealedHeader, ...frames, contentMac.digest()]);
    return {
      bytes,
      meta: {
        version: container.VERSION,
        kdfId: kdfParams.kdfId,
        iterations: kdfParams.iterations || 0,
        chunkSize,
        plaintextSha256: plaintextSha256.toString("hex"),
        origSize: input.length,
        encryptedSize: bytes.length,
      },
    };
  }

  /**
   * Decrypt an in-memory container.
   */
  decryptBuffer(bytes, credential) {
    const cred = normalizeCredential(credential);
    if (!Buffer.isBuffer(bytes)) throw badInput("Vault bytes must be a Buffer");
    const parsed = container.parseHeader(bytes);
    const { encKey, macKey, contentMacKey } = deriveSubkeys(cred, parsed.salt, parsed);
    container.verifyHeaderMac(parsed, macKey);

    let offset = container.HEADER_LEN + container.MAC_LEN;
    if (bytes.length < offset + FRAME_LEN_BYTES + container.MAC_LEN) {
      throw new VaultError(CODES.TRUNCATED, "Vault file has no content frames");
    }
    const bodyEnd = bytes.length - container.MAC_LEN;
    const contentMac = crypto.createHmac("sha256", contentMacKey);
    const parts = [];
    let index = 0;
    let sawSentinel = false;
    while (offset < bodyEnd) {
      if (offset + FRAME_LEN_BYTES > bodyEnd) {
        throw new VaultError(CODES.TRUNCATED, "Vault file ends inside a frame length field");
      }
      const lengthField = bytes.subarray(offset, offset + FRAME_LEN_BYTES);
      contentMac.update(lengthField);
      const frameLen = lengthField.readUInt32BE(0);
      offset += FRAME_LEN_BYTES;
      if (frameLen === container.SENTINEL) {
        sawSentinel = true;
        break;
      }
      if (frameLen < container.TAG_LEN || offset + frameLen > bodyEnd) {
        throw new VaultError(CODES.TRUNCATED, "Vault frame length exceeds the file bounds");
      }
      const frame = bytes.subarray(offset, offset + frameLen);
      contentMac.update(frame);
      offset += frameLen;
      parts.push(container.decryptChunk(encKey, container.chunkNonce(parsed.noncePrefix, index), frame));
      index += 1;
    }
    if (!sawSentinel) {
      throw new VaultError(CODES.TRUNCATED, "Vault file is missing its end-of-stream marker");
    }
    if (offset !== bodyEnd) {
      throw new VaultError(CODES.TRUNCATED, "Unexpected trailing bytes before the vault MAC");
    }
    const trailingMac = bytes.subarray(bodyEnd);
    const expectedMac = contentMac.digest();
    if (!crypto.timingSafeEqual(trailingMac, expectedMac)) {
      throw new VaultError(CODES.INTEGRITY_FAILED, "Vault content failed its integrity check");
    }
    const plaintext = Buffer.concat(parts);
    const digest = crypto.createHash("sha256").update(plaintext).digest();
    if (!digest.equals(parsed.plaintextSha256)) {
      throw new VaultError(CODES.INTEGRITY_FAILED, "Recovered plaintext does not match the recorded digest");
    }
    return {
      plaintext,
      meta: {
        version: parsed.version,
        origSize: parsed.origSize,
        plaintextSha256: parsed.plaintextSha256.toString("hex"),
      },
    };
  }

  /**
   * Stream-encrypt a file to `outputPath` atomically.
   * Two passes over the input: one to hash the plaintext, one to encrypt it,
   * so memory stays bounded regardless of file size.
   */
  async encryptFile({ inputPath, outputPath, password, rawKey, onProgress, signal }) {
    const cred = normalizeCredential(rawKey ? { rawKey } : password);
    if (!inputPath || !outputPath) throw badInput("inputPath and outputPath are required");
    this._checkAbort(signal);

    const stat = await fsp.stat(inputPath).catch(() => {
      throw new VaultError(CODES.NOT_FOUND, `Input file not found: ${inputPath}`);
    });
    if (!stat.isFile()) throw badInput("Input path is not a regular file");
    await this._assertWritableTarget(outputPath);

    const chunkSize = this.chunkSize;
    const plaintextSha256 = await this._hashFile(inputPath, signal);

    const salt = randomSalt();
    const noncePrefix = crypto.randomBytes(container.NONCE_LEN - 4);
    const kdfParams = cred.rawKey
      ? { kdfId: KDF.RAW_KEY, rawKey: cred.rawKey }
      : this.kdfParams;
    const headerPrefix = container.buildHeader({
      kdfId: kdfParams.kdfId,
      cipherId: container.CIPHER_AES_256_GCM,
      salt,
      noncePrefix,
      chunkSize,
      kdfParams,
      origSize: stat.size,
      plaintextSha256,
    });
    const { encKey, macKey, contentMacKey } = deriveSubkeys(cred, salt, {
      kdfId: kdfParams.kdfId,
      kdfParams: { iterations: kdfParams.iterations || 0 },
    });

    const tmp = tempPathFor(outputPath);
    const inFh = await fsp.open(inputPath, "r");
    const outFh = await this._openTemp(tmp);
    let committed = false;
    try {
      await outFh.write(container.sealHeader(headerPrefix, macKey));
      const contentMac = crypto.createHmac("sha256", contentMacKey);
      const buf = Buffer.alloc(chunkSize);
      let index = 0;
      let processed = 0;
      for (;;) {
        this._checkAbort(signal);
        const { bytesRead } = await inFh.read(buf, 0, chunkSize, null);
        if (bytesRead === 0) break;
        const frame = container.encryptChunk(
          encKey,
          container.chunkNonce(noncePrefix, index),
          buf.subarray(0, bytesRead),
        );
        const lengthField = Buffer.alloc(FRAME_LEN_BYTES);
        lengthField.writeUInt32BE(frame.length, 0);
        contentMac.update(lengthField);
        contentMac.update(frame);
        await outFh.write(Buffer.concat([lengthField, frame]));
        index += 1;
        processed += bytesRead;
        if (onProgress) onProgress({ processed, total: stat.size });
      }
      const sentinel = Buffer.alloc(FRAME_LEN_BYTES);
      sentinel.writeUInt32BE(container.SENTINEL, 0);
      contentMac.update(sentinel);
      await outFh.write(sentinel);
      await outFh.write(contentMac.digest());
      await outFh.sync();
      await outFh.close();
      await inFh.close();
      await this._atomicCommit(tmp, outputPath);
      committed = true;
      // An encrypted file is written wherever the user chose, often outside any
      // vault root, so its DACL has to be set explicitly rather than inherited.
      await protectFile(outputPath);
      const outStat = await fsp.stat(outputPath);
      return {
        outputPath,
        meta: {
          version: container.VERSION,
          kdfId: kdfParams.kdfId,
          iterations: kdfParams.iterations || 0,
          chunkSize,
          origSize: stat.size,
          encryptedSize: outStat.size,
          plaintextSha256: plaintextSha256.toString("hex"),
        },
      };
    } finally {
      await inFh.close().catch(() => {});
      await outFh.close().catch(() => {});
      if (!committed) await fsp.rm(tmp, { force: true }).catch(() => {});
    }
  }

  /**
   * Stream-decrypt a vault file to `outputPath` atomically.
   */
  async decryptFile({ inputPath, outputPath, password, rawKey, onProgress, signal }) {
    const cred = normalizeCredential(rawKey ? { rawKey } : password);
    if (!inputPath || !outputPath) throw badInput("inputPath and outputPath are required");
    this._checkAbort(signal);

    const stat = await fsp.stat(inputPath).catch(() => {
      throw new VaultError(CODES.NOT_FOUND, `Vault file not found: ${inputPath}`);
    });
    if (!stat.isFile()) throw badInput("Input path is not a regular file");
    const minSize = container.HEADER_LEN + container.MAC_LEN + FRAME_LEN_BYTES + container.MAC_LEN;
    if (stat.size < minSize) {
      throw new VaultError(CODES.TRUNCATED, "File is too small to be a vault container");
    }
    await this._assertWritableTarget(outputPath);

    const inFh = await fsp.open(inputPath, "r");
    const tmp = tempPathFor(outputPath);
    let outFh = null;
    let committed = false;
    try {
      const headerBuf = await readAt(inFh, 0, container.HEADER_LEN + container.MAC_LEN);
      if (!headerBuf) throw new VaultError(CODES.TRUNCATED, "Unable to read the vault header");
      const parsed = container.parseHeader(headerBuf);
      const { encKey, macKey, contentMacKey } = deriveSubkeys(cred, parsed.salt, parsed);
      container.verifyHeaderMac(parsed, macKey);

      outFh = await this._openTemp(tmp);
      const contentMac = crypto.createHmac("sha256", contentMacKey);
      const bodyEnd = stat.size - container.MAC_LEN;
      let offset = container.HEADER_LEN + container.MAC_LEN;
      let index = 0;
      let processed = 0;
      let sawSentinel = false;
      const plainHasher = crypto.createHash("sha256");

      for (;;) {
        this._checkAbort(signal);
        if (offset >= bodyEnd) break;
        if (offset + FRAME_LEN_BYTES > bodyEnd) {
          throw new VaultError(CODES.TRUNCATED, "Vault file ends inside a frame length field");
        }
        const lengthField = await readAt(inFh, offset, FRAME_LEN_BYTES);
        if (!lengthField) throw new VaultError(CODES.TRUNCATED, "Vault file ended unexpectedly");
        offset += FRAME_LEN_BYTES;
        contentMac.update(lengthField);
        const frameLen = lengthField.readUInt32BE(0);
        if (frameLen === container.SENTINEL) {
          sawSentinel = true;
          break;
        }
        if (frameLen < container.TAG_LEN || offset + frameLen > bodyEnd) {
          throw new VaultError(CODES.TRUNCATED, "Vault frame length exceeds the file bounds");
        }
        const frame = await readAt(inFh, offset, frameLen);
        if (!frame) throw new VaultError(CODES.TRUNCATED, "Vault file ended inside a frame");
        offset += frameLen;
        contentMac.update(frame);
        const plain = container.decryptChunk(encKey, container.chunkNonce(parsed.noncePrefix, index), frame);
        plainHasher.update(plain);
        await outFh.write(plain);
        index += 1;
        processed += plain.length;
        if (onProgress) onProgress({ processed, total: parsed.origSize });
      }

      if (!sawSentinel) {
        throw new VaultError(CODES.TRUNCATED, "Vault file is missing its end-of-stream marker");
      }
      if (offset !== bodyEnd) {
        throw new VaultError(CODES.TRUNCATED, "Unexpected trailing bytes before the vault MAC");
      }
      const trailingMac = await readAt(inFh, offset, container.MAC_LEN);
      if (!trailingMac) throw new VaultError(CODES.TRUNCATED, "Vault file is missing its trailing MAC");
      const expectedMac = contentMac.digest();
      if (!crypto.timingSafeEqual(trailingMac, expectedMac)) {
        throw new VaultError(CODES.INTEGRITY_FAILED, "Vault content failed its integrity check");
      }
      const digest = plainHasher.digest();
      if (!digest.equals(parsed.plaintextSha256)) {
        throw new VaultError(CODES.INTEGRITY_FAILED, "Recovered plaintext does not match the recorded digest");
      }
      await outFh.sync();
      await outFh.close();
      await inFh.close();
      await this._atomicCommit(tmp, outputPath);
      committed = true;
      // Recovered plaintext is the most sensitive thing this app writes.
      await protectFile(outputPath);
      return {
        outputPath,
        meta: {
          version: parsed.version,
          origSize: parsed.origSize,
          plaintextSha256: parsed.plaintextSha256.toString("hex"),
        },
      };
    } finally {
      await inFh.close().catch(() => {});
      if (outFh) await outFh.close().catch(() => {});
      if (!committed) await fsp.rm(tmp, { force: true }).catch(() => {});
    }
  }

  /**
   * Parse and describe a vault header without any key (task 32). This proves
   * the file claims to be a vault of a known version, and nothing more: the
   * header MAC is NOT verified here, so a header field is an unauthenticated
   * claim until `verifyPackage` succeeds with the right key.
   */
  async inspectPackage(inputPath) {
    const stat = await fsp.stat(inputPath).catch(() => {
      throw new VaultError(CODES.NOT_FOUND, "The file was not found");
    });
    if (!stat.isFile()) throw badInput("The input path is not a regular file");
    const minSize = container.HEADER_LEN + container.MAC_LEN + FRAME_LEN_BYTES + container.MAC_LEN;
    const fh = await fsp.open(inputPath, "r");
    try {
      const magicBuf = await readAt(fh, 0, 8);
      if (!magicBuf || !magicBuf.equals(container.MAGIC)) {
        throw new VaultError(CODES.NOT_A_VAULT, "Missing KnouxCrypt vault magic");
      }
      if (stat.size < minSize) {
        throw new VaultError(CODES.TRUNCATED, "The file is too small to be a complete vault container");
      }
      const headerBuf = await readAt(fh, 0, container.HEADER_LEN + container.MAC_LEN);
      if (!headerBuf) throw new VaultError(CODES.TRUNCATED, "Unable to read the vault header");
      const parsed = container.parseHeader(headerBuf);
      return {
        isVault: true,
        version: parsed.version,
        kdfId: parsed.kdfId,
        cipherId: parsed.cipherId,
        chunkSize: parsed.chunkSize,
        kdfParams: parsed.kdfParams,
        declaredOrigSize: parsed.origSize,
        declaredPlaintextSha256: parsed.plaintextSha256.toString("hex"),
        fileSize: stat.size,
        // Explicit: these fields are read from an unauthenticated header.
        headerAuthenticated: false,
        canDecrypt: null,
      };
    } finally {
      await fh.close().catch(() => {});
    }
  }

  /**
   * Full authenticated verification (task 32): stream the container, verify the
   * header MAC, every chunk's GCM tag, the trailing content MAC and the
   * plaintext digest — all against `rawKey`. The plaintext is never written
   * anywhere; only its digest is recomputed in memory, chunk by chunk.
   *
   * A wrong key or a tampered byte fails here, which is what turns the header's
   * claims from "unauthenticated" into "verified".
   */
  async verifyPackage({ inputPath, rawKey, onProgress, signal } = {}) {
    const cred = normalizeCredential({ rawKey });
    const stat = await fsp.stat(inputPath).catch(() => {
      throw new VaultError(CODES.NOT_FOUND, "The file was not found");
    });
    const fh = await fsp.open(inputPath, "r");
    try {
      const headerBuf = await readAt(fh, 0, container.HEADER_LEN + container.MAC_LEN);
      if (!headerBuf) throw new VaultError(CODES.TRUNCATED, "Unable to read the vault header");
      const parsed = container.parseHeader(headerBuf);
      const { encKey, macKey, contentMacKey } = deriveSubkeys(cred, parsed.salt, parsed);
      container.verifyHeaderMac(parsed, macKey);

      const bodyEnd = stat.size - container.MAC_LEN;
      if (bodyEnd < container.HEADER_LEN + container.MAC_LEN + FRAME_LEN_BYTES) {
        throw new VaultError(CODES.TRUNCATED, "The vault has no content frames");
      }
      const contentMac = crypto.createHmac("sha256", contentMacKey);
      const plainHasher = crypto.createHash("sha256");
      let offset = container.HEADER_LEN + container.MAC_LEN;
      let index = 0;
      let processed = 0;
      let frames = 0;
      let sawSentinel = false;

      for (;;) {
        this._checkAbort(signal);
        if (offset >= bodyEnd) break;
        if (offset + FRAME_LEN_BYTES > bodyEnd) {
          throw new VaultError(CODES.TRUNCATED, "The vault ends inside a frame length field");
        }
        const lengthField = await readAt(fh, offset, FRAME_LEN_BYTES);
        if (!lengthField) throw new VaultError(CODES.TRUNCATED, "The vault ended unexpectedly");
        offset += FRAME_LEN_BYTES;
        contentMac.update(lengthField);
        const frameLen = lengthField.readUInt32BE(0);
        if (frameLen === container.SENTINEL) {
          sawSentinel = true;
          break;
        }
        if (frameLen < container.TAG_LEN || offset + frameLen > bodyEnd) {
          throw new VaultError(CODES.TRUNCATED, "A frame length exceeds the file bounds");
        }
        const frame = await readAt(fh, offset, frameLen);
        if (!frame) throw new VaultError(CODES.TRUNCATED, "The vault ended inside a frame");
        offset += frameLen;
        contentMac.update(frame);
        const plain = container.decryptChunk(encKey, container.chunkNonce(parsed.noncePrefix, index), frame);
        plainHasher.update(plain);
        index += 1;
        frames += 1;
        processed += plain.length;
        if (onProgress) onProgress({ processed, total: parsed.origSize });
      }

      if (!sawSentinel) throw new VaultError(CODES.TRUNCATED, "The vault is missing its end-of-stream marker");
      if (offset !== bodyEnd) throw new VaultError(CODES.TRUNCATED, "Unexpected trailing bytes before the vault MAC");
      const trailingMac = await readAt(fh, offset, container.MAC_LEN);
      if (!trailingMac) throw new VaultError(CODES.TRUNCATED, "The vault is missing its trailing MAC");
      const expectedMac = contentMac.digest();
      if (!crypto.timingSafeEqual(trailingMac, expectedMac)) {
        throw new VaultError(CODES.INTEGRITY_FAILED, "Vault content failed its integrity check");
      }
      const digest = plainHasher.digest();
      if (!digest.equals(parsed.plaintextSha256)) {
        throw new VaultError(CODES.INTEGRITY_FAILED, "Recovered plaintext does not match the recorded digest");
      }
      return {
        verified: true,
        version: parsed.version,
        kdfId: parsed.kdfId,
        cipherId: parsed.cipherId,
        chunkSize: parsed.chunkSize,
        kdfParams: parsed.kdfParams,
        frames,
        origSize: parsed.origSize,
        processed,
        fileSize: stat.size,
        plaintextSha256: parsed.plaintextSha256.toString("hex"),
        headerAuthenticated: true,
      };
    } finally {
      await fh.close().catch(() => {});
    }
  }

  /**
   * Read and describe a vault header without decrypting content.
   */
  async inspect(inputPath) {
    const stat = await fsp.stat(inputPath).catch(() => {
      throw new VaultError(CODES.NOT_FOUND, `Vault file not found: ${inputPath}`);
    });
    const fh = await fsp.open(inputPath, "r");
    try {
      const magicBuf = await readAt(fh, 0, 8);
      if (!magicBuf || !magicBuf.equals(container.MAGIC)) {
        throw new VaultError(CODES.NOT_A_VAULT, "Missing KnouxCrypt vault magic");
      }
      const headerBuf = await readAt(fh, 0, container.HEADER_LEN + container.MAC_LEN);
      if (!headerBuf) throw new VaultError(CODES.TRUNCATED, "Unable to read the vault header");
      const parsed = container.parseHeader(headerBuf);
      return {
        isVault: true,
        version: parsed.version,
        kdfId: parsed.kdfId,
        cipherId: parsed.cipherId,
        chunkSize: parsed.chunkSize,
        origSize: parsed.origSize,
        fileSize: stat.size,
        plaintextSha256: parsed.plaintextSha256.toString("hex"),
      };
    } finally {
      await fh.close().catch(() => {});
    }
  }

  async _hashFile(inputPath, signal) {
    const fh = await fsp.open(inputPath, "r");
    try {
      const hasher = crypto.createHash("sha256");
      const buf = Buffer.alloc(this.chunkSize);
      for (;;) {
        this._checkAbort(signal);
        const { bytesRead } = await fh.read(buf, 0, this.chunkSize, null);
        if (bytesRead === 0) break;
        hasher.update(buf.subarray(0, bytesRead));
      }
      return hasher.digest();
    } finally {
      await fh.close().catch(() => {});
    }
  }

  async _assertWritableTarget(outputPath) {
    const dir = path.dirname(outputPath);
    const dirStat = await fsp.stat(dir).catch(() => null);
    if (!dirStat || !dirStat.isDirectory()) {
      throw new VaultError(CODES.IO_FAILED, `Output directory does not exist: ${dir}`);
    }
    const exists = await fsp
      .access(outputPath)
      .then(() => true)
      .catch(() => false);
    if (exists && !this.overwrite) {
      throw new VaultError(CODES.PATH_CONFLICT, `Output file already exists: ${outputPath}`);
    }
    // Actually try to create a file in the directory. On Windows `stat()` on the
    // directory succeeds even when the DACL denies WriteData, so a stat-only
    // check would let the operation run to completion — hashing the whole input
    // and then failing at the commit, after partial work. Probing catches a real
    // NTFS (or POSIX write-bit) denial up front and reports it as its own
    // condition instead of a generic IO failure.
    const probe = path.join(dir, `.knoux-writable-probe.${crypto.randomBytes(6).toString("hex")}.tmp`);
    let handle = null;
    try {
      handle = await fsp.open(probe, "wx");
    } catch (err) {
      if (isPermissionDenial(err)) {
        throw new VaultError(
          CODES.PERMISSION_DENIED,
          `This user is not allowed to write in ${dir}`,
          { syscall: err.syscall, errno: err.code },
        );
      }
      if (err.code === "EEXIST") return; // stale probe name; the directory is writable
      throw new VaultError(CODES.IO_FAILED, `Output directory is not writable: ${dir}`);
    } finally {
      if (handle) {
        await handle.close().catch(() => {});
        // Only remove what this probe created. If the name somehow collided
        // (EEXIST), the file belongs to somebody else and must stay.
        await fsp.rm(probe, { force: true }).catch(() => {});
      }
    }
  }

  /**
   * Open a temp output file, translating a platform write refusal into a typed
   * error. Windows reports an NTFS DENY ACE on the parent as EPERM.
   */
  async _openTemp(tmp) {
    try {
      return await fsp.open(tmp, "wx", 0o600);
    } catch (err) {
      if (isPermissionDenial(err)) {
        throw new VaultError(CODES.PERMISSION_DENIED, "The output location does not allow this user to write", {
          syscall: err.syscall,
          errno: err.code,
        });
      }
      throw err;
    }
  }

  async _atomicCommit(tmp, outputPath) {
    if (this.overwrite) {
      await fsp.rename(tmp, outputPath);
      return;
    }
    // Refuse to clobber a file created between the check and the commit.
    await fsp.link(tmp, outputPath).catch(async (err) => {
      if (err.code === "EEXIST") {
        throw new VaultError(CODES.PATH_CONFLICT, `Output file already exists: ${outputPath}`);
      }
      throw err;
    });
    await fsp.rm(tmp, { force: true });
  }
}

module.exports = {
  VaultEngine,
  FRAME_LEN_BYTES,
  CONTENT_MAC_INFO,
  readAt,
  normalizeCredential,
};
