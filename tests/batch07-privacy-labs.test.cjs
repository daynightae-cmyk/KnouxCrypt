"use strict";

/**
 * Batch 07 (tasks 25-28) tests: Clipboard Guard, Secure Random, HMAC
 * Authenticity and Public Key QR.
 *
 * Everything here runs the real implementation: the real vault service, the
 * real OpenSSL HMAC, the real qrcode encoder and a real, decodable QR matrix.
 * The only substitute is the clipboard adapter, which is injected by design so
 * the lease logic can be exercised without a display server.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { VaultService } = require("../electron/vault/service");
const { ClipboardGuard, MIN_SECONDS, MAX_SECONDS } = require("../electron/vault/clipboard");
const labs = require("../electron/vault/labs");
const jsQR = require("jsqr");
const { CODES } = require("../electron/vault/errors");

const PASSWORD = "correct horse battery staple";
const KEY = "0123456789abcdef0123456789abcdef";

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "knoux-b7-"));
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

/** Like `rejects`, but for calls that throw synchronously before awaiting. */
async function rejectsCall(fn, code) {
  try {
    await fn();
  } catch (err) {
    assert.equal(codeOf(err), code, `expected ${code}, got ${codeOf(err)}: ${err.message}`);
    return err;
  }
  assert.fail(`expected a ${code} rejection`);
}

/** A deterministic in-memory clipboard. Records every write and clear. */
function memoryClipboard() {
  const state = { text: "", writes: [], clears: 0 };
  return {
    state,
    adapter: {
      writeText: (value) => {
        state.text = value;
        state.writes.push(value);
      },
      readText: () => state.text,
      clear: () => {
        state.text = "";
        state.clears += 1;
      },
    },
  };
}

async function unlocked(dir, options = {}) {
  const service = new VaultService({ userDataPath: dir, ...options });
  const { sessionId } = await service.enroll(PASSWORD);
  return { service, sessionId };
}

// ---------------------------------------------------------------------------
// Task 25 — Clipboard Guard
// ---------------------------------------------------------------------------

test("clipboard: a lease clears the clipboard when the value is unchanged", async () => {
  const clip = memoryClipboard();
  const guard = new ClipboardGuard({ adapter: clip.adapter });
  const lease = guard.copy({ text: "secret-token", seconds: MIN_SECONDS, confirm: true });
  assert.equal(lease.state, "armed");
  assert.equal(clip.state.text, "secret-token");
  await guard.clearNow(lease.leaseId);
  assert.equal(clip.state.text, "");
  assert.equal(clip.state.clears, 1);
});

test("clipboard: a changed clipboard is left untouched and reported as skipped", async () => {
  const clip = memoryClipboard();
  const guard = new ClipboardGuard({ adapter: clip.adapter });
  const lease = guard.copy({ text: "leased-value", seconds: MIN_SECONDS, confirm: true });
  // The user copies something else before the lease expires.
  clip.state.text = "user-copied-something-else";
  await guard.clearNow(lease.leaseId);
  assert.equal(clip.state.text, "user-copied-something-else", "the guard must not erase unrelated content");
  assert.equal(clip.state.clears, 0);
  assert.ok(guard.status().lastSkippedAt, "the skip is recorded, not hidden");
});

test("clipboard: arming without explicit confirmation is refused", () => {
  const clip = memoryClipboard();
  const guard = new ClipboardGuard({ adapter: clip.adapter });
  assert.throws(() => guard.copy({ text: "x", seconds: 15 }), (err) => codeOf(err) === CODES.CONSENT_REQUIRED);
  assert.throws(() => guard.copy({ text: "x", seconds: 15, confirm: "yes" }), (err) => codeOf(err) === CODES.CONSENT_REQUIRED);
});

test("clipboard: an out-of-range timer is refused", () => {
  const clip = memoryClipboard();
  const guard = new ClipboardGuard({ adapter: clip.adapter });
  assert.throws(() => guard.copy({ text: "x", seconds: 1, confirm: true }), (err) => codeOf(err) === CODES.BAD_INPUT);
  assert.throws(() => guard.copy({ text: "x", seconds: MAX_SECONDS + 1, confirm: true }), (err) => codeOf(err) === CODES.BAD_INPUT);
});

test("clipboard: an expired lease clears on its own timer", async () => {
  const clip = memoryClipboard();
  const guard = new ClipboardGuard({ adapter: clip.adapter });
  // Use the minimum lease, then wait it out. This is the real setTimeout path.
  guard.copy({ text: "short-lived", seconds: MIN_SECONDS, confirm: true });
  assert.equal(clip.state.text, "short-lived");
  await new Promise((resolve) => setTimeout(resolve, MIN_SECONDS * 1000 + 250));
  assert.equal(clip.state.text, "", "the lease must clear when it expires");
  assert.equal(clip.state.clears, 1);
});

