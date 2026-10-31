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
