"use strict";
/**
 * Shadow Vault — MediaVault provider tests.
 *
 * Tests the full import → list → export → delete lifecycle, plus all security
 * boundaries: session required, tampered ciphertext, locked vault, invalid
 * types, oversized inputs, path traversal and cancelled operations.
 *
 * Run: node --test tests/vault-mediavault.test.cjs
 */
const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const { MediaVault, ALLOWED_TYPES, EXT_TO_MIME, MAX_FILE_BYTES, COLLECTION } = require("../electron/vault/mediavault");
const { VaultEngine } = require("../electron/vault/engine");
const { EncryptedStore } = require("../electron/vault/store");
const { RotationService } = require("../electron/vault/rotation");
const { VaultBackup } = require("../electron/vault/backup");

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

async function mkTmp() {
  return fsp.mkdtemp(path.join(os.tmpdir(), "knx-mv-test-"));
}

function makeKey() {
  return crypto.randomBytes(32);
}

async function makeFixture(dir, name, content) {
  const p = path.join(dir, name);
  await fsp.writeFile(p, content);
  return p;
}

async function setup() {
  const root = await mkTmp();
  const storeRoot = path.join(root, "store");
  const mediaRoot = path.join(root, "media");
  await fsp.mkdir(storeRoot, { recursive: true });
  await fsp.mkdir(mediaRoot, { recursive: true });

  const engine = new VaultEngine({ kdfParams: { kdfId: 0, iterations: 0 }, chunkSize: 64 * 1024 });
  // Preserve production's default no-overwrite policy; importing media must
  // never disable collision protection on the shared VaultEngine.
  const store = new EncryptedStore({ root: storeRoot, engine });
  const mv = new MediaVault({ engine, store, root: mediaRoot });
  const rawKey = makeKey();
  return { root, storeRoot, mediaRoot, engine, store, mv, rawKey };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("mediavault: import and list", () => {
  test("a jpeg imports, persists and appears in the list", async () => {
    const { mv, rawKey, root } = await setup();
    const srcDir = await mkTmp();
    const src = await makeFixture(srcDir, "photo.jpg", Buffer.alloc(1024, 0xab));

    const { record } = await mv.import(rawKey, { sourcePath: src });
    assert.equal(record.category, "Photos");
    assert.equal(record.originalName, "photo.jpg");
    assert.equal(record.mimeType, "image/jpeg");
    assert.ok(record.plaintextSha256.length === 64, "sha256 hex length");
    assert.ok(record.sizeBytes === 1024);
    assert.ok(record.id.length > 0);

    // The list returns the same record.
    const listed = await mv.list(rawKey);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, record.id);
    assert.equal(listed[0].originalName, "photo.jpg");
    await fsp.rm(srcDir, { recursive: true, force: true });
  });

  test("import does not delete or modify the source file", async () => {
    const { mv, rawKey } = await setup();
    const srcDir = await mkTmp();
    const content = Buffer.alloc(512, 0x42);
    const src = await makeFixture(srcDir, "audio.mp3", content);

    await mv.import(rawKey, { sourcePath: src });

    // Source still exists and is byte-identical.
    const after = await fsp.readFile(src);
    assert.ok(after.equals(content), "source file must be unchanged after import");
    await fsp.rm(srcDir, { recursive: true, force: true });
  });

  test("ciphertext blob is not plaintext", async () => {
    const { mv, rawKey, mediaRoot } = await setup();
    const srcDir = await mkTmp();
    const magic = Buffer.from("SECRET_PAYLOAD_DO_NOT_STORE_PLAIN");
    const src = await makeFixture(srcDir, "secret.txt", magic);

    const { record } = await mv.import(rawKey, { sourcePath: src });
    const blobPath = path.join(mediaRoot, record.blobName);
    const blob = await fsp.readFile(blobPath);
    assert.ok(!blob.includes(magic), "plaintext must not appear in ciphertext blob");
    await fsp.rm(srcDir, { recursive: true, force: true });
  });

  test("multiple files are individually importable and listable", async () => {
    const { mv, rawKey } = await setup();
    const srcDir = await mkTmp();
    const files = ["a.jpg", "b.mp4", "c.mp3", "d.pdf"];
    for (const f of files) {
      const src = await makeFixture(srcDir, f, Buffer.alloc(256, 0x11));
      await mv.import(rawKey, { sourcePath: src });
    }
    const listed = await mv.list(rawKey);
    assert.equal(listed.length, files.length);
    await fsp.rm(srcDir, { recursive: true, force: true });
  });

  test("two files with the same filename are both stored (each gets a distinct id)", async () => {
    const { mv, rawKey } = await setup();
    const srcDir = await mkTmp();
    const src1 = await makeFixture(srcDir, "dup.jpg", Buffer.alloc(100, 0x01));
    const src2 = await makeFixture(srcDir, "dup.jpg", Buffer.alloc(100, 0x02));
    const { record: r1 } = await mv.import(rawKey, { sourcePath: src1 });
    const { record: r2 } = await mv.import(rawKey, { sourcePath: src2 });
    assert.notEqual(r1.id, r2.id, "duplicate filenames get different ids");
    const listed = await mv.list(rawKey);
    assert.equal(listed.length, 2);
    await fsp.rm(srcDir, { recursive: true, force: true });
  });
});

