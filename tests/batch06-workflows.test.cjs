"use strict";

/**
 * Batch 06 (tasks 21-24) tests: encrypted archives, local transfer, fingerprint
 * verification and metadata cleaning.
 *
 * Every case runs the real implementation: a real ZIP writer, the real vault
 * engine, real sockets and real OpenSSL key material. No mocks.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const archive = require("../electron/vault/archive");
const metadata = require("../electron/vault/metadata");
const { TransferService } = require("../electron/vault/transfer");
const { VaultService } = require("../electron/vault/service");
const { CODES } = require("../electron/vault/errors");

const PASSWORD = "correct horse battery staple";

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "knoux-b6-"));
}

function codeOf(err) {
  return err && err.code;
}

async function unlocked(dir) {
  const service = new VaultService({ userDataPath: dir });
  const { sessionId } = await service.enroll(PASSWORD);
  return { service, sessionId };
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

/** A minimal but structurally valid JPEG with EXIF, XMP, ICC and COM segments. */
function jpegFixture() {
  const seg = (marker, payload) => {
    const out = Buffer.alloc(4 + payload.length);
    out[0] = 0xff;
    out[1] = marker;
    out.writeUInt16BE(payload.length + 2, 2);
    payload.copy(out, 4);
    return out;
  };
  const exif = Buffer.concat([
    Buffer.from("Exif\0\0", "latin1"),
    Buffer.from("MM\0*\0\0\0\x08\0\x01\x88\x25", "latin1"),
    Buffer.alloc(20, 1),
  ]);
  const xmp = Buffer.concat([
    Buffer.from("http://ns.adobe.com/xap/1.0/\0", "latin1"),
    Buffer.from("<x:xmpmeta/>", "latin1"),
  ]);
  const icc = Buffer.concat([Buffer.from("ICC_PROFILE\0\x01\x01", "latin1"), Buffer.alloc(64, 2)]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, Buffer.from("JFIF\0\x01\x02", "latin1")),
    seg(0xe1, exif),
    seg(0xe1, xmp),
    seg(0xe2, icc),
    seg(0xfe, Buffer.from("a comment", "latin1")),
    seg(0xdb, Buffer.alloc(65, 3)),
    seg(0xc0, Buffer.alloc(17, 4)),
    seg(0xda, Buffer.alloc(12, 5)),
    Buffer.from([1, 2, 3, 4, 0xff, 0x00, 9, 9]),
    Buffer.from([0xff, 0xd9]),
  ]);
}

function waitFor(predicate, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error("timed out waiting for a condition"));
      }
    }, 25);
  });
}

// ---- task 21: encrypted archive -------------------------------------------

test("archive: a real ZIP round-trips through create, inspect and extract", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const a = path.join(dir, "alpha.txt");
  const b = path.join(dir, "beta.bin");
  fs.writeFileSync(a, Buffer.alloc(60000, 0x41));
  fs.writeFileSync(b, "hello knoux archive");
  const out = path.join(dir, "pack.knx");

  const made = await service.archiveCreate({ sessionId, inputPaths: [a, b], outputPath: out, compression: true });
  assert.equal(made.fileCount, 2);
  assert.ok(made.encryptedSize > 0);

  const listed = await service.archiveInspect(sessionId, out);
  assert.deepEqual(
    listed.entries.map((e) => e.name).sort(),
    ["alpha.txt", "beta.bin"],
  );

  const dest = path.join(dir, "out");
  const extracted = await service.archiveExtract(sessionId, { inputPath: out, outputDir: dest });
  assert.equal(extracted.files.length, 2);
  assert.ok(fs.readFileSync(path.join(dest, "alpha.txt")).equals(fs.readFileSync(a)));
  assert.equal(fs.readFileSync(path.join(dest, "beta.bin")).toString(), "hello knoux archive");
});

test("archive: the output is an encrypted container, not a readable ZIP", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const src = path.join(dir, "x.txt");
  fs.writeFileSync(src, "payload");
  const out = path.join(dir, "sealed.knx");
  await service.archiveCreate({ sessionId, inputPaths: [src], outputPath: out });
  const head = fs.readFileSync(out).subarray(0, 4);
  assert.notEqual(head.readUInt32LE(0), 0x04034b50, "the archive must not start with the plain ZIP signature");
});

