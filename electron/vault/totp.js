"use strict";

/**
 * RFC 4226 (HOTP) and RFC 6238 (TOTP) implemented on Node's OpenSSL-backed
 * `crypto`. Nothing custom: HMAC and constant-time comparison come from the
 * platform, and the module is checked against the published RFC test vectors in
 * tests/totp.test.cjs.
 *
 * Secrets are never logged and never returned to the renderer; the renderer asks
 * for a code for a stored account id and receives only the six/eight digits and
 * the remaining lifetime.
 */
const crypto = require("crypto");
const { VaultError, CODES, badInput } = require("./errors");

const ALGORITHMS = Object.freeze(["SHA1", "SHA256", "SHA512"]);
const DEFAULT_DIGITS = 6;
const DEFAULT_PERIOD = 30;
const MAX_PERIOD = 300;
const SECRET_MIN_BYTES = 10; // RFC 4226 requires at least 128 bits of shared secret.

function normaliseAlgorithm(value) {
  const algorithm = String(value || "SHA1").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!ALGORITHMS.includes(algorithm)) {
    throw badInput(`Unsupported HMAC algorithm "${value}"`);
  }
  return algorithm;
}

function normaliseDigits(value) {
  const digits = value === undefined || value === null || value === "" ? DEFAULT_DIGITS : Number(value);
  if (!Number.isInteger(digits) || digits < 6 || digits > 8) {
    throw badInput("Digits must be an integer between 6 and 8");
  }
  return digits;
}

function normalisePeriod(value) {
  const period = value === undefined || value === null || value === "" ? DEFAULT_PERIOD : Number(value);
  if (!Number.isInteger(period) || period < 1 || period > MAX_PERIOD) {
    throw badInput(`Period must be an integer between 1 and ${MAX_PERIOD} seconds`);
  }
  return period;
}

/**
 * Decode a Base32 secret. Padding is optional and lowercase is accepted because
 * both appear in the wild in otpauth:// URIs and manual entry.
 */
function decodeSecret(secret) {
  if (typeof secret !== "string" || secret.length === 0) {
    throw badInput("Secret must be a non-empty Base32 string");
  }
  const cleaned = secret.replace(/[\s-]/g, "").toUpperCase().replace(/=+$/, "");
  if (!/^[A-Z2-7]+$/.test(cleaned)) {
    throw badInput("Secret is not valid Base32");
  }
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of cleaned) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const buffer = Buffer.from(out);
  if (buffer.length < SECRET_MIN_BYTES) {
    throw badInput(`Secret must decode to at least ${SECRET_MIN_BYTES} bytes`);
  }
  return buffer;
}

function encodeSecret(buffer) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}

/** HOTP, RFC 4226 section 5.3. */
function hotp(secret, counter, { digits = DEFAULT_DIGITS, algorithm = "SHA1" } = {}) {
  const key = Buffer.isBuffer(secret) ? secret : decodeSecret(secret);
  const size = normaliseDigits(digits);
  const alg = normaliseAlgorithm(algorithm);
  if (!Number.isSafeInteger(counter) || counter < 0) {
    throw badInput("Counter must be a non-negative safe integer");
  }
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac(alg.toLowerCase(), key).update(message).digest();
  // Dynamic truncation: the low nibble of the last byte selects the offset.
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 10 ** size).padStart(size, "0");
}

/** TOTP, RFC 6238 section 4.2. `atMs` is the wall clock in milliseconds. */
function totp(secret, atMs, { digits = DEFAULT_DIGITS, period = DEFAULT_PERIOD, algorithm = "SHA1" } = {}) {
  const step = normalisePeriod(period);
  const seconds = Math.floor(Number(atMs) / 1000);
  if (!Number.isFinite(seconds)) throw badInput("A finite timestamp is required");
  return hotp(secret, Math.floor(seconds / step), { digits, algorithm });
}

/** Seconds until the current step expires. Never reports 0 as a live value. */
function remainingSeconds(atMs, period = DEFAULT_PERIOD) {
  const step = normalisePeriod(period);
  const seconds = Math.floor(Number(atMs) / 1000);
  const elapsed = ((seconds % step) + step) % step;
  return step - elapsed;
}

/**
 * Verify a submitted code against the current step plus/minus `window` steps,
 * using a constant-time comparison. Returns the matched step offset so the
 * caller can refuse to accept the same counter twice (replay protection).
 */