describe("mediavault: shared-engine and journal regressions", () => {
  test("import never enables overwrite on the shared engine", async () => {
    const { mv, rawKey, engine } = await setup();
    const fixtureDir = await mkTmp();
    try {
      assert.equal(engine.overwrite, false, "the shared engine starts collision-safe");
      const sourcePath = await makeFixture(fixtureDir, "image.png", Buffer.alloc(128, 0x61));
      await mv.import(rawKey, { sourcePath });
      assert.equal(engine.overwrite, false, "import must not mutate shared overwrite policy");

      const existingPath = await makeFixture(fixtureDir, "existing.knx", Buffer.from("ORIGINAL_STAYS"));
      await assert.rejects(
        () => engine.encryptFile({ inputPath: sourcePath, outputPath: existingPath, rawKey }),
        (err) => err.code === "PATH_CONFLICT",
      );
      assert.equal((await fsp.readFile(existingPath)).toString(), "ORIGINAL_STAYS");
    } finally {
      await fsp.rm(fixtureDir, { recursive: true, force: true });
    }
  });

  test("security journal does not contain private media filenames", async () => {
    const { mv, rawKey } = await setup();
    const sourceDir = await mkTmp();
    const exportDir = await mkTmp();
    const actions = [];
    mv.onJournal = (message) => actions.push(message);
    try {
      const sourcePath = await makeFixture(sourceDir, "private-medical-record.pdf", Buffer.alloc(256, 0x43));
      const { record } = await mv.import(rawKey, { sourcePath });
      await mv.export(rawKey, { id: record.id, targetPath: path.join(exportDir, "export.pdf") });
      await mv.remove(rawKey, { id: record.id, confirm: true });
      assert.equal(actions.length, 3);
      assert.ok(actions.every((a) => !a.includes("private-medical-record")));
      assert.ok(actions.every((a) => !a.includes("export.pdf")));
    } finally {
      await fsp.rm(sourceDir, { recursive: true, force: true });
      await fsp.rm(exportDir, { recursive: true, force: true });
    }
  });

  test("failed blob deletion retains encrypted metadata for recovery", async () => {
    const { mv, rawKey, mediaRoot } = await setup();
    const sourceDir = await mkTmp();
    const sourcePath = await makeFixture(sourceDir, "recoverable.jpg", Buffer.alloc(128, 0x32));
    const { record } = await mv.import(rawKey, { sourcePath });
    const blobPath = path.join(mediaRoot, record.blobName);
    const origRm = fsp.rm;
    fsp.rm = async (p, options) => {
      if (p === blobPath) {
        const failure = new Error("Simulated disk I/O failure");
        failure.code = "EIO";
        throw failure;
      }
      return origRm(p, options);
    };
    try {
      await assert.rejects(() => mv.remove(rawKey, { id: record.id, confirm: true }), (err) => err.code === "IO_FAILED");
    } finally {
      fsp.rm = origRm;
    }
    assert.equal((await mv.list(rawKey)).length, 1, "a failed deletion must preserve metadata");
    assert.ok((await fsp.stat(blobPath)).isFile(), "a failed deletion must preserve ciphertext");
    await fsp.rm(sourceDir, { recursive: true, force: true });
  });
});

