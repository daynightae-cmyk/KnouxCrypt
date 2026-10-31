"use strict";

/**
 * Verifies the IPC contract: channels are registered, payloads are validated,
 * and failures are returned as typed results instead of raw exceptions.
 * Electron is stubbed so this runs headlessly.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const Module = require("module");

const handlers = new Map();
const fakeElectron = {
  ipcMain: {
    handle: (channel, fn) => handlers.set(channel, fn),
    removeHandler: (channel) => handlers.delete(channel),
  },
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    showSaveDialog: async () => ({ canceled: true, filePath: undefined }),
  },
  BrowserWindow: class {},
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") return fakeElectron;
  return originalLoad.call(this, request, parent, isMain);
};

const { registerVaultIpc, CHANNELS } = require("../electron/vault/ipc");
const { VaultService } = require("../electron/vault/service");
const { VaultSessionManager } = require("../electron/vault/session");
const { VaultEngine } = require("../electron/vault/engine");
const { CODES } = require("../electron/vault/errors");
const { KDF } = require("../electron/vault/kdf");

const PASSWORD = "correct horse battery staple";

function setupService() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "knoux-ipc-test-"));
  const manager = new VaultSessionManager({ enrollmentPath: path.join(dir, "e.json") });
  const engine = new VaultEngine({ kdfParams: { kdfId: KDF.RAW_KEY }, chunkSize: 4096 });
  const service = new VaultService({ userDataPath: dir, manager, engine });
  registerVaultIpc(service, () => null);
  return { dir, service };
}

async function call(channel, payload) {
  const fn = handlers.get(channel);
  assert.ok(fn, `handler for ${channel} is registered`);
  return fn({}, payload);
}

// Event-only channels are pushed from main to renderer; they have no handler
// by design, so they are excluded from the invoke-surface check.
const EVENT_ONLY = new Set([
  CHANNELS.PROGRESS,
  CHANNELS.REVOKED,
  CHANNELS.TRANSFER_REQUEST,
  CHANNELS.TRANSFER_STATE,
]);

test("all vault channels are registered", () => {
  setupService();
  for (const channel of Object.values(CHANNELS)) {
    if (EVENT_ONLY.has(channel)) continue;
    assert.ok(handlers.has(channel), `missing handler ${channel}`);
  }
});

test("event-only channels are not registered as invoke handlers", () => {
  setupService();
  for (const channel of EVENT_ONLY) {
    assert.ok(!handlers.has(channel), `${channel} must not be an invoke handler`);
  }
});

test("status returns a typed ok result", async () => {
  setupService();
  const res = await call(CHANNELS.STATUS);
  assert.equal(res.ok, true);
  assert.equal(res.data.enrolled, false);
});

test("enroll validates the payload shape", async () => {
  setupService();
  const bad = await call(CHANNELS.ENROLL, { password: 123 });
  assert.equal(bad.ok, false);
  assert.equal(bad.error.code, CODES.BAD_INPUT);

  const good = await call(CHANNELS.ENROLL, { password: PASSWORD });
  assert.equal(good.ok, true);
  assert.ok(good.data.sessionId);
});

test("unlock failure surfaces as AUTH_FAILED, not a thrown error", async () => {
  const { service } = setupService();
  await service.enroll(PASSWORD);
  service.lockAll();
  const res = await call(CHANNELS.UNLOCK, { password: "wrong" });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, CODES.AUTH_FAILED);
});

test("encrypt-text requires an active session", async () => {
  const { service } = setupService();
  await service.enroll(PASSWORD);
  const res = await call(CHANNELS.ENCRYPT_TEXT, { sessionId: "does-not-exist", text: "hi" });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, CODES.SESSION_REQUIRED);
});

test("encrypt-text round trips through the IPC layer", async () => {
  const { service } = setupService();
  await service.enroll(PASSWORD);
  const { data: unlocked } = await call(CHANNELS.UNLOCK, { password: PASSWORD });
  const enc = await call(CHANNELS.ENCRYPT_TEXT, { sessionId: unlocked.sessionId, text: "hello ipc" });
  assert.equal(enc.ok, true);
  const dec = await call(CHANNELS.DECRYPT_TEXT, { sessionId: unlocked.sessionId, container: enc.data.container });
  assert.equal(dec.ok, true);
  assert.equal(dec.data.text, "hello ipc");
});

test("encrypt-file rejects a missing session before touching the filesystem", async () => {
  const { service } = setupService();
  await service.enroll(PASSWORD);
  const res = await call(CHANNELS.ENCRYPT_FILE, {
    sessionId: "nope",
    inputPath: "/tmp/whatever",
    outputPath: "/tmp/out",
    operationId: "op",
  });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, CODES.SESSION_REQUIRED);
});

test("file pickers never leak paths when cancelled", async () => {
  setupService();
  const res = await call(CHANNELS.PICK_INPUT);
  assert.equal(res.ok, true);
  assert.equal(res.data.cancelled, true);
  assert.equal(res.data.path, null);
});

// ---- tasks 05-08: encrypted record store over IPC -------------------------

test("store channels reject an unknown collection before touching the service", async () => {
  setupService();
  const enroll = await call(CHANNELS.ENROLL, { password: PASSWORD });
  const res = await call(CHANNELS.STORE_LIST, { sessionId: enroll.data.sessionId, collection: "secrets" });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, CODES.BAD_INPUT);
});

test("store channels reject a non-object record", async () => {
  setupService();
  const enroll = await call(CHANNELS.ENROLL, { password: PASSWORD });
  const res = await call(CHANNELS.STORE_PUT, {
    sessionId: enroll.data.sessionId,
    collection: "notes",
    record: ["not", "an", "object"],
  });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, CODES.BAD_INPUT);
});

test("a store round trip works entirely through IPC", async () => {
  setupService();
  const enroll = await call(CHANNELS.ENROLL, { password: PASSWORD });
  const sid = enroll.data.sessionId;

  const put = await call(CHANNELS.STORE_PUT, {
    sessionId: sid,
    collection: "notes",
    record: { id: "ipc-1", title: "Over IPC", body: "secret", category: "Work" },
  });
  assert.equal(put.ok, true);
  assert.equal(put.data.created, true);

  const list = await call(CHANNELS.STORE_LIST, { sessionId: sid, collection: "notes" });
  assert.equal(list.ok, true);
  assert.equal(list.data.records[0].title, "Over IPC");

  const removed = await call(CHANNELS.STORE_REMOVE, { sessionId: sid, collection: "notes", id: "ipc-1" });
  assert.equal(removed.data.removed, true);

  const after = await call(CHANNELS.STORE_LIST, { sessionId: sid, collection: "notes" });
  assert.deepEqual(after.data.records, []);
});

test("a guest session is refused by every store channel", async () => {
  setupService();
  const guest = await call(CHANNELS.GUEST);
  const sid = guest.data.sessionId;

  for (const [channel, payload] of [
    [CHANNELS.STORE_LIST, { sessionId: sid, collection: "notes" }],
    [CHANNELS.STORE_PUT, { sessionId: sid, collection: "notes", record: { id: "g" } }],
    [CHANNELS.STORE_REMOVE, { sessionId: sid, collection: "notes", id: "g" }],
    [CHANNELS.STORE_CLEAR, { sessionId: sid, collection: "notes" }],
  ]) {
    const res = await call(channel, payload);
    assert.equal(res.ok, false, `${channel} must refuse a guest`);
    assert.equal(res.error.code, CODES.SESSION_REQUIRED);
  }
});

test("store failures never leak a filesystem path or stack trace", async () => {
  setupService();
  const res = await call(CHANNELS.STORE_LIST, { sessionId: "not-a-real-session", collection: "notes" });
  assert.equal(res.ok, false);
  const serialized = JSON.stringify(res);
  assert.equal(/\/tmp\/|\/home\/|at Object\.|\.cjs:\d+/.test(serialized), false, serialized);
});

// ---- tasks 09-12: password detail, authenticator, key forge ---------------

test("the authenticator and key channels are registered", () => {
  setupService();
  for (const channel of [
    CHANNELS.AUTH_ADD,
    CHANNELS.AUTH_LIST,
    CHANNELS.AUTH_CODE,
    CHANNELS.AUTH_REMOVE,
    CHANNELS.KEY_GENERATE,
    CHANNELS.KEY_LIST,
    CHANNELS.KEY_EXPORT_PRIVATE,
    CHANNELS.KEY_REMOVE,
  ]) {
    assert.ok(handlers.has(channel), `${channel} is registered`);
  }
});

test("an authenticator account round-trips and returns a real code", async () => {
  setupService();
  const enroll = await call(CHANNELS.ENROLL, { password: PASSWORD });
  const sid = enroll.data.sessionId;

  // The RFC 4226 shared secret, so the code is checkable against the standard.
  const added = await call(CHANNELS.AUTH_ADD, {
    sessionId: sid,
    account: { name: "Example", issuer: "Knoux", secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" },
  });
  assert.equal(added.ok, true, JSON.stringify(added.error));
  assert.ok(added.data.id);

  const listed = await call(CHANNELS.AUTH_LIST, { sessionId: sid });
  assert.equal(listed.data.accounts.length, 1);
  assert.equal(listed.data.accounts[0].name, "Example");
  // The secret must never be part of the list payload.
  assert.equal(Object.hasOwn(listed.data.accounts[0], "secret"), false);

  const code = await call(CHANNELS.AUTH_CODE, { sessionId: sid, id: added.data.id });
  assert.equal(code.ok, true, JSON.stringify(code.error));
  assert.match(code.data.code, /^\d{6}$/);
  assert.ok(code.data.remaining >= 1 && code.data.remaining <= 30);

  const removed = await call(CHANNELS.AUTH_REMOVE, { sessionId: sid, id: added.data.id });
  assert.equal(removed.data.removed, true);
  assert.equal((await call(CHANNELS.AUTH_LIST, { sessionId: sid })).data.accounts.length, 0);
});

test("the auth list never exposes the secret to the renderer", async () => {
  setupService();
  const enroll = await call(CHANNELS.ENROLL, { password: PASSWORD });
  const sid = enroll.data.sessionId;
  await call(CHANNELS.AUTH_ADD, {
    sessionId: sid,
    account: { name: "Example", secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" },
  });
  const listed = await call(CHANNELS.AUTH_LIST, { sessionId: sid });
  assert.equal(/GEZDGNBV/.test(JSON.stringify(listed)), false, "the secret leaked into the list payload");
});

test("a malformed authenticator secret is refused at the boundary", async () => {
  setupService();
  const enroll = await call(CHANNELS.ENROLL, { password: PASSWORD });
  const sid = enroll.data.sessionId;
  const res = await call(CHANNELS.AUTH_ADD, {
    sessionId: sid,
    account: { name: "Bad", secret: "not-base32!!" },
  });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, CODES.BAD_INPUT);
});

test("a duplicate authenticator account is refused", async () => {
  setupService();
  const enroll = await call(CHANNELS.ENROLL, { password: PASSWORD });
  const sid = enroll.data.sessionId;
  const account = { name: "Example", secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" };
  assert.equal((await call(CHANNELS.AUTH_ADD, { sessionId: sid, account })).ok, true);
  const again = await call(CHANNELS.AUTH_ADD, { sessionId: sid, account });
  assert.equal(again.ok, false);
  assert.equal(again.error.code, CODES.BAD_INPUT);
});

test("an unknown authenticator id returns NOT_FOUND, not a code", async () => {
  setupService();
  const enroll = await call(CHANNELS.ENROLL, { password: PASSWORD });
  const res = await call(CHANNELS.AUTH_CODE, { sessionId: enroll.data.sessionId, id: "missing" });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, CODES.NOT_FOUND);
});

test("a key is generated, listed without private material and removed", async () => {
  setupService();
  const enroll = await call(CHANNELS.ENROLL, { password: PASSWORD });
  const sid = enroll.data.sessionId;

  const made = await call(CHANNELS.KEY_GENERATE, {
    sessionId: sid,
    request: { algorithm: "ED25519", name: "Signing key", purpose: "signing" },
  });
  assert.equal(made.ok, true, JSON.stringify(made.error));
  assert.match(made.data.publicPem, /BEGIN PUBLIC KEY/);
  assert.match(made.data.fingerprint, /^[0-9a-f]{64}$/);

  const listed = await call(CHANNELS.KEY_LIST, { sessionId: sid });
  assert.equal(listed.data.keys.length, 1);
  assert.equal(listed.data.keys[0].hasPrivate, true);
  // The inventory must not carry private material.
  assert.equal(/PRIVATE KEY/.test(JSON.stringify(listed)), false);

  const removed = await call(CHANNELS.KEY_REMOVE, { sessionId: sid, id: made.data.id });
  assert.equal(removed.data.removed, true);
});

test("an unsupported key algorithm is refused", async () => {
  setupService();
  const enroll = await call(CHANNELS.ENROLL, { password: PASSWORD });
  const res = await call(CHANNELS.KEY_GENERATE, {
    sessionId: enroll.data.sessionId,
    request: { algorithm: "DES", name: "Weak" },
  });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, CODES.BAD_INPUT);
});

test("private key export requires explicit confirmation", async () => {
  setupService();
  const enroll = await call(CHANNELS.ENROLL, { password: PASSWORD });
  const sid = enroll.data.sessionId;
  const made = await call(CHANNELS.KEY_GENERATE, {
    sessionId: sid,
    request: { algorithm: "P-256", name: "TLS key" },
  });

  const denied = await call(CHANNELS.KEY_EXPORT_PRIVATE, { sessionId: sid, id: made.data.id, options: {} });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, CODES.BAD_INPUT);

  const allowed = await call(CHANNELS.KEY_EXPORT_PRIVATE, {
    sessionId: sid,
    id: made.data.id,
    options: { confirm: true },
  });
  assert.equal(allowed.ok, true);
  assert.match(allowed.data.privatePem, /BEGIN PRIVATE KEY/);
});

test("a guest session is refused by every authenticator and key channel", async () => {
  setupService();
  const guest = await call(CHANNELS.GUEST);
  const sid = guest.data.sessionId;
  for (const [channel, payload] of [
    [CHANNELS.AUTH_ADD, { sessionId: sid, account: { name: "x", secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" } }],
    [CHANNELS.AUTH_LIST, { sessionId: sid }],
    [CHANNELS.AUTH_CODE, { sessionId: sid, id: "x" }],
    [CHANNELS.AUTH_REMOVE, { sessionId: sid, id: "x" }],
    [CHANNELS.KEY_GENERATE, { sessionId: sid, request: { algorithm: "ED25519", name: "x" } }],
    [CHANNELS.KEY_LIST, { sessionId: sid }],
    [CHANNELS.KEY_EXPORT_PRIVATE, { sessionId: sid, id: "x", options: { confirm: true } }],
    [CHANNELS.KEY_REMOVE, { sessionId: sid, id: "x" }],
  ]) {
    const res = await call(channel, payload);
    assert.equal(res.ok, false, `${channel} must refuse a guest`);
    assert.equal(res.error.code, CODES.SESSION_REQUIRED);
  }
});
