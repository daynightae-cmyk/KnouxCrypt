"use strict";

/**
 * Batch 11 (tasks 41-44) tests: Expiring Secret Capsule, Session Privacy
 * Controls, File Integrity Baselines and the Secure Clipboard status.
 *
 * Everything runs the real implementation:
 *   - The capsule tests exercise real AES-256-GCM + PBKDF2 sealing, and assert
 *     that a wrong passphrase, altered ciphertext, expiry and the access limit
 *     are all refused with typed errors.
 *   - The privacy tests assert the idle-lock change is applied live to the real
 *     session manager and that the redacted view leaks nothing.
 *   - The integrity tests mutate a real file on disk and assert the real
 *     comparison verdict.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { VaultService } = require("../electron/vault/service");
const { CODES } = require("../electron/vault/errors");
const acl = require("../electron/vault/acl");
const { SecretCapsule, CAPSULE_FORMAT } = require("../electron/vault/capsule");
const { IntegrityBaseline } = require("../electron/vault/integrity");
const { ClipboardGuard } = require("../electron/vault/clipboard");

const PASSWORD = "correct horse battery staple";

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "knoux-b11-"));
}

function codeOf(err) {
  return err && err.code;
}

async function rejects(promise, code) {
  try {
    await promise;
  } catch (err) {
    assert.equal(codeOf(err), code, `expected ${code}, got ${codeOf(err)}: ${err.message}`);
    return err;
  }
  assert.fail(`expected a ${code} rejection`);
}

async function unlocked(dir, options = {}) {
  const service = new VaultService({ userDataPath: dir, ...options });
  const { sessionId } = await service.enroll(PASSWORD);
  return { service, sessionId };
}

// ---------------------------------------------------------------------------
// Task 41 — Expiring Secret Capsule
// ---------------------------------------------------------------------------

test("capsule: a create/open round-trip returns the secret and states remoteRevocable=false", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const created = await service.capsuleCreate({ secret: "s3cret-token", passphrase: "cap-pass", expiry: "1h", maxAccess: 1 });
  assert.equal(created.format, CAPSULE_FORMAT);
  assert.equal(created.remoteRevocable, false);
  assert.equal(JSON.stringify(created).includes("s3cret-token"), false, "the secret is not echoed in the metadata");

  const opened = await service.capsuleOpen(created.envelopeText, "cap-pass");
  assert.equal(opened.secret, "s3cret-token");
  assert.equal(opened.remainingAccess, 0);
  assert.equal(opened.remoteRevocable, false);
});

test("capsule: a wrong passphrase or altered ciphertext is refused", async () => {
  const capsule = new SecretCapsule();
  const created = capsule.create({ secret: "hello", passphrase: "right", expiry: "1d", maxAccess: 5 });
  await rejects(Promise.resolve().then(() => capsule.open(created.envelopeText, "wrong")), CODES.AUTH_FAILED);

  const envelope = JSON.parse(created.envelopeText);
  const bytes = Buffer.from(envelope.ciphertextB64, "base64");
  bytes[0] ^= 0xff;
  envelope.ciphertextB64 = bytes.toString("base64");
  assert.throws(() => capsule.open(JSON.stringify(envelope), "right"), (err) => codeOf(err) === CODES.AUTH_FAILED);
});

test("capsule: an expired capsule is refused", async () => {
  let now = 1_700_000_000_000;
  const capsule = new SecretCapsule({ now: () => now });
  const created = capsule.create({ secret: "soon", passphrase: "p", expiry: "10m", maxAccess: 5 });
  now += 11 * 60 * 1000; // 11 minutes later
  const info = capsule.inspect(created.envelopeText);
  assert.equal(info.expired, true);
  assert.throws(() => capsule.open(created.envelopeText, "p"), (err) => codeOf(err) === CODES.AUTH_FAILED);
});

test("capsule: the access limit is enforced and remainingAccess decrements", async () => {
  const capsule = new SecretCapsule();
  let current = capsule.create({ secret: "once", passphrase: "p", expiry: "1h", maxAccess: 3 });
  const first = capsule.open(current.envelopeText, "p");
  assert.equal(first.secret, "once");
  assert.equal(first.remainingAccess, 2);
  current = { envelopeText: first.envelopeText };
  const second = capsule.open(current.envelopeText, "p");
  assert.equal(second.remainingAccess, 1);
  const third = capsule.open(second.envelopeText, "p");
  assert.equal(third.remainingAccess, 0);
  assert.throws(() => capsule.open(third.envelopeText, "p"), (err) => codeOf(err) === CODES.AUTH_FAILED);
});

test("capsule: a malformed or non-capsule envelope is refused", async () => {
  const capsule = new SecretCapsule();
  assert.throws(() => capsule.inspect("not json"), (err) => codeOf(err) === CODES.BAD_INPUT);
  assert.throws(() => capsule.inspect("{}"), (err) => codeOf(err) === CODES.NOT_A_VAULT);
  assert.throws(() => capsule.create({ secret: "", passphrase: "p" }), (err) => codeOf(err) === CODES.BAD_INPUT);
  assert.throws(() => capsule.create({ secret: "x", passphrase: "p", expiry: "9y" }), (err) => codeOf(err) === CODES.BAD_INPUT);
  assert.throws(() => capsule.create({ secret: "x", passphrase: "p", maxAccess: 2 }), (err) => codeOf(err) === CODES.BAD_INPUT);
});

test("capsule: saving writes an owner-only file atomically and refuses a missing folder", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const created = await service.capsuleCreate({ secret: "to disk", passphrase: "p", expiry: "1h", maxAccess: 1 });

  const target = path.join(dir, "capsule.knx");
  const saved = await service.capsuleSave({ envelopeText: created.envelopeText, outputPath: target });
  assert.equal(saved.saved, true);
  assert.ok(fs.existsSync(target));
  // Previously gated behind `process.platform !== "win32"`, which meant the
  // capsule's "owner-only" claim was simply never tested on the platform where
  // the claim was most likely to be false. Assert it on both, against each
  // platform's real mechanism.
  const verdict = await acl.isProtected(target, { exhaustive: true });
  assert.equal(verdict.ok, true, `the capsule file must be confined to its owner (${verdict.mechanism}): ${verdict.detail}`);
  if (process.platform !== "win32") {
    assert.equal(fs.statSync(target).mode & 0o777, 0o600, "POSIX mode must be exactly 0600");
  }
  assert.equal(JSON.parse(fs.readFileSync(target, "utf8")).header.format, CAPSULE_FORMAT);

  await rejects(service.capsuleSave({ envelopeText: created.envelopeText, outputPath: path.join(dir, "nope", "c.knx") }), CODES.NOT_FOUND);
  await rejects(service.capsuleSave({ envelopeText: created.envelopeText, outputPath: "" }), CODES.BAD_INPUT);
});

// ---------------------------------------------------------------------------
// Task 42 — Session Privacy Controls
// ---------------------------------------------------------------------------

test("privacy: the policy marks each control enforced/not enforced with its mechanism", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const policy = await service.sessionPrivacyPolicy();
  assert.equal(policy.osScope, false);
  const byId = Object.fromEntries(policy.controls.map((c) => [c.id, c]));
  assert.equal(byId.idleLockSeconds.enforced, true);
  assert.equal(byId.lockOnSuspend.enforced, true);
  assert.ok(byId.idleLockSeconds.mechanism.length > 0);
});

test("privacy: an idle-lock change is applied live to the session manager", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const before = service.manager.idleLockMs;
  const updated = await service.sessionPrivacyUpdate({ idleLockSeconds: 120 });
  assert.equal(updated.values.idleLockSeconds, 120);
  assert.equal(service.manager.idleLockMs, 120 * 1000, "the manager's idle lock was updated live");
  assert.notEqual(service.manager.idleLockMs, before);
});

test("privacy: out-of-range and wrong-typed values are refused", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  await rejects(service.sessionPrivacyUpdate({ idleLockSeconds: 1 }), CODES.BAD_INPUT);
  await rejects(service.sessionPrivacyUpdate({ idleLockSeconds: 999999999 }), CODES.BAD_INPUT);
  await rejects(service.sessionPrivacyUpdate({ lockOnSuspend: "yes" }), CODES.BAD_INPUT);
  await rejects(service.sessionPrivacyUpdate({ retentionDays: 0 }), CODES.BAD_INPUT);
  await rejects(service.sessionPrivacyUpdate({ unknownField: 1 }), CODES.BAD_INPUT);
});

test("privacy: the redacted session view leaks no session id, key or secret", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const redacted = await service.sessionPrivacyRedacted();
  assert.equal(redacted.available, true);
  assert.equal(typeof redacted.locked, "boolean");
  assert.equal(typeof redacted.activeSessions, "number");
  // The view lists the field NAMES it redacts, but carries none of their values.
  assert.deepEqual(redacted.redacted, ["sessionId", "dek", "password", "privateKey", "token"]);
  const serialized = JSON.stringify(redacted);
  assert.equal(serialized.includes(sessionId), false, "the real session id is not present");
  assert.equal(serialized.includes(PASSWORD), false, "the password is not present");
  assert.equal(serialized.includes("dek"), true, "only the redaction label is present");
});

// ---------------------------------------------------------------------------
// Task 43 — File Integrity Baselines
// ---------------------------------------------------------------------------

test("integrity: a baseline detects unchanged, changed, missing and added files", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const keep = path.join(dir, "keep.txt");
  const edit = path.join(dir, "edit.txt");
  const gone = path.join(dir, "gone.txt");
  fs.writeFileSync(keep, "unchanged");
  fs.writeFileSync(edit, "before");
  fs.writeFileSync(gone, "delete me");

  const manifest = await service.integrityCreate({ files: [keep, edit, gone], algorithm: "SHA-256", label: "B" });
  assert.equal(manifest.count, 3);

  // Mutate the filesystem between the baseline and the comparison.
  fs.writeFileSync(edit, "after");
  fs.unlinkSync(gone);
  const added = path.join(dir, "added.txt");
  fs.writeFileSync(added, "new");

  const compared = await service.integrityCompare({ manifest, extraFiles: [added] });
  assert.equal(compared.summary.unchanged, 1);
  assert.equal(compared.summary.changed, 1);
  assert.equal(compared.summary.missing, 1);
  assert.equal(compared.summary.added, 1);
  assert.equal(compared.verified, false);
  assert.equal(compared.changed[0].name, "edit.txt");
  assert.equal(compared.missing[0].name, "gone.txt");
});

test("integrity: SHA-512 is supported and a malformed manifest is refused", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const file = path.join(dir, "f.bin");
  fs.writeFileSync(file, crypto.randomBytes(256));

  const algorithms = service.integrityAlgorithms();
  assert.ok(algorithms.algorithms.includes("SHA-512"));

  const manifest = await service.integrityCreate({ files: [file], algorithm: "SHA-512" });
  assert.equal(manifest.algorithm, "SHA-512");
  const compared = await service.integrityCompare({ manifest });
  assert.equal(compared.verified, true);

  const bad = path.join(dir, "bad.json");
  fs.writeFileSync(bad, "{ not json");
  await rejects(service.integrityLoad(bad), CODES.BAD_INPUT);
  await rejects(service.integrityLoad(path.join(dir, "missing.json")), CODES.NOT_FOUND);

  const notAManifest = path.join(dir, "other.json");
  fs.writeFileSync(notAManifest, JSON.stringify({ hello: "world" }));
  await rejects(service.integrityLoad(notAManifest), CODES.NOT_A_VAULT);
});

test("integrity: a file missing at baseline creation is refused, and comparison is read-only", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  await rejects(service.integrityCreate({ files: [path.join(dir, "nope.txt")] }), CODES.NOT_FOUND);
  await rejects(service.integrityCreate({ files: [] }), CODES.BAD_INPUT);

  const file = path.join(dir, "ro.txt");
  fs.writeFileSync(file, "stable");
  const manifest = await service.integrityCreate({ files: [file] });
  const mtimeBefore = fs.statSync(file).mtimeMs;
  await service.integrityCompare({ manifest });
  assert.equal(fs.readFileSync(file, "utf8"), "stable", "comparison did not modify the file");
  assert.equal(fs.statSync(file).mtimeMs, mtimeBefore);
});

test("integrity: a saved manifest round-trips through disk", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const file = path.join(dir, "m.txt");
  fs.writeFileSync(file, "content");
  const manifest = await service.integrityCreate({ files: [file] });
  const out = path.join(dir, "manifest.json");
  const saved = await service.integritySave({ manifest, outputPath: out });
  assert.equal(saved.saved, true);
  const loaded = await service.integrityLoad(out);
  assert.equal(loaded.count, 1);
  assert.equal(loaded.entries[0].sha, manifest.entries[0].sha);
});

// ---------------------------------------------------------------------------
// Task 44 — Secure Clipboard status
// ---------------------------------------------------------------------------

test("secure clipboard: the status reports real adapter support and guarantees nothing it cannot", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const status = service.secureClipboardStatus();
  assert.equal(status.guaranteedOsErase, false);
  assert.equal(status.clearsOnlyOwnLease, true);
  assert.equal(typeof status.supported, "boolean");
  assert.match(status.note, /cannot guarantee/i);
});

test("secure clipboard: a clear is skipped when the clipboard content changed underneath", async () => {
  // A real in-memory adapter stands in for the OS clipboard.
  const store = { text: null };
  const adapter = {
    readText: () => store.text,
    writeText: (t) => {
      store.text = t;
    },
    clear: () => {
      store.text = null;
    },
  };
  const guard = new ClipboardGuard({ adapter });
  const armed = guard.copy({ text: "copied secret", seconds: 30, sessionId: "s1", confirm: true });
  assert.equal(armed.state, "armed");
  assert.equal(store.text, "copied secret");

  // Something else replaces the clipboard; the guard must not clobber it.
  store.text = "user's own text";
  const result = guard._expire(armed.leaseId);
  assert.equal(result.lastSkippedAt !== null, true, "the clear was skipped and recorded");
  assert.equal(store.text, "user's own text", "the guard left an unrelated clipboard value alone");
  assert.equal(guard.status().armed, false, "the lease is no longer armed");
});

test("secure clipboard: a matching value is actually cleared when the timer fires", async () => {
  const store = { text: null };
  const adapter = {
    readText: () => store.text,
    writeText: (t) => {
      store.text = t;
    },
    clear: () => {
      store.text = null;
    },
  };
  const guard = new ClipboardGuard({ adapter });
  const armed = guard.copy({ text: "lease me", seconds: 30, sessionId: "s1", confirm: true });
  const result = guard._expire(armed.leaseId);
  assert.equal(store.text, null, "the guard cleared its own value");
  assert.equal(result.armed, false);
});

test("secure clipboard: the guard refuses to arm without consent", async () => {
  const adapter = { readText: () => null, writeText: () => {}, clear: () => {} };
  const guard = new ClipboardGuard({ adapter });
  assert.throws(() => guard.copy({ text: "x", seconds: 30, sessionId: "s1", confirm: false }), (err) => codeOf(err) === CODES.CONSENT_REQUIRED);
});
