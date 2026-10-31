"use strict";

/**
 * Key derivation and key separation for the vault container.
 *
 * Only vetted primitives from Node's OpenSSL-backed `crypto` are used:
 *   - PBKDF2-HMAC-SHA256 (default password KDF, OWASP-recommended iteration count)
 *   - scrypt (optional, memory-hard)
 *   - HKDF-SHA256 for domain-separated subkeys
 *
 * No custom cryptographic construction is implemented here.
 */
const crypto = require("crypto");
const { VaultError, CODES } = require("./errors");

const KDF = Object.freeze({
  // 0 = the caller supplies a high-entropy key directly (vault-managed DEK).
  // No password KDF is applied; the key is used as the master key.
  RAW_KEY: 0,
  PBKDF2_SHA256: 1,
  SCRYPT: 2,
});

const KEY_LEN = 32;
const SALT_LEN = 16;

// OWASP 2023 minimum for PBKDF2-HMAC-SHA256.
const DEFAULT_PBKDF2_ITERATIONS = 600000;
// Node scrypt baseline (N=2^15, r=8, p=1).
const DEFAULT_SCRYPT = { N: 32768, r: 8, p: 1 };

function randomSalt() {
  return crypto.randomBytes(SALT_LEN);
}

/**
 * Derive the master key from a password. Never returns raw password material.
 */
function deriveMasterKey(password, salt, params) {
  if (!Buffer.isBuffer(salt) || salt.length !== SALT_LEN) {
    throw new VaultError(CODES.BAD_INPUT, "Salt must be 16 bytes");
  }

  if (params.kdfId === KDF.RAW_KEY) {
    if (!Buffer.isBuffer(params.rawKey) || params.rawKey.length !== KEY_LEN) {
      throw new VaultError(CODES.BAD_INPUT, "RAW_KEY requires a 32-byte key");
    }
    return Buffer.from(params.rawKey);
  }

  if (typeof password !== "string" || password.length === 0) {
    throw new VaultError(CODES.BAD_INPUT, "Password must be a non-empty string");
  }

  if (params.kdfId === KDF.PBKDF2_SHA256) {
    const iterations = params.iterations || DEFAULT_PBKDF2_ITERATIONS;
    if (!Number.isInteger(iterations) || iterations < 100000) {
      throw new VaultError(CODES.BAD_INPUT, "PBKDF2 iterations too low");
    }
    return crypto.pbkdf2Sync(password, salt, iterations, KEY_LEN, "sha256");
  }

  if (params.kdfId === KDF.SCRYPT) {
    const N = params.N || DEFAULT_SCRYPT.N;
    const r = params.r || DEFAULT_SCRYPT.r;
    const p = params.p || DEFAULT_SCRYPT.p;
    // Guard against a hostile header requesting an unbounded memory/CPU cost.
    if (!Number.isInteger(N) || N < 16384 || N > 1 << 20 || (N & (N - 1)) !== 0) {
      throw new VaultError(CODES.UNSUPPORTED_FORMAT, "Invalid scrypt N");
    }
    if (!Number.isInteger(r) || r < 1 || r > 32) {
      throw new VaultError(CODES.UNSUPPORTED_FORMAT, "Invalid scrypt r");
    }
    if (!Number.isInteger(p) || p < 1 || p > 16) {
      throw new VaultError(CODES.UNSUPPORTED_FORMAT, "Invalid scrypt p");
    }
    return crypto.scryptSync(password, salt, KEY_LEN, {
      N,
      r,
      p,
      maxmem: 256 * 1024 * 1024,
    });
  }

  throw new VaultError(CODES.UNSUPPORTED_FORMAT, `Unknown kdfId ${params.kdfId}`);
}

/**
 * HKDF-SHA256 subkey derivation for domain separation.
 * `info` keeps the encryption key and the header-MAC key independent even
 * though both descend from the same master key.
 */
function hkdf(masterKey, salt, info, length = KEY_LEN) {
  const prk = crypto.createHmac("sha256", salt).update(masterKey).digest();
  const out = Buffer.alloc(length);
  let prev = Buffer.alloc(0);
  let offset = 0;
  let counter = 1;
  while (offset < length) {
    const hmac = crypto.createHmac("sha256", prk);
    hmac.update(prev);
    hmac.update(Buffer.from(info, "utf8"));
    hmac.update(Buffer.from([counter]));
    prev = hmac.digest();
    const take = Math.min(prev.length, length - offset);
    prev.copy(out, offset, 0, take);
    offset += take;
    counter += 1;
  }
  return out;
}

/**
 * Expand the master key into the concrete subkeys used by the container.
 */
function expandKeys(masterKey, salt) {
  return {
    encKey: hkdf(masterKey, salt, "knoux-vault/v1/enc"),
    macKey: hkdf(masterKey, salt, "knoux-vault/v1/mac"),
  };
}

module.exports = {
  KDF,
  KEY_LEN,
  SALT_LEN,
  DEFAULT_PBKDF2_ITERATIONS,
  DEFAULT_SCRYPT,
  randomSalt,
  deriveMasterKey,
  hkdf,
  expandKeys,
};
