"use strict";

/**
 * Expiring Secret Capsule (task 41).
 *
 * A real, authenticated, expiring secret container that lives only on this
 * device. The secret is encrypted with AES-256-GCM under a key derived from a
 * capsule passphrase via PBKDF2-HMAC-SHA256 (600k iterations), then sealed into
 * a small JSON envelope with an explicit expiry and an access counter.
 *
 * What this is:
 *   - Real authenticated encryption with real key derivation and a real
 *     tamper-evident envelope (GCM tag + a versioned header).
 *   - Real expiry and access-limit enforcement: once expired or exhausted, the
 *     open path refuses with a typed error.
 *
 * What this is NOT (and the UI says so):
 *   - Not remote. There is no server, no link, no revocation of copies. Once the
 *     envelope text leaves this device it cannot be recalled, and a recipient
 *     who has the passphrase can keep a copy. "Revocation" only means "this
 *     device will refuse to open it again".
 *   - Not a replacement for the vault container format; it is a self-contained
 *     one-shot container for a single short secret.
 */
const crypto = require("crypto");
const fsp = require("fs/promises");
const path = require("path");

const { VaultError, CODES, badInput } = require("./errors");

const CAPSULE_FORMAT = "KNXCAP01";
const CAPSULE_VERSION = 1;
const KDF_ITERATIONS = 600000;
const SALT_LEN = 16;
const IV_LEN = 12;
const KEY_LEN = 32;
const MAX_SECRET_BYTES = 64 * 1024;

const EXPIRY_CHOICES = Object.freeze([
  { id: "10m", label: "10 minutes", seconds: 600 },
  { id: "1h", label: "1 hour", seconds: 3600 },
  { id: "1d", label: "1 day", seconds: 86400 },
  { id: "7d", label: "7 days", seconds: 604800 },
]);
const MAX_EXPIRY_SECONDS = 30 * 24 * 3600;
const ACCESS_CHOICES = Object.freeze([1, 3, 5, 10]);

function deriveKey(passphrase, salt) {
  if (typeof passphrase !== "string" || passphrase.length === 0) {
    throw badInput("A capsule passphrase is required");
  }
  return crypto.pbkdf2Sync(passphrase, salt, KDF_ITERATIONS, KEY_LEN, "sha256");
}

class SecretCapsule {
  constructor(options = {}) {
    this.now = options.now || (() => Date.now());
  }

  choices() {
    return { expiry: EXPIRY_CHOICES.map((e) => ({ ...e })), accessLimits: [...ACCESS_CHOICES], maxSecretBytes: MAX_SECRET_BYTES };
  }

  /**
   * Build a sealed capsule envelope. Returns the envelope text (safe to hand to
   * the user) plus non-secret metadata. The secret itself is never returned.
   */
  create({ secret, passphrase, expiry = "1h", maxAccess = 1, label = "Capsule" } = {}) {
    if (typeof secret !== "string" || secret.length === 0) throw badInput("A secret is required");
    if (Buffer.byteLength(secret, "utf8") > MAX_SECRET_BYTES) throw badInput("The secret is too large for a capsule");
    const choice = EXPIRY_CHOICES.find((e) => e.id === expiry);
    if (!choice) throw badInput(`Unknown expiry "${expiry}"`);
    if (!ACCESS_CHOICES.includes(maxAccess)) throw badInput("Choose a supported access limit");

    const salt = crypto.randomBytes(SALT_LEN);
    const iv = crypto.randomBytes(IV_LEN);
    const key = deriveKey(passphrase, salt);
    const createdAt = this.now();
    const expiresAt = createdAt + choice.seconds * 1000;
    const header = {
      format: CAPSULE_FORMAT,
      version: CAPSULE_VERSION,
      label: String(label).slice(0, 64),
      createdAt: new Date(createdAt).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      maxAccess,
      kdf: { algorithm: "PBKDF2-HMAC-SHA256", iterations: KDF_ITERATIONS, saltHex: salt.toString("hex") },
      cipher: { algorithm: "AES-256-GCM", ivHex: iv.toString("hex") },
    };
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(JSON.stringify({ ...header, aad: "knoux-capsule-v1" }), "utf8"));
    const ciphertext = Buffer.concat([cipher.update(Buffer.from(secret, "utf8")), cipher.final()]);
    const tag = cipher.getAuthTag();
    key.fill(0);

