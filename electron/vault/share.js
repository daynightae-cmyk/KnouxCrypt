"use strict";

/**
 * Encrypted package sharing (task 16).
 *
 * A package is a small JSON envelope that carries an authenticated vault
 * container (the same AES-256-GCM format used everywhere else) plus the key
 * material needed to open it. Two models are supported and must be chosen
 * explicitly:
 *
 *   shared-secret  — the content key is derived from a passphrase with
 *                    PBKDF2-HMAC-SHA256. Anyone who knows the passphrase can
 *                    open the package.
 *   recipient-key  — a random content key is wrapped with the recipient's RSA
 *                    public key (RSA-OAEP). Only the matching private key can
 *                    open it, and the recipient fingerprint is recorded so the
 *                    sender can confirm they used the right key.
 *
 * Expiry is advisory and enforced on open: an offline copy that has already
 * been exported cannot be forcibly recalled, and this module says so rather
 * than pretending otherwise.
 */
const crypto = require("crypto");

const { VaultError, CODES, badInput } = require("./errors");
const { KDF, SALT_LEN, randomSalt, deriveMasterKey } = require("./kdf");

const SHARE_FORMAT = "KNXSHARE01";
const SHARE_VERSION = 1;
const CONTENT_KEY_LEN = 32;
const DEFAULT_ITERATIONS = 600000;
const MAX_ENVELOPE_BYTES = 32 * 1024 * 1024;

function fingerprintOfPublicPem(publicPem) {
  return crypto.createHash("sha256").update(publicPem).digest("hex");
}

function serialise(envelope) {
  return Buffer.from(JSON.stringify(envelope), "utf8");
}

function normaliseEnvelope(input) {
  const envelope = Buffer.isBuffer(input) || typeof input === "string" ? parseEnvelope(input) : input;
  if (!envelope || typeof envelope !== "object") throw badInput("A share package is required");
  if (envelope.format !== SHARE_FORMAT) {
    throw new VaultError(CODES.UNSUPPORTED_FORMAT, "Not a KnouxCrypt share package");
  }
  if (envelope.version !== SHARE_VERSION) {
    throw new VaultError(CODES.UNSUPPORTED_FORMAT, `Unsupported share version ${envelope.version}`);
  }
  return envelope;
}

function parseEnvelope(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(String(input), "utf8");
  if (bytes.length > MAX_ENVELOPE_BYTES) throw badInput("The share package is too large");
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new VaultError(CODES.INTEGRITY_FAILED, "The share package is not valid JSON");
  }
}

function assertNotExpired(envelope, atMs = Date.now()) {
  if (!envelope.expiresAt) return;
  const expires = Date.parse(envelope.expiresAt);
  if (Number.isNaN(expires)) {
    throw new VaultError(CODES.INTEGRITY_FAILED, "The share package has an invalid expiry");
  }
  if (atMs >= expires) {
    throw new VaultError(CODES.BAD_INPUT, "The share package has expired");
  }
}

class ShareService {
  constructor(options = {}) {
    this.engine = options.engine;
  }

  _container(plaintext, rawKey) {
    const { bytes } = this.engine.encryptBuffer(plaintext, { rawKey });
    return bytes;
  }

  _openContainer(containerBase64, rawKey) {
    const sealed = Buffer.from(containerBase64, "base64");
    const { plaintext } = this.engine.decryptBuffer(sealed, { rawKey });
    return plaintext;
  }

  /**
   * Build a shared-secret package. The passphrase is never stored; only a salt
   * and the iteration count are, so the same passphrase can re-derive the key.
   */
  createSharedSecret({ passphrase, payload, expiresAt = null, sender = "" } = {}) {
    if (typeof passphrase !== "string" || passphrase.length < 8) {
      throw badInput("A share passphrase must be at least 8 characters");
    }
    const body = normalisePayload(payload);
    const salt = randomSalt();
    const rawKey = deriveMasterKey(passphrase, salt, {
      kdfId: KDF.PBKDF2_SHA256,
      iterations: DEFAULT_ITERATIONS,
    });
    const container = this._container(body.bytes, rawKey);
    const envelope = {
      format: SHARE_FORMAT,
      version: SHARE_VERSION,
      model: "shared-secret",
      createdAt: new Date().toISOString(),
      expiresAt: normaliseExpiry(expiresAt),
      sender: String(sender || "").slice(0, 128),
      payloadType: body.type,
      kdf: { id: "pbkdf2-sha256", iterations: DEFAULT_ITERATIONS, salt: salt.toString("base64") },
      container: container.toString("base64"),
    };
    return { envelope, bytes: serialise(envelope), fingerprint: crypto.createHash("sha256").update(container).digest("hex") };
  }

