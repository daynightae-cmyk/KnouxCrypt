"use strict";

/**
 * Task 04 (FILE_CIPHER) acceptance tests.
 *
 * Covers the mission's required cases end to end through the real VaultService:
 * tiny/large/binary files, wrong password, truncated and tampered containers,
 * aborted writes, revoked sessions, path conflicts, source preservation, and
 * the guarantee that no disk/volume encryption is attempted.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");

const { VaultService } = require("../electron/vault/service");
const { VaultSessionManager } = require("../electron/vault/session");
const { VaultEngine } = require("../electron/vault/engine");
const { CODES } = require("../electron/vault/errors");
const { KDF } = require("../electron/vault/kdf");
const acl = require("../electron/vault/acl");

const PASSWORD = "correct horse battery staple";

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "knoux-cipher-test-"));
  const manager = new VaultSessionManager({ enrollmentPath: path.join(dir, "enrollment.json"), iterations: 100000 });
  const engine = new VaultEngine({ kdfParams: { kdfId: KDF.RAW_KEY }, chunkSize: 64 * 1024 });
  const service = new VaultService({ userDataPath: dir, manager, engine });
  return { dir, service };
}

async function unlocked() {
  const { dir, service } = setup();
  await service.enroll(PASSWORD);
  service.lockAll("test");
  const { sessionId } = await service.unlock(PASSWORD);
  return { dir, service, sessionId };
}

async function codeOf(promise) {
  try {
    await promise;
  } catch (err) {
    return err.code;
  }
  return null;
}

function writeFixture(dir, name, buffer) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, buffer);
  return file;
}

test("tiny file round trip preserves exact bytes", async () => {
  const { dir, service, sessionId } = await unlocked();
  const marker = Buffer.from("KNOUX-PLAINTEXT-MARKER-0123456789", "utf8");
  const input = writeFixture(dir, "tiny.txt", marker);
  const enc = path.join(dir, "tiny.knv");
  const dec = path.join(dir, "tiny.out");

  await service.encryptFile({ sessionId, inputPath: input, outputPath: enc, operationId: "t1" });
  const meta = await service.decryptFile({ sessionId, inputPath: enc, outputPath: dec, operationId: "t2" });

  assert.equal(meta.meta.origSize, marker.length);
  assert.deepEqual(fs.readFileSync(dec), marker);
  // A distinctive multi-byte marker must not survive anywhere in the container.
  assert.equal(fs.readFileSync(enc).includes(marker), false, "plaintext marker must not survive in the container");
});

test("a single-byte file round trips", async () => {
  const { dir, service, sessionId } = await unlocked();
  const input = writeFixture(dir, "one-byte.bin", Buffer.from([0x61]));
  const enc = path.join(dir, "one-byte.knv");
  const dec = path.join(dir, "one-byte.out");
  await service.encryptFile({ sessionId, inputPath: input, outputPath: enc, operationId: "ob1" });
  await service.decryptFile({ sessionId, inputPath: enc, outputPath: dec, operationId: "ob2" });
  assert.deepEqual(fs.readFileSync(dec), Buffer.from([0x61]));
});

test("an empty file round trips", async () => {
  const { dir, service, sessionId } = await unlocked();
  const input = writeFixture(dir, "empty.bin", Buffer.alloc(0));
  const enc = path.join(dir, "empty.knv");
  const dec = path.join(dir, "empty.out");
  const result = await service.encryptFile({ sessionId, inputPath: input, outputPath: enc, operationId: "e1" });
  assert.equal(result.meta.origSize, 0);
  const back = await service.decryptFile({ sessionId, inputPath: enc, outputPath: dec, operationId: "e2" });
  assert.equal(back.meta.origSize, 0);
  assert.equal(fs.statSync(dec).size, 0);
});

test("large file round trip spans many authenticated chunks", async () => {
  const { dir, service, sessionId } = await unlocked();
  const payload = crypto.randomBytes(3 * 1024 * 1024 + 17);
  const input = writeFixture(dir, "large.bin", payload);
  const enc = path.join(dir, "large.knv");
  const dec = path.join(dir, "large.out");

  const progress = [];
  service.onProgress = (p) => progress.push(p.processed);
  await service.encryptFile({ sessionId, inputPath: input, outputPath: enc, operationId: "l1" });
  const result = await service.decryptFile({ sessionId, inputPath: enc, outputPath: dec, operationId: "l2" });

  assert.equal(result.meta.origSize, payload.length);
  assert.ok(progress.length > 1, "progress must be reported per chunk");
  assert.ok(fs.readFileSync(dec).equals(payload), "recovered bytes must match the original exactly");
});

test("binary file with all byte values round trips", async () => {
  const { dir, service, sessionId } = await unlocked();
  const payload = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
  const input = writeFixture(dir, "all-bytes.bin", payload);
  const enc = path.join(dir, "all-bytes.knv");
  const dec = path.join(dir, "all-bytes.out");

  await service.encryptFile({ sessionId, inputPath: input, outputPath: enc, operationId: "b1" });
  await service.decryptFile({ sessionId, inputPath: enc, outputPath: dec, operationId: "b2" });
  assert.ok(fs.readFileSync(dec).equals(payload));
});

test("decrypting with a different vault password fails and writes nothing", async () => {
  const { dir, service, sessionId } = await unlocked();
  const input = writeFixture(dir, "secret.txt", Buffer.from("classified payload"));
  const enc = path.join(dir, "secret.knv");
  const dec = path.join(dir, "secret.out");

  await service.encryptFile({ sessionId, inputPath: input, outputPath: enc, operationId: "w1" });
  const container = fs.readFileSync(enc);

  // A second vault with a different password must not open the container.
  const other = setup();
  await other.service.enroll("a completely different password");
  other.service.lockAll("test");
  const { sessionId: otherSession } = await other.service.unlock("a completely different password");

  const code = await codeOf(other.service.decryptFile({ sessionId: otherSession, inputPath: enc, outputPath: dec, operationId: "w2" }));
  assert.equal(code, CODES.INTEGRITY_FAILED);
  assert.equal(fs.existsSync(dec), false, "no plaintext output may be produced on failure");
  assert.ok(fs.readFileSync(enc).equals(container), "the container must be untouched by a failed decrypt");
});

test("a single flipped byte in the ciphertext body is detected", async () => {
  const { dir, service, sessionId } = await unlocked();
  const input = writeFixture(dir, "flip.bin", crypto.randomBytes(200000));
  const enc = path.join(dir, "flip.knv");
  const dec = path.join(dir, "flip.out");
  await service.encryptFile({ sessionId, inputPath: input, outputPath: enc, operationId: "f1" });

  const bytes = fs.readFileSync(enc);
  // Flip a byte well past the header and header MAC, inside the first frame.
  bytes[bytes.length - 100] ^= 0xff;
  fs.writeFileSync(enc, bytes);

  const code = await codeOf(service.decryptFile({ sessionId, inputPath: enc, outputPath: dec, operationId: "f2" }));
  assert.ok([CODES.INTEGRITY_FAILED, CODES.AUTH_FAILED].includes(code), `expected integrity/auth failure, got ${code}`);
  assert.equal(fs.existsSync(dec), false);
});

test("a truncated container is rejected", async () => {
  const { dir, service, sessionId } = await unlocked();
  const input = writeFixture(dir, "trunc.bin", crypto.randomBytes(300000));
  const enc = path.join(dir, "trunc.knv");
  const dec = path.join(dir, "trunc.out");
  await service.encryptFile({ sessionId, inputPath: input, outputPath: enc, operationId: "r1" });

  const bytes = fs.readFileSync(enc);
  fs.writeFileSync(enc, bytes.subarray(0, bytes.length - 5000));

  const code = await codeOf(service.decryptFile({ sessionId, inputPath: enc, outputPath: dec, operationId: "r2" }));
  assert.ok([CODES.TRUNCATED, CODES.INTEGRITY_FAILED].includes(code), `expected truncation failure, got ${code}`);
  assert.equal(fs.existsSync(dec), false);
});

test("a reordered chunk is detected by the content MAC", async () => {
  const { dir, service, sessionId } = await unlocked();
  const input = writeFixture(dir, "reorder.bin", crypto.randomBytes(300000));
  const enc = path.join(dir, "reorder.knv");
  const dec = path.join(dir, "reorder.out");
  await service.encryptFile({ sessionId, inputPath: input, outputPath: enc, operationId: "o1" });

  const bytes = fs.readFileSync(enc);
  // Swap the first two frames (each: 4-byte length + ciphertext + 16-byte tag).
  const headerLen = 96 + 32;
  const len1 = bytes.readUInt32BE(headerLen);
  const frame1 = bytes.subarray(headerLen, headerLen + 4 + len1);
  const len2 = bytes.readUInt32BE(headerLen + 4 + len1);
  const frame2 = bytes.subarray(headerLen + 4 + len1, headerLen + 4 + len1 + 4 + len2);
  const swapped = Buffer.concat([bytes.subarray(0, headerLen), frame2, frame1, bytes.subarray(headerLen + 4 + len1 + 4 + len2)]);
  fs.writeFileSync(enc, swapped);

  const code = await codeOf(service.decryptFile({ sessionId, inputPath: enc, outputPath: dec, operationId: "o2" }));
  assert.ok(code !== null, "reordered chunks must not decrypt successfully");
  assert.equal(fs.existsSync(dec), false);
});

test("a container with an unsupported format version is refused", async () => {
  const { dir, service, sessionId } = await unlocked();
  const input = writeFixture(dir, "version.bin", crypto.randomBytes(50000));
  const enc = path.join(dir, "version.knv");
  const dec = path.join(dir, "version.out");
  await service.encryptFile({ sessionId, inputPath: input, outputPath: enc, operationId: "fv1" });

  const bytes = fs.readFileSync(enc);
  bytes[8] = 99; // the version byte in the header prefix
  fs.writeFileSync(enc, bytes);

  const code = await codeOf(service.decryptFile({ sessionId, inputPath: enc, outputPath: dec, operationId: "fv2" }));
  assert.equal(code, CODES.UNSUPPORTED_FORMAT);
  assert.equal(fs.existsSync(dec), false);
});

test("inspection of an unsupported version is refused without the key", async () => {
  const { dir, service, sessionId } = await unlocked();
  const input = writeFixture(dir, "version-inspect.bin", crypto.randomBytes(50000));
  const enc = path.join(dir, "version-inspect.knv");
  await service.encryptFile({ sessionId, inputPath: input, outputPath: enc, operationId: "fvi1" });
  const bytes = fs.readFileSync(enc);
  bytes[8] = 42;
  fs.writeFileSync(enc, bytes);
  const code = await codeOf(service.inspect(enc));
  assert.equal(code, CODES.UNSUPPORTED_FORMAT);
});

test("a container whose header was rewritten is rejected before decryption", async () => {
  const { dir, service, sessionId } = await unlocked();
  const input = writeFixture(dir, "header.bin", crypto.randomBytes(50000));
  const enc = path.join(dir, "header.knv");
  const dec = path.join(dir, "header.out");
  await service.encryptFile({ sessionId, inputPath: input, outputPath: enc, operationId: "hd1" });

  const bytes = fs.readFileSync(enc);
  bytes[60] ^= 0xff; // inside the MAC-protected header prefix
  fs.writeFileSync(enc, bytes);

  const code = await codeOf(service.decryptFile({ sessionId, inputPath: enc, outputPath: dec, operationId: "hd2" }));
  assert.ok([CODES.INTEGRITY_FAILED, CODES.AUTH_FAILED].includes(code), `expected header MAC failure, got ${code}`);
  assert.equal(fs.existsSync(dec), false);
});

test("a non-vault file is rejected as NOT_A_VAULT", async () => {
  const { dir, service, sessionId } = await unlocked();
  // Long enough to carry a full header, so the magic check is reached instead
  // of the length check.
  const input = writeFixture(dir, "not-a-vault.bin", Buffer.alloc(4096, 0x7a));
  const dec = path.join(dir, "nope.out");
  const code = await codeOf(service.decryptFile({ sessionId, inputPath: input, outputPath: dec, operationId: "n1" }));
  assert.equal(code, CODES.NOT_A_VAULT);
  assert.equal(fs.existsSync(dec), false);
});

test("a file shorter than a container header is reported as truncated", async () => {
  const { dir, service, sessionId } = await unlocked();
  const input = writeFixture(dir, "too-short.bin", Buffer.from("just some ordinary file contents"));
  const dec = path.join(dir, "too-short.out");
  const code = await codeOf(service.decryptFile({ sessionId, inputPath: input, outputPath: dec, operationId: "ts1" }));
  assert.equal(code, CODES.TRUNCATED);
  assert.equal(fs.existsSync(dec), false);
});

test("an existing output file is refused without being overwritten", async () => {
  const { dir, service, sessionId } = await unlocked();
  const input = writeFixture(dir, "conflict.txt", Buffer.from("source data"));
  const enc = writeFixture(dir, "conflict.knv", Buffer.from("pre-existing contents"));

  const code = await codeOf(service.encryptFile({ sessionId, inputPath: input, outputPath: enc, operationId: "c1" }));
  assert.equal(code, CODES.PATH_CONFLICT);
  assert.equal(fs.readFileSync(enc).toString(), "pre-existing contents", "the existing file must be preserved byte for byte");
});

test("a missing input file reports NOT_FOUND", async () => {
  const { dir, service, sessionId } = await unlocked();
  const code = await codeOf(service.encryptFile({ sessionId, inputPath: path.join(dir, "absent.bin"), outputPath: path.join(dir, "out.knv"), operationId: "m1" }));
  assert.equal(code, CODES.NOT_FOUND);
});

test("an unwritable destination fails cleanly and leaves no partial output", async (t) => {
  if (process.platform !== "win32" && process.getuid && process.getuid() === 0) {
    t.skip("running as root: POSIX write bits are not enforced against root");
    return;
  }
  const { dir, service, sessionId } = await unlocked();
  const input = writeFixture(dir, "readonly-src.bin", crypto.randomBytes(200000));
  const locked = path.join(dir, "locked-dir");
  fs.mkdirSync(locked, { recursive: true, mode: 0o500 });
  const target = path.join(locked, "out.knv");

  try {
    // Use whatever the platform truly enforces. `chmod 0o500` on a directory is
    // not a Windows denial at all — libuv maps the mode onto the read-only
    // attribute, so writes keep succeeding and this test was failing for the
    // right reason: the app had never been shown a real denial on Windows. Here
    // it is an explicit NTFS DENY ACE for WriteData/AddFile, which Windows
    // evaluates before the owner's Allow ACE.
    const denial = await acl.denyChildCreation(locked);
    if (process.platform === "win32") {
      assert.equal(denial.mechanism, "ntfs-deny-ace", "Windows denial must come from an ACL, not a mode");
    }

    // Fail if the platform did not actually refuse, otherwise the assertions
    // below would pass without exercising the error path at all.
    let refused = false;
    try {
      fs.writeFileSync(path.join(locked, "sanity.tmp"), Buffer.from("x"));
    } catch {
      refused = true;
    }
    assert.ok(refused, "the harness must genuinely deny writes to this directory");

    const code = await codeOf(service.encryptFile({ sessionId, inputPath: input, outputPath: target, operationId: "ro1" }));
    assert.equal(code, CODES.PERMISSION_DENIED, "a platform denial must be reported as its own condition, not a generic failure");
    assert.equal(fs.existsSync(target), false, "no partial output may exist");
    const leftovers = fs.readdirSync(locked).filter((name) => name.endsWith(".tmp"));
    assert.deepEqual(leftovers, [], "no temp file may be left behind");
  } finally {
    // Leave the tree deletable: on Windows a chmod cannot undo an ACE.
    await acl.allowChildCreation(locked).catch(() => {});
    fs.chmodSync(locked, 0o700);
  }
});

test("an encrypted output is confined to its owner", async () => {
  const { dir, service, sessionId } = await unlocked();
  const input = writeFixture(dir, "ro-src.bin", crypto.randomBytes(10000));
  const output = path.join(dir, "ro-out.knv");
  await service.encryptFile({ sessionId, inputPath: input, outputPath: output, operationId: "ro2" });
  assert.ok(fs.existsSync(output));
  const verdict = await acl.isProtected(output, { exhaustive: true });
  assert.equal(verdict.ok, true, `encrypted container must be owner-only: ${verdict.detail}`);
  // The source, which the app did not create, is left exactly as it was.
  assert.ok(fs.existsSync(input));
});

test("the destination directory must already exist", async () => {
  const { dir, service, sessionId } = await unlocked();
  const input = writeFixture(dir, "nodir-src.bin", Buffer.from("data"));
  const code = await codeOf(service.encryptFile({ sessionId, inputPath: input, outputPath: path.join(dir, "missing-dir", "out.knv"), operationId: "nd1" }));
  assert.equal(code, CODES.IO_FAILED);
});

test("the source file is never modified or deleted by encryption", async () => {
  const { dir, service, sessionId } = await unlocked();
  const payload = crypto.randomBytes(50000);
  const input = writeFixture(dir, "preserve.bin", payload);
  const before = fs.statSync(input);
  await service.encryptFile({ sessionId, inputPath: input, outputPath: path.join(dir, "preserve.knv"), operationId: "p1" });
  const after = fs.statSync(input);
  assert.ok(fs.existsSync(input), "source must still exist");
  assert.ok(fs.readFileSync(input).equals(payload), "source bytes must be unchanged");
  assert.equal(after.mtimeMs, before.mtimeMs, "source must not be touched");
});

test("cancelling an in-flight encryption leaves no output and no temp files", async () => {
  const { dir, service, sessionId } = await unlocked();
  const input = writeFixture(dir, "abort.bin", crypto.randomBytes(4 * 1024 * 1024));
  const enc = path.join(dir, "abort.knv");

  const promise = service.encryptFile({ sessionId, inputPath: input, outputPath: enc, operationId: "a1" });
  // Cancel once the first chunk has been written.
  await new Promise((resolve) => setTimeout(resolve, 15));
  service.cancel("a1");
  const code = await codeOf(promise);

  assert.equal(code, CODES.CANCELLED);
  assert.equal(fs.existsSync(enc), false, "no partial container may be committed");
  const leftovers = fs.readdirSync(dir).filter((name) => name.includes("knoux-") && name.endsWith(".tmp"));
  assert.deepEqual(leftovers, [], "temporary files must be cleaned up");
});

test("a revoked session cannot encrypt or decrypt files", async () => {
  const { dir, service, sessionId } = await unlocked();
  const input = writeFixture(dir, "revoked.txt", Buffer.from("data"));
  const enc = path.join(dir, "revoked.knv");

  await service.encryptFile({ sessionId, inputPath: input, outputPath: enc, operationId: "v1" });
  service.lock(sessionId, "user");

  assert.equal(await codeOf(service.encryptFile({ sessionId, inputPath: input, outputPath: path.join(dir, "v2.knv"), operationId: "v2" })), CODES.SESSION_REQUIRED);
  assert.equal(await codeOf(service.decryptFile({ sessionId, inputPath: enc, outputPath: path.join(dir, "v2.out"), operationId: "v3" })), CODES.SESSION_REQUIRED);
});

test("a guest session cannot run file operations", async () => {
  const { dir, service } = await unlocked();
  const guest = service.createGuestSession();
  const input = writeFixture(dir, "guest.txt", Buffer.from("data"));
  assert.equal(await codeOf(service.encryptFile({ sessionId: guest.sessionId, inputPath: input, outputPath: path.join(dir, "g.knv"), operationId: "g1" })), CODES.SESSION_REQUIRED);
});

test("inspection reads container metadata without the key", async () => {
  const { dir, service, sessionId } = await unlocked();
  const payload = crypto.randomBytes(70000);
  const input = writeFixture(dir, "inspect.bin", payload);
  const enc = path.join(dir, "inspect.knv");
  await service.encryptFile({ sessionId, inputPath: input, outputPath: enc, operationId: "i1" });

  const info = await service.inspect(enc);
  assert.equal(info.origSize, payload.length);
  assert.equal(info.plaintextSha256, crypto.createHash("sha256").update(payload).digest("hex"));
});

test("file operations are recorded in the real activity log", async () => {
  const { dir, service, sessionId } = await unlocked();
  const input = writeFixture(dir, "activity.txt", Buffer.from("data"));
  await service.encryptFile({ sessionId, inputPath: input, outputPath: path.join(dir, "activity.knv"), operationId: "ac1" });
  const status = await service.status();
  assert.ok(status.activity.some((entry) => entry.type === "encrypt-file"), "the encryption must appear in the activity log");
});

test("the app never attempts disk or volume encryption", () => {
  const mainSource = fs.readFileSync(path.resolve(__dirname, "../electron/main.js"), "utf8");
  const ipcSource = fs.readFileSync(path.resolve(__dirname, "../electron/vault/ipc.js"), "utf8");
  for (const forbidden of ["encrypt-drive", "decrypt-drive", "mount-volume", "unmount-volume", "bitlocker", "BitLocker"]) {
    assert.equal(mainSource.includes(forbidden), false, `main.js must not reference ${forbidden}`);
    assert.equal(ipcSource.includes(forbidden), false, `ipc.js must not reference ${forbidden}`);
  }
});
