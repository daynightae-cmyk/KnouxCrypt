"use strict";

/**
 * KnouxCrypt vault container format, version 1.
 *
 *   header (92 bytes, MAC-protected)
 *   frame* (uint32BE ciphertext length, ciphertext, 16-byte GCM tag)
 *   sentinel frame (0xFFFFFFFF)
 *   trailing HMAC-SHA256 over every frame byte
 *
 * Properties:
 *   - AES-256-GCM per 1 MiB chunk (unique 12-byte nonce: 8-byte prefix + 32-bit counter)
 *   - HKDF-separated header-MAC key and content-MAC key
 *   - the trailing MAC makes truncation and chunk removal detectable, which a
 *     per-chunk AEAD alone cannot do
 *   - no custom primitive: everything is Node/OpenSSL `crypto`
 */
const crypto = require("crypto");
const { VaultError, CODES } = require("./errors");

const MAGIC = Buffer.from("KNXVLT01", "ascii");
const VERSION = 1;

const CIPHER_AES_256_GCM = 1;
const TAG_LEN = 16;
const NONCE_PREFIX_LEN = 8;
const NONCE_LEN = 12;
const MAC_LEN = 32;
// Fixed header prefix: magic(8) ver(1) kdf(1) cipher(1) flags(1) salt(16)
// noncePrefix(8) chunkSize(4) kdfParams(16) origSize(8) plaintextSha256(32)
const HEADER_LEN = 96;
const DEFAULT_CHUNK_SIZE = 1024 * 1024; // 1 MiB
const SENTINEL = 0xffffffff;
const MAX_CHUNK_SIZE = 64 * 1024 * 1024;

function buildHeader({
  kdfId,
  cipherId,
  salt,
  noncePrefix,
  chunkSize,
  kdfParams,
  origSize,
  plaintextSha256,
}) {
  const header = Buffer.alloc(HEADER_LEN);
  MAGIC.copy(header, 0);
  header.writeUInt8(VERSION, 8);
  header.writeUInt8(kdfId, 9);
  header.writeUInt8(cipherId, 10);
  header.writeUInt8(0, 11); // flags, reserved
  salt.copy(header, 12);
  noncePrefix.copy(header, 28);
  header.writeUInt32BE(chunkSize, 36);
  header.writeUInt32BE(kdfParams.iterations || 0, 40);
  header.writeUInt32BE(kdfParams.N || 0, 44);
  header.writeUInt32BE(kdfParams.r || 0, 48);
  header.writeUInt32BE(kdfParams.p || 0, 52);
  header.writeBigUInt64BE(BigInt(origSize || 0), 56);
  const digest = plaintextSha256 || Buffer.alloc(32);
  if (digest.length !== 32) {
    throw new VaultError(CODES.BAD_INPUT, "plaintextSha256 must be 32 bytes");
  }
  digest.copy(header, 64);
  return header;
}

/**
 * Serialize a header and append its HMAC. `header` here is the 92-byte prefix.
 */
function sealHeader(headerPrefix, macKey) {
  const mac = crypto.createHmac("sha256", macKey).update(headerPrefix).digest();
  return Buffer.concat([headerPrefix, mac]);
}

function parseHeader(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < HEADER_LEN + MAC_LEN) {
    throw new VaultError(CODES.TRUNCATED, "Vault file is too small to contain a header");
  }
  if (!buf.subarray(0, 8).equals(MAGIC)) {
    throw new VaultError(CODES.NOT_A_VAULT, "Missing KnouxCrypt vault magic");
  }
  const version = buf.readUInt8(8);
  if (version !== VERSION) {
    throw new VaultError(CODES.UNSUPPORTED_FORMAT, `Unsupported vault version ${version}`);
  }
  const kdfId = buf.readUInt8(9);
  const cipherId = buf.readUInt8(10);
  if (cipherId !== CIPHER_AES_256_GCM) {
    throw new VaultError(CODES.UNSUPPORTED_FORMAT, `Unsupported cipher id ${cipherId}`);
  }
  const salt = Buffer.from(buf.subarray(12, 28));
  const noncePrefix = Buffer.from(buf.subarray(28, 36));
  const chunkSize = buf.readUInt32BE(36);
  if (chunkSize < 1 || chunkSize > MAX_CHUNK_SIZE) {
    throw new VaultError(CODES.UNSUPPORTED_FORMAT, "Invalid chunk size");
  }
  const kdfParams = {
    iterations: buf.readUInt32BE(40),
    N: buf.readUInt32BE(44),
    r: buf.readUInt32BE(48),
    p: buf.readUInt32BE(52),
  };
  const origSize = Number(buf.readBigUInt64BE(56));
  const plaintextSha256 = Buffer.from(buf.subarray(64, 96));
  return {
    version,
    kdfId,
    cipherId,
    salt,
    noncePrefix,
    chunkSize,
    kdfParams,
    origSize,
    plaintextSha256,
    headerPrefix: Buffer.from(buf.subarray(0, HEADER_LEN)),
    headerMac: Buffer.from(buf.subarray(HEADER_LEN, HEADER_LEN + MAC_LEN)),
  };
}

function verifyHeaderMac(parsed, macKey) {
  const expected = crypto.createHmac("sha256", macKey).update(parsed.headerPrefix).digest();
  if (expected.length !== parsed.headerMac.length || !crypto.timingSafeEqual(expected, parsed.headerMac)) {
    throw new VaultError(CODES.INTEGRITY_FAILED, "Vault header failed its authentication check");
  }
}

/**
 * Deterministic per-chunk nonce. The 32-bit counter never wraps within a
 * container because the chunk count is bounded by the 64-bit original size.
 */
function chunkNonce(prefix, index) {
  if (index > 0xfffffffe) {
    throw new VaultError(CODES.BAD_INPUT, "Chunk index exceeds nonce space");
  }
  const nonce = Buffer.alloc(NONCE_LEN);
  prefix.copy(nonce, 0);
  nonce.writeUInt32BE(index, NONCE_PREFIX_LEN);
  return nonce;
}

function encryptChunk(encKey, nonce, plaintext) {
  const cipher = crypto.createCipheriv("aes-256-gcm", encKey, nonce);
  // Bind the chunk index into the AAD so chunks cannot be reordered.
  cipher.setAAD(Buffer.from([0]));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([ct, tag]);
}

function decryptChunk(encKey, nonce, frame) {
  if (frame.length < TAG_LEN) {
    throw new VaultError(CODES.TRUNCATED, "Chunk frame is shorter than its authentication tag");
  }
  const tag = frame.subarray(frame.length - TAG_LEN);
  const ct = frame.subarray(0, frame.length - TAG_LEN);
  const decipher = crypto.createDecipheriv("aes-256-gcm", encKey, nonce);
  decipher.setAAD(Buffer.from([0]));
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch (err) {
    throw new VaultError(
      CODES.AUTH_FAILED,
      "Chunk authentication failed: wrong password, wrong key, or tampered/corrupt data",
    );
  }
}

module.exports = {
  MAGIC,
  VERSION,
  CIPHER_AES_256_GCM,
  TAG_LEN,
  NONCE_LEN,
  MAC_LEN,
  HEADER_LEN,
  DEFAULT_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
  SENTINEL,
  buildHeader,
  sealHeader,
  parseHeader,
  verifyHeaderMac,
  chunkNonce,
  encryptChunk,
  decryptChunk,
};
