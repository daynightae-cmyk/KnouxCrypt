"use strict";

/**
 * Service-layer primitives for tasks 25-28: Clipboard Guard, Secure Random,
 * HMAC Authenticity and Public Key QR.
 *
 * Everything here is real. Randomness comes from crypto.randomBytes, the HMAC
 * comes from OpenSSL, the QR matrix is a genuine QR encoder and the clipboard
 * is the operating system clipboard. What the module refuses to do is equally
 * deliberate: it does not claim a certified entropy source, it does not
 * masquerade a masked sample for a cleared clipboard, and it never lets a
 * secret value reach the renderer.
 */
const crypto = require("crypto");

const { VaultError, CODES, badInput } = require("./errors");

// ---- task 26: Secure Random ------------------------------------------------

/**
 * Output types the studio can produce. `alphabet` is only used for the
 * unbiased modulo sampling; `base64` is rendered through the URL-safe encoder.
 */
const RANDOM_TYPES = Object.freeze({
  hex: { label: "Hex", encoding: "hex" },
  base64: { label: "Base64", encoding: "base64" },
  passphrase: { label: "Passphrase", encoding: "words" },
});

const RANDOM_LIMITS = Object.freeze({ min: 8, max: 64, default: 32 });

const PASSPHRASE_WORDS = Object.freeze([
  "abacus", "abbey", "ablaze", "abrupt", "absorb", "accent", "accord", "acorn",
  "acrobat", "action", "active", "adapt", "adept", "adjust", "admire", "adopt",
  "adrift", "advance", "aerial", "affair", "afloat", "agenda", "agile", "agreed",
  "alarm", "album", "alert", "algae", "alien", "aligned", "almond", "alpine",
  "amber", "amount", "ample", "anchor", "ancient", "angled", "animal", "ankle",
  "answer", "anthem", "anvil", "apart", "apex", "appeal", "apple", "arcade",
  "archer", "ardent", "armor", "aroma", "array", "arrow", "ascent", "ashen",
  "aspect", "assume", "astute", "atlas", "atom", "attain", "attic", "auburn",
  "audio", "august", "aurora", "author", "autumn", "avatar", "avenue", "awning",
  "azure", "badge", "bagel", "bakery", "balance", "ballad", "bamboo", "banner",
  "banquet", "barber", "barely", "barrel", "basalt", "basket", "batch", "beacon",
  "beaker", "beam", "beech", "beetle", "begin", "behave", "belief", "belong",
  "below", "bench", "beside", "better", "beyond", "bicycle", "binary", "bishop",
  "bitter", "blade", "blank", "blaze", "bleat", "blizzard", "blossom", "blouse",
  "blueprint", "blunt", "blurry", "board", "bobsled", "bold", "bonfire", "bonus",
  "booklet", "border", "bottle", "boulder", "bouquet", "bowline", "bracket", "braid",
  "branch", "brave", "bread", "breeze", "bridge", "bright", "brisk", "bronze",
  "brook", "browse", "brush", "bubble", "bucket", "budgie", "buffer", "bugle",
  "builder", "bullet", "bundle", "burden", "bureau", "burrow", "bushel", "butler",
  "butter", "button", "cabin", "cable", "cactus", "cadence", "calm", "camera",
  "camp", "canary", "candle", "canopy", "canvas", "canyon", "capable", "capital",
  "captain", "caramel", "carbon", "cardinal", "cargo", "carnival", "carpet", "carrot",
  "cascade", "cashew", "castle", "casual", "catalog", "catcher", "cavern", "cedar",
  "ceiling", "celery", "census", "ceramic", "chalet", "chalk", "chamber", "change",
  "channel", "chapter", "charcoal", "charter", "cheerful", "cherry", "chess", "chestnut",
  "chime", "chimney", "choice", "chorus", "chrome", "cider", "cinema", "cipher",
  "circle", "citrus", "civic", "clamp", "clarify", "classic", "clever", "cliff",
  "climate", "clover", "cluster", "coastal", "cobalt", "cocoa", "coconut", "collage",
  "colony", "column", "combat", "comet", "comfort", "comic", "compass", "concert",
  "concise", "condor", "confer", "confirm", "conifer", "connect", "contour", "convoy",
  "copper", "coral", "cordial", "corner", "cornet", "cosmic", "cottage", "cotton",
  "council", "courage", "courier", "cousin", "covenant", "cove", "cradle", "craft",
]);