describe("mediavault: rotation compatibility", () => {
  test("fresh DEK rotation refuses existing media before touching the enrollment", async () => {
    const { root, mediaRoot, engine, store, mv, rawKey } = await setup();
    const sourceDir = await mkTmp();
    try {
      const sourcePath = await makeFixture(sourceDir, "photo.jpg", Buffer.alloc(128, 0x11));
      await mv.import(rawKey, { sourcePath });
      let rewrapCalled = false;
      const manager = {
        getDek: () => rawKey,
        rewrapDek: async () => { rewrapCalled = true; throw new Error("must not rewrap"); },
      };
      const rotation = new RotationService({ manager, store, engine, userDataPath: root });
      await assert.rejects(
        () => rotation.rotate("session", { newPassword: "correct horse battery", mode: "reencrypt", confirm: true }),
        (err) => err.code === "BAD_INPUT" && /Shadow Vault media/.test(err.message),
      );
      assert.equal(rewrapCalled, false, "rotation must be refused before updating enrollment");
      assert.equal((await mv.list(rawKey)).length, 1, "media remains available after refusal");
      assert.equal(await rotation.journal(), null, "no partial rotation journal is created");
      assert.ok((await fsp.stat(path.join(mediaRoot, (await mv.list(rawKey))[0].blobName))).isFile());
    } finally {
      await fsp.rm(sourceDir, { recursive: true, force: true });
    }
  });
});

describe("mediavault: session revocation during dialogs and file I/O", () => {
  test("file picker cannot import after the vault locks", async () => {
    const { mv, rawKey } = await setup();
    const sourceDir = await mkTmp();
    const sourcePath = await makeFixture(sourceDir, "locked.jpg", Buffer.alloc(64, 0x66));
    let unlocked = true;
    const assertSession = () => {
      if (!unlocked) {
        const err = new Error("Vault locked");
        err.code = "SESSION_REQUIRED";
        throw err;
      }
    };
    try {
      await assert.rejects(
        () => mv.pickAndImport(rawKey, {
          showDialog: async () => {
            unlocked = false;
            return { cancelled: false, paths: [sourcePath] };
          },
          assertSession,
        }),
        (err) => err.code === "SESSION_REQUIRED",
      );
      assert.equal((await mv.list(rawKey)).length, 0);
      assert.ok((await fsp.stat(sourcePath)).isFile());
    } finally {
      await fsp.rm(sourceDir, { recursive: true, force: true });
    }
  });

  test("revocation after encryption cleans the new ciphertext without committing metadata", async () => {
    const { mv, rawKey, mediaRoot, engine } = await setup();
    const sourceDir = await mkTmp();
    const sourcePath = await makeFixture(sourceDir, "private.jpg", Buffer.alloc(512, 0x21));
    let unlocked = true;
    const assertSession = () => {
      if (!unlocked) {
        const err = new Error("Vault locked");
        err.code = "SESSION_REQUIRED";
        throw err;
      }
    };
    const origEncrypt = engine.encryptFile.bind(engine);
    engine.encryptFile = async (args) => {
      const result = await origEncrypt(args);
      unlocked = false;
      return result;
    };
    try {
      await assert.rejects(() => mv.import(rawKey, { sourcePath, assertSession }), (err) => err.code === "SESSION_REQUIRED");
      assert.deepEqual(await fsp.readdir(mediaRoot), [], "no encrypted orphan remains");
      assert.equal((await mv.list(rawKey)).length, 0, "no metadata committed after lock");
    } finally {
      engine.encryptFile = origEncrypt;
      await fsp.rm(sourceDir, { recursive: true, force: true });
    }
  });

  test("revocation during export removes the newly written plaintext", async () => {
    const { mv, rawKey, engine } = await setup();
    const sourceDir = await mkTmp();
    const exportDir = await mkTmp();
    const sourcePath = await makeFixture(sourceDir, "private.pdf", Buffer.alloc(128, 0x53));
    const { record } = await mv.import(rawKey, { sourcePath });
    let unlocked = true;
    const assertSession = () => {
      if (!unlocked) {
        const err = new Error("Vault locked");
        err.code = "SESSION_REQUIRED";
        throw err;
      }
    };
    const origDecrypt = engine.decryptFile.bind(engine);
    engine.decryptFile = async (args) => {
      const result = await origDecrypt(args);
      unlocked = false;
      return result;
    };
    const targetPath = path.join(exportDir, "recovered.pdf");
    try {
      await assert.rejects(() => mv.export(rawKey, { id: record.id, targetPath, assertSession }),
        (err) => err.code === "SESSION_REQUIRED");
      await assert.rejects(() => fsp.stat(targetPath), (err) => err.code === "ENOENT");
    } finally {
      engine.decryptFile = origDecrypt;
      await fsp.rm(sourceDir, { recursive: true, force: true });
      await fsp.rm(exportDir, { recursive: true, force: true });
    }
  });
});