test("archive: compression can be turned off and the entries still round-trip", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const src = path.join(dir, "plain.txt");
  fs.writeFileSync(src, "x".repeat(4096));
  const out = path.join(dir, "store.knx");
  const made = await service.archiveCreate({ sessionId, inputPaths: [src], outputPath: out, compression: false });
  assert.equal(made.compression, false);
  const listed = await service.archiveInspect(sessionId, out);
  assert.equal(listed.entries[0].method, "store");
});

test("archive: a different vault key cannot open the archive", async () => {
  const dirA = tmp();
  const dirB = tmp();
  const { service: a, sessionId: sidA } = await unlocked(dirA);
  const { service: b, sessionId: sidB } = await unlocked(dirB);
  const src = path.join(dirA, "secret.txt");
  fs.writeFileSync(src, "private");
  const out = path.join(dirA, "pack.knx");
  await a.archiveCreate({ sessionId: sidA, inputPaths: [src], outputPath: out });
  await rejects(b.archiveInspect(sidB, out), CODES.INTEGRITY_FAILED);
});

test("archive: a corrupted archive is refused rather than yielding damaged files", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const src = path.join(dir, "s.txt");
  fs.writeFileSync(src, "content to protect");
  const out = path.join(dir, "pack.knx");
  await service.archiveCreate({ sessionId, inputPaths: [src], outputPath: out });
  const bytes = fs.readFileSync(out);
  bytes[bytes.length - 6] ^= 0xff;
  fs.writeFileSync(out, bytes);
  await rejects(service.archiveInspect(sessionId, out), CODES.INTEGRITY_FAILED);
});

test("archive: a truncated archive is refused", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const src = path.join(dir, "s.txt");
  fs.writeFileSync(src, "content to protect");
  const out = path.join(dir, "pack.knx");
  await service.archiveCreate({ sessionId, inputPaths: [src], outputPath: out });
  fs.writeFileSync(out, fs.readFileSync(out).subarray(0, 40));
  await rejects(service.archiveInspect(sessionId, out), CODES.TRUNCATED);
});

test("archive: extraction refuses to overwrite an existing file", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const src = path.join(dir, "dup.txt");
  fs.writeFileSync(src, "one");
  const out = path.join(dir, "pack.knx");
  await service.archiveCreate({ sessionId, inputPaths: [src], outputPath: out });
  const dest = path.join(dir, "dest");
  await service.archiveExtract(sessionId, { inputPath: out, outputDir: dest });
  await rejects(
    service.archiveExtract(sessionId, { inputPath: out, outputDir: dest }),
    CODES.BAD_INPUT,
  );
});

test("archive: a locked session cannot create or open an archive", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const src = path.join(dir, "s.txt");
  fs.writeFileSync(src, "x");
  service.lock(sessionId);
  await rejects(
    service.archiveCreate({ sessionId, inputPaths: [src], outputPath: path.join(dir, "n.knx") }),
    CODES.SESSION_REQUIRED,
  );
});

test("archive: a guest session cannot create an archive", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const guest = service.createGuestSession();
  const src = path.join(dir, "s.txt");
  fs.writeFileSync(src, "x");
  await rejects(
    service.archiveCreate({ sessionId: guest.sessionId, inputPaths: [src], outputPath: path.join(dir, "g.knx") }),
    CODES.SESSION_REQUIRED,
  );
});

test("archive: empty input, missing input and a missing output path are all refused", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  await rejects(service.archiveCreate({ sessionId, inputPaths: [], outputPath: path.join(dir, "a.knx") }), CODES.BAD_INPUT);
  await rejects(
    service.archiveCreate({ sessionId, inputPaths: [path.join(dir, "nope")], outputPath: path.join(dir, "a.knx") }),
    CODES.NOT_FOUND,
  );
  const src = path.join(dir, "s.txt");
  fs.writeFileSync(src, "x");
  await rejects(service.archiveCreate({ sessionId, inputPaths: [src] }), CODES.BAD_INPUT);
});

test("archive: the output may not overwrite one of its own inputs", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const src = path.join(dir, "self.txt");
  fs.writeFileSync(src, "x");
  await rejects(
    service.archiveCreate({ sessionId, inputPaths: [src], outputPath: src }),
    CODES.BAD_INPUT,
  );
});