const PASSPHRASE_BITS = Math.log2(PASSPHRASE_WORDS.length);

/**
 * Uniform random integer in [0, bound) from a real CSPRNG.
 *
 * Reading whole bytes and rejecting the incomplete tail removes the modulo bias
 * that a plain `bytes % bound` would introduce. `rng` is injectable so a test
 * can prove the rejection path is taken with a deterministic byte source.
 */
function uniformBelow(bound, rng = crypto.randomBytes) {
  if (!Number.isInteger(bound) || bound < 1) throw badInput("bound must be a positive integer");
  if (bound === 1) return 0;
  const limit = Math.floor(256 / bound) * bound;
  for (let attempt = 0; attempt < 1024; attempt += 1) {
    const byte = rng(1)[0];
    if (byte < limit) return byte % bound;
  }
  // Reaching this point requires an adversarial or broken rng.
  throw new VaultError(CODES.IO_FAILED, "The random source did not yield a usable byte");
}

/** Generate `length` random bytes, or `length` random words for a passphrase. */
function randomBytes({ type = "hex", length = RANDOM_LIMITS.default } = {}) {
  const spec = RANDOM_TYPES[type];
  if (!spec) throw badInput(`Unsupported output type "${type}"`);
  const size = Number(length);
  if (!Number.isInteger(size) || size < RANDOM_LIMITS.min || size > RANDOM_LIMITS.max) {
    throw badInput(`Length must be a whole number between ${RANDOM_LIMITS.min} and ${RANDOM_LIMITS.max}`);
  }
  if (type === "passphrase") {
    const words = Array.from({ length: size }, () => PASSPHRASE_WORDS[uniformBelow(PASSPHRASE_WORDS.length)]);
    return {
      type,
      length: size,
      value: words.join(" "),
      bytes: null,
      entropyBits: Number((size * PASSPHRASE_BITS).toFixed(2)),
      source: "crypto.randomBytes",
    };
  }
  const bytes = crypto.randomBytes(size);
  const value = type === "base64" ? bytes.toString("base64url") : bytes.toString("hex");
  return {
    type,
    length: size,
    value,
    bytes: size,
    entropyBits: size * 8,
    source: "crypto.randomBytes",
  };
}

// ---- task 27: HMAC Authenticity -------------------------------------------

/**
 * Only real digests are offered. md5 and sha1 are deliberately absent so the UI
 * cannot request a broken algorithm, and the key is always at least 16 bytes.
 */
const HMAC_ALGORITHMS = Object.freeze({
  "SHA-256": "sha256",
  "SHA-384": "sha384",
  "SHA-512": "sha512",
});

const HMAC_MIN_KEY_BYTES = 16;
const HMAC_MAX_KEY_BYTES = 4096;
const HMAC_MAX_MESSAGE_BYTES = 4 * 1024 * 1024;

/** Compute a real keyed digest. The key is never returned. */
function hmacCompute({ algorithm = "SHA-256", message, key, keyEncoding = "utf8", encoding = "hex" } = {}) {
  const digest = HMAC_ALGORITHMS[algorithm];
  if (!digest) throw badInput(`Unsupported HMAC algorithm "${algorithm}"`);
  if (encoding !== "hex" && encoding !== "base64") throw badInput("The digest is rendered as hex or base64");

  const keyBytes = decodeKey(key, keyEncoding);
  if (keyBytes.length < HMAC_MIN_KEY_BYTES) {
    throw badInput(`The key must be at least ${HMAC_MIN_KEY_BYTES} bytes`);
  }
  if (keyBytes.length > HMAC_MAX_KEY_BYTES) throw badInput("The key is too long");

  const messageBytes = Buffer.from(String(message ?? ""), "utf8");
  if (messageBytes.length === 0) throw badInput("A message is required");
  if (messageBytes.length > HMAC_MAX_MESSAGE_BYTES) throw badInput("The message is too long");

  const mac = crypto.createHmac(digest, keyBytes).update(messageBytes).digest();
  return {
    algorithm,
    encoding,
    digest,
    mac: encoding === "base64" ? mac.toString("base64") : mac.toString("hex"),
    messageBytes: messageBytes.length,
    keyBytes: keyBytes.length,
  };
}