describe("mediavault: backup safety", () => {
  test("backup refuses misleading metadata-only media backups", async () => {
    const { root, storeRoot, engine, store, mv, rawKey } = await setup();
    const sourceDir = await mkTmp();
    try {
      const sourcePath = await makeFixture(sourceDir, "family.jpg", Buffer.alloc(128, 0x17));
      await mv.import(rawKey, { sourcePath });
      const backup = new VaultBackup({ root: storeRoot, engine, store });
      await assert.rejects(
        () => backup.build(rawKey),
        (err) => err.code === "BAD_INPUT" && /media files are not included/i.test(err.message),
      );
      // Other encrypted collections remain independently backup-capable.
      const selected = await backup.build(rawKey, { collections: ["notes"] });
      assert.deepEqual(selected.manifest.map((entry) => entry.collection), ["notes"]);
    } finally {
      await fsp.rm(sourceDir, { recursive: true, force: true });
    }
  });

  test("restore refuses older metadata-only media backups before any write", async () => {
    const { storeRoot, engine, store, rawKey } = await setup();
    const backup = new VaultBackup({ root: storeRoot, engine, store });
    backup.inspect = async () => ({
      manifest: [{ collection: "mediavault", count: 2, sha256: "stub" }],
      totalRecords: 2,
    });
    await assert.rejects(
      () => backup.restore("not-read-on-refusal.knxb", rawKey, { confirm: true }),
      (err) => err.code === "BAD_INPUT" && /broken media references/.test(err.message),
    );
  });
});

