"use strict";

/**
 * Inspection and authenticity primitives (tasks 17-20).
 *
 * These are thin, pure wrappers over Node's OpenSSL bindings so the service
 * layer can expose real hashing, real detached signatures and real X.509
 * parsing instead of placeholder text. Nothing here holds vault state.
 */
const crypto = require("crypto");
const fsp = require("fs/promises");

const { VaultError, CODES } = require("./errors");

// Only these digests are offered. md5/sha1 are deliberately absent so a caller
// cannot request a broken algorithm through the UI.
const DIGESTS = Object.freeze({
  "SHA-256": "sha256",
  "SHA-384": "sha384",
  "SHA-512": "sha512",
  "SHA3-256": "sha3-256",
  "SHA3-512": "sha3-512",
});

// Signing algorithms mapped to the Node/OpenSSL digest used for each key type.
const SIGN_ALGORITHMS = Object.freeze({
  ED25519: { type: "ed25519", digest: null },
  "P-256": { type: "ec", digest: "sha256" },
  "P-384": { type: "ec", digest: "sha384" },
  RSA_2048: { type: "rsa", digest: "sha256" },
  RSA_4096: { type: "rsa", digest: "sha512" },
});

function badInput(message) {
  return new VaultError(CODES.BAD_INPUT, message);
}

function digestFor(name) {
  const digest = DIGESTS[name];
  if (!digest) throw badInput(`Unsupported digest "${name}"`);
  return digest;
}

/** Hash a buffer or a file with a supported digest. */
async function hash({ algorithm = "SHA-256", text, inputPath }) {
  const digest = digestFor(algorithm);
  if (typeof text === "string" && text.length > 0) {
    return {
      algorithm,
      digest: crypto.createHash(digest).update(Buffer.from(text, "utf8")).digest("hex"),
      size: Buffer.byteLength(text, "utf8"),
    };
  }
  if (typeof inputPath === "string" && inputPath.length > 0) {
    let bytes;
    try {
      bytes = await fsp.readFile(inputPath);
    } catch (err) {
      if (err.code === "ENOENT") throw new VaultError(CODES.NOT_FOUND, "The file was not found");
      throw new VaultError(CODES.IO_FAILED, "The file could not be read");
    }
    return {
      algorithm,
      digest: crypto.createHash(digest).update(bytes).digest("hex"),
      size: bytes.length,
    };
  }
  throw badInput("Provide text or a file path to hash");
}

/**
 * Constant-time comparison of two hex digests. Returns a verdict object rather
 * than a bare boolean so the caller cannot accidentally treat a length mismatch
 * as "not equal by timing" instead of "different input".
 */
function compareDigests(a, b) {
  const left = String(a || "").trim().toLowerCase();
  const right = String(b || "").trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(left) || !/^[0-9a-f]+$/.test(right)) {
    throw badInput("Both digests must be hexadecimal");
  }
  const lb = Buffer.from(left, "hex");
  const rb = Buffer.from(right, "hex");
  const equal = lb.length === rb.length && crypto.timingSafeEqual(lb, rb);
  return { equal, left, right, lengthMatch: lb.length === rb.length };
}

/** Produce a detached signature over text or a file. */
async function sign({ algorithm, privatePem, text, inputPath }) {
  const spec = SIGN_ALGORITHMS[algorithm];
  if (!spec) throw badInput(`Unsupported signing algorithm "${algorithm}"`);
  if (typeof privatePem !== "string" || !privatePem.includes("PRIVATE KEY")) {
    throw badInput("A private key in PEM form is required to sign");
  }
  const payload = await payloadBytes({ text, inputPath });
  let signature;
  try {
    signature = crypto.sign(spec.digest, payload, crypto.createPrivateKey(privatePem));
  } catch {
    throw badInput("The private key does not match the chosen algorithm");
  }
  return {
    algorithm,
    digest: spec.digest || "none",
    signature: signature.toString("base64"),
    size: payload.length,
  };
}

/** Verify a detached signature. Never throws for a bad signature; it reports. */
async function verify({ algorithm, publicPem, signature, text, inputPath }) {
  const spec = SIGN_ALGORITHMS[algorithm];
  if (!spec) throw badInput(`Unsupported signing algorithm "${algorithm}"`);
  if (typeof publicPem !== "string" || !publicPem.includes("PUBLIC KEY")) {
    throw badInput("A public key in PEM form is required to verify");
  }
  let sigBytes;
  try {
    sigBytes = Buffer.from(String(signature || ""), "base64");
  } catch {
    throw badInput("The signature is not valid base64");
  }
  if (sigBytes.length === 0) throw badInput("A signature is required");
  const payload = await payloadBytes({ text, inputPath });
  let valid = false;
  try {
    valid = crypto.verify(spec.digest, payload, crypto.createPublicKey(publicPem), sigBytes);
  } catch {
    valid = false;
  }
  return { valid, algorithm, size: payload.length };
}