test("clipboard: revoking the owning session disarms its lease", async () => {
  const clip = memoryClipboard();
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir, { clipboardAdapter: clip.adapter });
  const lease = await service.clipboardCopy({ sessionId, text: "session-bound", seconds: 120, confirm: true });
  assert.equal(service.clipboardStatus().armed, true);
  service.lock(sessionId, "user");
  assert.equal(service.clipboardStatus().armed, false, "a revoked session must not keep a live timer");
  assert.equal(clip.state.text, "session-bound", "disarming does not clear; it just stops the timer");
  assert.ok(lease.leaseId);
});

test("clipboard: verify never returns the raw clipboard text", async () => {
  const clip = memoryClipboard();
  const guard = new ClipboardGuard({ adapter: clip.adapter });
  const lease = guard.copy({ text: "top-secret", seconds: 30, confirm: true });
  const verdict = guard.verify(lease.leaseId);
  assert.deepEqual(Object.keys(verdict).sort(), ["leaseId", "length", "present"]);
  assert.equal(verdict.present, true);
  assert.equal(JSON.stringify(verdict).includes("top-secret"), false);
});

test("clipboard: a lease result never carries the value's digest", async () => {
  const clip = memoryClipboard();
  const { service, sessionId } = await unlocked(tmp(), { clipboardAdapter: clip.adapter });
  const secret = "low-entropy-password";
  const res = await service.clipboardCopy({ sessionId, text: secret, seconds: 15, confirm: true });
  assert.equal(res.state, "armed");
  // A digest of a low-entropy value is offline-reversible, so it must stay in
  // the main process and never appear in the renderer payload.
  const digest = crypto.createHash("sha256").update(secret, "utf8").digest("hex");
  const wire = JSON.stringify(res);
  assert.equal(wire.includes(digest), false);
  assert.equal(wire.includes(secret), false);
  assert.equal("hash" in res, false);
});

test("clipboard: an unsupported platform fails closed", () => {
  const guard = new ClipboardGuard({ adapter: null });
  assert.equal(guard.supported, false);
  assert.throws(() => guard.copy({ text: "x", seconds: 15, confirm: true }), (err) => codeOf(err) === CODES.UNSUPPORTED_FORMAT);
});

// ---------------------------------------------------------------------------
// Task 26 — Secure Random
// ---------------------------------------------------------------------------

test("random: hex output has the requested length and only hex characters", () => {
  const result = labs.randomBytes({ type: "hex", length: 32 });
  assert.equal(result.value.length, 64);
  assert.match(result.value, /^[0-9a-f]{64}$/);
  assert.equal(result.entropyBits, 256);
  assert.equal(result.source, "crypto.randomBytes");
});

test("random: base64 output is URL-safe and does not repeat between calls", () => {
  const a = labs.randomBytes({ type: "base64", length: 24 }).value;
  const b = labs.randomBytes({ type: "base64", length: 24 }).value;
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]+$/);
});

test("random: passphrases use only words from the validated wordlist", () => {
  const words = labs.randomBytes({ type: "passphrase", length: 8 }).value.split(" ");
  assert.equal(words.length, 8);
  for (const word of words) assert.ok(labs.PASSPHRASE_WORDS.includes(word), `${word} is not in the wordlist`);
  assert.equal(new Set(labs.PASSPHRASE_WORDS).size, 256, "the wordlist must be 256 unique words for 8 bits each");
});

test("random: passwords avoid visually ambiguous characters", () => {
  const value = labs.randomBytes({ type: "password", length: 32 }).value;
  assert.equal(value.length, 32);
  assert.doesNotMatch(value, /[0O1lI]/);
  assert.match(value, /^[A-Za-z0-9!@#$%^&*()\-_=+\[\]{}]+$/);
});

test("random: entropy is reported from the generator, not guessed", () => {
  assert.equal(labs.randomBytes({ type: "passphrase", length: 12 }).entropyBits, 96);
  const password = labs.randomBytes({ type: "password", length: 16 });
  assert.ok(Math.abs(password.entropyBits - 16 * labs.PASSWORD_ALPHABET_BITS) < 0.01);
});

test("random: rejection sampling is unbiased and skips out-of-range bytes", () => {
  // bound 200 -> limit = 200, so bytes 200..255 must be rejected. Feed two
  // rejected bytes followed by an accepted one and confirm the third is used.
  const sequence = [250, 255, 7];
  let i = 0;
  const rng = () => Buffer.from([sequence[i++]]);
  assert.equal(labs.uniformBelow(200, rng), 7);
  assert.equal(i, 3, "the two rejected bytes must be discarded");
});

test("random: uniformBelow covers the whole range without bias", () => {
  const counts = new Array(8).fill(0);
  for (let i = 0; i < 8000; i += 1) counts[labs.uniformBelow(8)] += 1;
  for (const count of counts) {
    // A sanity band: no bucket should be wildly over- or under-full.
    assert.ok(count > 750 && count < 1250, `bucket count ${count} looks biased`);
  }
});

test("random: an unknown type or bad length is refused", () => {
  assert.throws(() => labs.randomBytes({ type: "md5", length: 16 }), (err) => codeOf(err) === CODES.BAD_INPUT);
  assert.throws(() => labs.randomBytes({ type: "hex", length: 4 }), (err) => codeOf(err) === CODES.BAD_INPUT);
  assert.throws(() => labs.randomBytes({ type: "hex", length: 4096 }), (err) => codeOf(err) === CODES.BAD_INPUT);
});

test("random: the module never falls back to Math.random", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "electron", "vault", "labs.js"), "utf8");
  assert.equal(/Math\.random/.test(source), false, "Math.random must not appear in the CSPRNG module");
});

