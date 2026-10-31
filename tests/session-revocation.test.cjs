"use strict";

/**
 * Task 02 (SECURE_ACCESS_LOGIN) — session revocation must reach the renderer.
 *
 * The preload allow-list has always contained `vault:revoked`, but nothing ever
 * emitted it. These tests pin the real behaviour: every revocation path
 * (explicit lock, lock-all, idle sweep) notifies the window once per session.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

const sent = [];
const handlers = new Map();
const fakeElectron = {
  ipcMain: {
    handle: (c, fn) => handlers.set(c, fn),
    removeHandler: (c) => handlers.delete(c),
    removeAllListeners: () => {},
    on: () => {},
  },
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    showSaveDialog: async () => ({ canceled: true }),
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
const { KDF } = require("../electron/vault/kdf");

const PASSWORD = "correct horse battery staple";

function setup(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "knoux-revoked-test-"));
  const manager = new VaultSessionManager({
    enrollmentPath: path.join(dir, "e.json"),
    iterations: 100000,
    ...options,
  });
  const engine = new VaultEngine({ kdfParams: { kdfId: KDF.RAW_KEY }, chunkSize: 4096 });
  const service = new VaultService({ userDataPath: dir, manager, engine });
  const fakeWindow = {
    isDestroyed: () => false,
    webContents: { send: (channel, payload) => sent.push({ channel, payload }) },
  };
  registerVaultIpc(service, () => fakeWindow);
  return { dir, service, manager };
}

test("the revoked event is delivered on the allow-listed channel", async () => {
  sent.length = 0;
  const { service } = setup();
  const { sessionId } = await service.enroll(PASSWORD);
  service.lock(sessionId, "user");

  const revoked = sent.filter((m) => m.channel === CHANNELS.REVOKED);
  assert.equal(revoked.length, 1, "exactly one revocation event per session");
  assert.equal(revoked[0].payload.sessionId, sessionId);
  assert.equal(revoked[0].payload.reason, "user");
});

test("lockAll notifies for every session it revokes", async () => {
  const { service } = setup();
  await service.enroll(PASSWORD);
  service.lockAll("test");
  const a = await service.unlock(PASSWORD);
  const b = await service.unlock(PASSWORD);
  sent.length = 0;

  service.lockAll("tray");
  const ids = sent.filter((m) => m.channel === CHANNELS.REVOKED).map((m) => m.payload.sessionId);
  assert.deepEqual(ids.sort(), [a.sessionId, b.sessionId].sort());
  assert.ok(sent.every((m) => m.payload.reason === "tray"));
});

test("an idle timeout also reports the revocation", async () => {
  let now = 1_000_000;
  const { service, manager } = setup({ idleLockMs: 1000, now: () => now });
  const { sessionId } = await service.enroll(PASSWORD);
  sent.length = 0;

  now += 5000;
  manager._sweepExpired();

  const revoked = sent.filter((m) => m.channel === CHANNELS.REVOKED);
  assert.equal(revoked.length, 1);
  assert.equal(revoked[0].payload.sessionId, sessionId);
  assert.equal(revoked[0].payload.reason, "idle-timeout");
});

test("a notification failure cannot undo the revocation", async () => {
  const { service } = setup();
  const { sessionId } = await service.enroll(PASSWORD);
  service.onRevoked = () => {
    throw new Error("renderer gone");
  };

  const result = service.lock(sessionId, "user");
  assert.equal(result.locked, true);
  assert.equal(service.manager.activeSessions().length, 0, "the session must stay revoked");
});

test("revoked sessions cannot be reused for privileged work", async () => {
  const { service } = setup();
  const { sessionId } = await service.enroll(PASSWORD);
  service.lock(sessionId, "user");
  assert.throws(() => service.manager.getDek(sessionId), (err) => err.code === "SESSION_REQUIRED");
});

test("guest sessions report their own revocation", async () => {
  const { service } = setup();
  const guest = service.createGuestSession();
  sent.length = 0;
  service.lock(guest.sessionId, "user");
  const revoked = sent.filter((m) => m.channel === CHANNELS.REVOKED);
  assert.equal(revoked.length, 1);
  assert.equal(revoked[0].payload.sessionId, guest.sessionId);
});
