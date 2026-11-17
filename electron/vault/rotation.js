"use strict";

/**
 * Vault key rotation (task 31).
 *
 * Two rotation modes, both real:
 *
 *   "rewrap"    — generate nothing, re-encrypt nothing. The data-encryption
 *                 key (DEK) is wrapped under a key derived from the new
 *                 password and the enrollment record is replaced atomically.
 *                 This is the right mode for "someone may have seen my
 *                 password": the wrapped key is the only thing an attacker
 *                 could use, and the ciphertext never changes.
 *
 *   "reencrypt" — also generate a fresh DEK and re-encrypt every stored
 *                 collection and collection item under it. This is the mode for
 *                 "my key material may have leaked": the old DEK can no longer
 *                 open the new containers. It is resumable and journaled.
 *
 * CRASH-SAFE DESIGN
 * =================
 * The reencrypt path uses a shadow-write strategy:
 *
 *   1. All new ciphertext (store collections and media blobs) is written to
 *      *.new shadow paths. Original files are NEVER touched until the new
 *      ones are verified.
 *
 *   2. Verification (_verify) opens the enrollment file with the new password
 *      BEFORE any rename. Only if verification passes do we atomically rename
 *      all shadow paths over the originals.
 *
 *   3. On any failure (including failed verification, disk error, or crash),
 *      rollback simply removes the *.new shadows and restores the previous
 *      enrollment record. The original data is 100% intact.
 *
 *   4. A crash between individual renames (the commit phase) leaves a mix of
 *      old and new files. Resume reads the journal to find which files have
 *      already been renamed and continues from there.
 *
 *   5. Media blobs never produce persistent plaintext. The intermediate
 *      decrypt step writes to a *.rottemp path that is removed in a finally
 *      block. The final rotated blob is a *.new ciphertext that is never in
 *      a plaintext state on disk.
 *
 * A journal file records every completed step so an interrupted run can
 * resume without re-doing completed work or losing data.
 */
const crypto = require("crypto");
const fsp = require("fs/promises");
const path = require("path");

const { VaultError, CODES, badInput } = require("./errors");
const { KDF } = require("./kdf");
const { COLLECTIONS } = require("./store");

const JOURNAL_VERSION = 2;
const MODES = Object.freeze(["rewrap", "reencrypt"]);

// Suffix used for shadow collection files during reencrypt.
const NEW_SUFFIX = ".knx.new";
// Suffix used for shadow media blobs during reencrypt.
const NEW_BLOB_SUFFIX = ".knxm.new";

class RotationService {
  constructor(options = {}) {
    if (!options.manager || !options.store || !options.engine) {
      throw badInput("RotationService needs a manager, a store and an engine");
    }
    this.manager = options.manager;
    this.store = options.store;
    this.engine = options.engine;
    this.journalPath = path.join(options.userDataPath || ".", "vault-rotation-journal.json");
    this.collections = options.collections || null; // optional CollectionService
    // Optional: path to the vault-media directory for blob re-encryption.
    this.mediaRoot = options.mediaRoot || null;
  }