/** Parse an X.509 certificate and return the fields a user can act on. */
function inspectCertificate(pem) {
  const text = String(pem || "").trim();
  if (!text.includes("BEGIN CERTIFICATE")) {
    throw badInput("That does not look like a PEM certificate");
  }
  let cert;
  try {
    cert = new crypto.X509Certificate(text);
  } catch {
    throw new VaultError(CODES.INTEGRITY_FAILED, "The certificate could not be parsed");
  }

  const now = Date.now();
  const notBefore = Date.parse(cert.validFrom);
  const notAfter = Date.parse(cert.validTo);
  const expired = Number.isFinite(notAfter) && notAfter < now;
  const notYetValid = Number.isFinite(notBefore) && notBefore > now;

  // A self-signed certificate verifies against its own key. This is reported
  // as a fact, not as "trusted": KnouxCrypt has no CA store and never claims
  // that a chain is trusted.
  let selfSigned = false;
  try {
    selfSigned = cert.verify(cert.publicKey);
  } catch {
    selfSigned = false;
  }

  const san = cert.subjectAltName
    ? cert.subjectAltName.split(",").map((part) => part.trim()).filter(Boolean)
    : [];

  return {
    subject: cert.subject,
    issuer: cert.issuer,
    serialNumber: cert.serialNumber,
    validFrom: cert.validFrom,
    validTo: cert.validTo,
    expired,
    notYetValid,
    selfSigned,
    fingerprint256: cert.fingerprint256,
    subjectAltName: san,
    keyType: cert.publicKey.asymmetricKeyType || "unknown",
    keySize: cert.publicKey.asymmetricKeyDetails?.modulusLength || null,
    isCA: cert.ca === true,
  };
}

/**
 * Write a report document atomically with owner-only permissions. Used by the
 * certificate and fingerprint screens to save a real, self-describing record
 * instead of leaving the parsed values only on screen.
 */
async function exportReport({ report, outputPath, kind }) {
  if (!report || typeof report !== "object") throw badInput("A report object is required");
  if (typeof outputPath !== "string" || !outputPath.trim()) throw badInput("An output path is required");
  const target = require("path").resolve(outputPath);
  const doc = JSON.stringify(
    { kind, format: "KNXREPORT01", version: 1, exportedAt: new Date().toISOString(), report },
    null,
    2,
  );
  const tmp = `${target}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  try {
    await fsp.writeFile(tmp, doc, { mode: 0o600 });
    await fsp.rename(tmp, target);
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    if (err.code === "ENOENT") throw new VaultError(CODES.NOT_FOUND, "The output folder does not exist");
    throw new VaultError(CODES.IO_FAILED, "The report could not be written");
  }
  return { exported: true, outputPath: target, kind };
}

/**
 * Fingerprint of a public key or certificate, in the same shape a user reads
 * aloud: SHA-256 over the DER encoding, grouped in fours.
 */
function fingerprintOf(pem) {
  const text = String(pem || "").trim();
  if (!text.includes("-----BEGIN")) throw badInput("A PEM public key or certificate is required");
  let der;
  try {
    der = text.includes("CERTIFICATE")
      ? new crypto.X509Certificate(text).raw
      : crypto.createPublicKey(text).export({ type: "spki", format: "der" });
  } catch {
    throw badInput("The PEM material could not be parsed");
  }
  const hex = crypto.createHash("sha256").update(der).digest("hex");
  const groups = hex.match(/.{1,4}/g) || [];
  return {
    fingerprint: hex,
    groups,
    grouped: groups.join(" "),
    short: groups.slice(0, 8).join(" "),
  };
}

/**
 * Compare two fingerprints group by group. The comparison itself is
 * constant-time; `firstMismatch` is reported only so the UI can show where the
 * two diverge, and it is derived from the same bytes that were compared.
 */
function compareFingerprints(left, right) {
  const normalize = (value) => String(value || "").replace(/[^0-9a-fA-F]/g, "").toLowerCase();
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) throw badInput("Both fingerprints are required");
  if (!/^[0-9a-f]+$/.test(a) || !/^[0-9a-f]+$/.test(b)) throw badInput("Fingerprints must be hexadecimal");

  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  const equal = ab.length === bb.length && crypto.timingSafeEqual(ab, bb);

  let firstMismatch = -1;
  const limit = Math.min(ab.length, bb.length);
  for (let i = 0; i < limit; i += 1) {
    if (ab[i] !== bb[i]) {
      firstMismatch = i;
      break;
    }
  }
  const groupLength = 2; // four hex characters per displayed group
  return {
    equal,
    left: a,
    right: b,
    lengthMatch: ab.length === bb.length,
    matchedGroups: firstMismatch === -1 ? Math.floor(limit / groupLength) : Math.floor(firstMismatch / groupLength),
    totalGroups: Math.floor(Math.min(ab.length, bb.length) / groupLength),
    firstMismatch,
  };
}

async function payloadBytes({ text, inputPath }) {
  if (typeof text === "string" && text.length > 0) return Buffer.from(text, "utf8");
  if (typeof inputPath === "string" && inputPath.length > 0) {
    try {
      return await fsp.readFile(inputPath);
    } catch (err) {
      if (err.code === "ENOENT") throw new VaultError(CODES.NOT_FOUND, "The file was not found");
      throw new VaultError(CODES.IO_FAILED, "The file could not be read");
    }
  }
  throw badInput("Provide text or a file path");
}

module.exports = {
  DIGESTS,
  SIGN_ALGORITHMS,
  hash,
  compareDigests,
  sign,
  verify,
  inspectCertificate,
  fingerprintOf,
  compareFingerprints,
  exportReport,
};