// ---------------------------------------------------------------------------
// Task 27 — HMAC Authenticity
// ---------------------------------------------------------------------------

test("hmac: RFC 4231 test case 1 matches the published vectors", () => {
  const key = Buffer.alloc(20, 0x0b).toString("hex");
  assert.equal(
    labs.hmacCompute({ algorithm: "SHA-256", message: "Hi There", key, keyEncoding: "hex" }).mac,
    "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
  );
  assert.equal(
    labs.hmacCompute({ algorithm: "SHA-384", message: "Hi There", key, keyEncoding: "hex" }).mac,
    "afd03944d84895626b0825f4ab46907f15f9dadbe4101ec682aa034c7cebc59cfaea9ea9076ede7f4af152e8b2fa9cb6",
  );
  assert.equal(
    labs.hmacCompute({ algorithm: "SHA-512", message: "Hi There", key, keyEncoding: "hex" }).mac,
    "87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854",
  );
});

test("hmac: RFC 4231 case 2's 4-byte key is refused by the key-length policy", () => {
  // RFC 4231 case 2 uses the 4-byte key "Jefe". This build deliberately
  // requires at least 16 key bytes, so the vector is unreachable by design and
  // the policy rejection is what gets asserted here.
  assert.throws(
    () => labs.hmacCompute({ algorithm: "SHA-256", message: "what do ya want for nothing?", key: "Jefe" }),
    (err) => codeOf(err) === CODES.BAD_INPUT,
  );
  assert.ok(labs.HMAC_MIN_KEY_BYTES >= 16);
});

test("hmac: RFC 4231 test cases 3 and 4 match the published vectors", () => {
  const case3 = labs.hmacCompute({
    algorithm: "SHA-256",
    message: Buffer.alloc(50, 0xdd).toString("latin1"),
    key: Buffer.alloc(20, 0xaa).toString("hex"),
    keyEncoding: "hex",
  });
  assert.equal(case3.mac, "6322b333d44a41a1ac9357671365b69c0df837a10783964e87fd0348b609d906");
  const case4 = labs.hmacCompute({
    algorithm: "SHA-256",
    message: "Test With Truncation",
    key: Buffer.alloc(20, 0x0c).toString("hex"),
    keyEncoding: "hex",
  });
  assert.equal(case4.mac, "a3b6167473100ee06e0c796c2955552bfa6f7c0a6a8aef8b93f860aab0cd20c5");
});

test("hmac: a streamed file produces the same MAC as the same bytes in memory", async () => {
  const dir = tmp();
  const file = path.join(dir, "payload.bin");
  const payload = crypto.randomBytes(3 * 1024 * 1024 + 17);
  fs.writeFileSync(file, payload);
  const streamed = await labs.hmacCompute({ algorithm: "SHA-256", key: KEY, inputPath: file });
  assert.equal(streamed.source, "file");
  assert.equal(streamed.messageBytes, payload.length);
  // Hash the same bytes in memory through Node's own HMAC and compare. This
  // proves the streaming path reads every byte exactly once, in order.
  const expected = crypto.createHmac("sha256", Buffer.from(KEY, "utf8")).update(payload).digest("hex");
  assert.equal(streamed.mac, expected);
});

test("hmac: a missing file reports NOT_FOUND", async () => {
  await rejects(labs.hmacCompute({ algorithm: "SHA-256", key: KEY, inputPath: path.join(tmp(), "nope.bin") }), CODES.NOT_FOUND);
});

test("hmac: providing both a message and a file is refused", () => {
  const file = path.join(tmp(), "a.txt");
  fs.writeFileSync(file, "data");
  assert.throws(() => labs.hmacCompute({ algorithm: "SHA-256", key: KEY, message: "x", inputPath: file }), (err) => codeOf(err) === CODES.BAD_INPUT);
});

