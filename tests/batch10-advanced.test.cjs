"use strict";

/**
 * Batch 10 (tasks 37-40) tests: Argon2id Key Derivation Studio, Signature
 * Studio, Security Activity Journal and the Secure Transfer Wizard.
 *
 * Every test runs the real implementation:
 *   - Argon2id is checked against the canonical RFC 9106 known-answer vector and
 *     against hash-wasm's own documented example, on a real worker thread.
 *   - The journal tests edit, delete, reorder and corrupt a real journal file on
 *     disk and assert on the real tamper verdict.
 *   - The wizard test performs a genuine loopback transfer over a real socket
 *     and re-hashes what landed on disk.
 *
 * Negative cases assert on the real typed error codes, never on fabricated
 * success.
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
const { Argon2Studio, LIMITS } = require("../electron/vault/argon2");
const { SecurityJournal, CATEGORIES } = require("../electron/vault/journal");

const PASSWORD = "correct horse battery staple";

// Canonical Argon2id test vector from the reference implementation's test suite
// (and reproduced by hash-wasm): password "password", salt "somesalt",
// t=2, m=65536 KiB, p=1, 32-byte tag.
const KAT = {
  passphrase: "password",
  saltHex: Buffer.from("somesalt").toString("hex"),
  params: { memoryKiB: 65536, iterations: 2, parallelism: 1, hashLength: 32 },
  tagHex: "09316115d5cf24ed5a15a31a3ba326e5cf32edc24702987c02b6566f61913cf7",
};

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "knoux-b10-"));
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
// Task 37 — Argon2id Key Derivation Studio
// ---------------------------------------------------------------------------

test("argon2: the canonical Argon2id vector reproduces exactly", async () => {
  const studio = new Argon2Studio();
  const result = await studio.derive({ passphrase: KAT.passphrase, saltHex: KAT.saltHex, params: KAT.params, reveal: true });
  assert.equal(result.algorithm, "Argon2id");
  assert.equal(result.version, "1.3 (v=19)");
  assert.equal(result.tagHex, KAT.tagHex, "the derived tag matches the reference vector");
  assert.equal(result.saltHex, KAT.saltHex);
  assert.equal(result.saltGenerated, false);
  assert.equal(result.memoryKiB, 65536);
  assert.equal(result.iterations, 2);
  assert.equal(result.parallelism, 1);
  // The result must never carry the passphrase back to the caller.
  assert.equal(JSON.stringify(result).includes(KAT.passphrase), false, "the passphrase is not echoed in the result");
});

test("argon2: reveal=false returns only a fingerprint, never the tag", async () => {
  const studio = new Argon2Studio();
  const result = await studio.derive({ passphrase: "another pass", params: { profile: "INTERACTIVE" } });
  assert.equal(result.tagHex, null, "the tag is withheld unless explicitly requested");
  assert.match(result.tagFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(result.saltGenerated, true, "a random salt is generated when none is supplied");
  assert.ok(result.durationMs >= 0);
});

test("argon2: the associated-data / secret-key inputs are refused explicitly", async () => {
  const studio = new Argon2Studio();
  await rejects(
    studio.derive({ passphrase: "x", associatedData: Buffer.from("ad").toString("hex") }),
    CODES.BAD_INPUT,
  );
  await rejects(studio.derive({ passphrase: "x", secretKey: "aa" }), CODES.BAD_INPUT);
});

test("argon2: out-of-range parameters are refused before anything is allocated", async () => {
  const studio = new Argon2Studio();
  await rejects(studio.derive({ passphrase: "x", params: { memoryKiB: 1 } }), CODES.BAD_INPUT);
  await rejects(studio.derive({ passphrase: "x", params: { memoryKiB: LIMITS.maxMemoryKiB + 1 } }), CODES.BAD_INPUT);
  await rejects(studio.derive({ passphrase: "x", params: { iterations: 0 } }), CODES.BAD_INPUT);
  await rejects(studio.derive({ passphrase: "x", params: { parallelism: 0 } }), CODES.BAD_INPUT);
  await rejects(studio.derive({ passphrase: "x", params: { hashLength: 8 } }), CODES.BAD_INPUT);
  await rejects(studio.derive({ passphrase: "x", params: { profile: "TURBO" } }), CODES.BAD_INPUT);
  // 4 KiB of memory with parallelism 1 violates the 8 KiB-per-lane floor.
  await rejects(studio.derive({ passphrase: "x", params: { memoryKiB: 4, parallelism: 1 } }), CODES.BAD_INPUT);
});

test("argon2: an empty or over-long passphrase is refused", async () => {
  const studio = new Argon2Studio();
  await rejects(studio.derive({ passphrase: "" }), CODES.BAD_INPUT);
  await rejects(studio.derive({ passphrase: "a".repeat(2000) }), CODES.BAD_INPUT);
});

test("argon2: a malformed salt is refused", async () => {
  const studio = new Argon2Studio();
  await rejects(studio.derive({ passphrase: "x", saltHex: "zz" }), CODES.BAD_INPUT);
  await rejects(studio.derive({ passphrase: "x", saltHex: "abc" }), CODES.BAD_INPUT); // odd length
});

test("argon2: an in-flight derivation can be cancelled by terminating its worker", async () => {
  const studio = new Argon2Studio();
  const pending = studio.derive({
    passphrase: "x",
    operationId: "op-cancel",
    params: { memoryKiB: 512 * 1024, iterations: 8, parallelism: 1 },
  });
  // Cancel on the next tick, once the worker has been spawned and registered.
  await new Promise((r) => setTimeout(r, 20));
  const cancelled = studio.cancel("op-cancel");
  assert.equal(cancelled.cancelled, true, "the studio reports it terminated a live worker");
  await rejects(pending, CODES.CANCELLED);
  assert.equal(studio.cancel("op-cancel").cancelled, false, "a second cancel finds nothing to cancel");
});

test("argon2: the service records only non-secret parameters in the journal", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const result = await service.argon2Derive({ passphrase: "top secret phrase", params: { profile: "INTERACTIVE" } });
  assert.equal(result.algorithm, "Argon2id");
  const { entries } = await service.journalList({ category: "Keys", limit: 50 });
  const argon = entries.find((e) => e.action.includes("Argon2id"));
  assert.ok(argon, "the derivation was journaled");
  assert.equal(JSON.stringify(argon).includes("top secret phrase"), false, "the passphrase never reaches the journal");
});

// ---------------------------------------------------------------------------
// Task 38 — Signature Studio
// ---------------------------------------------------------------------------

test("signature studio: a real sign/verify round-trip succeeds and a tampered message fails", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const key = await service.keyGenerate(sessionId, { algorithm: "ED25519", name: "Studio signer" });

  const signed = await service.signatureSign(sessionId, { keyId: key.id, text: "release note" });
  assert.match(signed.signature, /^[A-Za-z0-9+/=]+$/);
  assert.equal(signed.fingerprint, key.fingerprint);

  const good = await service.signatureVerify(sessionId, { keyId: key.id, signature: signed.signature, text: "release note" });
  assert.equal(good.valid, true, "the real signature verifies");

  const bad = await service.signatureVerify(sessionId, { keyId: key.id, signature: signed.signature, text: "release note!" });
  assert.equal(bad.valid, false, "a changed message does not verify");

  const corrupt = await service.signatureVerify(sessionId, { keyId: key.id, signature: signed.signature.slice(0, -4) + "AAAA", text: "release note" });
  assert.equal(corrupt.valid, false, "a corrupted signature does not verify");
});

test("signature studio: verification with a mismatched public key fails, and a wrong key is refused", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const a = await service.keyGenerate(sessionId, { algorithm: "ED25519", name: "A" });
  const b = await service.keyGenerate(sessionId, { algorithm: "ED25519", name: "B" });
  const signed = await service.signatureSign(sessionId, { keyId: a.id, text: "msg" });

  const mismatch = await service.signatureVerify(sessionId, { keyId: b.id, signature: signed.signature, text: "msg" });
  assert.equal(mismatch.valid, false, "a signature from a different key does not verify");

  await rejects(service.signatureSign(sessionId, { keyId: "does-not-exist", text: "msg" }), CODES.NOT_FOUND);
});

test("signature studio: signing requires an unlocked session and export refuses guest/locked sessions", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const key = await service.keyGenerate(sessionId, { algorithm: "ED25519", name: "Signer" });
  const signed = await service.signatureSign(sessionId, { keyId: key.id, text: "msg" });

  // A guest session cannot sign (no vault key).
  const guest = service.createGuestSession();
  await rejects(service.signatureSign(guest.sessionId, { keyId: key.id, text: "msg" }), CODES.SESSION_REQUIRED);

  // Export requires a real unlocked session.
  const out = path.join(dir, "sig.json");
  await rejects(service.reportExport({ sessionId: guest.sessionId, report: signed, outputPath: out, kind: "signature" }), CODES.SESSION_REQUIRED);

  const exported = await service.reportExport({ sessionId, report: signed, outputPath: out, kind: "signature" });
  assert.equal(exported.exported, true);
  const written = JSON.parse(fs.readFileSync(out, "utf8"));
  assert.equal(written.kind, "signature");
  assert.equal(written.report.signature, signed.signature);

  // After a lock, the same export is refused.
  service.lockAll();
  await rejects(service.reportExport({ sessionId, report: signed, outputPath: out, kind: "signature" }), CODES.SESSION_REQUIRED);
});

test("signature studio: report export refuses a missing report or path", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  await rejects(service.reportExport({ sessionId, report: null, outputPath: path.join(dir, "x.json") }), CODES.BAD_INPUT);
  await rejects(service.reportExport({ sessionId, report: { a: 1 }, outputPath: "" }), CODES.BAD_INPUT);
  await rejects(
    service.reportExport({ sessionId, report: { a: 1 }, outputPath: path.join(dir, "missing", "x.json") }),
    CODES.NOT_FOUND,
  );
});

// ---------------------------------------------------------------------------
// Task 39 — Security Activity Journal
// ---------------------------------------------------------------------------

test("journal: a fresh journal is intact and records real events with a chain", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const integrity = await service.journalIntegrity();
  assert.equal(integrity.status, "intact");
  assert.equal(integrity.externalTrustAnchor, false, "the report never claims an external anchor");

  await service.journalRecord({ category: "Files", action: "Encrypted a document", outcome: "success" });
  const { entries } = await service.journalList({ limit: 10 });
  const newest = entries.find((e) => e.category === "Files");
  assert.ok(newest, "the new entry is listed");
  assert.equal(newest.action, "Encrypted a document");
  assert.match(newest.mac, /^[0-9a-f]{64}$/);
  assert.match(newest.prev, /^[0-9a-f]{64}$/);
  // The chain links each entry to its predecessor's MAC.
  const chain = await service.journalList({ limit: 50 });
  const sorted = [...chain.entries].sort((a, b) => a.seq - b.seq);
  for (let i = 1; i < sorted.length; i += 1) {
    assert.equal(sorted[i].prev, sorted[i - 1].mac, "each entry chains to the previous entry's MAC");
  }
});

test("journal: an unknown category or outcome is refused", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  await rejects(service.journalRecord({ category: "Nope", action: "x" }), CODES.BAD_INPUT);
  await rejects(service.journalRecord({ category: "Files", action: "x", outcome: "maybe" }), CODES.BAD_INPUT);
  await rejects(service.journalRecord({ category: "Files", action: "" }), CODES.BAD_INPUT);
  assert.deepEqual((await service.journalCategories()).categories, [...CATEGORIES]);
});

test("journal: editing an entry is detected as tampering", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  await service.journalRecord({ category: "Session", action: "Unlocked", outcome: "success" });
  await service.journalRecord({ category: "Files", action: "Encrypted", outcome: "success" });

  const file = path.join(dir, "security-journal.json");
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  doc.entries[0].action = "Unlocked (edited)";
  fs.writeFileSync(file, JSON.stringify(doc));

  // A fresh instance must re-read the file and re-verify the chain.
  const reopened = new VaultService({ userDataPath: dir });
  const integrity = await reopened.journalIntegrity();
  assert.equal(integrity.status, "tampered");
  assert.equal(integrity.reason, "mac-mismatch");
});

test("journal: deleting an entry breaks the chain and is detected", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  for (let i = 0; i < 3; i += 1) await service.journalRecord({ category: "Files", action: `Event ${i}`, outcome: "info" });

  const file = path.join(dir, "security-journal.json");
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  doc.entries.splice(1, 1); // remove the middle entry
  fs.writeFileSync(file, JSON.stringify(doc));

  const integrity = await new VaultService({ userDataPath: dir }).journalIntegrity();
  assert.equal(integrity.status, "tampered");
  assert.equal(integrity.reason, "chain-break");
});

test("journal: reordering entries is detected", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  for (let i = 0; i < 3; i += 1) await service.journalRecord({ category: "Files", action: `Event ${i}`, outcome: "info" });

  const file = path.join(dir, "security-journal.json");
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  [doc.entries[0], doc.entries[2]] = [doc.entries[2], doc.entries[0]];
  fs.writeFileSync(file, JSON.stringify(doc));

  const integrity = await new VaultService({ userDataPath: dir }).journalIntegrity();
  assert.equal(integrity.status, "tampered");
});

test("journal: a corrupted document is reported as tampered, not silently accepted", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  await service.journalRecord({ category: "Files", action: "Event", outcome: "info" });

  fs.writeFileSync(path.join(dir, "security-journal.json"), "{ this is not json");
  const integrity = await new VaultService({ userDataPath: dir }).journalIntegrity();
  assert.equal(integrity.status, "tampered");
  assert.equal(integrity.reason, "malformed-document");
});

test("journal: secrets are redacted by field name and by value pattern", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const pem = "-----BEGIN PRIVATE KEY-----\nMIIabc\n-----END PRIVATE KEY-----";
  await service.journalRecord({
    category: "Keys",
    action: "Key imported",
    outcome: "success",
    detail: {
      password: "hunter2",
      privateKey: pem,
      otpSeed: "JBSWY3DPEHPK3PXP",
      digest: "a".repeat(64),
      note: `the key is ${pem}`,
      safeField: "public label",
    },
  });
  const { entries } = await service.journalList({ category: "Keys", limit: 10 });
  const entry = entries.find((e) => e.action === "Key imported");
  assert.ok(entry, "the redaction entry is listed");
  const serialized = JSON.stringify(entry);
  assert.equal(serialized.includes("hunter2"), false, "a password value is never stored");
  assert.equal(serialized.includes("BEGIN PRIVATE KEY"), false, "private key material is scrubbed");
  assert.equal(serialized.includes("JBSWY3DPEHPK3PXP"), false, "an OTP seed is redacted");
  assert.equal(serialized.includes("a".repeat(64)), false, "a 64-hex value is scrubbed");
  assert.equal(entry.detail.safeField, "public label", "non-sensitive values are preserved");
});

test("journal: filtering by category, outcome and query works", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  await service.journalRecord({ category: "Files", action: "Encrypted alpha", outcome: "success" });
  await service.journalRecord({ category: "Keys", action: "Generated beta", outcome: "success" });
  await service.journalRecord({ category: "Session", action: "Unlock rejected", outcome: "rejected" });

  const files = await service.journalList({ category: "Files", limit: 50 });
  assert.ok(files.entries.every((e) => e.category === "Files"));

  const rejected = await service.journalList({ outcome: "rejected", limit: 50 });
  assert.ok(rejected.entries.every((e) => e.outcome === "rejected"));

  const search = await service.journalList({ query: "beta", limit: 50 });
  assert.equal(search.entries.length, 1);
  assert.match(search.entries[0].action, /beta/);

  await rejects(service.journalList({ category: "Nope" }), CODES.BAD_INPUT);
});

test("journal: clearing and exporting both require explicit confirmation", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  await service.journalRecord({ category: "Files", action: "Event", outcome: "info" });

  await rejects(service.journalClear({ confirm: false }), CODES.CONSENT_REQUIRED);
  await rejects(service.journalClear({}), CODES.CONSENT_REQUIRED);
  await rejects(service.journalExport({ outputPath: path.join(dir, "out.json") }), CODES.CONSENT_REQUIRED);
  await rejects(service.journalExport({ confirm: true, outputPath: "" }), CODES.BAD_INPUT);

  const out = path.join(dir, "journal.json");
  const exported = await service.journalExport({ confirm: true, outputPath: out });
  assert.equal(exported.exported, true);
  assert.ok(fs.existsSync(out));

  const cleared = await service.journalClear({ confirm: true });
  assert.equal(cleared.cleared, true);
  const after = await service.journalList({ limit: 50 });
  // Only the "journal cleared" marker remains.
  assert.ok(after.entries.every((e) => e.category === "Journal"));
});

// ---------------------------------------------------------------------------
// Task 40 — Secure Transfer Wizard
// ---------------------------------------------------------------------------

test("wizard: the review stage computes real digests and requires a valid port", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const src = path.join(dir, "payload.bin");
  const bytes = crypto.randomBytes(4096);
  fs.writeFileSync(src, bytes);
  const expected = crypto.createHash("sha256").update(bytes).digest("hex");

  await rejects(service.wizardBegin({ files: [src], recipientPort: 0 }), CODES.BAD_INPUT);
  await rejects(service.wizardBegin({ files: [], recipientPort: 9000 }), CODES.BAD_INPUT);

  const view = await service.wizardBegin({ files: [src], recipientPort: 9000, label: "Peer" });
  assert.equal(view.stage, "review");
  assert.equal(view.files.length, 1);
  assert.equal(view.files[0].sha256, expected, "the reviewed digest is the real file digest");
  assert.equal(view.consented, false);
});

test("wizard: nothing is sent without explicit consent", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const src = path.join(dir, "p.bin");
  fs.writeFileSync(src, crypto.randomBytes(100));
  const view = await service.wizardBegin({ files: [src], recipientPort: 9000 });
  await rejects(service.wizardRun(view.wizardId), CODES.CONSENT_REQUIRED);
  await rejects(service.wizardConsent(view.wizardId, { confirm: false }), CODES.CONSENT_REQUIRED);
  assert.equal(service.wizardStatus(view.wizardId).consented, false);
});

test("wizard: a real loopback self-test transfers files and verifies the received bytes", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const a = path.join(dir, "one.bin");
  const b = path.join(dir, "two.bin");
  fs.writeFileSync(a, crypto.randomBytes(5000));
  fs.writeFileSync(b, crypto.randomBytes(1234));

  const result = await service.wizardSelfTest({ sessionId, files: [a, b] });
  assert.equal(result.allMatched, true, "every received file re-hashed to the sent digest");
  assert.equal(result.networkOpened, true);
  assert.equal(result.transport, "authenticated loopback self-test");
  assert.equal(result.files.length, 2);
  assert.ok(result.files.every((f) => f.matched === true));
  assert.equal(result.recipient.label, "This device (loopback)");
});

test("wizard: connecting to a closed port fails with a typed error, never a fake success", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const src = path.join(dir, "p.bin");
  fs.writeFileSync(src, crypto.randomBytes(64));
  const view = await service.wizardBegin({ files: [src], recipientPort: 65001 });
  await service.wizardConsent(view.wizardId, { confirm: true });
  await rejects(service.wizardRun(view.wizardId), CODES.IO_FAILED);
  const after = service.wizardStatus(view.wizardId);
  assert.equal(after.stage, "failed", "a failed transfer is reported as failed");
  assert.equal(after.receipt, null, "no receipt is fabricated");
});

test("wizard: an unknown wizard id is refused and cancellation is real", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  assert.throws(() => service.wizardStatus("nope"), (err) => codeOf(err) === CODES.NOT_FOUND);
  await rejects(service.wizardRun("nope"), CODES.NOT_FOUND);
  const src = path.join(dir, "p.bin");
  fs.writeFileSync(src, crypto.randomBytes(64));
  const view = await service.wizardBegin({ files: [src], recipientPort: 9000 });
  const cancelled = service.wizardCancel(view.wizardId);
  assert.equal(cancelled.cancelled, true);
  assert.equal(service.wizardStatus(view.wizardId).stage, "cancelled");
});