describe("mediavault: export", () => {
  test("export produces a byte-identical file", async () => {
    const { mv, rawKey } = await setup();
    const srcDir = await mkTmp();
    const exportDir = await mkTmp();
    const content = crypto.randomBytes(8192);
    const src = await makeFixture(srcDir, "data.pdf", content);

    const { record } = await mv.import(rawKey, { sourcePath: src });
    const target = path.join(exportDir, "data-out.pdf");
    await mv.export(rawKey, { id: record.id, targetPath: target });

    const exported = await fsp.readFile(target);
    assert.ok(exported.equals(content), "exported bytes must equal original");
    await fsp.rm(srcDir, { recursive: true, force: true });
    await fsp.rm(exportDir, { recursive: true, force: true });
  });

  test("export refuses to overwrite an existing file at the target path", async () => {
    const { mv, rawKey } = await setup();
    const srcDir = await mkTmp();
    const exportDir = await mkTmp();
    const src = await makeFixture(srcDir, "img.png", Buffer.alloc(64, 0xcc));
    const { record } = await mv.import(rawKey, { sourcePath: src });

    const target = path.join(exportDir, "existing.png");
    await fsp.writeFile(target, "already here");

    await assert.rejects(
      () => mv.export(rawKey, { id: record.id, targetPath: target }),
      (err) => err.code === "PATH_CONFLICT",
    );
    await fsp.rm(srcDir, { recursive: true, force: true });
    await fsp.rm(exportDir, { recursive: true, force: true });
  });

  test("export with a wrong key fails authentication", async () => {
    const { mv, rawKey } = await setup();
    const srcDir = await mkTmp();
    const exportDir = await mkTmp();
    const src = await makeFixture(srcDir, "doc.pdf", Buffer.alloc(256, 0xf0));
    const { record } = await mv.import(rawKey, { sourcePath: src });

    const wrongKey = makeKey();
    const target = path.join(exportDir, "out.pdf");
    let thrown2 = null;
    try {
      await mv.export(wrongKey, { id: record.id, targetPath: target });
    } catch (err) {
      thrown2 = err;
    }
    assert.ok(thrown2 !== null, "must throw with a wrong key");
    assert.ok(
      ["INTEGRITY_FAILED", "AUTH_FAILED", "TRUNCATED"].includes(thrown2.code),
      `expected auth/integrity error, got ${thrown2.code}`,
    );
    // No partial output must exist.
    const exists = await fsp.access(target).then(() => true).catch(() => false);
    assert.ok(!exists, "no partial output on auth failure");
    await fsp.rm(srcDir, { recursive: true, force: true });
    await fsp.rm(exportDir, { recursive: true, force: true });
  });

  test("export with a tampered blob fails integrity", async () => {
    const { mv, rawKey, mediaRoot } = await setup();
    const srcDir = await mkTmp();
    const exportDir = await mkTmp();
    const src = await makeFixture(srcDir, "vid.mp4", Buffer.alloc(1024, 0x7a));
    const { record } = await mv.import(rawKey, { sourcePath: src });

    // Flip a byte deep in the ciphertext.
    const blobPath = path.join(mediaRoot, record.blobName);
    const blob = await fsp.readFile(blobPath);
    blob[blob.length - 50] ^= 0xff;
    await fsp.writeFile(blobPath, blob);

    const target = path.join(exportDir, "out.mp4");
    let thrown = null;
    try {
      await mv.export(rawKey, { id: record.id, targetPath: target });
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown !== null, "export must throw on tampered blob");
    assert.ok(
      ["INTEGRITY_FAILED", "AUTH_FAILED", "TRUNCATED"].includes(thrown.code),
      `expected an integrity/auth error, got ${thrown.code}: ${thrown.message}`,
    );
    // No partial output must exist.
    const exists = await fsp.access(target).then(() => true).catch(() => false);
    assert.ok(!exists, "no partial output on tampered blob");
    await fsp.rm(srcDir, { recursive: true, force: true });
    await fsp.rm(exportDir, { recursive: true, force: true });
  });
});

describe("mediavault: delete", () => {
  test("remove with confirm:true deletes blob and metadata", async () => {
    const { mv, rawKey, mediaRoot } = await setup();
    const srcDir = await mkTmp();
    const src = await makeFixture(srcDir, "img.gif", Buffer.alloc(128, 0x33));
    const { record } = await mv.import(rawKey, { sourcePath: src });

    const blobPath = path.join(mediaRoot, record.blobName);
    const blobExisted = await fsp.access(blobPath).then(() => true).catch(() => false);
    assert.ok(blobExisted, "blob must exist before remove");

    await mv.remove(rawKey, { id: record.id, confirm: true });

    const blobGone = await fsp.access(blobPath).then(() => false).catch(() => true);
    assert.ok(blobGone, "blob must be gone after remove");

    const listed = await mv.list(rawKey);
    assert.equal(listed.length, 0);
    await fsp.rm(srcDir, { recursive: true, force: true });
  });

  test("remove without confirm:true is refused with CONSENT_REQUIRED", async () => {
    const { mv, rawKey } = await setup();
    const srcDir = await mkTmp();
    const src = await makeFixture(srcDir, "audio.ogg", Buffer.alloc(64, 0x44));
    const { record } = await mv.import(rawKey, { sourcePath: src });

    await assert.rejects(
      () => mv.remove(rawKey, { id: record.id, confirm: false }),
      (err) => err.code === "CONSENT_REQUIRED",
    );
    // Record must still exist.
    const listed = await mv.list(rawKey);
    assert.equal(listed.length, 1);
    await fsp.rm(srcDir, { recursive: true, force: true });
  });

  test("remove with an unknown id is refused with NOT_FOUND", async () => {
    const { mv, rawKey } = await setup();
    await assert.rejects(
      () => mv.remove(rawKey, { id: "nonexistent-id", confirm: true }),
      (err) => err.code === "NOT_FOUND",
    );
  });
});