test("archive: entry names are reduced to a basename and duplicates are renamed", () => {
  const taken = new Set();
  assert.equal(archive.entryNameFor("/etc/passwd", taken), "passwd");
  assert.equal(archive.entryNameFor("C:\\Users\\me\\secret.txt", taken), "secret.txt");
  assert.equal(archive.entryNameFor("../../escape.txt", taken), "escape.txt");
  assert.equal(archive.entryNameFor("/a/dup.txt", taken), "dup.txt");
  assert.equal(archive.entryNameFor("/b/dup.txt", taken), "dup (1).txt");
});

test("archive: a directory traversal entry name is rejected", () => {
  assert.throws(() => archive.assertSafeEntryName("../evil.txt"), (err) => codeOf(err) === CODES.INTEGRITY_FAILED);
  assert.throws(() => archive.assertSafeEntryName("/etc/passwd"), (err) => codeOf(err) === CODES.INTEGRITY_FAILED);
  assert.throws(() => archive.assertSafeEntryName("a\\..\\b"), (err) => codeOf(err) === CODES.INTEGRITY_FAILED);
  assert.equal(archive.assertSafeEntryName("nested/ok.txt"), "nested/ok.txt");
});

test("archive: a crafted traversal ZIP is refused on extraction", () => {
  const evil = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.alloc(26, 0),
  ]);
  assert.throws(() => archive.extractZip(evil), (err) => codeOf(err) === CODES.INTEGRITY_FAILED);
});

test("archive: the entry-count bound is enforced", () => {
  const entries = Array.from({ length: archive.MAX_ENTRIES + 1 }, (_, i) => ({ name: `f${i}`, data: Buffer.from("x") }));
  assert.throws(() => archive.buildZip(entries), (err) => codeOf(err) === CODES.BAD_INPUT);
});

test("archive: an empty archive is refused", () => {
  assert.throws(() => archive.buildZip([]), (err) => codeOf(err) === CODES.BAD_INPUT);
});

test("archive: a ZIP without a central directory is refused", () => {
  assert.throws(
    () => archive.listZip(Buffer.alloc(64, 0)),
    (err) => codeOf(err) === CODES.INTEGRITY_FAILED,
  );
});

test("archive: a buildZip output is recognised as a ZIP and parses back", () => {
  const zip = archive.buildZip([{ name: "a.txt", data: Buffer.from("hello") }]);
  assert.equal(archive.looksLikeZip(zip), true);
  const entries = archive.extractZip(zip);
  assert.equal(entries[0].name, "a.txt");
  assert.equal(entries[0].data.toString(), "hello");
});

test("archive: a corrupted entry body fails its checksum", () => {
  const zip = archive.buildZip([{ name: "a.txt", data: Buffer.alloc(4096, 7) }], { compression: false });
  const copy = Buffer.from(zip);
  copy[40] ^= 0xff;
  assert.throws(() => archive.extractZip(copy), (err) => codeOf(err) === CODES.INTEGRITY_FAILED);
});

// ---- task 22: local transfer ----------------------------------------------

test("transfer: a real file is delivered byte-identically over a real socket", async () => {
  const dirA = tmp();
  const dirB = tmp();
  const { service: a, sessionId: sidA } = await unlocked(dirA);
  const { service: b, sessionId: sidB } = await unlocked(dirB);

  let request = null;
  b.transfer.onRequest = (r) => {
    request = r;
  };
  const info = await b.transferListen({ sessionId: sidB });
  assert.equal(info.loopbackOnly, true);
  assert.equal(info.host, "127.0.0.1");

  const src = path.join(dirA, "payload.bin");
  fs.writeFileSync(src, crypto.randomBytes(700000));
  const dest = path.join(dirB, "received");

  const sending = a.transferSend({ sessionId: sidA, host: "127.0.0.1", port: info.port, files: [src], sender: "Device A" });
  await waitFor(() => request);
  assert.match(request.code, /^\d{6}$/);
  await b.transferRespond({ sessionId: sidB, requestId: request.requestId, accept: true, outputDir: dest });
  const sent = await sending;

  await waitFor(() => fs.existsSync(path.join(dest, "payload.bin")));
  assert.ok(fs.readFileSync(path.join(dest, "payload.bin")).equals(fs.readFileSync(src)));
  assert.equal(sent.code, request.code);
  assert.equal(sent.bytes, 700000);
  await b.transferStop();
  await a.transferStop();
});