test("hmac: comparison reports a mismatch without leaking a plaintext verdict", () => {
  const mac = labs.hmacCompute({ algorithm: "SHA-256", message: "abc", key: KEY }).mac;
  assert.equal(labs.hmacCompare(mac, mac).equal, true);
  const tampered = mac.slice(0, -1) + (mac.endsWith("a") ? "b" : "a");
  assert.equal(labs.hmacCompare(mac, tampered).equal, false);
  assert.equal(labs.hmacCompare(mac, mac.slice(0, 10)).equal, false);
});

test("hmac: a short key, a weak algorithm and an empty message are refused", () => {
  assert.throws(() => labs.hmacCompute({ algorithm: "SHA-256", message: "x", key: "short" }), (err) => codeOf(err) === CODES.BAD_INPUT);
  assert.throws(() => labs.hmacCompute({ algorithm: "MD5", message: "x", key: KEY }), (err) => codeOf(err) === CODES.BAD_INPUT);
  assert.throws(() => labs.hmacCompute({ algorithm: "SHA-256", message: "", key: KEY }), (err) => codeOf(err) === CODES.BAD_INPUT);
});

test("hmac: the service never echoes the key back to the caller", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const secretKey = "a-very-secret-key-value-1234567890";
  const result = await service.hmacCompute({ algorithm: "SHA-256", message: "hello", key: secretKey });
  assert.equal(JSON.stringify(result).includes(secretKey), false);
  assert.equal(result.mac.length, 64);
});

// ---------------------------------------------------------------------------
// Task 28 — Public Key QR
// ---------------------------------------------------------------------------

test("qr: the produced matrix decodes back to the exact public payload", () => {
  const payload = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKnouxExamplePublicKeyForQrTests";
  const result = labs.publicKeyQr({ text: payload });
  assert.equal(result.rows.length, result.size);
  assert.equal(result.rows[0].length, result.size);
  // Build an RGBA image and decode it with an independent QR reader.
  const scale = 4;
  const quiet = 4 * scale;
  const side = result.size * scale + quiet * 2;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let y = 0; y < result.size * scale; y += 1) {
    for (let x = 0; x < result.size * scale; x += 1) {
      if (result.rows[Math.floor(y / scale)][Math.floor(x / scale)] === "1") {
        const offset = ((y + quiet) * side + (x + quiet)) * 4;
        data[offset] = 0;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
        data[offset + 3] = 255;
      }
    }
  }
  const decoded = jsQR(data, side, side);
  assert.ok(decoded, "the generated matrix must be a scannable QR code");
  assert.equal(decoded.data, payload);
});

test("qr: a stored vault key renders its public PEM and reports the fingerprint", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const key = await service.keyGenerate(sessionId, { algorithm: "ED25519", name: "QR key" });
  const result = await service.publicKeyQr({ sessionId, keyId: key.id });
  assert.ok(result.payload.includes("PUBLIC KEY"));
  assert.equal(result.fingerprint, key.fingerprint);
  assert.equal(result.payload.includes("PRIVATE KEY"), false);
});

test("qr: private key material is refused", () => {
  assert.throws(
    () => labs.publicKeyQr({ text: "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----" }),
    (err) => codeOf(err) === CODES.BAD_INPUT,
  );
});

test("qr: an empty or oversized payload is refused", () => {
  assert.throws(() => labs.publicKeyQr({ text: "   " }), (err) => codeOf(err) === CODES.BAD_INPUT);
  assert.throws(() => labs.publicKeyQr({ text: "A".repeat(2000) }), (err) => codeOf(err) === CODES.BAD_INPUT);
});

test("qr: an unknown key id reports NOT_FOUND and a keyless key is refused", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  await rejects(service.publicKeyQr({ sessionId, keyId: "deadbeef" }), CODES.NOT_FOUND);
  const secret = await service.keyGenerate(sessionId, { algorithm: "HMAC_256", name: "secret key" });
  await rejects(service.publicKeyQr({ sessionId, keyId: secret.id }), CODES.BAD_INPUT);
});

// ---------------------------------------------------------------------------
// Session authorization across the new IPC surface
// ---------------------------------------------------------------------------

test("labs: a revoked session cannot use the clipboard or qr services", async () => {
  const clip = memoryClipboard();
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir, { clipboardAdapter: clip.adapter });
  service.lock(sessionId, "user");
  await rejectsCall(() => service.clipboardCopy({ sessionId, text: "x", seconds: 15, confirm: true }), CODES.SESSION_REQUIRED);
  await rejectsCall(() => service.publicKeyQr({ sessionId, keyId: "whatever" }), CODES.SESSION_REQUIRED);
});
