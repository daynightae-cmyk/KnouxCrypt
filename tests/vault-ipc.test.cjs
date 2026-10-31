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

test("all vault channels are registered", () => {
  setupService();
  for (const channel of Object.values(CHANNELS)) {
    if (channel === CHANNELS.PROGRESS || channel === CHANNELS.REVOKED) continue;
    assert.ok(handlers.has(channel), `missing handler ${channel}`);
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
