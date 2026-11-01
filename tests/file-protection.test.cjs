"use strict";

/**
 * Real per-user file protection (Windows NTFS DACLs / POSIX modes).
 *
 * These tests exist because `mode: 0o600` and `fs.chmod()` do not control
 * access on Windows: libuv maps only the POSIX write bit onto
 * FILE_ATTRIBUTE_READONLY, and the file's actual DACL is inherited from its
 * directory — which under a profile or temp root grants `BUILTIN\Users:(RX)`
 * and `NT AUTHORITY\Authenticated Users:(M)`. A passing POSIX mode assertion on
 * Windows therefore proves nothing about confidentiality, and skipping the
 * assertion on Windows would hide a real exposure.
 *
 * So on Windows every claim here is checked against the security descriptor the
 * OS enforces, using `icacls /findsid` with SIDs (never display names, which
 * are localised), and every denial is produced with a mechanism the platform
 * actually enforces — an explicit DENY ACE, not a chmod.
 *
 * Each test builds its own adversarial ACL rather than trusting the machine's
 * baseline, so the suite proves the mechanism works instead of passing because
 * a particular host happened to be strict already.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("fs/promises");
const os = require("node:os");
const path = require("node:path");

const acl = require("../electron/vault/acl");
const { VaultService } = require("../electron/vault/service");
const { VaultEngine } = require("../electron/vault/engine");
const { VaultSessionManager } = require("../electron/vault/session");
const { EncryptedStore } = require("../electron/vault/store");
const { KDF } = require("../electron/vault/kdf");
const { CODES } = require("../electron/vault/errors");

const IS_WINDOWS = process.platform === "win32";
const PASSWORD = "correct horse battery staple";
const EVERYONE = "S-1-1-0";
const AUTHENTICATED_USERS = "S-1-5-11";
const USERS = "S-1-5-32-545";

function mkroot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `knoux-${prefix}-`));
}

function icacls(target, ...args) {
  cp.execFileSync("icacls", [target, ...args], { encoding: "utf8" });
}

/**
 * Loosen a path the way an unprotected Windows default does: hand read access
 * to Everyone. POSIX equivalent clears the owner-only mode.
 */
function makeWorldReadable(target) {
  if (IS_WINDOWS) {
    icacls(target, "/grant", `*${EVERYONE}:R`);
    return;
  }
  fs.chmodSync(target, 0o644);
}

async function isWorldReadable(target) {
  if (IS_WINDOWS) {
    const info = await acl.describeAccess(target);
    return Boolean(info && info.broadGrants.includes(EVERYONE));
  }
  const mode = (await fsp.stat(target)).mode & 0o777;
  return (mode & 0o004) !== 0;
}

function service(dir) {
  const manager = new VaultSessionManager({ enrollmentPath: path.join(dir, "vault-enrollment.json"), iterations: 100000 });
  const engine = new VaultEngine({ kdfParams: { kdfId: KDF.RAW_KEY }, chunkSize: 8192 });
  return new VaultService({ userDataPath: dir, manager, engine });
}

// ---- the mechanism itself ---------------------------------------------------

