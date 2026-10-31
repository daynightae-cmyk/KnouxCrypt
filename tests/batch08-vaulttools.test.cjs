"use strict";

/**
 * Batch 08 (tasks 29-32) tests: Collections, protected Document Viewer,
 * Vault Key Rotation and Package Inspector.
 *
 * Everything here exercises the real implementation end to end: real AES-256-GCM
 * containers on disk, real PBKDF2 enrollment, real atomic writes. Negative cases
 * (corrupt container, wrong password, aborted write, revoked session, path
 * conflict, tampered header) assert on the real typed error codes.
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

const PASSWORD = "correct horse battery staple";
const NEW_PASSWORD = "a completely different passphrase";

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "knoux-b8-"));
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

async function writeFile(dir, name, contents) {
  const file = path.join(dir, name);
  await fsp.writeFile(file, contents);
  return file;
}

// ---------------------------------------------------------------------------
// Task 29 — Private vault collections
// ---------------------------------------------------------------------------

test("collections: create nests, tags are normalised and depth is bounded", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);

  const root = await service.collectionsCreate(sessionId, { name: "Documents", tags: ["Work", "work", " Legal "] });
  assert.equal(root.depth, 0);
  assert.deepEqual(root.tags, ["work", "legal"], "tags are trimmed, lower-cased and de-duplicated");

  const child = await service.collectionsCreate(sessionId, { name: "Taxes", parentId: root.id });
  assert.equal(child.depth, 1);
  assert.equal(child.parentId, root.id);

  const tree = await service.collectionsTree(sessionId);
  assert.equal(tree.collections.length, 2);

  await rejects(
    service.collectionsCreate(sessionId, { name: "Orphan", parentId: "does-not-exist" }),
    CODES.NOT_FOUND,
  );
});

test("collections: an item is encrypted at rest and decrypts back byte-for-byte", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const collection = await service.collectionsCreate(sessionId, { name: "Assets" });

  const plaintext = crypto.randomBytes(4096);
  const input = await writeFile(dir, "asset.bin", plaintext);

  const { item } = await service.collectionsAddItem(sessionId, { collectionId: collection.id, inputPath: input });
  assert.equal(item.size, plaintext.length);
  assert.equal(item.sha256, crypto.createHash("sha256").update(plaintext).digest("hex"));

  // The stored blob must not contain the plaintext.
  const blob = await fsp.readFile(path.join(dir, "vault-collections", "items", `${item.id}.knx`));
  assert.ok(!blob.includes(plaintext.subarray(0, 64)), "the encrypted container must not contain plaintext");

  const out = path.join(dir, "restored.bin");
  await rejects(
    service.collectionsExportItem(sessionId, { itemId: item.id, outputPath: out }),
    CODES.CONSENT_REQUIRED,
  );
  const exported = await service.collectionsExportItem(sessionId, { itemId: item.id, outputPath: out, confirm: true });
  assert.equal(exported.sha256, item.sha256);
  assert.ok((await fsp.readFile(out)).equals(plaintext), "the exported file matches the original");
});

test("collections: a duplicate name is renamed rather than silently overwritten", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const collection = await service.collectionsCreate(sessionId, { name: "Docs" });
  const input = await writeFile(dir, "note.txt", "hello");

  const first = await service.collectionsAddItem(sessionId, { collectionId: collection.id, inputPath: input, name: "note.txt" });
  assert.equal(first.item.name, "note.txt");

  const second = await service.collectionsAddItem(sessionId, { collectionId: collection.id, inputPath: input, name: "note.txt" });
  assert.equal(second.renamed, true);
  assert.equal(second.item.name, "note (2).txt");

  const kept = await service.collectionsAddItem(sessionId, {
    collectionId: collection.id,
    inputPath: input,
    name: "note.txt",
    onDuplicate: "keep",
  });
  assert.equal(kept.skipped, true);
});

test("collections: move preserves the blob, copy re-encrypts under a new nonce", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const a = await service.collectionsCreate(sessionId, { name: "A" });
  const b = await service.collectionsCreate(sessionId, { name: "B" });
  const input = await writeFile(dir, "data.bin", crypto.randomBytes(2048));
  const { item } = await service.collectionsAddItem(sessionId, { collectionId: a.id, inputPath: input });

  const moved = await service.collectionsMoveItem(sessionId, { itemId: item.id, toCollectionId: b.id });
  assert.equal(moved.moved, true);
  assert.equal(moved.item.id, item.id, "a move keeps the item id and its blob");

  const copied = await service.collectionsCopyItem(sessionId, { itemId: item.id, toCollectionId: a.id });
  assert.notEqual(copied.item.id, item.id);
  const original = await fsp.readFile(path.join(dir, "vault-collections", "items", `${item.id}.knx`));
  const copy = await fsp.readFile(path.join(dir, "vault-collections", "items", `${copied.item.id}.knx`));
  assert.ok(!original.equals(copy), "a copy must be a fresh container, not a duplicated file");

  const tree = await service.collectionsTree(sessionId);
  const byId = Object.fromEntries(tree.collections.map((c) => [c.id, c]));
  assert.equal(byId[b.id].itemCount, 1);
  assert.equal(byId[a.id].itemCount, 1);
});

test("collections: a non-empty collection needs a confirmed recursive delete", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const parent = await service.collectionsCreate(sessionId, { name: "Parent" });
  const child = await service.collectionsCreate(sessionId, { name: "Child", parentId: parent.id });
  const input = await writeFile(dir, "x.txt", "x");
  const { item } = await service.collectionsAddItem(sessionId, { collectionId: child.id, inputPath: input });

  await rejects(service.collectionsRemove(sessionId, parent.id), CODES.CONSENT_REQUIRED);
  await rejects(service.collectionsRemove(sessionId, parent.id, { recursive: true }), CODES.CONSENT_REQUIRED);

  const result = await service.collectionsRemove(sessionId, parent.id, { recursive: true, confirm: true });
  assert.equal(result.collections, 2);
  assert.equal(result.items, 1);
  const tree = await service.collectionsTree(sessionId);
  assert.equal(tree.collections.length, 0);
  assert.equal(fs.existsSync(path.join(dir, "vault-collections", "items", `${item.id}.knx`)), false);
});

test("collections: search matches names and tags without a plaintext index on disk", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const collection = await service.collectionsCreate(sessionId, { name: "Reports", tags: ["finance"] });
  const input = await writeFile(dir, "q1.txt", "quarter one");
  await service.collectionsAddItem(sessionId, { collectionId: collection.id, inputPath: input, name: "q1.txt", tags: ["finance"] });

  const byName = await service.collectionsSearch(sessionId, { query: "q1" });
  assert.equal(byName.matches.length, 1);
  assert.equal(byName.matches[0].kind, "item");

  const byTag = await service.collectionsSearch(sessionId, { tag: "finance" });
  assert.equal(byTag.matches.length, 2);

  // The store on disk is ciphertext: the search term must not appear literally.
  const raw = await fsp.readFile(path.join(dir, "vault-store", "collections.knx"));
  assert.equal(raw.includes(Buffer.from("finance")), false, "collection metadata is encrypted at rest");
});

test("collections: a revoked session cannot read the tree (locked-state reads denied)", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  await service.collectionsCreate(sessionId, { name: "Secret" });
  service.lock(sessionId, "test");
  await rejects(service.collectionsTree(sessionId), CODES.SESSION_REQUIRED);
});

test("collections: a guest session is refused outright", async () => {
  const dir = tmp();
  const service = new VaultService({ userDataPath: dir });
  await service.enroll(PASSWORD);
  const { sessionId } = service.createGuestSession();
  await rejects(service.collectionsTree(sessionId), CODES.SESSION_REQUIRED);
});

// ---------------------------------------------------------------------------
// Task 30 — Protected document viewer
// ---------------------------------------------------------------------------

test("viewer: opens a text document, keeps plaintext on disk only while open, cleans up on close", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const source = await writeFile(dir, "notes.txt", "line one\nline two\n");
  const container = path.join(dir, "notes.knx");
  await service.encryptFile({ sessionId, inputPath: source, outputPath: container });

  const view = await service.viewerOpen(sessionId, { inputPath: container, displayName: "notes.txt" });
  assert.equal(view.kind, "text");
  assert.equal(view.mime, "text/plain");
  assert.equal(view.text, "line one\nline two\n");
  assert.equal(service.viewerStatus().openDocuments, 1);

  const docDir = path.join(dir, "vault-documents");
  const before = (await fsp.readdir(docDir)).length;
  assert.equal(before, 1, "exactly one temp plaintext exists while open");

  await service.viewerClose(view.docId);
  assert.equal(service.viewerStatus().openDocuments, 0);
  assert.equal((await fsp.readdir(docDir)).length, 0, "the temp plaintext is deleted on close");
});

test("viewer: an unsupported format is refused instead of being guessed", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const source = await writeFile(dir, "archive.zip", "not really a zip");
  const container = path.join(dir, "archive.knx");
  await service.encryptFile({ sessionId, inputPath: source, outputPath: container });

  await rejects(
    service.viewerOpen(sessionId, { inputPath: container, displayName: "archive.zip" }),
    CODES.UNSUPPORTED_FORMAT,
  );
});

test("viewer: a revoked session closes every open document and deletes the plaintext", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const source = await writeFile(dir, "secret.txt", "classified");
  const container = path.join(dir, "secret.knx");
  await service.encryptFile({ sessionId, inputPath: source, outputPath: container });

  await service.viewerOpen(sessionId, { inputPath: container, displayName: "secret.txt" });
  assert.equal(service.viewerStatus().openDocuments, 1);

  service.lock(sessionId, "test-revoke");
  // The revoke handler closes documents asynchronously; let the microtask run.
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(service.viewerStatus().openDocuments, 0);
  assert.equal((await fsp.readdir(path.join(dir, "vault-documents"))).length, 0);
});

test("viewer: startup sweep removes stale plaintext left by a crash", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const docDir = path.join(dir, "vault-documents");
  await fsp.mkdir(docDir, { recursive: true });
  await fsp.writeFile(path.join(docDir, "orphan.tmp"), "leftover plaintext");

  const result = await service.viewerSweep();
  assert.equal(result.removed, 1);
  assert.equal((await fsp.readdir(docDir)).length, 0);
});

test("viewer: large documents are paged through bounded chunks instead of inlined", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const big = Buffer.alloc(3 * 1024 * 1024, 0x41); // 3 MiB of "A"
  const source = await writeFile(dir, "big.txt", big);
  const container = path.join(dir, "big.knx");
  await service.encryptFile({ sessionId, inputPath: source, outputPath: container });

  const view = await service.viewerOpen(sessionId, { inputPath: container, displayName: "big.txt" });
  assert.equal(view.truncated, true, "a 3 MiB text file is not inlined into the renderer");
  assert.equal(view.text, null);

  const chunk = await service.viewerReadChunk(view.docId, { offset: 0, length: 1024 });
  assert.equal(chunk.bytesRead, 1024);
  assert.equal(chunk.eof, false);
  assert.ok(Buffer.from(chunk.chunk, "base64").equals(Buffer.alloc(1024, 0x41)));

  const tail = await service.viewerReadChunk(view.docId, { offset: big.length - 10, length: 1024 });
  assert.equal(tail.bytesRead, 10);
  assert.equal(tail.eof, true);
});

// ---------------------------------------------------------------------------
// Task 31 — Vault key rotation
// ---------------------------------------------------------------------------

test("rotation: rewrap mode keeps stored data readable and only changes the wrapper", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  await service.storePut(sessionId, "notes", { id: "n1", title: "kept", body: "hello" });

  const preflight = await service.rotationPreflight(sessionId);
  assert.equal(preflight.enrolled, true);
  assert.ok(preflight.modes.includes("rewrap"));

  const result = await service.rotationStart(sessionId, { newPassword: NEW_PASSWORD, mode: "rewrap", confirm: true });
  assert.equal(result.verified, true);
  assert.equal(result.rotationCount, 1);

  // The new password unlocks and the data is intact.
  const reopened = new VaultService({ userDataPath: dir });
  const { sessionId: sid2 } = await reopened.unlock(NEW_PASSWORD);
  const notes = await reopened.storeList(sid2, "notes");
  assert.equal(notes.records.length, 1);
  assert.equal(notes.records[0].body, "hello");
});

test("rotation: reencrypt mode makes the old key unable to open the new containers", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  await service.storePut(sessionId, "notes", { id: "n1", title: "kept", body: "top secret" });
  const oldStore = await fsp.readFile(path.join(dir, "vault-store", "notes.knx"));

  const result = await service.rotationStart(sessionId, { newPassword: NEW_PASSWORD, mode: "reencrypt", confirm: true });
  assert.equal(result.verified, true);
  assert.ok(result.collectionsReencrypted.includes("notes"));

  const newStore = await fsp.readFile(path.join(dir, "vault-store", "notes.knx"));
  assert.ok(!oldStore.equals(newStore), "the container was actually rewritten");

  // Reopening with the new password yields the same record.
  const reopened = new VaultService({ userDataPath: dir });
  const { sessionId: sid2 } = await reopened.unlock(NEW_PASSWORD);
  const notes = await reopened.storeList(sid2, "notes");
  assert.equal(notes.records[0].body, "top secret");

  // The same live session keeps working (its DEK was swapped in place).
  const still = await service.storeList(sessionId, "notes");
  assert.equal(still.records.length, 1);
});

test("rotation: the old password stops working after a rotation", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  await service.rotationStart(sessionId, { newPassword: NEW_PASSWORD, mode: "rewrap", confirm: true });

  const reopened = new VaultService({ userDataPath: dir });
  await rejects(reopened.unlock(PASSWORD), CODES.AUTH_FAILED);
  const ok = await reopened.unlock(NEW_PASSWORD);
  assert.ok(ok.sessionId);
});

test("rotation: a rotation without confirmation is refused", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  await rejects(service.rotationStart(sessionId, { newPassword: NEW_PASSWORD, mode: "rewrap" }), CODES.CONSENT_REQUIRED);
  await rejects(service.rotationStart(sessionId, { newPassword: "short", mode: "rewrap", confirm: true }), CODES.BAD_INPUT);
  await rejects(service.rotationStart(sessionId, { newPassword: NEW_PASSWORD, mode: "bogus", confirm: true }), CODES.BAD_INPUT);
});

test("rotation: a failed reencrypt rolls the enrollment back so the old password still works", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  await service.storePut(sessionId, "notes", { id: "n1", title: "kept", body: "hello" });

  // Force the store write to fail partway through the reencrypt.
  const original = service.store.write.bind(service.store);
  let calls = 0;
  service.store.write = async (...args) => {
    calls += 1;
    if (calls >= 1) throw new Error("simulated disk failure");
    return original(...args);
  };

  await rejects(
    service.rotationStart(sessionId, { newPassword: NEW_PASSWORD, mode: "reencrypt", confirm: true }),
    CODES.IO_FAILED,
  );
  service.store.write = original;

  // The journal records the failure and the old enrollment is restored.
  const status = await service.rotationStatus();
  assert.equal(status.inProgress, true);
  assert.equal(status.stage, "rolled-back");

  const reopened = new VaultService({ userDataPath: dir });
  const { sessionId: sid2 } = await reopened.unlock(PASSWORD);
  const notes = await reopened.storeList(sid2, "notes");
  assert.equal(notes.records[0].body, "hello");

  // And a rollback clears the journal.
  const rolledBack = await service.rotationRollback(true);
  assert.equal(rolledBack.rolledBack, true);
  assert.equal((await service.rotationStatus()).inProgress, false);
});

test("rotation: a completed reencrypt cannot be rolled back (and says so)", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  await service.storePut(sessionId, "notes", { id: "n1", title: "kept", body: "hello" });
  await service.rotationStart(sessionId, { newPassword: NEW_PASSWORD, mode: "reencrypt", confirm: true });

  // The journal is cleared on success, so a rollback has nothing to act on.
  await rejects(service.rotationRollback(true), CODES.NOT_FOUND);
});

test("rotation: preflight refuses to start while a rotation is pending", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  await service.storePut(sessionId, "notes", { id: "n1", title: "kept", body: "hello" });

  const original = service.store.write.bind(service.store);
  service.store.write = async () => {
    throw new Error("simulated disk failure");
  };
  await rejects(
    service.rotationStart(sessionId, { newPassword: NEW_PASSWORD, mode: "reencrypt", confirm: true }),
    CODES.IO_FAILED,
  );
  service.store.write = original;

  await rejects(
    service.rotationStart(sessionId, { newPassword: "yet another passphrase", mode: "rewrap", confirm: true }),
    CODES.BAD_INPUT,
  );
});

// ---------------------------------------------------------------------------
// Task 32 — Ciphertext package inspector
// ---------------------------------------------------------------------------

test("package: header inspection reports unauthenticated claims and never claims decryptability", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const source = await writeFile(dir, "doc.txt", "payload");
  const container = path.join(dir, "doc.knx");
  await service.encryptFile({ sessionId, inputPath: source, outputPath: container });

  const info = await service.packageInspect(container);
  assert.equal(info.isVault, true);
  assert.equal(info.version, 1);
  assert.equal(info.headerAuthenticated, false);
  assert.equal(info.canDecrypt, null);
  assert.equal(info.declaredOrigSize, 7);
});

test("package: a non-vault file is rejected with NOT_A_VAULT", async () => {
  const dir = tmp();
  const { service } = await unlocked(dir);
  const junk = await writeFile(dir, "random.bin", crypto.randomBytes(2048));
  await rejects(service.packageInspect(junk), CODES.NOT_A_VAULT);
});

test("package: verification succeeds with the right key and reports authenticated metadata", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const source = await writeFile(dir, "doc.txt", "payload to verify");
  const container = path.join(dir, "doc.knx");
  await service.encryptFile({ sessionId, inputPath: source, outputPath: container });

  const verified = await service.packageVerify(sessionId, container);
  assert.equal(verified.verified, true);
  assert.equal(verified.headerAuthenticated, true);
  assert.equal(verified.origSize, "payload to verify".length);
  assert.ok(verified.frames >= 1);
});

test("package: a tampered byte fails verification", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const source = await writeFile(dir, "doc.txt", "payload that will be tampered with");
  const container = path.join(dir, "doc.knx");
  await service.encryptFile({ sessionId, inputPath: source, outputPath: container });

  const bytes = await fsp.readFile(container);
  // Flip a byte inside the ciphertext body (past the sealed header).
  const target = 96 + 32 + 20;
  bytes[target] ^= 0xff;
  await fsp.writeFile(container, bytes);

  await rejects(service.packageVerify(sessionId, container), CODES.AUTH_FAILED);
});

test("package: truncation fails verification", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const source = await writeFile(dir, "doc.txt", "payload that will be truncated");
  const container = path.join(dir, "doc.knx");
  await service.encryptFile({ sessionId, inputPath: source, outputPath: container });

  const bytes = await fsp.readFile(container);
  await fsp.writeFile(container, bytes.subarray(0, bytes.length - 16));

  await rejects(service.packageVerify(sessionId, container), CODES.TRUNCATED);
});

test("package: verification with a foreign key fails authentication", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const source = await writeFile(dir, "doc.txt", "payload");
  const container = path.join(dir, "doc.knx");
  await service.encryptFile({ sessionId, inputPath: source, outputPath: container });

  // A second, unrelated vault has a different DEK.
  const otherDir = tmp();
  const { service: other, sessionId: otherSession } = await unlocked(otherDir);
  await rejects(other.packageVerify(otherSession, container), CODES.INTEGRITY_FAILED);
});

test("package: an unsupported container version is refused, not misread", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const source = await writeFile(dir, "doc.txt", "payload");
  const container = path.join(dir, "doc.knx");
  await service.encryptFile({ sessionId, inputPath: source, outputPath: container });

  const bytes = await fsp.readFile(container);
  bytes[8] = 9; // version byte
  await fsp.writeFile(container, bytes);
  await rejects(service.packageInspect(container), CODES.UNSUPPORTED_FORMAT);
});

// ---------------------------------------------------------------------------
// Cross-cutting negative cases required by the mission
// ---------------------------------------------------------------------------

test("negative: a corrupted container cannot be decrypted by any path", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const source = await writeFile(dir, "doc.txt", "payload");
  const container = path.join(dir, "doc.knx");
  await service.encryptFile({ sessionId, inputPath: source, outputPath: container });

  const bytes = await fsp.readFile(container);
  bytes[bytes.length - 1] ^= 0xff; // break the trailing MAC
  await fsp.writeFile(container, bytes);

  await rejects(
    service.decryptFile({ sessionId, inputPath: container, outputPath: path.join(dir, "out.txt") }),
    CODES.INTEGRITY_FAILED,
  );
  assert.equal(fs.existsSync(path.join(dir, "out.txt")), false, "no partial plaintext is left behind");
});

test("negative: an aborted write leaves no output and no temp file", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const big = Buffer.alloc(4 * 1024 * 1024, 0x42);
  const source = await writeFile(dir, "big.bin", big);
  const container = path.join(dir, "big.knx");

  // Abort almost immediately: the atomic write must clean up its temp file.
  const operationId = "op-abort-1";
  const promise = service.encryptFile({ sessionId, inputPath: source, outputPath: container, operationId });
  service.cancel(operationId);
  await rejects(promise, CODES.CANCELLED);

  assert.equal(fs.existsSync(container), false, "the destination is never created on abort");
  const leftovers = (await fsp.readdir(dir)).filter((n) => n.includes(".tmp"));
  assert.deepEqual(leftovers, [], "no temp file survives an aborted write");
});

test("negative: decrypting to an existing path is refused with PATH_CONFLICT", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const source = await writeFile(dir, "doc.txt", "payload");
  const container = path.join(dir, "doc.knx");
  await service.encryptFile({ sessionId, inputPath: source, outputPath: container });

  const out = path.join(dir, "existing.txt");
  await fsp.writeFile(out, "already here");
  await rejects(
    service.decryptFile({ sessionId, inputPath: container, outputPath: out, overwrite: false }),
    CODES.PATH_CONFLICT,
  );
  assert.equal((await fsp.readFile(out, "utf8")), "already here", "the existing file is untouched");
});

test("negative: a wrong password fails with AUTH_FAILED and never yields data", async () => {
  const dir = tmp();
  const { service, sessionId } = await unlocked(dir);
  const source = await writeFile(dir, "doc.txt", "payload");
  const container = path.join(dir, "doc.knx");
  await service.encryptFile({ sessionId, inputPath: source, outputPath: container });

  const reopened = new VaultService({ userDataPath: dir });
  await rejects(reopened.unlock("the wrong password entirely"), CODES.AUTH_FAILED);
});
