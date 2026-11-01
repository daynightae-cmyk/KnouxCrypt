"use strict";

/**
 * Functional + negative tests for the vault session manager (enrollment,
 * unlock, revocation, lockout, guest isolation, idle auto-lock).
 * Run with: node --test tests/vault-session.test.cjs
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");

const { VaultSessionManager } = require("../electron/vault/session");
const { CODES } = require("../electron/vault/errors");
const acl = require("../electron/vault/acl");

const FAST = { iterations: 100000 };
const PASSWORD = "correct horse battery staple";

function setup(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "knoux-session-test-"));
  const enrollmentPath = path.join(dir, "enrollment.json");
  const manager = new VaultSessionManager({ enrollmentPath, ...overrides });
  return { dir, enrollmentPath, manager };
}

function codeOf(fn) {
  try {
    fn();
  } catch (err) {
    return err.code;
  }
  return null;
}

test("status reports not-enrolled initially", async () => {
  const { manager, dir } = setup();
  const status = await manager.status();
  assert.equal(status.enrolled, false);
  assert.equal(status.locked, true);
  await fsp.rm(dir, { recursive: true, force: true });
});

test("enrollment then unlock issues a real session with a key", async () => {
  const { manager, enrollmentPath, dir } = setup();
  const enrolled = await manager.enroll(PASSWORD, FAST);
  assert.ok(enrolled.sessionId);
  assert.equal(await manager.isEnrolled(), true);

  // The enrollment record must be confined to this user. Asserted against the
  // mechanism the platform actually enforces: a NTFS DACL on Windows, the mode
  // bits on POSIX. Checking `stat().mode` on Windows would compare a value libuv
  // synthesises from the read-only attribute — 0o666 for a normal file even
  // after chmod(0o600) — and so would report the wrong thing in both
  // directions: a false failure here, and a false pass on a file whose DACL
  // really does grant BUILTIN\Users read access.
  const verdict = await acl.isProtected(enrollmentPath, { exhaustive: true });
  assert.equal(
    verdict.ok,
    true,
    `enrollment record must be confined to its owner (${verdict.mechanism}): ${verdict.detail}`,
  );
  // The directory holding it too, so a record written by a later release
  // inherits the same confinement.
  const dirVerdict = await acl.isProtected(dir, { exhaustive: true });
  assert.equal(dirVerdict.ok, true, `enrollment directory must be owner-only: ${dirVerdict.detail}`);
  if (process.platform !== "win32") {
    assert.equal((await fsp.stat(enrollmentPath)).mode & 0o777, 0o600, "POSIX mode must be 0600");
  }

  manager.lockAll();
  const unlocked = await manager.unlock(PASSWORD);
  const dek = manager.getDek(unlocked.sessionId);
  assert.equal(dek.length, 32);
  await fsp.rm(dir, { recursive: true, force: true });
});

test("enrollment record never contains the raw password or DEK", async () => {
  const { manager, enrollmentPath, dir } = setup();
  await manager.enroll(PASSWORD, FAST);
  const raw = await fsp.readFile(enrollmentPath, "utf8");
  assert.equal(raw.includes(PASSWORD), false);
  assert.equal(raw.includes("password"), false);
  await fsp.rm(dir, { recursive: true, force: true });
});

test("second enrollment is refused", async () => {
  const { manager, dir } = setup();
  await manager.enroll(PASSWORD, FAST);
  await assert.rejects(
    () => manager.enroll(PASSWORD, FAST),
    (err) => err.code === CODES.ALREADY_ENROLLED,
  );
  await fsp.rm(dir, { recursive: true, force: true });
});

test("unlock with a wrong password is rejected", async () => {
  const { manager, dir } = setup();
  await manager.enroll(PASSWORD, FAST);
  manager.lockAll();
  await assert.rejects(
    () => manager.unlock("wrong-password"),
    (err) => err.code === CODES.AUTH_FAILED,
  );
  await fsp.rm(dir, { recursive: true, force: true });
});

test("repeated failures trigger a lockout", async () => {
  const { manager, dir } = setup({ maxAttempts: 3, lockoutMs: 60000 });
  await manager.enroll(PASSWORD, FAST);
  manager.lockAll();
  for (let i = 0; i < 2; i++) {
    await assert.rejects(() => manager.unlock("nope"), (e) => e.code === CODES.AUTH_FAILED);
  }
  await assert.rejects(() => manager.unlock("nope"), (e) => e.code === CODES.LOCKED_OUT);
  // Even the correct password is refused while locked out.
  await assert.rejects(() => manager.unlock(PASSWORD), (e) => e.code === CODES.LOCKED_OUT);
  await fsp.rm(dir, { recursive: true, force: true });
});

test("guest sessions hold no key and cannot decrypt", async () => {
  const { manager, dir } = setup();
  await manager.enroll(PASSWORD, FAST);
  const guest = manager.createGuestSession();
  assert.equal(guest.guest, true);
  assert.equal(codeOf(() => manager.getDek(guest.sessionId)), CODES.SESSION_REQUIRED);
  await fsp.rm(dir, { recursive: true, force: true });
});

test("revoked sessions are refused and their key is zeroed", async () => {
  const { manager, dir } = setup();
  await manager.enroll(PASSWORD, FAST);
  const session = await manager.unlock(PASSWORD);
  const dek = manager.getDek(session.sessionId);
  const snapshot = Buffer.from(dek);
  assert.equal(manager.revoke(session.sessionId, "test"), true);
  assert.equal(codeOf(() => manager.getDek(session.sessionId)), CODES.SESSION_REQUIRED);
  // The in-memory key material has been overwritten.
  assert.notDeepEqual(dek, snapshot);
  await fsp.rm(dir, { recursive: true, force: true });
});

test("lockAll revokes every active session", async () => {
  const { manager, dir } = setup();
  await manager.enroll(PASSWORD, FAST);
  manager.lockAll();
  const a = await manager.unlock(PASSWORD);
  const b = await manager.unlock(PASSWORD);
  assert.equal(manager.activeSessions().length, 2);
  assert.equal(manager.lockAll(), 2);
  assert.equal(manager.activeSessions().length, 0);
  for (const id of [a.sessionId, b.sessionId]) {
    assert.equal(codeOf(() => manager.getDek(id)), CODES.SESSION_REQUIRED);
  }
  await fsp.rm(dir, { recursive: true, force: true });
});

test("idle auto-lock expires a session after inactivity", async () => {
  let clock = 1000;
  const { manager, dir } = setup({ idleLockMs: 1000, now: () => clock });
  await manager.enroll(PASSWORD, FAST);
  const session = await manager.unlock(PASSWORD);
  clock += 1500;
  manager._sweepExpired();
  assert.equal(codeOf(() => manager.getDek(session.sessionId)), CODES.SESSION_REQUIRED);
  await fsp.rm(dir, { recursive: true, force: true });
});

test("activity extends the idle window", async () => {
  let clock = 1000;
  const { manager, dir } = setup({ idleLockMs: 1000, now: () => clock });
  await manager.enroll(PASSWORD, FAST);
  const session = await manager.unlock(PASSWORD);
  clock += 800;
  manager.touch(session.sessionId);
  clock += 800;
  manager._sweepExpired();
  assert.ok(manager.getDek(session.sessionId).length === 32);
  await fsp.rm(dir, { recursive: true, force: true });
});

test("unlock without enrollment reports NOT_ENROLLED", async () => {
  const { manager, dir } = setup();
  await assert.rejects(() => manager.unlock(PASSWORD), (e) => e.code === CODES.NOT_ENROLLED);
  await fsp.rm(dir, { recursive: true, force: true });
});

test("a short password is refused at enrollment", async () => {
  const { manager, dir } = setup();
  await assert.rejects(() => manager.enroll("short", FAST), (e) => e.code === CODES.BAD_INPUT);
  await fsp.rm(dir, { recursive: true, force: true });
});