describe("mediavault: session and key security", () => {
  test("list without a key throws SESSION_REQUIRED", async () => {
    const { mv } = await setup();
    await assert.rejects(() => mv.list(null), (err) => err.code === "SESSION_REQUIRED");
    await assert.rejects(() => mv.list(undefined), (err) => err.code === "SESSION_REQUIRED");
    await assert.rejects(() => mv.list("not-a-buffer"), (err) => err.code === "SESSION_REQUIRED");
  });

  test("import without a key throws SESSION_REQUIRED", async () => {
    const { mv } = await setup();
    const srcDir = await mkTmp();
    const src = await makeFixture(srcDir, "x.jpg", Buffer.alloc(10, 0x01));
    await assert.rejects(
      () => mv.import(null, { sourcePath: src }),
      (err) => err.code === "SESSION_REQUIRED",
    );
    await fsp.rm(srcDir, { recursive: true, force: true });
  });

  test("records from one key are unreadable with a different key", async () => {
    const { mv, rawKey } = await setup();
    const srcDir = await mkTmp();
    const src = await makeFixture(srcDir, "img.bmp", Buffer.alloc(256, 0x55));
    await mv.import(rawKey, { sourcePath: src });

    const otherKey = makeKey();
    let thrown3 = null;
    try {
      await mv.list(otherKey);
    } catch (err) {
      thrown3 = err;
    }
    assert.ok(thrown3 !== null, "must throw with wrong key");
    assert.ok(
      ["INTEGRITY_FAILED", "AUTH_FAILED"].includes(thrown3.code),
      `expected auth/integrity error, got ${thrown3.code}`,
    );
    await fsp.rm(srcDir, { recursive: true, force: true });
  });
});

describe("mediavault: input validation", () => {
  test("unknown file type is refused with BAD_INPUT", async () => {
    const { mv, rawKey } = await setup();
    const srcDir = await mkTmp();
    const src = await makeFixture(srcDir, "prog.exe", Buffer.alloc(64, 0x00));
    await assert.rejects(
      () => mv.import(rawKey, { sourcePath: src }),
      (err) => err.code === "BAD_INPUT",
    );
    await fsp.rm(srcDir, { recursive: true, force: true });
  });

  test("a file exceeding MAX_FILE_BYTES is refused with BAD_INPUT", async () => {
    const { mv, rawKey } = await setup();
    // We fake a large file by stubbing stat — cheaper than writing 200 MB.
    const srcDir = await mkTmp();
    const src = await makeFixture(srcDir, "big.jpg", Buffer.alloc(10));
    // Temporarily monkey-patch lstat to return an oversized stat.
    const fspReal = require("node:fs/promises");
    const origLstat = fspReal.lstat.bind(fspReal);
    fspReal.lstat = async (p) => {
      if (p === path.resolve(src)) {
        const s = await origLstat(p);
        return { ...s, size: MAX_FILE_BYTES + 1, isSymbolicLink: () => false, isFile: () => true };
      }
      return origLstat(p);
    };
    try {
      await assert.rejects(
        () => mv.import(rawKey, { sourcePath: src }),
        (err) => err.code === "BAD_INPUT",
      );
    } finally {
      fspReal.lstat = origLstat;
    }
    await fsp.rm(srcDir, { recursive: true, force: true });
  });

  test("a missing source file is refused with NOT_FOUND", async () => {
    const { mv, rawKey } = await setup();
    await assert.rejects(
      () => mv.import(rawKey, { sourcePath: "/does/not/exist/file.jpg" }),
      (err) => err.code === "NOT_FOUND",
    );
  });

  test("import of a symlink is refused with BAD_INPUT", async () => {
    const { mv, rawKey } = await setup();
    const srcDir = await mkTmp();
    const target = await makeFixture(srcDir, "real.jpg", Buffer.alloc(32, 0x11));
    const link = path.join(srcDir, "link.jpg");
    try {
      await fsp.symlink(target, link);
    } catch {
      // Skip on platforms where symlink creation is not permitted.
      return;
    }
    await assert.rejects(
      () => mv.import(rawKey, { sourcePath: link }),
      (err) => err.code === "BAD_INPUT",
    );
    await fsp.rm(srcDir, { recursive: true, force: true });
  });

  test("export with no id throws BAD_INPUT", async () => {
    const { mv, rawKey } = await setup();
    const exportDir = await mkTmp();
    await assert.rejects(
      () => mv.export(rawKey, { id: "", targetPath: path.join(exportDir, "out.jpg") }),
      (err) => err.code === "BAD_INPUT",
    );
    await fsp.rm(exportDir, { recursive: true, force: true });
  });

  test("export with a non-existent target directory throws IO_FAILED", async () => {
    const { mv, rawKey } = await setup();
    const srcDir = await mkTmp();
    const src = await makeFixture(srcDir, "img.jpg", Buffer.alloc(64, 0x22));
    const { record } = await mv.import(rawKey, { sourcePath: src });

    await assert.rejects(
      () => mv.export(rawKey, { id: record.id, targetPath: "/no/such/directory/out.jpg" }),
      (err) => err.code === "IO_FAILED",
    );
    await fsp.rm(srcDir, { recursive: true, force: true });
  });
});