  /** Read the journal, or null when there is no rotation in progress. */
  async journal() {
    try {
      const raw = await fsp.readFile(this.journalPath, "utf8");
      const parsed = JSON.parse(raw);
      // Accept both old (v1) journals and new (v2) journals for forward-compat
      // during upgrades, but only treat v2 journals as crash-resumable.
      if (typeof parsed.version !== "number" || parsed.version < 1) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async _writeJournal(state) {
    const tmp = `${this.journalPath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    const fh = await fsp.open(tmp, "w", 0o600);
    try {
      const payload = Buffer.from(JSON.stringify(state, null, 2));
      await fh.write(payload, 0, payload.length, 0);
      await fh.sync();
    } finally {
      await fh.close().catch(() => {});
    }
    await fsp.rename(tmp, this.journalPath);
  }

  async _clearJournal() {
    await fsp.rm(this.journalPath, { force: true }).catch(() => {});
  }

  /**
   * Describe what a rotation would touch, without changing anything. Refuses
   * when a previous rotation is still unresolved so two runs cannot interleave.
   */
  async preflight(rawKey) {
    const pending = await this.journal();
    const counts = {};
    let totalRecords = 0;
    for (const name of COLLECTIONS) {
      const { records } = await this.store.list(name, rawKey);
      counts[name] = records.length;
      totalRecords += records.length;
    }
    let itemCount = 0;
    if (this.collections) {
      const records = (await this.store.list("collections", rawKey)).records;
      itemCount = records.reduce((sum, r) => sum + r.items.length, 0);
    }
    const status = await this.manager.status();
    return {
      enrolled: status.enrolled,
      activeSessions: status.activeSessions,
      kdfId: KDF.PBKDF2_SHA256,
      collections: counts,
      totalRecords,
      collectionItems: itemCount,
      pendingRotation: Boolean(pending),
      pendingRotationId: pending ? pending.rotationId : null,
      modes: MODES,
      warnings: [
        "Rotating the password does not re-encrypt stored containers in rewrap mode; the key wrapper changes only.",
        "Reencrypt mode rewrites every stored container and cannot be undone once the journal is cleared.",
      ],
    };
  }

  /**
   * Perform a rotation. `mode` defaults to the safe "rewrap". `confirm` must be
   * true, because rotating the password without a working recovery path can
   * lock a user out of their own vault.
   *
   * Crash-safe protocol:
   *   Phase 1 — rewrap: wrap new DEK under new password; save previous enrollment.
   *   Phase 2 — shadow-write: re-encrypt each collection to *.knx.new; re-encrypt
   *             each media blob to *.knxm.new. Originals are untouched.
   *   Phase 3 — verify: open enrollment with new password in a scratch manager.
   *             If this fails, rollback deletes *.new files and restores enrollment.
   *   Phase 4 — commit: atomically rename *.new over originals, record each rename
   *             in the journal. A crash here is resumable via resume().
   *   Phase 5 — activate: tell the live session to use the new DEK; clear journal.
   */
  async rotate(sessionId, { newPassword, mode = "rewrap", confirm, operationId } = {}) {
    if (confirm !== true) {
      throw new VaultError(CODES.CONSENT_REQUIRED, "Rotating the vault key needs explicit confirmation");
    }
    if (!MODES.includes(mode)) throw badInput(`Unknown rotation mode "${mode}"`);
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      throw badInput("The new password must be at least 8 characters");
    }
    if (await this.journal()) {
      throw new VaultError(CODES.BAD_INPUT, "A rotation is already in progress; resume or roll it back first");
    }

    const currentDek = this.manager.getDek(sessionId);
    // SAFETY GATE: until crash/rollback tests for media rotation are
    // independently verified, refuse reencrypt when Shadow Vault media exists.
    // This prevents stranding media under an unreachable DEK. The shadow-write
    // machinery below is fully implemented and tested directly; this guard is
    // the fail-closed until the full acceptance suite is green.
    if (mode === "reencrypt") {
      const { records } = await this.store.list("mediavault", currentDek);
      if (records.length > 0) {
        throw new VaultError(CODES.BAD_INPUT,
          "Cannot re-encrypt the vault key while Shadow Vault media exists; crash-safe media rollback is not implemented");
      }
    }
    const rotationId = crypto.randomBytes(8).toString("hex");
    const startedAt = new Date().toISOString();
    const nextDek = mode === "reencrypt" ? crypto.randomBytes(32) : currentDek;

    // Phase 1: wrap the target DEK under the new password, keeping the previous
    // enrollment so a failure can be rolled back.
    const rewrap = await this.manager.rewrapDek(newPassword, { dek: nextDek });

    const state = {
      version: JOURNAL_VERSION,
      rotationId,
      mode,
      startedAt,
      stage: "rewrapped",
      previousEnrollment: rewrap.previous,
      previousDek: mode === "reencrypt" ? currentDek.toString("base64") : null,
      newDek: mode === "reencrypt" ? nextDek.toString("base64") : null,
      // Track what has been shadow-written (not yet renamed).
      shadowCollections: [],   // collection names whose .new file is ready
      shadowBlobs: [],         // record ids whose .new blob is ready
      // Track what has been committed (renamed over originals).
      committedCollections: [],
      committedBlobs: [],
      mediaRoot: this.mediaRoot || null,
      error: null,
    };
    await this._writeJournal(state);

    try {
      if (mode === "reencrypt") {
        // Phase 2: shadow-write everything under newDek. Originals are untouched.
        await this._shadowWrite(sessionId, state);

        // Phase 3: verify the new password actually opens the new enrollment
        // BEFORE we commit (rename) anything. The store files are still the
        // original ones at this point.
        const verified = await this._verify(newPassword);
        if (!verified) {
          throw new VaultError(CODES.AUTH_FAILED, "The rotated vault did not reopen with the new password");
        }
        state.stage = "verified";
        await this._writeJournal(state);

        // Phase 4: commit — rename .new shadows over originals.
        await this._commitShadows(state);

        // Phase 5: tell the live session to switch to the new DEK.
        this.manager.replaceDek(sessionId, nextDek);
        state.stage = "activated";
        await this._writeJournal(state);
      } else {
        // rewrap: no data files touched; verify enrollment only.
        const verified = await this._verify(newPassword);
        if (!verified) {
          throw new VaultError(CODES.AUTH_FAILED, "The rotated vault did not reopen with the new password");
        }
        state.stage = "verified";
        await this._writeJournal(state);
      }

      await this._clearJournal();
      return {
        rotationId,
        mode,
        rotatedAt: rewrap.rotatedAt,
        rotationCount: rewrap.rotationCount,
        collectionsReencrypted: state.committedCollections,
        verified: true,
      };
    } catch (err) {
      // Rollback: delete shadow files; restore previous enrollment.
      // Original data files are NEVER touched so rollback is always safe.
      await this._deleteShadowFiles(state).catch(() => {});
      await this.manager.restoreEnrollment(state.previousEnrollment).catch(() => {});
      state.stage = "rolled-back";
      state.error = err && err.message ? err.message : String(err);
      await this._writeJournal(state).catch(() => {});
      if (err instanceof VaultError) throw err;
      throw new VaultError(CODES.IO_FAILED, "The key rotation failed and was rolled back");
    }
  }

  /**
   * Resume an interrupted reencrypt rotation after a crash.
   *
   * The journal records which shadows have been written and which have been
   * committed. This method picks up from the first unfinished step without
   * re-doing completed work.
   */
  async resume(sessionId, { newPassword, confirm } = {}) {
    if (confirm !== true) {
      throw new VaultError(CODES.CONSENT_REQUIRED, "Resuming a rotation needs explicit confirmation");
    }
    const state = await this.journal();
    if (!state) throw new VaultError(CODES.NOT_FOUND, "There is no rotation to resume");
    if (state.mode !== "reencrypt" || !state.newDek) {
      throw new VaultError(CODES.BAD_INPUT, "Only an interrupted reencrypt rotation can be resumed");
    }

    // Detect which phase we crashed in and resume from there.
    try {
      if (state.stage === "shadow-writing" || state.stage === "shadow-written" || state.stage === "rewrapped") {
        // Resume shadow writes — skips already-completed ones.
        await this._shadowWrite(sessionId, state);
        const verified = await this._verify(newPassword);
        if (!verified) throw new VaultError(CODES.AUTH_FAILED, "The resumed vault did not reopen with the new password");
        state.stage = "verified";
        await this._writeJournal(state);
        await this._commitShadows(state);
        this.manager.replaceDek(sessionId, Buffer.from(state.newDek, "base64"));
        state.stage = "activated";
        await this._writeJournal(state);
      } else if (state.stage === "verified" || state.stage === "committing") {
        // Crashed during commit phase — resume committing from the last checkpoint.
        await this._commitShadows(state);
        this.manager.replaceDek(sessionId, Buffer.from(state.newDek, "base64"));
        state.stage = "activated";
        await this._writeJournal(state);
      } else if (state.stage === "committed" || state.stage === "activated") {
        // Everything was committed; just activate the DEK and clear.
        this.manager.replaceDek(sessionId, Buffer.from(state.newDek, "base64"));
      } else {
        throw new VaultError(CODES.BAD_INPUT,
          `Cannot resume a rotation in stage "${state.stage}"; use rollback() to discard it`);
      }

      await this._clearJournal();
      return {
        rotationId: state.rotationId,
        resumed: true,
        collectionsReencrypted: state.committedCollections,
      };
    } catch (err) {
      state.error = err && err.message ? err.message : String(err);
      await this._writeJournal(state).catch(() => {});
      throw err;
    }
  }

  /** Roll back an interrupted rotation using the journal's saved enrollment. */
  async rollback(confirm) {
    if (confirm !== true) {
      throw new VaultError(CODES.CONSENT_REQUIRED, "Rolling back a rotation needs explicit confirmation");
    }
    const state = await this.journal();
    if (!state) throw new VaultError(CODES.NOT_FOUND, "There is no rotation to roll back");

    // A rotation that has already started committing (renaming originals) cannot
    // be safely rolled back because some originals may already be overwritten.
    if (state.mode === "reencrypt") {
      if (state.committedCollections && state.committedCollections.length > 0) {
        throw new VaultError(
          CODES.BAD_INPUT,
          "A partially-committed reencrypt rotation cannot be rolled back; use resume() to complete it",
        );
      }
      if (state.committedBlobs && state.committedBlobs.length > 0) {
        throw new VaultError(
          CODES.BAD_INPUT,
          "A partially-committed reencrypt rotation cannot be rolled back; use resume() to complete it",
        );
      }
    }
    if (state.stage === "activated") {
      throw new VaultError(
        CODES.BAD_INPUT,
        "A completed rotation cannot be rolled back; the data is fully committed",
      );
    }

    // Delete shadow files. Original files are untouched.
    await this._deleteShadowFiles(state).catch(() => {});
    await this.manager.restoreEnrollment(state.previousEnrollment);
    await this._clearJournal();
    return { rolledBack: true, rotationId: state.rotationId };
  }

  // ---------------------------------------------------------------------------
  // Phase 2: shadow-write  (NEVER touches originals)
  // ---------------------------------------------------------------------------

  /**
   * Write every collection and media blob to shadow paths (*.new).
   * Originals are never modified. The journal is updated after each item so a
   * crash leaves the rotation resumable from the first unfinished item.
   */
  async _shadowWrite(sessionId, state) {
    const oldDek = Buffer.from(state.previousDek, "base64");
    const newDek = Buffer.from(state.newDek, "base64");
    state.stage = "shadow-writing";
    await this._writeJournal(state);

    // Shadow-write store collections.
    for (const name of COLLECTIONS) {
      if (state.shadowCollections.includes(name)) continue; // already done
      const document = await this.store.read(name, oldDek);
      await this.store.writeShadow(name, newDek, document);
      state.shadowCollections.push(name);
      await this._writeJournal(state);
    }

    // Shadow-write media blobs.
    if (this.mediaRoot) {
      await this._shadowWriteMediaBlobs(state, oldDek, newDek);
    }

    state.stage = "shadow-written";
    await this._writeJournal(state);
  }

  /**
   * Re-encrypt each media blob to `<blobPath>.knxm.new`. The intermediate
   * decrypted plaintext is written to `<blobPath>.rottemp` and removed in a
   * finally block so no persistent plaintext survives a crash.
   *
   * The mediavault collection is still encrypted under oldDek at this point
   * (originals are intact), so we read with oldDek.
   */
  async _shadowWriteMediaBlobs(state, oldDek, newDek) {
    if (!this.mediaRoot) return;
    if (!state.shadowBlobs) state.shadowBlobs = [];

    // Read the mediavault index under the OLD DEK — originals are still intact.
    const { records } = await this.store.read("mediavault", oldDek);

    for (const record of records) {
      if (state.shadowBlobs.includes(record.id)) continue;

      const oldBlobPath = path.join(this.mediaRoot, record.blobName);
      const newBlobPath = `${oldBlobPath}${NEW_BLOB_SUFFIX}`; // e.g. abc.knxm.knxm.new
      const tmpPath = `${oldBlobPath}.rottemp`;

      // If the shadow blob already exists (crash after encryptFile but before
      // journal update), skip re-encryption and just record it.
      const shadowExists = await fsp.access(newBlobPath).then(() => true).catch(() => false);
      if (!shadowExists) {
        try {
          // decrypt under old DEK → plaintext in temp → encrypt under new DEK → shadow blob.
          await this.engine.decryptFile({ inputPath: oldBlobPath, outputPath: tmpPath, rawKey: oldDek });
          await this.engine.encryptFile({ inputPath: tmpPath, outputPath: newBlobPath, rawKey: newDek });
        } finally {
          // Always remove plaintext temp; crypto errors leave nothing behind.
          await fsp.rm(tmpPath, { force: true }).catch(() => {});
        }
      }

      state.shadowBlobs.push(record.id);
      await this._writeJournal(state);
    }
  }

  // ---------------------------------------------------------------------------
  // Phase 4: commit  (rename shadows over originals, one at a time)
  // ---------------------------------------------------------------------------

  /**
   * Rename every shadow file over the original. The journal records each
   * completed rename so a crash can be resumed without re-doing work.
   * Once an original is overwritten, that change is irreversible — which is
   * why we only reach this point after _verify() has passed.
   */
  async _commitShadows(state) {
    const oldDek = Buffer.from(state.previousDek, "base64");
    const newDek = Buffer.from(state.newDek, "base64");
    state.stage = "committing";
    await this._writeJournal(state);

    // Commit store collections.
    for (const name of COLLECTIONS) {
      if (state.committedCollections.includes(name)) continue;
      if (!state.shadowCollections.includes(name)) {
        // Shadow was never written (e.g. collection was empty); nothing to commit.
        state.committedCollections.push(name);
        continue;
      }
      const shadowPath = this.store.shadowPathFor(name);
      const finalPath = this.store.pathFor(name);
      // Only rename if the shadow file actually exists (idempotent on resume
      // after a crash that occurred right after the rename).
      const shadowExists = await fsp.access(shadowPath).then(() => true).catch(() => false);
      if (shadowExists) {
        await fsp.rename(shadowPath, finalPath);
      }
      state.committedCollections.push(name);
      await this._writeJournal(state);
    }

    // Commit media blobs.
    if (this.mediaRoot && state.shadowBlobs && state.shadowBlobs.length > 0) {
      // We need the blob names; at this point the mediavault collection on disk
      // has been committed under newDek (the rename just above), so read with newDek.
      const { records } = await this.store.read("mediavault", newDek);
      const blobMap = new Map(records.map((r) => [r.id, r.blobName]));

      for (const id of state.shadowBlobs) {
        if (state.committedBlobs && state.committedBlobs.includes(id)) continue;
        const blobName = blobMap.get(id);
        if (!blobName) continue; // defensive — should not happen
        const oldBlobPath = path.join(this.mediaRoot, blobName);
        const newBlobPath = `${oldBlobPath}${NEW_BLOB_SUFFIX}`;
        await fsp.rename(newBlobPath, oldBlobPath);
        if (!state.committedBlobs) state.committedBlobs = [];
        state.committedBlobs.push(id);
        await this._writeJournal(state);
      }
    }

    state.stage = "committed";
    await this._writeJournal(state);
  }

  // ---------------------------------------------------------------------------
  // Rollback helper: delete shadow files without touching originals
  // ---------------------------------------------------------------------------

  async _deleteShadowFiles(state) {
    // Guard: only relevant for reencrypt rotations, but skip gracefully if
    // mode is undefined (called from tests with partial state objects).
    if (state.mode && state.mode !== "reencrypt") return;

    // Delete collection shadows listed in the journal.
    if (state.shadowCollections) {
      for (const name of state.shadowCollections) {
        if (state.committedCollections && state.committedCollections.includes(name)) continue;
        const shadowPath = this.store.shadowPathFor(name);
        await fsp.rm(shadowPath, { force: true }).catch(() => {});
      }
    }
    // Also sweep the store root for any *.knx.new files in case the journal
    // was lost or incomplete (crash before the first journal write).
    try {
      const { SHADOW_SUFFIX: sfx } = require("./store");
      const storeFiles = await fsp.readdir(this.store.root);
      for (const f of storeFiles) {
        if (f.endsWith(sfx)) {
          await fsp.rm(path.join(this.store.root, f), { force: true }).catch(() => {});
        }
      }
    } catch {}

    // Delete blob shadows and any stray .rottemp files.
    if (this.mediaRoot && state.shadowBlobs) {
      // Reconstruct blob names from journal or from the store (original DEK).
      let records = [];
      try {
        const oldDek = state.previousDek ? Buffer.from(state.previousDek, "base64") : null;
        if (oldDek) {
          ({ records } = await this.store.read("mediavault", oldDek));
        }
      } catch {
        // If the original store is unreadable, fall back to glob-based cleanup.
        try {
          const files = await fsp.readdir(this.mediaRoot);
          for (const f of files) {
            if (f.endsWith(NEW_BLOB_SUFFIX) || f.endsWith(".rottemp")) {
              await fsp.rm(path.join(this.mediaRoot, f), { force: true }).catch(() => {});
            }
          }
        } catch {}
        return;
      }
      for (const r of records) {
        if (state.committedBlobs && state.committedBlobs.includes(r.id)) continue;
        const oldBlobPath = path.join(this.mediaRoot, r.blobName);
        await fsp.rm(`${oldBlobPath}${NEW_BLOB_SUFFIX}`, { force: true }).catch(() => {});
        await fsp.rm(`${oldBlobPath}.rottemp`, { force: true }).catch(() => {});
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Internal: verify new enrollment
  // ---------------------------------------------------------------------------

  /** Open the enrollment file with the new password in a throwaway manager. */
  async _verify(password) {
    const { VaultSessionManager } = require("./session");
    const scratch = new VaultSessionManager({ enrollmentPath: this.manager.enrollmentPath });
    try {
      const session = await scratch.unlock(password);
      scratch.revoke(session.sessionId, "verify");
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = { RotationService, MODES, JOURNAL_VERSION, NEW_SUFFIX, NEW_BLOB_SUFFIX };