function verify(secret, code, atMs, { digits = DEFAULT_DIGITS, period = DEFAULT_PERIOD, algorithm = "SHA1", window = 1 } = {}) {
  const submitted = String(code || "").trim();
  if (!/^\d+$/.test(submitted)) return { ok: false, offset: null };
  const step = normalisePeriod(period);
  const seconds = Math.floor(Number(atMs) / 1000);
  const base = Math.floor(seconds / step);
  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = hotp(secret, base + offset, { digits, algorithm });
    if (
      candidate.length === submitted.length &&
      crypto.timingSafeEqual(Buffer.from(candidate, "utf8"), Buffer.from(submitted, "utf8"))
    ) {
      return { ok: true, offset, counter: base + offset };
    }
  }
  return { ok: false, offset: null };
}

/** A fresh 160-bit secret, matching the RFC 4226 recommendation. */
function generateSecret(bytes = 20) {
  if (!Number.isInteger(bytes) || bytes < SECRET_MIN_BYTES || bytes > 64) {
    throw badInput(`Secret length must be an integer between ${SECRET_MIN_BYTES} and 64 bytes`);
  }
  return encodeSecret(crypto.randomBytes(bytes));
}

/**
 * Parse an otpauth:// URI as used by Google Authenticator, Authy and the Key
 * Uri format specification.
 *
 *   otpauth://totp/Issuer:account?secret=...&issuer=...&algorithm=SHA1
 *                                   &digits=6&period=30
 *
 * Only `totp` and `hotp` are accepted; anything else (including a plain https
 * link) is refused rather than guessed at. The caller still has to confirm the
 * account before it is stored.
 */
function parseOtpauthUri(uri) {
  if (typeof uri !== "string" || uri.trim().length === 0) {
    throw badInput("An otpauth:// URI is required");
  }
  const trimmed = uri.trim();
  if (!/^otpauth:\/\//i.test(trimmed)) {
    throw badInput("The URI must start with otpauth://");
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw badInput("The otpauth URI could not be parsed");
  }
  const type = parsed.host.toLowerCase();
  if (type !== "totp" && type !== "hotp") {
    throw badInput(`Unsupported otpauth type "${type}"`);
  }

  const label = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!label) throw badInput("The otpauth URI has no account label");
  // The label may be "Issuer:account" or just "account".
  let issuerFromLabel = "";
  let name = label;
  const separator = label.indexOf(":");
  if (separator > 0) {
    issuerFromLabel = label.slice(0, separator).trim();
    name = label.slice(separator + 1).trim();
  }
  if (!name) throw badInput("The otpauth URI has no account name");

  const params = parsed.searchParams;
  const secret = params.get("secret");
  if (!secret) throw badInput("The otpauth URI has no secret parameter");
  // Throws if the secret is malformed or too short to be a real seed.
  decodeSecret(secret);

  const issuer = (params.get("issuer") || issuerFromLabel || "").trim();
  const algorithm = normaliseAlgorithm(params.get("algorithm") || "SHA1");
  const digits = normaliseDigits(params.get("digits") || DEFAULT_DIGITS);
  const period = normalisePeriod(params.get("period") || DEFAULT_PERIOD);

  const counterParam = params.get("counter");
  let counter = null;
  if (type === "hotp") {
    // A missing parameter must not be treated as counter 0, or a re-import would
    // silently restart the sequence.
    if (counterParam === null || counterParam.trim() === "") {
      throw badInput("An hotp URI requires a counter");
    }
    counter = Number(counterParam);
    if (!Number.isSafeInteger(counter) || counter < 0) {
      throw badInput("An hotp URI requires a non-negative counter");
    }
  }

  return { type, name, issuer, secret: secret.replace(/[\s-]/g, "").toUpperCase(), algorithm, digits, period, counter };
}

module.exports = {
  ALGORITHMS,
  DEFAULT_DIGITS,
  DEFAULT_PERIOD,
  SECRET_MIN_BYTES,
  decodeSecret,
  encodeSecret,
  generateSecret,
  hotp,
  normaliseAlgorithm,
  normaliseDigits,
  normalisePeriod,
  parseOtpauthUri,
  remainingSeconds,
  totp,
  verify,
};