test("transfer: the receiver can decline and the sender learns about it", async () => {
  const dirA = tmp();
  const dirB = tmp();
  const { service: a, sessionId: sidA } = await unlocked(dirA);
  const { service: b, sessionId: sidB } = await unlocked(dirB);
  let request = null;
  b.transfer.onRequest = (r) => {
    request = r;
  };
  const info = await b.transferListen({ sessionId: sidB });
  const src = path.join(dirA, "x.bin");
  fs.writeFileSync(src, crypto.randomBytes(1000));

  const sending = a.transferSend({ sessionId: sidA, host: "127.0.0.1", port: info.port, files: [src] });
  await waitFor(() => request);
  await b.transferRespond({ sessionId: sidB, requestId: request.requestId, accept: false });
  const err = await rejects(sending, CODES.IO_FAILED);
  assert.ok(err);
  assert.equal(b.transferRequests().requests.length, 0);
  await b.transferStop();
  await a.transferStop();
});

test("transfer: an accepted transfer with a different displayed code still completes, because the code is an authentication string not a key", async () => {
  const dirA = tmp();
  const dirB = tmp();
  const { service: a, sessionId: sidA } = await unlocked(dirA);
  const { service: b, sessionId: sidB } = await unlocked(dirB);
  let request = null;
  b.transfer.onRequest = (r) => {
    request = r;
  };
  const info = await b.transferListen({ sessionId: sidB });
  const src = path.join(dirA, "y.bin");
  fs.writeFileSync(src, crypto.randomBytes(2000));

  const sending = a.transferSend({ sessionId: sidA, host: "127.0.0.1", port: info.port, code: "000000", files: [src] });
  await waitFor(() => request);
  assert.equal(request.code, "000000", "the receiver displays the code the sender chose");
  await b.transferRespond({ sessionId: sidB, requestId: request.requestId, accept: true, outputDir: path.join(dirB, "d") });
  const sent = await sending;
  assert.equal(sent.code, "000000");
  await b.transferStop();
  await a.transferStop();
});

test("transfer: tampered ciphertext is rejected by the receiver", () => {
  const key = crypto.randomBytes(32);
  const prefix = crypto.randomBytes(8);
  const sealed = Buffer.from(require("../electron/vault/transfer").seal(key, prefix, 0, Buffer.from("hello")));
  sealed[0] ^= 0xff;
  assert.throws(
    () => require("../electron/vault/transfer").open(key, prefix, 0, sealed),
    (err) => codeOf(err) === CODES.INTEGRITY_FAILED,
  );
});

test("transfer: a truncated frame is rejected", () => {
  const key = crypto.randomBytes(32);
  const prefix = crypto.randomBytes(8);
  assert.throws(
    () => require("../electron/vault/transfer").open(key, prefix, 0, Buffer.alloc(8)),
    (err) => codeOf(err) === CODES.INTEGRITY_FAILED,
  );
});

test("transfer: a frame sealed with one nonce counter cannot be opened with another", () => {
  const key = crypto.randomBytes(32);
  const prefix = crypto.randomBytes(8);
  const sealed = require("../electron/vault/transfer").seal(key, prefix, 3, Buffer.from("data"));
  assert.throws(
    () => require("../electron/vault/transfer").open(key, prefix, 4, sealed),
    (err) => codeOf(err) === CODES.INTEGRITY_FAILED,
  );
});

test("transfer: only loopback may be bound", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  await rejects(
    service.transfer.listen({ sessionId, bindHost: "0.0.0.0" }),
    CODES.BAD_INPUT,
  );
  await service.transferStop();
});

test("transfer: a bad port, a bad code and an empty file list are refused", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const src = path.join(dir, "x");
  fs.writeFileSync(src, "x");
  await rejects(service.transferSend({ sessionId, host: "127.0.0.1", port: 0, code: "123456", files: [src] }), CODES.BAD_INPUT);
  await rejects(service.transferSend({ sessionId, host: "127.0.0.1", port: 9999, code: "12", files: [src] }), CODES.BAD_INPUT);
  await rejects(service.transferSend({ sessionId, host: "127.0.0.1", port: 9999, code: "123456", files: [] }), CODES.BAD_INPUT);
});

