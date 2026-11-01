"use strict";

/**
 * End-to-end service tests: real enrollment -> unlock -> encrypt/decrypt of
 * text and files, plus revocation enforcement.
 * Run with: node --test tests/vault-service.test.cjs
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");

const { VaultService } = require("../electron/vault/service");
const { VaultSessionManager } = require("../electron/vault/session");
const { VaultEngine } = require("../electron/vault/engine");
const { CODES } = require("../electron/vault/errors");
const { KDF } = require("../electron/vault/kdf");

const PASSWORD = "correct horse battery staple";

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "knoux-service-test-"));
  const manager = new VaultSessionManager({
    enrollmentPath: path.join(dir, "enrollment.json"),
    iterations: 100000,
  });
  const engine = new VaultEngine({
    kdfParams: { kdfId: KDF.RAW_KEY },
    chunkSize: 4096,
  });
  const service = new VaultService({ userDataPath: dir, manager, engine });
  return { dir, service, manager };
}

async function codeOf(promise) {
  try {
    await promise;
  } catch (err) {
    return err.code;
  }
  return null;
}

test("status is truthful before enrollment", async () => {
  const { service, dir } = setup();
  const status = await service.status();
  assert.equal(status.enrolled, false);
  assert.equal(status.locked, true);
  assert.equal(status.engine.algorithm, "AES-256-GCM");
  await service.close();
  await fsp.rm(dir, { recursive: true, force: true });
});

test("enroll, lock, unlock and encrypt/decrypt text round trip", async () => {
  const { service, dir } = setup();
  await service.enroll(PASSWORD, { iterations: 100000 });
  const status = await service.status();
  assert.equal(status.enrolled, true);

  service.lockAll();
  const { sessionId } = await service.unlock(PASSWORD);
  const { container } = await service.encryptText(sessionId, "top secret payload");
  const { text } = await service.decryptText(sessionId, container);
  assert.equal(text, "top secret payload");

  const activity = (await service.status()).activity;
  assert.ok(activity.some((a) => a.type === "encrypt-text"));
  assert.ok(activity.some((a) => a.type === "unlock"));
  await service.close();
  await fsp.rm(dir, { recursive: true, force: true });
});

test("encrypt/decrypt a file end to end", async () => {
  const { service, dir } = setup();
  await service.enroll(PASSWORD, { iterations: 100000 });
  service.lockAll();
  const { sessionId } = await service.unlock(PASSWORD);

  const input = path.join(dir, "doc.bin");
  const encrypted = path.join(dir, "doc.knv");
  const restored = path.join(dir, "doc.restored");
  const payload = crypto.randomBytes(4096 * 3 + 77);
  await fsp.writeFile(input, payload);

  const enc = await service.encryptFile({ sessionId, inputPath: input, outputPath: encrypted, operationId: "op1" });
  assert.equal(enc.meta.origSize, payload.length);
  const dec = await service.decryptFile({ sessionId, inputPath: encrypted, outputPath: restored, operationId: "op2" });
  assert.equal(dec.meta.origSize, payload.length);
  assert.deepEqual(await fsp.readFile(restored), payload);
  await service.close();
  await fsp.rm(dir, { recursive: true, force: true });
});

test("guest session cannot encrypt or decrypt", async () => {
  const { service, dir } = setup();
  await service.enroll(PASSWORD, { iterations: 100000 });
  const guest = service.createGuestSession();
  assert.equal(await codeOf(service.encryptText(guest.sessionId, "nope")), CODES.SESSION_REQUIRED);
  await service.close();
  await fsp.rm(dir, { recursive: true, force: true });
});

test("revoked session cannot encrypt", async () => {
  const { service, dir } = setup();
  await service.enroll(PASSWORD, { iterations: 100000 });
  service.lockAll();
  const { sessionId } = await service.unlock(PASSWORD);
  service.lock(sessionId, "test");
  assert.equal(await codeOf(service.encryptText(sessionId, "nope")), CODES.SESSION_REQUIRED);
  await service.close();
  await fsp.rm(dir, { recursive: true, force: true });
});

test("cancelling an operation aborts it", async () => {
  const { service, dir } = setup();
  await service.enroll(PASSWORD, { iterations: 100000 });
  service.lockAll();
  const { sessionId } = await service.unlock(PASSWORD);

  const input = path.join(dir, "big.bin");
  const encrypted = path.join(dir, "big.knv");
  await fsp.writeFile(input, crypto.randomBytes(4096 * 8));

  let firstProgress = false;
  const originalOnProgress = service.onProgress;
  service.onProgress = (p) => {
    originalOnProgress?.(p);
    if (!firstProgress) {
      firstProgress = true;
      service.cancel(p.operationId);
    }
  };

  const code = await codeOf(
    service.encryptFile({ sessionId, inputPath: input, outputPath: encrypted, operationId: "cancel-op" }),
  );
  assert.equal(code, CODES.CANCELLED);
  assert.equal(fs.existsSync(encrypted), false);
  await service.close();
  await fsp.rm(dir, { recursive: true, force: true });
});
