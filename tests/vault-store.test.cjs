"use strict";

/**
 * Tasks 05-08 — encrypted record storage for Shadow Vault, Notes and Passwords.
 *
 * These assert on real files on disk: the store must be unreadable without the
 * vault key, must detect tampering, and must never be reachable from a guest or
 * revoked session.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { VaultService } = require("../electron/vault/service");
const { VaultEngine } = require("../electron/vault/engine");
const { VaultSessionManager } = require("../electron/vault/session");
const { EncryptedStore } = require("../electron/vault/store");
const { KDF } = require("../electron/vault/kdf");
const { CODES } = require("../electron/vault/errors");

const PASSWORD = "correct horse battery staple";

async function unlocked() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "knoux-store-test-"));
  const manager = new VaultSessionManager({
    enrollmentPath: path.join(dir, "enrollment.json"),
    iterations: 100000,
  });
  const engine = new VaultEngine({ kdfParams: { kdfId: KDF.RAW_KEY }, chunkSize: 8192 });
  const service = new VaultService({ userDataPath: dir, manager, engine });
  const { sessionId } = await service.enroll(PASSWORD);
  return { dir, service, manager, engine, sessionId };
}

async function codeOf(promise) {
  try {
    await promise;
    return null;
  } catch (err) {
    return err.code || err.message;
  }
}

function note(id, title) {
  return { id, title, body: `body for ${id}`, category: "Personal", pinned: false, updated: "Now" };
}

test("a fresh store is empty and no file is created by reading", async () => {
  const { dir, service, sessionId } = await unlocked();
  const res = await service.storeList(sessionId, "notes");
  assert.equal(res.ok, undefined);
  assert.deepEqual(res.records, []);
  assert.equal(fs.existsSync(path.join(dir, "vault-store", "notes.knx")), false);
});

test("a stored record survives a full service restart", async () => {
  const { dir, service, sessionId } = await unlocked();
  await service.storePut(sessionId, "notes", note("n1", "First note"));

  // A brand new service over the same directory must decrypt the same record.
  const manager2 = new VaultSessionManager({ enrollmentPath: path.join(dir, "enrollment.json"), iterations: 100000 });
  const service2 = new VaultService({ userDataPath: dir, manager: manager2 });
  const second = await service2.unlock(PASSWORD);
  const { records } = await service2.storeList(second.sessionId, "notes");
  assert.equal(records.length, 1);
  assert.equal(records[0].title, "First note");
});

test("the store file on disk contains no plaintext", async () => {
  const { dir, service, sessionId } = await unlocked();
  const secret = "TOP-SECRET-NOTE-BODY-9f3a";
  await service.storePut(sessionId, "notes", { ...note("n2", "Secret"), body: secret });

  const raw = fs.readFileSync(path.join(dir, "vault-store", "notes.knx"));
  assert.equal(raw.includes(Buffer.from(secret)), false, "the plaintext body must not appear on disk");
  assert.equal(raw.includes(Buffer.from("n2")), false, "the record id must not appear on disk");
  assert.equal(raw.subarray(0, 8).toString("ascii"), "KNXVLT01", "the store uses the real vault container format");
});

test("put updates an existing record rather than duplicating it", async () => {
  const { service, sessionId } = await unlocked();
  await service.storePut(sessionId, "notes", note("n3", "Original"));
  const second = await service.storePut(sessionId, "notes", note("n3", "Edited"));
  assert.equal(second.created, false);

  const { records } = await service.storeList(sessionId, "notes");
  assert.equal(records.length, 1);
  assert.equal(records[0].title, "Edited");
});

test("remove deletes exactly one record and reports whether it existed", async () => {
  const { service, sessionId } = await unlocked();
  await service.storePut(sessionId, "notes", note("a", "A"));
  await service.storePut(sessionId, "notes", note("b", "B"));

  assert.deepEqual(await service.storeRemove(sessionId, "notes", "a"), { collection: "notes", removed: true });
  assert.deepEqual(await service.storeRemove(sessionId, "notes", "a"), { collection: "notes", removed: false });

  const { records } = await service.storeList(sessionId, "notes");
  assert.deepEqual(records.map((r) => r.id), ["b"]);
});

test("clear empties the collection without deleting the container", async () => {
  const { dir, service, sessionId } = await unlocked();
  await service.storePut(sessionId, "notes", note("x", "X"));
  await service.storeClear(sessionId, "notes");
  const { records } = await service.storeList(sessionId, "notes");
  assert.deepEqual(records, []);
  assert.ok(fs.existsSync(path.join(dir, "vault-store", "notes.knx")));
});

test("credentials and notes are separate stores", async () => {
  const { service, sessionId } = await unlocked();
  await service.storePut(sessionId, "notes", note("shared", "A note"));
  await service.storePut(sessionId, "passwords", { id: "shared", title: "A login", password: "x" });

  assert.equal((await service.storeList(sessionId, "notes")).records[0].title, "A note");
  assert.equal((await service.storeList(sessionId, "passwords")).records[0].title, "A login");
});

test("an unknown collection is refused", async () => {
  const { service, sessionId } = await unlocked();
  const code = await codeOf(service.storeList(sessionId, "secrets"));
  assert.equal(code, CODES.BAD_INPUT);
});

test("a guest session cannot read or write the store", async () => {
  const { service } = await unlocked();
  const guest = service.createGuestSession();
  assert.equal(await codeOf(service.storeList(guest.sessionId, "notes")), CODES.SESSION_REQUIRED);
  assert.equal(await codeOf(service.storePut(guest.sessionId, "notes", note("g", "G"))), CODES.SESSION_REQUIRED);
});

test("a revoked session cannot read the store", async () => {
  const { service, sessionId } = await unlocked();
  await service.storePut(sessionId, "notes", note("r", "R"));
  service.lock(sessionId, "user");
  assert.equal(await codeOf(service.storeList(sessionId, "notes")), CODES.SESSION_REQUIRED);
});

test("a tampered store file is rejected instead of returning wrong data", async () => {
  const { dir, service, sessionId } = await unlocked();
  await service.storePut(sessionId, "notes", note("t", "Tamper me"));

  const file = path.join(dir, "vault-store", "notes.knx");
  const bytes = fs.readFileSync(file);
  // Offset 200 sits inside the first ciphertext frame: header is 96 bytes plus a
  // 32-byte header MAC, so this is body data caught by the frame GCM tag.
  bytes[200] ^= 0xff;
  fs.writeFileSync(file, bytes);

  assert.equal(await codeOf(service.storeList(sessionId, "notes")), CODES.AUTH_FAILED);
});

test("a tampered header is rejected by its own MAC", async () => {
  const { dir, service, sessionId } = await unlocked();
  await service.storePut(sessionId, "notes", note("th", "Header tamper"));

  const file = path.join(dir, "vault-store", "notes.knx");
  const bytes = fs.readFileSync(file);
  bytes[40] ^= 0x01; // inside the MAC-protected header prefix
  fs.writeFileSync(file, bytes);

  assert.equal(await codeOf(service.storeList(sessionId, "notes")), CODES.INTEGRITY_FAILED);
});

test("a tampered trailing content MAC is rejected", async () => {
  const { dir, service, sessionId } = await unlocked();
  await service.storePut(sessionId, "notes", note("tm", "MAC tamper"));

  const file = path.join(dir, "vault-store", "notes.knx");
  const bytes = fs.readFileSync(file);
  bytes[bytes.length - 1] ^= 0xff;
  fs.writeFileSync(file, bytes);

  assert.equal(await codeOf(service.storeList(sessionId, "notes")), CODES.INTEGRITY_FAILED);
});

test("a truncated store file is rejected", async () => {
  const { dir, service, sessionId } = await unlocked();
  await service.storePut(sessionId, "notes", note("tr", "Truncate me"));

  const file = path.join(dir, "vault-store", "notes.knx");
  const bytes = fs.readFileSync(file);
  fs.writeFileSync(file, bytes.subarray(0, bytes.length - 20));

  assert.equal(await codeOf(service.storeList(sessionId, "notes")), CODES.TRUNCATED);
});

test("a store written by a different vault key cannot be read", async () => {
  const a = await unlocked();
  await a.service.storePut(a.sessionId, "notes", note("k", "Key A"));

  // A second, independently enrolled vault pointed at the first one's file.
  const managerB = new VaultSessionManager({ enrollmentPath: path.join(a.dir, "other.json"), iterations: 100000 });
  const serviceB = new VaultService({ userDataPath: a.dir, manager: managerB });
  const b = await serviceB.enroll(PASSWORD);
  assert.equal(await codeOf(serviceB.storeList(b.sessionId, "notes")), CODES.INTEGRITY_FAILED);
});

test("records larger than the per-record limit are refused", async () => {
  const { service, sessionId } = await unlocked();
  const huge = { id: "big", body: "x".repeat(300 * 1024) };
  assert.equal(await codeOf(service.storePut(sessionId, "notes", huge)), CODES.BAD_INPUT);
});

test("a record without an id is refused", async () => {
  const { service, sessionId } = await unlocked();
  assert.equal(await codeOf(service.storePut(sessionId, "notes", { title: "no id" })), CODES.BAD_INPUT);
});

test("the store container is written atomically and leaves no temp files", async () => {
  const { dir, service, sessionId } = await unlocked();
  for (let i = 0; i < 5; i += 1) await service.storePut(sessionId, "notes", note(`n${i}`, `Note ${i}`));
  const leftovers = fs.readdirSync(path.join(dir, "vault-store")).filter((f) => f.endsWith(".tmp"));
  assert.deepEqual(leftovers, []);
});

test("store writes are recorded in the real activity log", async () => {
  const { service, sessionId } = await unlocked();
  await service.storePut(sessionId, "notes", note("act", "Activity"));
  const types = service.activity.map((e) => e.type);
  assert.ok(types.includes("store-create"), `expected store-create in ${types.join(",")}`);
});

test("the raw store writer refuses an unsupported document version", async () => {
  const { dir, engine, service, sessionId } = await unlocked();
  const store = new EncryptedStore({ root: path.join(dir, "vault-store"), engine });
  const rawKey = service.manager.getDek(sessionId);
  await store.write("notes", rawKey, { version: 99, records: [] });
  assert.equal(await codeOf(store.read("notes", rawKey)), CODES.UNSUPPORTED_FORMAT);
});

test("store encryption uses a fresh nonce per write", async () => {
  const { dir, service, sessionId } = await unlocked();
  const file = path.join(dir, "vault-store", "notes.knx");
  await service.storePut(sessionId, "notes", note("same", "Same"));
  const first = fs.readFileSync(file);
  await service.storePut(sessionId, "notes", note("same", "Same"));
  const second = fs.readFileSync(file);
  assert.notEqual(first.toString("base64"), second.toString("base64"), "identical plaintext must not produce identical ciphertext");
});

test("an empty store file is treated as an empty collection", async () => {
  const { dir, service, sessionId } = await unlocked();
  fs.mkdirSync(path.join(dir, "vault-store"), { recursive: true });
  fs.writeFileSync(path.join(dir, "vault-store", "notes.knx"), Buffer.alloc(0));
  const { records } = await service.storeList(sessionId, "notes");
  assert.deepEqual(records, []);
});

test("the store directory is not world-readable", async () => {
  const { dir, service, sessionId } = await unlocked();
  await service.storePut(sessionId, "notes", note("perm", "Perms"));
  const file = path.join(dir, "vault-store", "notes.knx");
  const mode = fs.statSync(file).mode & 0o777;
  assert.equal(mode & 0o077, 0, `store file must not be group/world accessible, got ${mode.toString(8)}`);
});

test("a random byte string is not mistaken for a store", async () => {
  const { dir, engine, sessionId, service } = await unlocked();
  const store = new EncryptedStore({ root: path.join(dir, "vault-store"), engine });
  fs.mkdirSync(path.join(dir, "vault-store"), { recursive: true });
  fs.writeFileSync(path.join(dir, "vault-store", "notes.knx"), crypto.randomBytes(4096));
  const rawKey = service.manager.getDek(sessionId);
  assert.equal(await codeOf(store.read("notes", rawKey)), CODES.NOT_A_VAULT);
});