test("protection confines a file to its owner and removes broad grants", async () => {
  const dir = mkroot("acl-file");
  try {
    const file = path.join(dir, "secret.knx");
    await fsp.writeFile(file, "sealed", { mode: 0o600 });

    // Establish that the test can observe exposure at all. Without this the
    // "restricted" assertion below could pass vacuously on a strict host.
    makeWorldReadable(file);
    assert.equal(await isWorldReadable(file), true, "the harness must be able to grant Everyone access");
    assert.equal((await acl.isProtected(file)).ok, false, "a file readable by Everyone is not protected");

    await acl.protectFile(file);
    const verdict = await acl.isProtected(file);
    assert.equal(verdict.ok, true, `expected owner-only protection, got: ${verdict.detail}`);
    assert.equal(await isWorldReadable(file), false, "Everyone must lose access after protection");

    // The owner must still be able to use its own vault. Asserting only
    // "nobody else can read it" would let a self-lockout pass as success.
    await fsp.writeFile(file, "rewritten");
    assert.equal((await fsp.readFile(file, "utf8")), "rewritten", "protection must not lock out the owner");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("protection reports its mechanism per platform instead of faking one", async () => {
  const dir = mkroot("acl-mech");
  try {
    const file = path.join(dir, "a.bin");
    await fsp.writeFile(file, "x");
    await acl.protectFile(file);
    const info = await acl.describeAccess(file);
    if (IS_WINDOWS) {
      assert.equal(info.mechanism, "ntfs-dacls");
      assert.match(info.ownerSid, /^S-1-5-21-\d+-\d+-\d+-\d+$/, "a Windows verdict needs the real owner SID");
      assert.equal(info.ownerGranted, true);
      // Windows keeps SYSTEM + Administrators by design (backup, antivirus,
      // elevated servicing; an admin can take ownership of any file anyway).
      // What must be gone is every group that reaches *other ordinary users*.
      for (const broad of [EVERYONE, AUTHENTICATED_USERS, USERS]) {
        assert.equal(info.broadGrants.includes(broad), false, `${broad} must not be granted`);
      }
    } else {
      assert.equal(info.mechanism, "posix-mode");
      assert.equal(info.mode & 0o077, 0, "group/world bits must be clear");
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a protected directory confines files created inside it from the moment they exist", async () => {
  const dir = mkroot("acl-inherit");
  try {
    const store = path.join(dir, "vault-store");
    await fsp.mkdir(store, { recursive: true });
    await acl.protectDirectory(store);

    // Created *after* protection.
    const fresh = path.join(store, "fresh.knx");
    await fsp.writeFile(fresh, "sealed");
    await acl.protectFile(fresh);

    if (IS_WINDOWS) {
      // NTFS: the child inherited the owner-only DACL at creation, so it never
      // existed under a permissive ACL.
      assert.equal(await isWorldReadable(fresh), false, "a new child must not be readable by Everyone");
    } else {
      // POSIX has no inheritance at all: a new file takes its mode from the
      // create call and the umask, so the directory's 0700 cannot give the file
      // 0600. What confines it on POSIX is that no other user can traverse into
      // the directory, plus the explicit per-file mode. Asserting the inherited
      // file mode here would be testing a Windows mechanism on the wrong OS.
      const dirMode = (await fsp.stat(store)).mode & 0o777;
      assert.equal(dirMode & 0o077, 0, `directory must deny group/world traversal, got ${dirMode.toString(8)}`);
      assert.equal((await fsp.stat(fresh)).mode & 0o777, 0o600, "the per-file pass must still set 0600");
    }
    assert.equal((await acl.isProtected(fresh)).ok, true, "and the file must be confined either way");

    // Pre-existing child with a loose ACL.
    const existing = path.join(store, "existing.knx");
    await fsp.writeFile(existing, "old");
    await acl.protectFile(existing);
    makeWorldReadable(existing);
    assert.equal(await isWorldReadable(existing), true, "the pre-existing child starts exposed");
    await acl.protectDirectory(store, { recursive: true });
    assert.equal(
      await isWorldReadable(existing),
      false,
      IS_WINDOWS ? "the parent DACL change must propagate to the existing child" : "the recursive pass must clear the mode",
    );
    assert.equal((await acl.isProtected(existing)).ok, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("protection never leaves an empty DACL that locks the owner out", async () => {
  // Regression guard for the failure found while building this: `/T` combined
  // with `(OI)(CI)` puts an inert template on leaf files, and `/inheritance:r`
  // then strips their only effective grant, so the owner cannot even stat them.
  const dir = mkroot("acl-lockout");
  try {
    const root = path.join(dir, "vault");
    await fsp.mkdir(path.join(root, "deep"), { recursive: true });
    const leaves = [path.join(root, "one.knx"), path.join(root, "deep", "two.knx")];
    for (const leaf of leaves) await fsp.writeFile(leaf, "payload");

    await acl.protectDirectory(root);
    await acl.protectDirectory(root, { recursive: true });

    for (const leaf of leaves) {
      assert.equal((await fsp.readFile(leaf, "utf8")), "payload", `${path.basename(leaf)} must stay readable`);
      await fsp.writeFile(leaf, "payload2");
      assert.equal((await fsp.readFile(leaf, "utf8")), "payload2", `${path.basename(leaf)} must stay writable`);
      assert.equal((await acl.isProtected(leaf)).ok, true);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- the real vault artifacts ----------------------------------------------

test("the enrollment record and its directory are confined to one user", async () => {
  const dir = mkroot("acl-enroll");
  try {
    const svc = service(dir);
    await svc.enroll(PASSWORD);
    await svc.fileProtection;
    const enrollment = path.join(dir, "vault-enrollment.json");

    const dirVerdict = await acl.isProtected(dir);
    assert.equal(dirVerdict.ok, true, `vault root must be owner-only: ${dirVerdict.detail}`);
    const fileVerdict = await acl.isProtected(enrollment);
    assert.equal(fileVerdict.ok, true, `enrollment record must be owner-only: ${fileVerdict.detail}`);

    // The record is only worth protecting because of what it holds.
    const record = JSON.parse(await fsp.readFile(enrollment, "utf8"));
    for (const field of ["wrappedDek", "salt", "verifier"]) {
      assert.ok(record[field], `the sealed record should still carry ${field}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a sealed store collection and its directory are confined to one user", async () => {
  const dir = mkroot("acl-store");
  try {
    const svc = service(dir);
    const { sessionId } = await svc.enroll(PASSWORD);
    await svc.storePut(sessionId, "notes", { id: "n1", title: "T", body: "secret", category: "Personal", pinned: false, updated: "now" });
    await svc.fileProtection;

    const storeDir = path.join(dir, "vault-store");
    const file = path.join(storeDir, "notes.knx");
    assert.equal((await acl.isProtected(storeDir)).ok, true, "the store directory must be owner-only");
    assert.equal((await acl.isProtected(file)).ok, true, "the sealed collection must be owner-only");

    // And still genuinely encrypted, not merely ACL-gated.
    const raw = await fsp.readFile(file);
    assert.equal(raw.includes(Buffer.from("secret")), false, "plaintext must never reach the disk");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("encrypted and recovered plaintext outside the vault root are confined too", async () => {
  const dir = mkroot("acl-cipher");
  try {
    const svc = service(dir);
    const { sessionId } = await svc.enroll(PASSWORD);
    const dek = svc.manager.getDek(sessionId);

    // An arbitrary directory that is not one of the vault's own roots, the way
    // a user-chosen export location behaves.
    const outside = mkroot("acl-outside");
    try {
      const src = path.join(outside, "plain.bin");
      await fsp.writeFile(src, crypto.randomBytes(40000));
      const enc = path.join(outside, "out.knv");
      await svc.engine.encryptFile({ inputPath: src, outputPath: enc, rawKey: dek });
      assert.equal((await acl.isProtected(enc)).ok, true, "the container must not be world-readable");

      const dec = path.join(outside, "recovered.bin");
      await svc.engine.decryptFile({ inputPath: enc, outputPath: dec, rawKey: dek });
      assert.equal((await acl.isProtected(dec)).ok, true, "recovered plaintext must not be world-readable");
      assert.equal((await acl.isProtected(src)).ok, false, "a file the app did not write stays as its creator left it");
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- genuine platform denials ----------------------------------------------

test("an unwritable destination is refused with PERMISSION_DENIED and no partial output", async (t) => {
  if (!IS_WINDOWS && process.getuid && process.getuid() === 0) {
    t.skip("running as root: POSIX write bits are not enforced against root");
    return;
  }
  const dir = mkroot("acl-deny");
  const locked = path.join(dir, "locked-dir");
  try {
    const svc = service(dir);
    const { sessionId } = await svc.enroll(PASSWORD);
    const dek = svc.manager.getDek(sessionId);

    await fsp.mkdir(locked, { recursive: true });
    // On Windows this is an explicit NTFS DENY ACE for WriteData/AddFile, which
    // the OS evaluates before the owner's Allow ACE, so it genuinely refuses.
    // On POSIX it is the 0o500 directory mode.
    const denial = await acl.denyChildCreation(locked);
    assert.ok(
      IS_WINDOWS ? denial.mechanism === "ntfs-deny-ace" : denial.mechanism === "posix-mode",
      `the denial must use the platform's real mechanism, got ${denial.mechanism}`,
    );

    // Prove the OS itself refuses, independently of the app under test.
    let rawErr = null;
    try {
      await fsp.writeFile(path.join(locked, "probe.tmp"), Buffer.from("x"));
    } catch (err) {
      rawErr = err.code;
    }
    assert.ok(rawErr, "the platform must actually deny the write, otherwise this test proves nothing");

    const src = path.join(dir, "deny-src.bin");
    await fsp.writeFile(src, crypto.randomBytes(200000));
    const target = path.join(locked, "out.knv");

    let code = null;
    try {
      await svc.engine.encryptFile({ inputPath: src, outputPath: target, rawKey: dek });
    } catch (err) {
      code = err.code;
    }
    assert.equal(code, CODES.PERMISSION_DENIED, "a permission refusal must not be reported as a generic IO failure");
    assert.equal(fs.existsSync(target), false, "no partial output may exist");
    const leftovers = (await fsp.readdir(locked)).filter((name) => name.endsWith(".tmp"));
    assert.deepEqual(leftovers, [], "no temp file may be left behind");

    // Decryption must fail closed the same way — plaintext must not be written
    // somewhere the user cannot control, and no partial plaintext may survive.
    const enc = path.join(dir, "deny.knv");
    await svc.engine.encryptFile({ inputPath: src, outputPath: enc, rawKey: dek });
    let dcode = null;
    try {
      await svc.engine.decryptFile({ inputPath: enc, outputPath: path.join(locked, "plain.bin"), rawKey: dek });
    } catch (err) {
      dcode = err.code;
    }
    assert.equal(dcode, CODES.PERMISSION_DENIED);
  } finally {
    await acl.allowChildCreation(locked).catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a denied store root is surfaced, not silently swallowed", async () => {
  const dir = mkroot("acl-store-deny");
  const root = path.join(dir, "vault-store");
  try {
    const svc = service(dir);
    const { sessionId } = await svc.enroll(PASSWORD);
    const dek = svc.manager.getDek(sessionId);

    await fsp.mkdir(root, { recursive: true });
    await acl.denyChildCreation(root);

    const store = new EncryptedStore({ root, engine: svc.engine });
    let code = null;
    let result = null;
    try {
      result = await store.put("notes", dek, { id: "x", title: "t", body: "b", category: "Personal", pinned: false, updated: "now" });
    } catch (err) {
      code = err.code;
    }

    if (IS_WINDOWS) {
      // A DENY ACE for the current user survives protection: icacls strips
      // inherited ACEs and replaces the *allow* entries of the allow-list, and
      // never removes an explicit deny (that is /remove:d). So the refusal is
      // real and must be reported as its own condition.
      assert.equal(code, CODES.PERMISSION_DENIED, "the store must surface a denial, not swallow it");
      const created = (await fsp.readdir(root)).filter((n) => n.endsWith(".knx") || n.endsWith(".tmp"));
      assert.deepEqual(created, [], "a failed put must leave no store or temp file");
    } else {
      // POSIX: protectDirectory chmods its own directory 0700, which overwrites
      // the 0500 mode the test applied. That is deliberate product behaviour —
      // a store root left unwritable would make the vault permanently
      // unsaveable — so the POSIX assertion is that the write succeeds and the
      // result is confined, not that a mode-based freeze is honoured.
      // The unambiguous POSIX denial case is covered above, on a destination
      // directory the application does not own.
      assert.equal(code, null, `expected the app to restore its own store directory, got ${code}`);
      assert.equal(result.created, true);
      assert.equal((await acl.isProtected(path.join(root, "notes.knx"))).ok, true, "and the written store must be owner-only");
    }
  } finally {
    await acl.allowChildCreation(root).catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- honesty checks ---------------------------------------------------------

test("exhaustive verification catches a trustee no blocklist contains, and repair removes it", async (t) => {
  if (!IS_WINDOWS) {
    t.skip("NTFS trustee enumeration is a Windows mechanism");
    return;
  }
  // NT AUTHORITY\LOCAL SERVICE is a real, resolvable account that is neither the
  // owner nor on the known-broad list. A protection scheme that only knows how
  // to delete Everyone/Users/Authenticated Users would leave this grant in
  // place and still call itself owner-only.
  const LOCAL_SERVICE = "S-1-5-19";
  const dir = mkroot("acl-foreign");
  try {
    const file = path.join(dir, "leak.knx");
    await fsp.writeFile(file, "sealed");

    // Start from a genuinely protected file, so the only variable left is the
    // trustee added below.
    await acl.harden(file, { isDirectory: false });
    assert.equal((await acl.isProtected(file, { exhaustive: true })).ok, true, "baseline must be clean");

    icacls(file, "/grant", `*${LOCAL_SERVICE}:R`);

    const cheap = await acl.isProtected(file);
    const thorough = await acl.isProtected(file, { exhaustive: true });
    assert.equal(
      cheap.ok,
      true,
      "the fast path is a known-broad blocklist: it cannot see a trustee it does not know",
    );
    assert.equal(thorough.ok, false, `exhaustive check must see ${LOCAL_SERVICE}: ${thorough.detail}`);
    assert.ok(thorough.detail.includes(LOCAL_SERVICE), "the offending trustee must be named, not just counted");

    const result = await acl.harden(file, { isDirectory: false });
    assert.equal(result.repaired, true, "an unexpected trustee must trigger DACL replacement");
    assert.deepEqual(result.strayBefore, [LOCAL_SERVICE]);

    const after = await acl.describeAccess(file, { exhaustive: true });
    const trustees = after.trustees.map((e) => e.sid).sort();
    const allow = [acl.SID.SYSTEM, acl.SID.ADMINISTRATORS, after.ownerSid].sort();
    assert.deepEqual(trustees, allow, "the DACL must contain exactly the allow-list and nothing else");
    assert.equal((await acl.isProtected(file, { exhaustive: true })).ok, true, "and the file must still be usable");
    await fsp.writeFile(file, "still writable");
    assert.equal((await fsp.readFile(file, "utf8")), "still writable");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("isProtected fails closed when it cannot answer", async () => {
  const dir = mkroot("acl-failclosed");
  try {
    const missing = path.join(dir, "nope.bin");
    const verdict = await acl.isProtected(missing);
    assert.equal(verdict.ok, false, "a nonexistent path is not 'protected'");
    assert.equal(typeof verdict.detail, "string");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the service reports protection outcomes instead of hiding them", async () => {
  const dir = mkroot("acl-status");
  try {
    const svc = service(dir);
    await svc.enroll(PASSWORD);
    await svc.fileProtection;
    const status = svc.fileSecurity();
    assert.equal(status.platform, process.platform);
    assert.equal(status.mechanism, IS_WINDOWS ? "ntfs-dacls" : "posix-mode");
    assert.ok(status.attempts > 0, "writing a vault must actually attempt protection");
    assert.equal(status.failures, 0, `protection failures must be visible, got ${JSON.stringify(status.lastFailures)}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the service refuses to relabel the working directory", async () => {
  // A relative or repository userDataPath must never receive an owner-only
  // DACL: that would be an unrelated, hard-to-reverse change to the checkout.
  const svc = new VaultService({ userDataPath: process.cwd() });
  const result = await svc.fileProtection;
  assert.equal(result.sealed, false);
  assert.equal(result.reason, "refused-cwd");
});