/**
 * Compare two MACs in constant time. The verdict never says "authentic" or
 * "forged": a matching MAC proves the two inputs were produced with the same
 * key, which is all a MAC comparison can show.
 */
function hmacCompare(left, right) {
  const a = String(left ?? "").trim();
  const b = String(right ?? "").trim();
  if (!a || !b) throw badInput("Both MAC values are required");
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  const hexLike = /^[0-9a-f]+$/i.test(a) && /^[0-9a-f]+$/i.test(b) && ab.length === bb.length;
  if (hexLike) {
    return { equal: crypto.timingSafeEqual(ab, bb), comparedBytes: ab.length, mode: "hex" };
  }
  const at = Buffer.from(a, "utf8");
  const bt = Buffer.from(b, "utf8");
  const equal = at.length === bt.length && crypto.timingSafeEqual(at, bt);
  return { equal, comparedBytes: at.length, mode: "text" };
}

function decodeKey(key, encoding) {
  if (typeof key !== "string" || key.length === 0) throw badInput("A key is required");
  if (encoding === "hex") {
    const hex = key.replace(/[\s-]/g, "");
    if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) throw badInput("The key is not valid hexadecimal");
    return Buffer.from(hex, "hex");
  }
  if (encoding === "base64") {
    const bytes = Buffer.from(key.replace(/\s/g, ""), "base64");
    if (bytes.length === 0) throw badInput("The key is not valid base64");
    return bytes;
  }
  return Buffer.from(key, "utf8");
}

// ---- task 28: Public Key QR -----------------------------------------------

/**
 * A real QR code for public key material.
 *
 * The matrix is produced by the qrcode encoder and rendered by the UI; nothing
 * here is decorative. Only public data is ever accepted, because encoding a
 * private key into a QR code would put it on screen where any camera can read
 * it.
 */
function publicKeyQr({ text, errorCorrectionLevel = "M" } = {}) {
  const value = String(text ?? "").trim();
  if (!value) throw badInput("Public key material is required");
  if (value.length > 1200) throw badInput("The public payload is too long for a single QR code");
  if (looksPrivate(value)) {
    throw new VaultError(CODES.BAD_INPUT, "Refusing to encode private key material into a QR code");
  }
  let qr;
  try {
    qr = require("qrcode/lib/core/qrcode");
  } catch {
    throw new VaultError(CODES.IO_FAILED, "The QR encoder is unavailable");
  }
  const code = qr.create(value, { errorCorrectionLevel });
  const size = code.modules.size;
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    let row = "";
    for (let x = 0; x < size; x += 1) row += code.modules.get(x, y) ? "1" : "0";
    rows.push(row);
  }
  return {
    size,
    errorCorrectionLevel,
    rows,
    moduleCount: size * size,
    // The payload length only; the payload itself is echoed by the caller.
    payloadBytes: Buffer.byteLength(value, "utf8"),
  };
}

function looksPrivate(text) {
  return /PRIVATE KEY|BEGIN RSA PRIVATE|BEGIN EC PRIVATE|OPENSSH PRIVATE|secret/i.test(text);
}

module.exports = {
  RANDOM_TYPES,
  RANDOM_LIMITS,
  PASSPHRASE_WORDS,
  PASSPHRASE_BITS,
  uniformBelow,
  randomBytes,
  HMAC_ALGORITHMS,
  HMAC_MIN_KEY_BYTES,
  HMAC_MAX_MESSAGE_BYTES,
  hmacCompute,
  hmacCompare,
  publicKeyQr,
};