describe("mediavault: persistence", () => {
  test("records survive a service restart (new engine+store pointing at same root)", async () => {
    const { root, storeRoot, mediaRoot, rawKey } = await setup();
    const srcDir = await mkTmp();
    const content = crypto.randomBytes(512);
    const src = await makeFixture(srcDir, "persist.png", content);

    // Import with the first service instance.
    const engine1 = new VaultEngine({ kdfParams: { kdfId: 0, iterations: 0 } });
    const store1 = new EncryptedStore({ root: storeRoot, engine: engine1 });
    const mv1 = new MediaVault({ engine: engine1, store: store1, root: mediaRoot });
    const { record: r1 } = await mv1.import(rawKey, { sourcePath: src });

    // Create a fresh service pointing at the same directories.
    const engine2 = new VaultEngine({ kdfParams: { kdfId: 0, iterations: 0 } });
    const store2 = new EncryptedStore({ root: storeRoot, engine: engine2 });
    const mv2 = new MediaVault({ engine: engine2, store: store2, root: mediaRoot });

    const listed = await mv2.list(rawKey);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, r1.id);
    assert.equal(listed[0].originalName, "persist.png");

    // Export from the second instance and verify bytes.
    const exportDir = await mkTmp();
    const target = path.join(exportDir, "recovered.png");
    await mv2.export(rawKey, { id: r1.id, targetPath: target });
    const recovered = await fsp.readFile(target);
    assert.ok(recovered.equals(content));

    await fsp.rm(srcDir, { recursive: true, force: true });
    await fsp.rm(exportDir, { recursive: true, force: true });
    await fsp.rm(root, { recursive: true, force: true });
  });
});

describe("mediavault: count", () => {
  test("count reflects the real number of imported items by category", async () => {
    const { mv, rawKey } = await setup();
    const srcDir = await mkTmp();
    const files = [
      ["a.jpg", "image/jpeg"],
      ["b.png", "image/png"],
      ["c.mp4", "video/mp4"],
    ];
    for (const [name] of files) {
      await mv.import(rawKey, { sourcePath: await makeFixture(srcDir, name, Buffer.alloc(64)) });
    }
    const result = await mv.count(rawKey);
    assert.equal(result.total, 3);
    assert.equal(result.byCategory.Photos, 2);
    assert.equal(result.byCategory.Videos, 1);
    await fsp.rm(srcDir, { recursive: true, force: true });
  });
});