test("transfer: a locked session cannot listen", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  service.lock(sessionId);
  await rejects(service.transferListen({ sessionId }), CODES.SESSION_REQUIRED);
});

test("transfer: session revocation tears the listener down", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  await service.transferListen({ sessionId });
  assert.ok(service.transfer.serverInfo);
  service.lock(sessionId);
  await waitFor(() => !service.transfer.serverInfo);
  await service.transferStop();
});

test("transfer: the entry name from the sender is sanitised on the receiver", async () => {
  const dirA = tmp();
  const dirB = tmp();
  const { service: a, sessionId: sidA } = await unlocked(dirA);
  const { service: b, sessionId: sidB } = await unlocked(dirB);
  let request = null;
  b.transfer.onRequest = (r) => {
    request = r;
  };
  const info = await b.transferListen({ sessionId: sidB });
  const weird = path.join(dirA, "..evil.txt");
  fs.writeFileSync(weird, "x");
  const dest = path.join(dirB, "sanitised");

  const sending = a.transferSend({ sessionId: sidA, host: "127.0.0.1", port: info.port, files: [weird] });
  await waitFor(() => request);
  await b.transferRespond({ sessionId: sidB, requestId: request.requestId, accept: true, outputDir: dest });
  const sent = await sending;
  assert.deepEqual(Object.keys(sent.digests), ["..evil.txt"]);
  await waitFor(() => fs.existsSync(path.join(dest, "..evil.txt")));
  assert.ok(!fs.existsSync(path.join(path.dirname(dest), "evil.txt")));
  await b.transferStop();
  await a.transferStop();
});

test("transfer: stopping a listener that is not running is a no-op", async () => {
  const dir = tmp();
  const service = new TransferService({ userDataPath: dir });
  const result = await service.stop();
  assert.equal(result.stopped, true);
});

// ---- task 23: fingerprint verification ------------------------------------

test("fingerprint: a vault key's fingerprint matches an independent SHA-256 of its SPKI DER", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const key = await service.keyGenerate(sessionId, { algorithm: "ED25519", name: "Signing" });
  const result = await service.fingerprintGet({ sessionId, keyId: key.id });
  const expected = crypto
    .createHash("sha256")
    .update(crypto.createPublicKey(key.publicPem).export({ type: "spki", format: "der" }))
    .digest("hex");
  assert.equal(result.fingerprint, expected);
  assert.equal(result.source, "vault");
  assert.equal(result.algorithm, "ED25519");
  assert.equal(result.groups.length, 16);
});

test("fingerprint: identical fingerprints compare equal", () => {
  const dir = tmp();
  const service = new VaultService({ userDataPath: dir });
  const a = "aa".repeat(32);
  const result = service.fingerprintCompare(a, a);
  assert.equal(result.equal, true);
  assert.equal(result.lengthMatch, true);
});

test("fingerprint: a single-character difference is detected with its position", () => {
  const dir = tmp();
  const service = new VaultService({ userDataPath: dir });
  const a = "00".repeat(32);
  const b = `${"00".repeat(31)}01`;
  const result = service.fingerprintCompare(a, b);
  assert.equal(result.equal, false);
  assert.equal(result.firstMismatch, 31);
  assert.equal(result.matchedGroups, 15);
});

test("fingerprint: a length mismatch is reported, not treated as a match", () => {
  const dir = tmp();
  const service = new VaultService({ userDataPath: dir });
  const result = service.fingerprintCompare("aabb", "aabbcc");
  assert.equal(result.equal, false);
  assert.equal(result.lengthMatch, false);
});

test("fingerprint: non-hex input is refused", () => {
  const dir = tmp();
  const service = new VaultService({ userDataPath: dir });
  assert.throws(() => service.fingerprintCompare("zzzz", "aabb"), (err) => codeOf(err) === CODES.BAD_INPUT);
  assert.throws(() => service.fingerprintCompare("", "aabb"), (err) => codeOf(err) === CODES.BAD_INPUT);
});

