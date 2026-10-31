"use strict";

/**
 * Batch 04 (tasks 13-16) negative and positive tests: key detail, privacy
 * preferences, encrypted backup/restore, and encrypted package sharing.
 *
 * These exercise the real modules on disk - real AES-GCM containers, real
 * PBKDF2 derivation and real RSA-OAEP wrapping - with no mocks.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");

const { VaultBackup } = require("../electron/vault/backup");
const { ShareService } = require("../electron/vault/share");
const { Preferences, DEFAULTS } = require("../electron/vault/preferences");
const { VaultEngine } = require("../electron/vault/engine");
const { EncryptedStore } = require("../electron/vault/store");
const { VaultSessionManager } = require("../electron/vault/session");
const { VaultService } = require("../electron/vault/service");
const { CODES } = require("../electron/vault/errors");
const { KDF } = require("../electron/vault/kdf");

const PASSWORD = "correct horse battery staple";

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "knoux-b4-"));
}

function rawEngine() {
  return new VaultEngine({ kdfParams: { kdfId: KDF.RAW_KEY }, chunkSize: 4096 });
}

function codeOf(err) {
  return err && err.code;
}

// ---------------------------------------------------------------- backup ----

test("backup round-trips every collection and verifies checksums", async () => {
  const dir = tmp();
  const engine = rawEngine();
  const store = new EncryptedStore({ root: path.join(dir, "store"), engine });
  const rawKey = crypto.randomBytes(32);

  await store.put("notes", rawKey, { id: "n1", title: "note", body: "secret" });
  await store.put("passwords", rawKey, { id: "p1", title: "site", password: "hunter2" });

  const backup = new VaultBackup({ root: path.join(dir, "store"), engine, store });
  const created = await backup.create(rawKey);
  assert.ok(created.manifest.length >= 2);
  const noteEntry = created.manifest.find((m) => m.collection === "notes");
  assert.equal(noteEntry.count, 1);

  const summary = await backup.inspect(created.file, rawKey);
  assert.equal(summary.format, "KNXBK01");
  assert.equal(summary.totalRecords, created.manifest.reduce((s, m) => s + m.count, 0));
});

test("backup cannot be read with the wrong key", async () => {
  const dir = tmp();
  const engine = rawEngine();
  const store = new EncryptedStore({ root: path.join(dir, "store"), engine });
  const rawKey = crypto.randomBytes(32);
  await store.put("notes", rawKey, { id: "n1", title: "note" });

  const backup = new VaultBackup({ root: path.join(dir, "store"), engine, store });
  const created = await backup.create(rawKey);

  await assert.rejects(
    () => backup.inspect(created.file, crypto.randomBytes(32)),
    (err) => [CODES.AUTH_FAILED, CODES.INTEGRITY_FAILED].includes(codeOf(err)),
  );
});

test("a tampered backup file fails its integrity check", async () => {
  const dir = tmp();
  const engine = rawEngine();
  const store = new EncryptedStore({ root: path.join(dir, "store"), engine });
  const rawKey = crypto.randomBytes(32);
  await store.put("notes", rawKey, { id: "n1", title: "note" });

  const backup = new VaultBackup({ root: path.join(dir, "store"), engine, store });
  const created = await backup.create(rawKey);

  const bytes = await fsp.readFile(created.file);
  bytes[bytes.length - 20] ^= 0xff;
  await fsp.writeFile(created.file, bytes);

  await assert.rejects(
    () => backup.inspect(created.file, rawKey),
    (err) => codeOf(err) === CODES.INTEGRITY_FAILED,
  );
});

test("a truncated backup is refused", async () => {
  const dir = tmp();
  const engine = rawEngine();
  const store = new EncryptedStore({ root: path.join(dir, "store"), engine });
  const rawKey = crypto.randomBytes(32);
  await store.put("notes", rawKey, { id: "n1", title: "note" });

  const backup = new VaultBackup({ root: path.join(dir, "store"), engine, store });
  const created = await backup.create(rawKey);

  const bytes = await fsp.readFile(created.file);
  await fsp.writeFile(created.file, bytes.subarray(0, 40));

  await assert.rejects(
    () => backup.inspect(created.file, rawKey),
    (err) => [CODES.TRUNCATED, CODES.INTEGRITY_FAILED, CODES.AUTH_FAILED].includes(codeOf(err)),
  );
});

test("an empty backup file is refused with TRUNCATED", async () => {
  const dir = tmp();
  const engine = rawEngine();
  const store = new EncryptedStore({ root: path.join(dir, "store"), engine });
  const backup = new VaultBackup({ root: path.join(dir, "store"), engine, store });
  const file = path.join(dir, "empty.knxbak");
  await fsp.writeFile(file, Buffer.alloc(0));

  await assert.rejects(
    () => backup.inspect(file, crypto.randomBytes(32)),
    (err) => codeOf(err) === CODES.TRUNCATED,
  );
});

test("a missing backup file is refused with NOT_FOUND", async () => {
  const dir = tmp();
  const engine = rawEngine();
  const store = new EncryptedStore({ root: path.join(dir, "store"), engine });
  const backup = new VaultBackup({ root: path.join(dir, "store"), engine, store });

  await assert.rejects(
    () => backup.inspect(path.join(dir, "nope.knxbak"), crypto.randomBytes(32)),
    (err) => codeOf(err) === CODES.NOT_FOUND,
  );
});

test("restore requires explicit confirmation", async () => {
  const dir = tmp();
  const engine = rawEngine();
  const store = new EncryptedStore({ root: path.join(dir, "store"), engine });
  const rawKey = crypto.randomBytes(32);
  await store.put("notes", rawKey, { id: "n1", title: "note" });

  const backup = new VaultBackup({ root: path.join(dir, "store"), engine, store });
  const created = await backup.create(rawKey);

  await assert.rejects(
    () => backup.restore(created.file, rawKey, {}),
    (err) => codeOf(err) === CODES.BAD_INPUT,
  );
});

test("restore replaces collections and reports what it restored", async () => {
  const dir = tmp();
  const engine = rawEngine();
  const store = new EncryptedStore({ root: path.join(dir, "store"), engine });
  const rawKey = crypto.randomBytes(32);

  await store.put("notes", rawKey, { id: "n1", title: "original" });
  const backup = new VaultBackup({ root: path.join(dir, "store"), engine, store });
  const created = await backup.create(rawKey);

  // Diverge the live store, then restore and confirm it comes back.
  await store.write("notes", rawKey, { version: 1, records: [{ id: "n2", title: "divergent" }] });

  const result = await backup.restore(created.file, rawKey, { confirm: true });
  assert.equal(result.totalRecords >= 1, true);

  const after = await store.list("notes", rawKey);
  assert.equal(after.records.length, 1);
  assert.equal(after.records[0].title, "original");
});

test("a backup id with path separators is rejected", () => {
  const dir = tmp();
  const backup = new VaultBackup({ root: dir, engine: rawEngine(), store: null });
  assert.throws(() => backup.pathFor("../../etc/passwd"), (err) => codeOf(err) === CODES.BAD_INPUT);
  assert.throws(() => backup.pathFor("a/b"), (err) => codeOf(err) === CODES.BAD_INPUT);
});

// ----------------------------------------------------------------- share ----

test("a shared-secret package opens with the right passphrase only", () => {
  const share = new ShareService({ engine: rawEngine() });
  const { envelope } = share.createSharedSecret({ passphrase: "correct horse", payload: "hello" });

  const opened = share.open(envelope, { passphrase: "correct horse" });
  assert.equal(opened.payload, "hello");

  assert.throws(
    () => share.open(envelope, { passphrase: "wrong passphrase" }),
    (err) => [CODES.AUTH_FAILED, CODES.INTEGRITY_FAILED].includes(codeOf(err)),
  );
});

test("a shared-secret package rejects a short passphrase", () => {
  const share = new ShareService({ engine: rawEngine() });
  assert.throws(
    () => share.createSharedSecret({ passphrase: "short", payload: "x" }),
    (err) => codeOf(err) === CODES.BAD_INPUT,
  );
});

test("a shared-secret package requires a passphrase to open", () => {
  const share = new ShareService({ engine: rawEngine() });
  const { envelope } = share.createSharedSecret({ passphrase: "correct horse", payload: "x" });
  assert.throws(() => share.open(envelope, {}), (err) => codeOf(err) === CODES.BAD_INPUT);
});

test("a recipient-key package opens only with the matching private key", () => {
  const share = new ShareService({ engine: rawEngine() });
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const other = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const { envelope } = share.createForRecipient({ recipientPublicPem: publicKey, payload: { a: 1 } });
  const opened = share.open(envelope, { privatePem: privateKey });
  assert.deepEqual(opened.payload, { a: 1 });

  assert.throws(
    () => share.open(envelope, { privatePem: other.privateKey }),
    (err) => codeOf(err) === CODES.AUTH_FAILED,
  );
});

test("a recipient-key package refuses a non-RSA key", () => {
  const share = new ShareService({ engine: rawEngine() });
  const ed = crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  assert.throws(
    () => share.createForRecipient({ recipientPublicPem: ed.publicKey, payload: "x" }),
    (err) => codeOf(err) === CODES.BAD_INPUT,
  );
});

test("an expired package is refused on open but still inspectable", () => {
  const share = new ShareService({ engine: rawEngine() });
  const { envelope } = share.createSharedSecret({
    passphrase: "correct horse",
    payload: "x",
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  });
  // Simulate time passing by rewriting the expiry in the envelope.
  envelope.expiresAt = new Date(Date.now() - 1000).toISOString();

  assert.equal(share.inspect(envelope).expired, true);
  assert.throws(
    () => share.open(envelope, { passphrase: "correct horse" }),
    (err) => codeOf(err) === CODES.BAD_INPUT,
  );
});

test("an expiry in the past is refused at creation", () => {
  const share = new ShareService({ engine: rawEngine() });
  assert.throws(
    () => share.createSharedSecret({ passphrase: "correct horse", payload: "x", expiresAt: new Date(Date.now() - 1000).toISOString() }),
    (err) => codeOf(err) === CODES.BAD_INPUT,
  );
});

test("a malformed share envelope is refused", () => {
  const share = new ShareService({ engine: rawEngine() });
  assert.throws(() => share.inspect({ format: "NOT-KNOUX" }), (err) => codeOf(err) === CODES.UNSUPPORTED_FORMAT);
  assert.throws(() => share.open("{ not json"), (err) => codeOf(err) === CODES.INTEGRITY_FAILED);
  assert.throws(() => share.inspect({ format: "KNXSHARE01", version: 99 }), (err) => codeOf(err) === CODES.UNSUPPORTED_FORMAT);
});

test("a tampered package container fails to open", () => {
  const share = new ShareService({ engine: rawEngine() });
  const { envelope } = share.createSharedSecret({ passphrase: "correct horse", payload: "x" });
  const container = Buffer.from(envelope.container, "base64");
  container[container.length - 5] ^= 0xff;
  envelope.container = container.toString("base64");

  assert.throws(
    () => share.open(envelope, { passphrase: "correct horse" }),
    (err) => codeOf(err) === CODES.INTEGRITY_FAILED,
  );
});

test("an empty payload is refused", () => {
  const share = new ShareService({ engine: rawEngine() });
  assert.throws(
    () => share.createSharedSecret({ passphrase: "correct horse", payload: "" }),
    (err) => codeOf(err) === CODES.BAD_INPUT,
  );
});

// ----------------------------------------------------------- preferences ----

test("preferences fall back to safe defaults when the file is missing", async () => {
  const dir = tmp();
  const prefs = new Preferences({ file: path.join(dir, "prefs.json") });
  const snapshot = await prefs.load();
  assert.deepEqual(snapshot.values, { ...DEFAULTS });
});

test("preferences clamp out-of-range values instead of accepting them", async () => {
  const dir = tmp();
  const prefs = new Preferences({ file: path.join(dir, "prefs.json") });
  await prefs.load();

  const low = await prefs.update({ idleLockSeconds: 1 });
  assert.ok(low.values.idleLockSeconds >= 30);

  const high = await prefs.update({ retentionDays: 99999 });
  assert.ok(high.values.retentionDays <= 365);
});

test("preferences reject non-numeric input", async () => {
  const dir = tmp();
  const prefs = new Preferences({ file: path.join(dir, "prefs.json") });
  await prefs.load();
  await assert.rejects(() => prefs.update({ idleLockSeconds: "soon" }), (err) => codeOf(err) === CODES.BAD_INPUT);
});

test("preferences persist and reload", async () => {
  const dir = tmp();
  const file = path.join(dir, "prefs.json");
  const prefs = new Preferences({ file });
  await prefs.load();
  await prefs.update({ idleLockSeconds: 600, clearClipboard: true });

  const reloaded = new Preferences({ file });
  const snapshot = await reloaded.load();
  assert.equal(snapshot.values.idleLockSeconds, 600);
  assert.equal(snapshot.values.clearClipboard, true);
});

test("preferences notify their listener so the session manager can re-arm", async () => {
  const dir = tmp();
  const seen = [];
  const prefs = new Preferences({ file: path.join(dir, "prefs.json"), onChange: (s) => seen.push(s) });
  await prefs.load();
  await prefs.update({ idleLockSeconds: 90 });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].values.idleLockSeconds, 90);
});

test("a corrupt preferences file does not crash the load", async () => {
  const dir = tmp();
  const file = path.join(dir, "prefs.json");
  await fsp.writeFile(file, "{ not json");
  const prefs = new Preferences({ file });
  const snapshot = await prefs.load();
  assert.deepEqual(snapshot.values, { ...DEFAULTS });
});

// ------------------------------------------------------- service wiring -----

function setupService() {
  const dir = tmp();
  const manager = new VaultSessionManager({ enrollmentPath: path.join(dir, "e.json") });
  const engine = rawEngine();
  const service = new VaultService({ userDataPath: dir, manager, engine });
  return { dir, service };
}

test("key detail returns public material and never the private key", async () => {
  const { service } = setupService();
  const { sessionId } = await service.enroll(PASSWORD);
  const created = await service.keyGenerate(sessionId, { algorithm: "ED25519", name: "Signing" });
  const detail = await service.keyGet(sessionId, created.id);

  assert.equal(detail.name, "Signing");
  assert.ok(detail.fingerprint);
  assert.ok(detail.publicPem.includes("BEGIN PUBLIC KEY"));
  assert.equal(detail.hasPrivate, true);
  // The private key must not appear anywhere in the detail payload.
  assert.equal(JSON.stringify(detail).includes("BEGIN PRIVATE KEY"), false);
});

test("key detail returns NOT_FOUND for an unknown id", async () => {
  const { service } = setupService();
  const { sessionId } = await service.enroll(PASSWORD);
  await assert.rejects(() => service.keyGet(sessionId, "does-not-exist"), (err) => codeOf(err) === CODES.NOT_FOUND);
});

test("key update renames metadata without changing the fingerprint", async () => {
  const { service } = setupService();
  const { sessionId } = await service.enroll(PASSWORD);
  const created = await service.keyGenerate(sessionId, { algorithm: "ED25519", name: "Before" });
  const before = await service.keyGet(sessionId, created.id);

  const updated = await service.keyUpdate(sessionId, created.id, { name: "After", purpose: "signing" });
  assert.equal(updated.name, "After");
  assert.equal(updated.purpose, "signing");
  assert.equal(updated.fingerprint, before.fingerprint);
});

test("key update refuses an empty name", async () => {
  const { service } = setupService();
  const { sessionId } = await service.enroll(PASSWORD);
  const created = await service.keyGenerate(sessionId, { algorithm: "ED25519", name: "Empty name test" });
  await assert.rejects(() => service.keyUpdate(sessionId, created.id, { name: "   " }), (err) => codeOf(err) === CODES.BAD_INPUT);
});

test("a revoked session cannot reach key, backup or share operations", async () => {
  const { service } = setupService();
  const { sessionId } = await service.enroll(PASSWORD);
  service.lockAll("test");

  await assert.rejects(() => service.keyGet(sessionId, "x"), (err) => codeOf(err) === CODES.SESSION_REQUIRED);
  await assert.rejects(() => service.backupList(sessionId), (err) => codeOf(err) === CODES.SESSION_REQUIRED);
  assert.throws(() => service.shareInspect(sessionId, { format: "KNXSHARE01", version: 1, model: "shared-secret" }), (err) => codeOf(err) === CODES.SESSION_REQUIRED);
});

test("backup create, list, inspect and restore work end to end through the service", async () => {
  const { service } = setupService();
  const { sessionId } = await service.enroll(PASSWORD);
  await service.storePut(sessionId, "notes", { id: "n1", title: "kept" });

  const created = await service.backupCreate(sessionId);
  const listed = await service.backupList(sessionId);
  assert.ok(listed.backups.some((b) => b.id === created.id));

  const summary = await service.backupInspect(sessionId, created.id);
  assert.equal(summary.format, "KNXBK01");

  await service.storeRemove(sessionId, "notes", "n1");
  await service.backupRestore(sessionId, created.id, { confirm: true });
  const after = await service.storeList(sessionId, "notes");
  assert.equal(after.records.length, 1);
  assert.equal(after.records[0].title, "kept");
});

test("share create and open work through the service with a passphrase", async () => {
  const { service } = setupService();
  const { sessionId } = await service.enroll(PASSWORD);
  const created = await service.shareCreate(sessionId, {
    model: "shared-secret",
    passphrase: "share me safely",
    payload: "transfer note",
  });
  assert.equal(created.model, "shared-secret");

  const opened = service.shareOpen(sessionId, created.envelope, { passphrase: "share me safely" });
  assert.equal(opened.payload, "transfer note");
});

test("share create refuses an unknown model", async () => {
  const { service } = setupService();
  const { sessionId } = await service.enroll(PASSWORD);
  await assert.rejects(
    () => service.shareCreate(sessionId, { model: "telepathy", payload: "x" }),
    (err) => codeOf(err) === CODES.BAD_INPUT,
  );
});

test("preferences update re-arms the live session idle window", async () => {
  const { service } = setupService();
  await service.enroll(PASSWORD);
  const before = service.manager.idleLockMs;
  await service.preferencesUpdate({ idleLockSeconds: 60 });
  assert.equal(service.manager.idleLockMs, 60000);
  assert.notEqual(service.manager.idleLockMs, before);
});

test("setIdleLockMs ignores a non-positive value", () => {
  const dir = tmp();
  const manager = new VaultSessionManager({ enrollmentPath: path.join(dir, "e.json") });
  assert.equal(manager.setIdleLockMs(0), false);
  assert.equal(manager.setIdleLockMs(-5), false);
  assert.equal(manager.setIdleLockMs(60000), true);
});
