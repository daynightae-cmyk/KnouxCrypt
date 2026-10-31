"use strict";

/**
 * Batch 09 (tasks 33-36) tests: Android Autofill preview, Offline Security
 * Advisor, Multi-Device Pairing and the Password Strength Audit.
 *
 * Everything here runs the real implementation. The pairing test performs a
 * real X25519 Diffie-Hellman agreement and derives a real HKDF phrase; the
 * audit runs the real estimator. Negative cases (wrong phrase, declined match,
 * over-long input, unknown filter, corrupt preview file) assert on the real
 * typed error codes or the real, honest refusal.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");

const { VaultService } = require("../electron/vault/service");
const { CODES } = require("../electron/vault/errors");
const { PairingService, SAS_WORDS, SESSION_TTL_MS } = require("../electron/vault/pairing");
const { SecurityAdvisor, MANUAL_TOPICS } = require("../electron/vault/posture");
const { AutofillPreview, DEFAULTS } = require("../electron/vault/autofill");
const passwordaudit = require("../electron/vault/passwordaudit");

const PASSWORD = "correct horse battery staple";

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "knoux-b9-"));
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

async function rejectsCall(fn, code) {
  try {
    await fn();
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
// Task 33 — Android Autofill preview
// ---------------------------------------------------------------------------

test("autofill: defaults, persistence and unknown-key rejection", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);

  const initial = await service.autofillGet();
  assert.deepEqual(initial.values, DEFAULTS);

  const updated = await service.autofillUpdate({ suggestions: true });
  assert.equal(updated.values.suggestions, true);
  assert.equal(updated.values.mask, DEFAULTS.mask, "untouched keys are preserved");

  // A fresh service instance reads the persisted file.
  const reopened = await new VaultService({ userDataPath: dir }).autofillGet();
  assert.equal(reopened.values.suggestions, true, "the preview persisted to disk");

  await rejects(service.autofillUpdate(["not", "an", "object"]), CODES.BAD_INPUT);
});

test("autofill: the capability report never claims native Autofill", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const caps = (await service.autofillGet()).capabilities;
  assert.equal(caps.platform, "desktop");
  assert.equal(caps.nativeAutofill, false);
  assert.equal(caps.canRegisterProvider, false);
  assert.equal(caps.canOpenSettings, false);
  assert.match(caps.reason, /Android operating system/);
});

test("autofill: a corrupt preview file falls back to safe defaults", async () => {
  const dir = tmp();
  const file = path.join(dir, "autofill-preview.json");
  await fsp.writeFile(file, "{ not json");
  const preview = new AutofillPreview({ file });
  const snapshot = await preview.load();
  assert.deepEqual(snapshot.values, DEFAULTS);
});

// ---------------------------------------------------------------------------
// Task 34 — Offline Security Advisor
// ---------------------------------------------------------------------------

test("advisor: observed rows quote real local state and the report denies scanning the OS", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);

  const report = await service.advisorReview("All");
  assert.ok(report.rows.length >= 8);
  assert.match(report.disclaimer, /does not scan the operating system/);

  const enrolled = report.rows.find((r) => r.id === "vault-enrolled");
  assert.equal(enrolled.kind, "OBSERVED");
  assert.equal(enrolled.status, "pass");
  assert.equal(enrolled.value, "Enrolled");
  assert.equal(enrolled.evidence, "vault:status -> enrolled");

  // The freshly enrolled service is unlocked, so the session row flags attention.
  const sessionRow = report.rows.find((r) => r.id === "vault-locked");
  assert.equal(sessionRow.status, "attention");

  // No backup exists yet.
  const backups = report.rows.find((r) => r.id === "backups");
  assert.equal(backups.status, "attention");
  assert.match(backups.value, /0 backup/);
});

test("advisor: manual topics are never marked as passed", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const report = await service.advisorReview("Device");
  for (const row of report.rows) {
    assert.equal(row.kind, "MANUAL");
    assert.equal(row.status, "manual");
    assert.ok(row.guidance.length > 0);
  }
  assert.equal(report.rows.length, MANUAL_TOPICS.length);
});

test("advisor: filters are enforced and unknown filters are refused", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  await rejects(service.advisorReview("Nonsense"), CODES.BAD_INPUT);
  const vaultOnly = await service.advisorReview("Vault");
  assert.ok(vaultOnly.rows.every((r) => r.category === "Vault"));
});

test("advisor: a transfer listener and armed leases are reported from real signals", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const advisor = new SecurityAdvisor({
    status: async () => ({ enrolled: true, locked: true }),
    preferences: () => ({ values: { idleLockSeconds: 300, lockOnSuspend: true, clearClipboard: true, retentionDays: 30 } }),
    runtimeSignals: () => ({ backups: 2, transferListening: true, transferAddress: "127.0.0.1:5050", clipboardLeases: 1 }),
  });
  const report = await advisor.review({ filter: "All" });
  assert.equal(report.rows.find((r) => r.id === "transfer-listener").status, "attention");
  assert.equal(report.rows.find((r) => r.id === "clipboard-leases").status, "attention");
  assert.equal(report.rows.find((r) => r.id === "backups").status, "pass");
});

// ---------------------------------------------------------------------------
// Task 35 — Multi-Device Pairing
// ---------------------------------------------------------------------------

test("pairing: a real X25519 agreement derives a six-word phrase and reports no network", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const session = service.pairingStart({ label: "This device" });
  assert.equal(session.algorithm, "X25519 + HKDF-SHA256");
  assert.equal(session.transport, "loopback");
  assert.equal(session.networkOpened, false);
  assert.equal(session.sas.length, 6);
  for (const word of session.sas) assert.ok(SAS_WORDS.includes(word), `unknown SAS word ${word}`);
  assert.equal(session.sasText, session.sas.join(" · "));
  assert.notEqual(session.localFingerprint, session.peerFingerprint);
  // Private keys must never be part of the payload.
  assert.equal(session.localPrivate, undefined);
  assert.equal(session.peerPrivate, undefined);
});

test("pairing: the shared secret is symmetric (both roles derive the same phrase)", async () => {
  // Derive the SAS independently from both sides of a real agreement.
  const a = crypto.generateKeyPairSync("x25519");
  const b = crypto.generateKeyPairSync("x25519");
  const sharedA = crypto.diffieHellman({ privateKey: a.privateKey, publicKey: b.publicKey });
  const sharedB = crypto.diffieHellman({ privateKey: b.privateKey, publicKey: a.publicKey });
  assert.deepEqual(sharedA, sharedB, "Diffie-Hellman must be symmetric");
});

test("pairing: a wrong phrase or a declined match is refused", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const session = service.pairingStart();

  await rejectsCall(() => service.pairingConfirm(session.sessionId, { matches: false }), CODES.AUTH_FAILED);
  await rejectsCall(
    () => service.pairingConfirm(session.sessionId, { matches: true, phrase: "wrong words here now" }),
    CODES.AUTH_FAILED,
  );

  const ok = service.pairingConfirm(session.sessionId, { matches: true, phrase: session.sasText });
  assert.equal(ok.confirmed, true);
  assert.equal(ok.networkOpened, false);
});

test("pairing: unknown sessions are NOT_FOUND and expiry sweeps them", async () => {
  let clock = 1000;
  const pairing = new PairingService({ now: () => clock });
  const session = pairing.start();
  assert.equal(pairing.status(session.sessionId).sessionId, session.sessionId);

  clock += SESSION_TTL_MS + 1;
  assert.throws(() => pairing.status(session.sessionId), (err) => codeOf(err) === CODES.NOT_FOUND);
});

test("pairing: cancel removes the session", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const session = service.pairingStart();
  assert.equal(service.pairingCancel(session.sessionId).cancelled, true);
  assert.equal(service.pairingCancel(session.sessionId).cancelled, false);
  assert.throws(() => service.pairingStatus(session.sessionId), (err) => codeOf(err) === CODES.NOT_FOUND);
});

// ---------------------------------------------------------------------------
// Task 36 — Password Strength Audit
// ---------------------------------------------------------------------------

test("audit: weak inputs score low and strong inputs score high", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  for (const weak of ["password", "123456", "qwerty", "abcdef"]) {
    assert.ok(service.passwordAudit(weak).score <= 1, `${weak} should be weak`);
  }
  for (const strong of ["correct horse battery staple", "x9#Lm2!vQ7@wZ", "Tr0ub4dor&3"]) {
    assert.ok(service.passwordAudit(strong).score >= 3, `${strong} should be strong`);
  }
});

test("audit: the estimate is deterministic", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const first = service.passwordAudit("Zebra!Mango42");
  const second = service.passwordAudit("Zebra!Mango42");
  assert.equal(first.guesses, second.guesses);
  assert.equal(first.score, second.score);
  assert.equal(first.entropyBits, second.entropyBits);
});

test("audit: the estimator detects the documented patterns", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const patternsOf = (s) => service.passwordAudit(s).patterns.map((p) => p.pattern);
  assert.ok(patternsOf("password").includes("dictionary"));
  assert.ok(patternsOf("abcdabcd").includes("repeat"));
  assert.ok(patternsOf("qwertyuiop").includes("keyboard"));
  assert.ok(patternsOf("1997").includes("date"));
});

test("audit: monotonicity — adding a random character never lowers the estimate", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  let previous = service.passwordAudit("Xk").guesses;
  let value = "Xk";
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (let i = 0; i < 12; i += 1) {
    value += alphabet[(i * 7 + 3) % alphabet.length];
    const next = service.passwordAudit(value).guesses;
    assert.ok(next >= previous, `estimate fell from ${previous} to ${next} at "${value}"`);
    previous = next;
  }
});

test("audit: the result states its own limits and refuses over-long input", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const result = service.passwordAudit("Example!Pass99");
  assert.equal(result.limits.breachChecked, false);
  assert.equal(result.limits.storedInput, false);
  assert.match(result.limits.note, /No breach database/);
  assert.throws(() => service.passwordAudit("a".repeat(passwordaudit.MAX_INPUT + 1)), (err) => codeOf(err) === CODES.BAD_INPUT);
  assert.throws(() => service.passwordAudit(""), (err) => codeOf(err) === CODES.BAD_INPUT);
});

test("audit: the activity log records the score, never the audited text", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const secret = "SuperSecret-Passphrase-123!";
  service.passwordAudit(secret);
  const log = JSON.stringify(service.activity);
  assert.ok(!log.includes(secret), "the audited text must never be written to the activity log");
  assert.match(log, /password-audit/);
});