test("fingerprint: separators are ignored so a grouped fingerprint compares equal to a raw one", () => {
  const dir = tmp();
  const service = new VaultService({ userDataPath: dir });
  const raw = "0123456789abcdef".repeat(4);
  const grouped = raw.match(/.{1,4}/g).join(" ");
  assert.equal(service.fingerprintCompare(raw, grouped).equal, true);
});

test("fingerprint: a certificate is fingerprinted from its DER encoding", () => {
  const inspect = require("../electron/vault/inspect");
  const { publicKey } = crypto.generateKeyPairSync("ed25519");
  const pem = publicKey.export({ type: "spki", format: "pem" });
  const result = inspect.fingerprintOf(pem);
  assert.equal(result.fingerprint.length, 64);
  assert.equal(result.grouped.split(" ").length, 16);
});

test("fingerprint: malformed PEM is refused", () => {
  const inspect = require("../electron/vault/inspect");
  assert.throws(() => inspect.fingerprintOf("not a key"), (err) => codeOf(err) === CODES.BAD_INPUT);
  assert.throws(() => inspect.fingerprintOf("-----BEGIN PUBLIC KEY-----\nnope\n-----END PUBLIC KEY-----"), (err) => codeOf(err) === CODES.BAD_INPUT);
});

test("fingerprint: an unknown key id is NOT_FOUND", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  await rejects(service.fingerprintGet({ sessionId, keyId: "nope" }), CODES.NOT_FOUND);
});

test("fingerprint: no material at all is refused", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  await rejects(service.fingerprintGet({}), CODES.BAD_INPUT);
});

test("fingerprint: a key file on disk can be fingerprinted", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const key = await service.keyGenerate(sessionId, { algorithm: "ED25519", name: "K" });
  const file = path.join(dir, "pub.pem");
  fs.writeFileSync(file, key.publicPem);
  const result = await service.fingerprintGet({ inputPath: file });
  assert.equal(result.source, "file");
  assert.equal(result.name, "pub.pem");
  const viaVault = await service.fingerprintGet({ sessionId, keyId: key.id });
  assert.equal(result.fingerprint, viaVault.fingerprint);
});

// ---- task 24: metadata cleaning -------------------------------------------

test("metadata: a JPEG's groups are detected from its real segments", async () => {
  const dir = tmp();
  const service = new VaultService({ userDataPath: dir });
  const src = path.join(dir, "photo.jpg");
  fs.writeFileSync(src, jpegFixture());
  const info = await service.metadataInspect({ inputPath: src });
  assert.equal(info.format, "jpeg");
  assert.equal(info.cleanable, true);
  const present = Object.fromEntries(info.groups.map((g) => [g.id, g.present]));
  assert.deepEqual(present, { gps: true, dates: true, camera: true, icc: true, xmp: true });
});

test("metadata: cleaning removes exactly the requested groups and leaves the image bytes", async () => {
  const dir = tmp();
  const service = new VaultService({ userDataPath: dir });
  const src = path.join(dir, "photo.jpg");
  const original = jpegFixture();
  fs.writeFileSync(src, original);
  const dest = path.join(dir, "clean.jpg");

  const result = await service.metadataClean({ inputPath: src, outputPath: dest, remove: ["xmp", "icc"] });
  assert.deepEqual(result.removedGroups.sort(), ["icc", "xmp"]);
  assert.ok(result.cleanedSize < result.originalSize);
  assert.equal(result.originalUntouched, true);
  assert.ok(fs.readFileSync(src).equals(original), "the source file must be byte-identical");

  const after = await service.metadataInspect({ inputPath: dest });
  const present = Object.fromEntries(after.groups.map((g) => [g.id, g.present]));
  assert.equal(present.xmp, false);
  assert.equal(present.icc, false);
  assert.equal(present.gps, true, "EXIF survives when only XMP and ICC were removed");
});

test("metadata: removing GPS also removes the capture date and camera details, because they share EXIF", async () => {
  const dir = tmp();
  const service = new VaultService({ userDataPath: dir });
  const src = path.join(dir, "photo.jpg");
  fs.writeFileSync(src, jpegFixture());
  const dest = path.join(dir, "clean.jpg");
  const result = await service.metadataClean({ inputPath: src, outputPath: dest, remove: ["gps"] });
  assert.deepEqual(result.removedGroups.sort(), ["camera", "dates", "gps"]);
});

