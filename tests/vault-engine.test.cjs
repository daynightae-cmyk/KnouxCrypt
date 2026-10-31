"use strict";

/**
 * Real functional + negative tests for the KnouxCrypt vault engine.
 * Run with: node --test tests/vault-engine.test.cjs
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");

const { VaultEngine } = require("../electron/vault/engine");
const { CODES } = require("../electron/vault/errors");
const { KDF } = require("../electron/vault/kdf");

// Fast KDF parameters keep the suite quick; the production default stays at
// 600k PBKDF2 iterations.
const FAST = { kdfId: KDF.PBKDF2_SHA256, iterations: 100000 };
const PASSWORD = "correct horse battery staple";

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "knoux-vault-test-"));
}

function engine(overrides = {}) {
  return new VaultEngine({ kdfParams: FAST, chunkSize: 4096, ...overrides });
}

function codeOf(fn) {
  try {
    fn();
  } catch (err) {
    return err.code;
  }
  return null;
}

test("buffer round trip with password", () => {
  const e = engine();
  const plain = Buffer.from("KnouxCrypt authenticated vault payload — مرحبا", "utf8");
  const { bytes, meta } = e.encryptBuffer(plain, PASSWORD);
  assert.notEqual(bytes.toString("latin1"), plain.toString("latin1"));
  assert.equal(meta.origSize, plain.length);
  const out = e.decryptBuffer(bytes, PASSWORD);
  assert.deepEqual(out.plaintext, plain);
});

test("buffer round trip with a raw 32-byte key", () => {
  const e = engine();
  const key = crypto.randomBytes(32);
  const plain = Buffer.from("raw key payload");
  const { bytes, meta } = e.encryptBuffer(plain, { rawKey: key });
  assert.equal(meta.kdfId, KDF.RAW_KEY);
  assert.deepEqual(e.decryptBuffer(bytes, { rawKey: key }).plaintext, plain);
  // A password must not silently substitute for the missing raw key.
  const code = codeOf(() => e.decryptBuffer(bytes, PASSWORD));
  assert.ok([CODES.BAD_INPUT, CODES.INTEGRITY_FAILED].includes(code), `got ${code}`);
});

test("empty payload round trips", () => {
  const e = engine();
  const { bytes } = e.encryptBuffer(Buffer.alloc(0), PASSWORD);
  assert.equal(e.decryptBuffer(bytes, PASSWORD).plaintext.length, 0);
});

test("wrong password is rejected", () => {
  const e = engine();
  const { bytes } = e.encryptBuffer(Buffer.from("secret"), PASSWORD);
  const code = codeOf(() => e.decryptBuffer(bytes, "wrong password"));
  assert.ok([CODES.INTEGRITY_FAILED, CODES.AUTH_FAILED].includes(code), `got ${code}`);
});

test("tampered ciphertext is detected", () => {
  const e = engine();
  const { bytes } = e.encryptBuffer(Buffer.from("x".repeat(200)), PASSWORD);
  const copy = Buffer.from(bytes);
  // Flip a byte inside the first ciphertext frame (after the 128-byte header).
  copy[140] ^= 0xff;
  const code = codeOf(() => e.decryptBuffer(copy, PASSWORD));
  assert.ok([CODES.AUTH_FAILED, CODES.INTEGRITY_FAILED].includes(code), `got ${code}`);
});

test("tampered header is detected before any decryption", () => {
  const e = engine();
  const { bytes } = e.encryptBuffer(Buffer.from("header check"), PASSWORD);
  const copy = Buffer.from(bytes);
  copy[36] ^= 0x01; // chunkSize field inside the MAC-protected prefix
  assert.equal(codeOf(() => e.decryptBuffer(copy, PASSWORD)), CODES.INTEGRITY_FAILED);
});

test("truncated container is rejected", () => {
  const e = engine();
  const { bytes } = e.encryptBuffer(Buffer.from("y".repeat(500)), PASSWORD);
  assert.equal(codeOf(() => e.decryptBuffer(bytes.subarray(0, bytes.length - 8), PASSWORD)), CODES.TRUNCATED);
});

test("appended garbage is rejected", () => {
  const e = engine();
  const { bytes } = e.encryptBuffer(Buffer.from("z".repeat(500)), PASSWORD);
  const withGarbage = Buffer.concat([bytes, Buffer.from("garbage")]);
  const code = codeOf(() => e.decryptBuffer(withGarbage, PASSWORD));
  assert.ok([CODES.TRUNCATED, CODES.INTEGRITY_FAILED].includes(code), `got ${code}`);
});

test("missing end-of-stream sentinel is rejected", () => {
  const e = engine();
  const { bytes } = e.encryptBuffer(Buffer.from("no sentinel"), PASSWORD);
  // Remove the 4-byte sentinel that sits just before the 32-byte trailing MAC.
  const mangled = Buffer.concat([bytes.subarray(0, bytes.length - 36), bytes.subarray(bytes.length - 32)]);
  assert.equal(codeOf(() => e.decryptBuffer(mangled, PASSWORD)), CODES.TRUNCATED);
});

test("non-vault data is rejected with NOT_A_VAULT", () => {
  const e = engine();
  const notVault = Buffer.alloc(256, 7);
  assert.equal(codeOf(() => e.decryptBuffer(notVault, PASSWORD)), CODES.NOT_A_VAULT);
});

test("streaming file round trip across many chunks", async () => {
  const dir = tmpDir();
  const input = path.join(dir, "large.bin");
  const encrypted = path.join(dir, "large.knv");
  const restored = path.join(dir, "restored.bin");
  const payload = crypto.randomBytes(4096 * 7 + 123);
  await fsp.writeFile(input, payload);

  const e = engine();
  const progress = [];
  const enc = await e.encryptFile({
    inputPath: input,
    outputPath: encrypted,
    password: PASSWORD,
    onProgress: (p) => progress.push(p.processed),
  });
  assert.equal(enc.meta.origSize, payload.length);
  assert.ok(progress.length >= 7, `expected >=7 progress events, got ${progress.length}`);

  const dec = await e.decryptFile({ inputPath: encrypted, outputPath: restored, password: PASSWORD });
  assert.equal(dec.meta.origSize, payload.length);
  assert.deepEqual(await fsp.readFile(restored), payload);
  await fsp.rm(dir, { recursive: true, force: true });
});

test("streaming decrypt with wrong password fails and leaves no output", async () => {
  const dir = tmpDir();
  const input = path.join(dir, "a.bin");
  const encrypted = path.join(dir, "a.knv");
  const restored = path.join(dir, "a.out");
  await fsp.writeFile(input, crypto.randomBytes(10000));

  const e = engine();
  await e.encryptFile({ inputPath: input, outputPath: encrypted, password: PASSWORD });
  await assert.rejects(
    () => e.decryptFile({ inputPath: encrypted, outputPath: restored, password: "nope" }),
    (err) => [CODES.INTEGRITY_FAILED, CODES.AUTH_FAILED].includes(err.code),
  );
  assert.equal(fs.existsSync(restored), false, "no partial plaintext may remain");
  // No temp files left behind either.
  const leftovers = fs.readdirSync(dir).filter((f) => f.includes(".knoux-"));
  assert.deepEqual(leftovers, []);
  await fsp.rm(dir, { recursive: true, force: true });
});

test("streaming decrypt of corrupted ciphertext fails and leaves no output", async () => {
  const dir = tmpDir();
  const input = path.join(dir, "b.bin");
  const encrypted = path.join(dir, "b.knv");
  const restored = path.join(dir, "b.out");
  await fsp.writeFile(input, crypto.randomBytes(9000));
  const e = engine();
  await e.encryptFile({ inputPath: input, outputPath: encrypted, password: PASSWORD });

  const buf = await fsp.readFile(encrypted);
  buf[buf.length - 40] ^= 0xff; // flip a byte inside a ciphertext frame
  await fsp.writeFile(encrypted, buf);

  await assert.rejects(
    () => e.decryptFile({ inputPath: encrypted, outputPath: restored, password: PASSWORD }),
    (err) => [CODES.AUTH_FAILED, CODES.INTEGRITY_FAILED].includes(err.code),
  );
  assert.equal(fs.existsSync(restored), false);
  await fsp.rm(dir, { recursive: true, force: true });
});

test("streaming decrypt of a truncated file fails", async () => {
  const dir = tmpDir();
  const input = path.join(dir, "c.bin");
  const encrypted = path.join(dir, "c.knv");
  const restored = path.join(dir, "c.out");
  await fsp.writeFile(input, crypto.randomBytes(9000));
  const e = engine();
  await e.encryptFile({ inputPath: input, outputPath: encrypted, password: PASSWORD });
  const buf = await fsp.readFile(encrypted);
  await fsp.writeFile(encrypted, buf.subarray(0, buf.length - 100));
  await assert.rejects(
    () => e.decryptFile({ inputPath: encrypted, outputPath: restored, password: PASSWORD }),
    (err) => err.code === CODES.TRUNCATED,
  );
  await fsp.rm(dir, { recursive: true, force: true });
});

test("output path conflict is refused without overwriting", async () => {
  const dir = tmpDir();
  const input = path.join(dir, "d.bin");
  const encrypted = path.join(dir, "d.knv");
  await fsp.writeFile(input, crypto.randomBytes(2048));
  const e = engine();
  await e.encryptFile({ inputPath: input, outputPath: encrypted, password: PASSWORD });
  const before = await fsp.readFile(encrypted);
  await assert.rejects(
    () => e.encryptFile({ inputPath: input, outputPath: encrypted, password: PASSWORD }),
    (err) => err.code === CODES.PATH_CONFLICT,
  );
  assert.deepEqual(await fsp.readFile(encrypted), before);
  await fsp.rm(dir, { recursive: true, force: true });
});

test("aborted write cleans up temp files and produces no output", async () => {
  const dir = tmpDir();
  const input = path.join(dir, "e.bin");
  const encrypted = path.join(dir, "e.knv");
  await fsp.writeFile(input, crypto.randomBytes(4096 * 5));
  const controller = new AbortController();
  const e = engine();
  await assert.rejects(
    () =>
      e.encryptFile({
        inputPath: input,
        outputPath: encrypted,
        password: PASSWORD,
        signal: controller.signal,
        onProgress: () => controller.abort(),
      }),
    (err) => err.code === CODES.CANCELLED,
  );
  assert.equal(fs.existsSync(encrypted), false, "aborted operation must not commit output");
  const leftovers = fs.readdirSync(dir).filter((f) => f.includes(".knoux-"));
  assert.deepEqual(leftovers, [], "aborted operation must not leave temp files");
  await fsp.rm(dir, { recursive: true, force: true });
});

test("inspect reads header metadata without the password", async () => {
  const dir = tmpDir();
  const input = path.join(dir, "f.bin");
  const encrypted = path.join(dir, "f.knv");
  const payload = crypto.randomBytes(3000);
  await fsp.writeFile(input, payload);
  const e = engine();
  const { meta } = await e.encryptFile({ inputPath: input, outputPath: encrypted, password: PASSWORD });
  const info = await e.inspect(encrypted);
  assert.equal(info.isVault, true);
  assert.equal(info.origSize, payload.length);
  assert.equal(info.plaintextSha256, meta.plaintextSha256);
  await fsp.rm(dir, { recursive: true, force: true });
});

test("non-vault file fails inspection", async () => {
  const dir = tmpDir();
  const file = path.join(dir, "plain.txt");
  await fsp.writeFile(file, "just text, definitely not a vault");
  const e = engine();
  await assert.rejects(() => e.inspect(file), (err) => err.code === CODES.NOT_A_VAULT);
  await fsp.rm(dir, { recursive: true, force: true });
});

test("reordered chunks are detected by the content MAC", async () => {
  const e = engine({ chunkSize: 16 });
  const { bytes } = e.encryptBuffer(Buffer.from("A".repeat(64)), PASSWORD);
  // Locate the two 16-byte frames after the 128-byte header.
  const headerEnd = 96 + 32;
  const frame1Start = headerEnd + 4;
  const frame1 = bytes.subarray(frame1Start, frame1Start + 32); // 16 ct + 16 tag
  const frame2 = bytes.subarray(frame1Start + 36, frame1Start + 36 + 32);
  const swapped = Buffer.concat([
    bytes.subarray(0, frame1Start),
    frame2,
    bytes.subarray(frame1Start + 32, frame1Start + 36),
    frame1,
    bytes.subarray(frame1Start + 68),
  ]);
  const code = codeOf(() => e.decryptBuffer(swapped, PASSWORD));
  assert.ok([CODES.AUTH_FAILED, CODES.INTEGRITY_FAILED].includes(code), `got ${code}`);
});