  /** Build a package for a specific RSA public key. */
  createForRecipient({ recipientPublicPem, payload, expiresAt = null, sender = "" } = {}) {
    if (typeof recipientPublicPem !== "string" || !/BEGIN PUBLIC KEY/.test(recipientPublicPem)) {
      throw badInput("A recipient RSA public key in SPKI PEM form is required");
    }
    const body = normalisePayload(payload);
    let publicKey;
    try {
      publicKey = crypto.createPublicKey(recipientPublicPem);
    } catch {
      throw badInput("The recipient public key could not be read");
    }
    if (publicKey.asymmetricKeyType !== "rsa") {
      throw badInput("Only RSA recipient keys are supported for key-wrapped packages");
    }

    const contentKey = crypto.randomBytes(CONTENT_KEY_LEN);
    const container = this._container(body.bytes, contentKey);
    const wrapped = crypto.publicEncrypt(
      { key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      contentKey,
    );
    const envelope = {
      format: SHARE_FORMAT,
      version: SHARE_VERSION,
      model: "recipient-key",
      createdAt: new Date().toISOString(),
      expiresAt: normaliseExpiry(expiresAt),
      sender: String(sender || "").slice(0, 128),
      payloadType: body.type,
      recipientFingerprint: fingerprintOfPublicPem(recipientPublicPem),
      wrappedKey: wrapped.toString("base64"),
      container: container.toString("base64"),
    };
    return { envelope, bytes: serialise(envelope), fingerprint: crypto.createHash("sha256").update(container).digest("hex") };
  }

  /** Read envelope metadata without opening the package. */
  inspect(input) {
    const envelope = normaliseEnvelope(input);
    return {
      format: envelope.format,
      version: envelope.version,
      model: envelope.model,
      createdAt: envelope.createdAt,
      expiresAt: envelope.expiresAt || null,
      expired: envelope.expiresAt ? Date.now() >= Date.parse(envelope.expiresAt) : false,
      sender: envelope.sender || "",
      recipientFingerprint: envelope.recipientFingerprint || null,
      requires: envelope.model === "shared-secret" ? "passphrase" : "recipient-private-key",
    };
  }

  /** Open a package. Exactly one of `passphrase` or `privatePem` is required. */
  open(input, credential = {}) {
    const envelope = normaliseEnvelope(input);
    assertNotExpired(envelope);

    let rawKey;
    if (envelope.model === "shared-secret") {
      if (typeof credential.passphrase !== "string" || credential.passphrase.length === 0) {
        throw badInput("This package requires its share passphrase");
      }
      const salt = Buffer.from(envelope.kdf?.salt || "", "base64");
      if (salt.length !== SALT_LEN) throw new VaultError(CODES.INTEGRITY_FAILED, "The package salt is missing");
      rawKey = deriveMasterKey(credential.passphrase, salt, {
        kdfId: KDF.PBKDF2_SHA256,
        iterations: envelope.kdf.iterations || DEFAULT_ITERATIONS,
      });
    } else if (envelope.model === "recipient-key") {
      if (typeof credential.privatePem !== "string" || !/BEGIN PRIVATE KEY/.test(credential.privatePem)) {
        throw badInput("This package requires the recipient private key");
      }
      let privateKey;
      try {
        privateKey = crypto.createPrivateKey(credential.privatePem);
      } catch {
        throw badInput("The recipient private key could not be read");
      }
      const wrapped = Buffer.from(envelope.wrappedKey || "", "base64");
      try {
        rawKey = crypto.privateDecrypt(
          { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
          wrapped,
        );
      } catch {
        throw new VaultError(CODES.AUTH_FAILED, "This package was not addressed to that key");
      }
    } else {
      throw new VaultError(CODES.UNSUPPORTED_FORMAT, `Unsupported share model ${envelope.model}`);
    }

    // A wrong passphrase or key surfaces here as a container auth failure.
    const plaintext = this._openContainer(envelope.container, rawKey);
    const payload = decodePayload(plaintext, envelope.payloadType);
    return {
      model: envelope.model,
      sender: envelope.sender || "",
      createdAt: envelope.createdAt,
      expiresAt: envelope.expiresAt || null,
      payloadType: envelope.payloadType || "text",
      payload,
    };
  }
}

function normalisePayload(payload) {
  if (typeof payload === "string") {
    if (payload.length === 0) throw badInput("The package payload must not be empty");
    return { type: "text", bytes: Buffer.from(payload, "utf8") };
  }
  if (Buffer.isBuffer(payload)) {
    if (payload.length === 0) throw badInput("The package payload must not be empty");
    return { type: "bytes", bytes: payload };
  }
  if (payload && typeof payload === "object") {
    return { type: "json", bytes: Buffer.from(JSON.stringify(payload), "utf8") };
  }
  throw badInput("The package payload must be text, bytes or an object");
}

/** Decode the container plaintext according to the type recorded at creation. */
function decodePayload(plaintext, payloadType) {
  const text = plaintext.toString("utf8");
  if (payloadType === "json") {
    try {
      return JSON.parse(text);
    } catch {
      throw new VaultError(CODES.INTEGRITY_FAILED, "The package payload is not valid JSON");
    }
  }
  if (payloadType === "bytes") return plaintext;
  return text;
}

function normaliseExpiry(expiresAt) {
  if (expiresAt === null || expiresAt === undefined || expiresAt === "") return null;
  const parsed = typeof expiresAt === "number" ? expiresAt : Date.parse(expiresAt);
  if (Number.isNaN(parsed)) throw badInput("The expiry must be a valid date");
  if (parsed <= Date.now()) throw badInput("The expiry must be in the future");
  return new Date(parsed).toISOString();
}

module.exports = { ShareService, SHARE_FORMAT, SHARE_VERSION, parseEnvelope };