test("metadata: the cleaned copy is still a valid JPEG ending in EOI", async () => {
  const dir = tmp();
  const service = new VaultService({ userDataPath: dir });
  const src = path.join(dir, "photo.jpg");
  fs.writeFileSync(src, jpegFixture());
  const dest = path.join(dir, "clean.jpg");
  await service.metadataClean({ inputPath: src, outputPath: dest, remove: ["gps", "xmp", "icc"] });
  const bytes = fs.readFileSync(dest);
  assert.equal(bytes.subarray(0, 2).toString("hex"), "ffd8");
  assert.equal(bytes.subarray(-2).toString("hex"), "ffd9");
});

test("metadata: writing over the source file is refused", async () => {
  const dir = tmp();
  const service = new VaultService({ userDataPath: dir });
  const src = path.join(dir, "photo.jpg");
  fs.writeFileSync(src, jpegFixture());
  await rejects(service.metadataClean({ inputPath: src, outputPath: src, remove: ["gps"] }), CODES.BAD_INPUT);
});

test("metadata: an empty removal set is refused", async () => {
  const dir = tmp();
  const service = new VaultService({ userDataPath: dir });
  const src = path.join(dir, "photo.jpg");
  fs.writeFileSync(src, jpegFixture());
  await rejects(
    service.metadataClean({ inputPath: src, outputPath: path.join(dir, "c.jpg"), remove: [] }),
    CODES.BAD_INPUT,
  );
});

test("metadata: a missing file is NOT_FOUND", async () => {
  const dir = tmp();
  const service = new VaultService({ userDataPath: dir });
  await rejects(service.metadataInspect({ inputPath: path.join(dir, "nope.jpg") }), CODES.NOT_FOUND);
});

test("metadata: a non-JPEG is refused rather than faked", async () => {
  const dir = tmp();
  const service = new VaultService({ userDataPath: dir });
  const src = path.join(dir, "note.txt");
  fs.writeFileSync(src, "just text");
  const info = await service.metadataInspect({ inputPath: src });
  assert.equal(info.cleanable, false);
  await rejects(
    service.metadataClean({ inputPath: src, outputPath: path.join(dir, "c.txt"), remove: ["gps"] }),
    CODES.BAD_INPUT,
  );
});

test("metadata: a file claiming a .jpg extension without JPEG bytes is refused", async () => {
  const dir = tmp();
  const service = new VaultService({ userDataPath: dir });
  const src = path.join(dir, "fake.jpg");
  fs.writeFileSync(src, "this is not an image");
  await rejects(
    service.metadataClean({ inputPath: src, outputPath: path.join(dir, "c.jpg"), remove: ["gps"] }),
    CODES.BAD_INPUT,
  );
});

test("metadata: a directory is refused as an inspection target", async () => {
  const dir = tmp();
  const service = new VaultService({ userDataPath: dir });
  await rejects(service.metadataInspect({ inputPath: dir }), CODES.BAD_INPUT);
});

test("metadata: no output path is refused", async () => {
  const dir = tmp();
  const service = new VaultService({ userDataPath: dir });
  const src = path.join(dir, "photo.jpg");
  fs.writeFileSync(src, jpegFixture());
  await rejects(service.metadataClean({ inputPath: src, remove: ["gps"] }), CODES.BAD_INPUT);
});

test("metadata: format sniffing recognises the common headers", () => {
  assert.equal(metadata.sniffKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "jpeg");
  assert.equal(metadata.sniffKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "png");
  assert.equal(metadata.sniffKind(Buffer.from("RIFF0000WEBP", "latin1")), "webp");
  assert.equal(metadata.sniffKind(Buffer.from("%PDF-1.7", "latin1")), "pdf");
  assert.equal(metadata.sniffKind(Buffer.from("PK\x03\x04", "latin1")), "zip");
  assert.equal(metadata.sniffKind(Buffer.from("nothing")), "unknown");
});

test("metadata: a truncated JPEG structure is reported as not safely rewritable", () => {
  const broken = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from([0xff, 0xe1, 0x00, 0x40])]);
  assert.equal(metadata.jpegSegments(broken), null);
  assert.equal(metadata.stripJpegSegments(broken, new Set(["gps"])), null);
});
