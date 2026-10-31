"use strict";

/**
 * Batch 05 (tasks 17-20) tests: real hashing, detached signatures and X.509
 * certificate parsing, plus the service-level wiring that exposes them.
 *
 * Every case runs against the real Node/OpenSSL implementation; no mocks.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const inspect = require("../electron/vault/inspect");
const { VaultService } = require("../electron/vault/service");
const { VaultSessionManager } = require("../electron/vault/session");
const { VaultEngine } = require("../electron/vault/engine");
const { CODES } = require("../electron/vault/errors");
const { KDF } = require("../electron/vault/kdf");

const PASSWORD = "correct horse battery staple";

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "knoux-b5-"));
}

function codeOf(err) {
  return err && err.code;
}

function setupService() {
  const dir = tmp();
  const manager = new VaultSessionManager({ enrollmentPath: path.join(dir, "e.json") });
  const engine = new VaultEngine({ kdfParams: { kdfId: KDF.RAW_KEY }, chunkSize: 4096 });
  const service = new VaultService({ userDataPath: dir, manager, engine });
  return { dir, service };
}

// -------------------------------------------------------- task 17: hashing ---

test("hash of known text matches the published SHA-256 value", async () => {
  const result = await inspect.hash({ algorithm: "SHA-256", text: "abc" });
  assert.equal(result.digest, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("hash supports every offered digest and refuses md5 and sha1", async () => {
  for (const algorithm of ["SHA-256", "SHA-384", "SHA-512", "SHA3-256", "SHA3-512"]) {
    const result = await inspect.hash({ algorithm, text: "hello" });
    assert.match(result.digest, /^[0-9a-f]+$/);
    assert.ok(result.digest.length >= 64);
  }
  await assert.rejects(() => inspect.hash({ algorithm: "MD5", text: "x" }), (e) => codeOf(e) === CODES.BAD_INPUT);
  await assert.rejects(() => inspect.hash({ algorithm: "SHA-1", text: "x" }), (e) => codeOf(e) === CODES.BAD_INPUT);
});

test("hash of a file matches the hash of its bytes", async () => {
  const dir = tmp();
  const file = path.join(dir, "data.bin");
  const bytes = crypto.randomBytes(5000);
  fs.writeFileSync(file, bytes);
  const fromFile = await inspect.hash({ algorithm: "SHA-256", inputPath: file });
  const fromBytes = crypto.createHash("sha256").update(bytes).digest("hex");
  assert.equal(fromFile.digest, fromBytes);
  assert.equal(fromFile.size, 5000);
});

test("hashing a missing file reports NOT_FOUND", async () => {
  const dir = tmp();
  await assert.rejects(
    () => inspect.hash({ inputPath: path.join(dir, "nope.bin") }),
    (e) => codeOf(e) === CODES.NOT_FOUND,
  );
});

test("hashing with neither text nor path is refused", async () => {
  await assert.rejects(() => inspect.hash({}), (e) => codeOf(e) === CODES.BAD_INPUT);
});

test("digest comparison is exact and rejects non-hex input", () => {
  const a = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  assert.equal(inspect.compareDigests(a, a.toUpperCase()).equal, true);
  assert.equal(inspect.compareDigests(a, "00".repeat(32)).equal, false);
  assert.equal(inspect.compareDigests(a, "ba7816bf").lengthMatch, false);
  assert.throws(() => inspect.compareDigests("zzzz", a), (e) => codeOf(e) === CODES.BAD_INPUT);
});

// ------------------------------------------------------ task 18: signatures ---

test("Ed25519 sign and verify round-trips, and tampering is detected", async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const signed = await inspect.sign({ algorithm: "ED25519", privatePem: privateKey, text: "contract v1" });
  assert.ok(signed.signature.length > 0);

  const good = await inspect.verify({
    algorithm: "ED25519",
    publicPem: publicKey,
    signature: signed.signature,
    text: "contract v1",
  });
  assert.equal(good.valid, true);

  const bad = await inspect.verify({
    algorithm: "ED25519",
    publicPem: publicKey,
    signature: signed.signature,
    text: "contract v2",
  });
  assert.equal(bad.valid, false);
});

test("RSA sign and verify works and a foreign key does not verify", async () => {
  const a = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const b = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const signed = await inspect.sign({ algorithm: "RSA_2048", privatePem: a.privateKey, text: "payload" });
  assert.equal(
    (await inspect.verify({ algorithm: "RSA_2048", publicPem: a.publicKey, signature: signed.signature, text: "payload" })).valid,
    true,
  );
  assert.equal(
    (await inspect.verify({ algorithm: "RSA_2048", publicPem: b.publicKey, signature: signed.signature, text: "payload" })).valid,
    false,
  );
});

test("a garbage signature fails verification instead of throwing", async () => {
  const { publicKey } = crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const result = await inspect.verify({
    algorithm: "ED25519",
    publicPem: publicKey,
    signature: Buffer.from("not a real signature").toString("base64"),
    text: "x",
  });
  assert.equal(result.valid, false);
});

test("signing refuses a non-private key and an unknown algorithm", async () => {
  const { publicKey } = crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  await assert.rejects(
    () => inspect.sign({ algorithm: "ED25519", privatePem: publicKey, text: "x" }),
    (e) => codeOf(e) === CODES.BAD_INPUT,
  );
  await assert.rejects(
    () => inspect.sign({ algorithm: "ROT13", privatePem: "-----BEGIN PRIVATE KEY-----", text: "x" }),
    (e) => codeOf(e) === CODES.BAD_INPUT,
  );
});

test("verifying requires a public key and a signature", async () => {
  await assert.rejects(() => inspect.verify({ algorithm: "ED25519", publicPem: "nope", signature: "AA==", text: "x" }), (e) => codeOf(e) === CODES.BAD_INPUT);
  const { publicKey } = crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  await assert.rejects(() => inspect.verify({ algorithm: "ED25519", publicPem: publicKey, signature: "", text: "x" }), (e) => codeOf(e) === CODES.BAD_INPUT);
});

// ---------------------------------------------------- task 20: certificates ---

function makeCertificate({ selfSigned = true, cn = "knoux.test", expired = false } = {}) {
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  // Node cannot mint certificates without a library, so build a real one with
  // openssl when it is available; otherwise the caller skips.
  const { execFileSync } = require("child_process");
  const dir = tmp();
  const keyFile = path.join(dir, "key.pem");
  const certFile = path.join(dir, "cert.pem");
  fs.writeFileSync(keyFile, privateKey.export({ type: "pkcs8", format: "pem" }));
  // Explicit dates make the expiry case deterministic regardless of the host
  // clock, instead of relying on a negative -days value.
  const dates = expired
    ? ["-not_before", "20200101000000Z", "-not_after", "20210101000000Z"]
    : ["-not_before", "20200101000000Z", "-not_after", "20400101000000Z"];
  try {
    execFileSync("openssl", [
      "req", "-x509", "-new", "-key", keyFile, "-out", certFile,
      ...dates, "-subj", `/CN=${cn}`,
      "-addext", "subjectAltName=DNS:knoux.test,DNS:www.knoux.test",
      "-addext", "basicConstraints=critical,CA:TRUE",
    ], { stdio: "pipe" });
  } catch {
    return null;
  }
  return fs.readFileSync(certFile, "utf8");
}

const CERT = makeCertificate();
const EXPIRED_CERT = makeCertificate({ expired: true });

test("a real certificate is parsed with its subject, SAN and dates", { skip: !CERT }, () => {
  const info = inspect.inspectCertificate(CERT);
  assert.match(info.subject, /knoux\.test/);
  assert.ok(info.fingerprint256.length > 0);
  assert.ok(info.subjectAltName.some((name) => name.includes("knoux.test")));
  assert.equal(info.keyType, "rsa");
  assert.equal(info.expired, false);
  assert.equal(info.selfSigned, true);
});

test("an expired certificate is reported as expired", { skip: !EXPIRED_CERT }, () => {
  const info = inspect.inspectCertificate(EXPIRED_CERT);
  assert.equal(info.expired, true);
});

test("a non-PEM string is refused, and a PEM with bad content is refused", () => {
  assert.throws(() => inspect.inspectCertificate("hello world"), (e) => codeOf(e) === CODES.BAD_INPUT);
  assert.throws(
    () => inspect.inspectCertificate("-----BEGIN CERTIFICATE-----\nnot base64\n-----END CERTIFICATE-----"),
    (e) => [CODES.INTEGRITY_FAILED, CODES.BAD_INPUT].includes(codeOf(e)),
  );
});

// --------------------------------------------------------- service wiring ----

test("hashCompute works without an unlocked vault", async () => {
  const { service } = setupService();
  const res = await service.hashCompute({ algorithm: "SHA-256", text: "abc" });
  assert.equal(res.digest, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("hashCompare reports match and mismatch", async () => {
  const { service } = setupService();
  const a = await service.hashCompute({ algorithm: "SHA-256", text: "abc" });
  assert.equal(service.hashCompare(a.digest, a.digest).equal, true);
  assert.equal(service.hashCompare(a.digest, "00".repeat(32)).equal, false);
});

test("sign then verify with a stored Ed25519 key round-trips", async () => {
  const { service } = setupService();
  const { sessionId } = await service.enroll(PASSWORD);
  const key = await service.keyGenerate(sessionId, { algorithm: "ED25519", name: "Signer" });

  const signed = await service.signatureSign(sessionId, { keyId: key.id, text: "release note" });
  assert.ok(signed.signature.length > 0);
  assert.equal(signed.fingerprint, key.fingerprint);

  const verified = await service.signatureVerify(sessionId, {
    publicPem: key.publicPem,
    algorithm: "ED25519",
    signature: signed.signature,
    text: "release note",
  });
  assert.equal(verified.valid, true);

  const tampered = await service.signatureVerify(sessionId, {
    publicPem: key.publicPem,
    algorithm: "ED25519",
    signature: signed.signature,
    text: "release note!",
  });
  assert.equal(tampered.valid, false);
});

test("signing requires an unlocked session and a signing key", async () => {
  const { service } = setupService();
  const { sessionId } = await service.enroll(PASSWORD);
  const secret = await service.keyGenerate(sessionId, { algorithm: "HMAC_256", name: "Mac" });
  await assert.rejects(
    () => service.signatureSign(sessionId, { keyId: secret.id, text: "x" }),
    (e) => codeOf(e) === CODES.BAD_INPUT,
  );

  service.lockAll("test");
  await assert.rejects(
    () => service.signatureSign(sessionId, { keyId: "anything", text: "x" }),
    (e) => codeOf(e) === CODES.SESSION_REQUIRED,
  );
});

test("verification with a stored key id needs the session; a public PEM does not", async () => {
  const { service } = setupService();
  const { sessionId } = await service.enroll(PASSWORD);
  const key = await service.keyGenerate(sessionId, { algorithm: "ED25519", name: "Signer" });
  const signed = await service.signatureSign(sessionId, { keyId: key.id, text: "msg" });

  // With a raw public key, verification works after the vault is locked.
  service.lockAll("test");
  const ok = await service.signatureVerify("", {
    publicPem: key.publicPem,
    algorithm: "ED25519",
    signature: signed.signature,
    text: "msg",
  });
  assert.equal(ok.valid, true);

  // Resolving a stored key needs the session.
  await assert.rejects(
    () => service.signatureVerify("", { keyId: key.id, signature: signed.signature, text: "msg" }),
    (e) => codeOf(e) === CODES.SESSION_REQUIRED,
  );
});

test("signing with an unknown key id reports NOT_FOUND", async () => {
  const { service } = setupService();
  const { sessionId } = await service.enroll(PASSWORD);
  await assert.rejects(
    () => service.signatureSign(sessionId, { keyId: "missing", text: "x" }),
    (e) => codeOf(e) === CODES.NOT_FOUND,
  );
});

test("certificateInspect parses through the service", { skip: !CERT }, async () => {
  const { service } = setupService();
  const info = await service.certificateInspect({ pem: CERT });
  assert.match(info.subject, /knoux\.test/);
});