    const envelope = { header, ciphertextB64: ciphertext.toString("base64"), tagB64: tag.toString("base64"), accessCount: 0 };
    return {
      format: CAPSULE_FORMAT,
      envelopeText: JSON.stringify(envelope),
      label: header.label,
      createdAt: header.createdAt,
      expiresAt: header.expiresAt,
      maxAccess,
      secretBytes: Buffer.byteLength(secret, "utf8"),
      remoteRevocable: false,
    };
  }

  /** Parse and structurally validate an envelope without opening it. */
  inspect(envelopeText) {
    let envelope;
    try {
      envelope = typeof envelopeText === "string" ? JSON.parse(envelopeText) : envelopeText;
    } catch {
      throw new VaultError(CODES.BAD_INPUT, "The capsule is not valid JSON");
    }
    if (!envelope || envelope.header?.format !== CAPSULE_FORMAT) {
      throw new VaultError(CODES.NOT_A_VAULT, "That is not a KnouxCrypt capsule");
    }
    const header = envelope.header;
    const expired = Date.parse(header.expiresAt) <= this.now();
    return {
      format: header.format,
      version: header.version,
      label: header.label,
      createdAt: header.createdAt,
      expiresAt: header.expiresAt,
      maxAccess: header.maxAccess,
      accessCount: Number(envelope.accessCount) || 0,
      expired,
      exhausted: (Number(envelope.accessCount) || 0) >= header.maxAccess,
      kdf: header.kdf.algorithm,
      cipher: header.cipher.algorithm,
    };
  }

  /**
   * Open a capsule with its passphrase. Enforces expiry and access limit and
   * authenticates the ciphertext. Returns the secret once and increments the
   * access counter in the returned envelope text.
   */
  open(envelopeText, passphrase) {
    const info = this.inspect(envelopeText);
    if (info.expired) throw new VaultError(CODES.AUTH_FAILED, "This capsule has expired");
    if (info.exhausted) throw new VaultError(CODES.AUTH_FAILED, "This capsule has reached its access limit");

    const envelope = typeof envelopeText === "string" ? JSON.parse(envelopeText) : envelopeText;
    const salt = Buffer.from(envelope.header.kdf.saltHex, "hex");
    const iv = Buffer.from(envelope.header.cipher.ivHex, "hex");
    if (salt.length !== SALT_LEN || iv.length !== IV_LEN) {
      throw new VaultError(CODES.INTEGRITY_FAILED, "The capsule header is malformed");
    }
    const key = deriveKey(passphrase, salt);
    try {
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAAD(Buffer.from(JSON.stringify({ ...envelope.header, aad: "knoux-capsule-v1" }), "utf8"));
      decipher.setAuthTag(Buffer.from(envelope.tagB64, "base64"));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertextB64, "base64")), decipher.final()]);
      const updated = { ...envelope, accessCount: (Number(envelope.accessCount) || 0) + 1 };
      return {
        secret: plaintext.toString("utf8"),
        remainingAccess: Math.max(0, envelope.header.maxAccess - updated.accessCount),
        envelopeText: JSON.stringify(updated),
        remoteRevocable: false,
      };
    } catch (err) {
      if (err instanceof VaultError) throw err;
      throw new VaultError(CODES.AUTH_FAILED, "The capsule passphrase is wrong or the capsule was altered");
    } finally {
      key.fill(0);
    }
  }

  /** Write a capsule envelope to disk with owner-only permissions. */
  async save({ envelopeText, outputPath } = {}) {
    if (typeof outputPath !== "string" || !outputPath.trim()) throw badInput("An output path is required");
    this.inspect(envelopeText);
    const target = path.resolve(outputPath);
    const tmp = `${target}.${crypto.randomBytes(6).toString("hex")}.tmp`;
    try {
      await fsp.writeFile(tmp, envelopeText, { mode: 0o600 });
      await fsp.rename(tmp, target);
    } catch (err) {
      await fsp.rm(tmp, { force: true }).catch(() => {});
      if (err.code === "ENOENT") throw new VaultError(CODES.NOT_FOUND, "The output folder does not exist");
      throw new VaultError(CODES.IO_FAILED, "The capsule could not be written");
    }
    return { saved: true, outputPath: target };
  }
}

module.exports = { SecretCapsule, CAPSULE_FORMAT, EXPIRY_CHOICES, ACCESS_CHOICES, KDF_ITERATIONS };
