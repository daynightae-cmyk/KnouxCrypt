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
 * A journal file records the plan and each completed step so a crash leaves a
 * recoverable state rather than a half-rotated vault. Nothing is deleted until
 * the new state verifies: the previous enrollment record is kept and restored
 * on rollback.
 */
const crypto = require("crypto");
const fsp = require("fs/promises");
const path = require("path");

const { VaultError, CODES, badInput } = require("./errors");
const { KDF } = require("./kdf");
const { COLLECTIONS } = require("./store");

const JOURNAL_VERSION = 1;
const MODES = Object.freeze(["rewrap", "reencrypt"]);

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
  }

  /** Read the journal, or null when there is no rotation in progress. */
  async journal() {
    try {
      const raw = await fsp.readFile(this.journalPath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed.version !== JOURNAL_VERSION) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async _writeJournal(state) {
    const tmp = `${this.journalPath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
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
    const rotationId = crypto.randomBytes(8).toString("hex");
    const startedAt = new Date().toISOString();

    // In reencrypt mode a fresh DEK is generated first, so the enrollment is
    // wrapped under the key the containers will actually use. In rewrap mode
    // the existing DEK is kept and only its wrapper changes.
    const nextDek = mode === "reencrypt" ? crypto.randomBytes(32) : currentDek;

    // Step 1: wrap the target DEK under the new password and keep the previous
    // record so a later failure can be rolled back.
    const rewrap = await this.manager.rewrapDek(newPassword, { dek: nextDek });
    const state = {
      version: JOURNAL_VERSION,
      rotationId,
      mode,
      startedAt,
      stage: "rewrapped",
      previousEnrollment: rewrap.previous,
      previousDek: mode === "reencrypt" ? currentDek.toString("base64") : null,
      completedCollections: [],
      newDek: mode === "reencrypt" ? nextDek.toString("base64") : null,
      error: null,
    };
    await this._writeJournal(state);

    try {
      if (mode === "reencrypt") {
        await this._reencrypt(sessionId, state, operationId);
      }
      // Step 3: prove the new password opens the vault before committing. A
      // scratch manager reads the same enrollment file so live sessions are
      // untouched.
      const verified = await this._verify(newPassword);
      if (!verified) throw new VaultError(CODES.AUTH_FAILED, "The rotated vault did not reopen with the new password");
      state.stage = "verified";
      await this._writeJournal(state);
      await this._clearJournal();
      return {
        rotationId,
        mode,
        rotatedAt: rewrap.rotatedAt,
        rotationCount: rewrap.rotationCount,
        collectionsReencrypted: state.completedCollections,
        verified: true,
      };
    } catch (err) {
      // Roll back to the last known-good enrollment so the vault still opens.
      await this.manager.restoreEnrollment(state.previousEnrollment).catch(() => {});
      state.stage = "rolled-back";
      state.error = err && err.message ? err.message : String(err);
      await this._writeJournal(state);
      if (err instanceof VaultError) throw err;
      // Surface an unexpected failure as a typed, non-leaking error.
      throw new VaultError(CODES.IO_FAILED, "The key rotation failed and was rolled back");
    }
  }

  /**
   * Re-encrypt every store collection under a fresh DEK, one collection at a
   * time. Each completed collection is recorded in the journal, so an
   * interrupted run can resume from the first unfinished collection.
   */
  async _reencrypt(sessionId, state, operationId) {
    const oldDek = Buffer.from(state.previousDek, "base64");
    const newDek = Buffer.from(state.newDek, "base64");
    state.stage = "reencrypting";
    await this._writeJournal(state);

    for (const name of COLLECTIONS) {
      if (state.completedCollections.includes(name)) continue;
      const document = await this.store.read(name, oldDek);
      // Decrypt under the old DEK, re-encrypt under the new one. Both writes
      // are atomic (temp + rename) inside the store.
      await this.store.write(name, newDek, document);
      state.completedCollections.push(name);
      await this._writeJournal(state);
    }

    // The session must now use the new DEK, or every later read would fail.
    this.manager.replaceDek(sessionId, newDek);
    state.stage = "reencrypted";
    await this._writeJournal(state);
  }

  /** Resume an interrupted reencrypt rotation after a crash. */
  async resume(sessionId, { newPassword, confirm } = {}) {
    if (confirm !== true) {
      throw new VaultError(CODES.CONSENT_REQUIRED, "Resuming a rotation needs explicit confirmation");
    }
    const state = await this.journal();
    if (!state) throw new VaultError(CODES.NOT_FOUND, "There is no rotation to resume");
    if (state.mode !== "reencrypt" || !state.newDek) {
      throw new VaultError(CODES.BAD_INPUT, "Only an interrupted reencrypt rotation can be resumed");
    }
    const newDek = Buffer.from(state.newDek, "base64");
    this.manager.replaceDek(sessionId, newDek);
    await this._reencrypt(sessionId, state, undefined);
    const verified = await this._verify(newPassword);
    if (!verified) throw new VaultError(CODES.AUTH_FAILED, "The resumed vault did not reopen with the new password");
    state.stage = "verified";
    await this._writeJournal(state);
    await this._clearJournal();
    return { rotationId: state.rotationId, resumed: true, collectionsReencrypted: state.completedCollections };
  }

  /** Roll back an interrupted rotation using the journal's saved enrollment. */
  async rollback(confirm) {
    if (confirm !== true) {
      throw new VaultError(CODES.CONSENT_REQUIRED, "Rolling back a rotation needs explicit confirmation");
    }
    const state = await this.journal();
    if (!state) throw new VaultError(CODES.NOT_FOUND, "There is no rotation to roll back");
    if (state.stage === "verified" || state.stage === "reencrypted") {
      // A completed reencrypt cannot be rolled back: the old DEK no longer
      // matches the stored containers. Say so instead of pretending.
      if (state.mode === "reencrypt") {
        throw new VaultError(
          CODES.BAD_INPUT,
          "A completed reencrypt rotation cannot be rolled back; the old key no longer opens the new containers",
        );
      }
    }
    await this.manager.restoreEnrollment(state.previousEnrollment);
    await this._clearJournal();
    return { rolledBack: true, rotationId: state.rotationId };
  }

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

module.exports = { RotationService, MODES, JOURNAL_VERSION };
