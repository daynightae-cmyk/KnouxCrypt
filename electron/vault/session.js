"use strict";

/**
 * Local vault session manager.
 *
 * Responsibilities:
 *   - one-time enrollment: password-derived key material wraps a random
 *     data-encryption key (DEK) that never leaves the main process
 *   - unlock: verify the password, unwrap the DEK, issue an in-memory session
 *   - session lifecycle: idle auto-lock, explicit lock, revocation, lockout
 *   - guest preview: a deliberately non-privileged session that holds no key
 *
 * The DEK is only ever held in this process's memory. No IPC channel exposes it.
 */
const crypto = require("crypto");
const fsp = require("fs/promises");
const path = require("path");

const { VaultError, CODES, badInput } = require("./errors");
const { KDF, KEY_LEN, SALT_LEN, DEFAULT_PBKDF2_ITERATIONS, randomSalt, deriveMasterKey, hkdf, expandKeys } = require("./kdf");

const ENROLLMENT_VERSION = 1;
const VERIFIER_INFO = "knoux-vault/v1/verify";
const WRAP_NONCE_LEN = 12;
const DEFAULT_IDLE_LOCK_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LOCKOUT_MS = 30 * 1000;

function nowMs() {
  return Date.now();
}

class VaultSessionManager {
  constructor(options = {}) {
    this.enrollmentPath = options.enrollmentPath;
    this.idleLockMs = options.idleLockMs || DEFAULT_IDLE_LOCK_MS;
    this.maxAttempts = options.maxAttempts || DEFAULT_MAX_ATTEMPTS;
    this.lockoutMs = options.lockoutMs || DEFAULT_LOCKOUT_MS;
    this.now = options.now || nowMs;
    this.sessions = new Map();
    this.failedAttempts = 0;
    this.lockoutUntil = 0;
    this._idleTimer = null;
  }

  // ---- enrollment ---------------------------------------------------------

  async isEnrolled() {
    try {
      await fsp.access(this.enrollmentPath);
      return true;
    } catch {
      return false;
    }
  }

  async status() {
    const enrolled = await this.isEnrolled();
    return {
      enrolled,
      locked: this.activeSessions().length === 0,
      failedAttempts: this.failedAttempts,
      lockoutUntil: this.lockoutUntil > this.now() ? this.lockoutUntil : 0,
      activeSessions: this.activeSessions().length,
    };
  }

  async enroll(password, options = {}) {
    if (typeof password !== "string" || password.length < 8) {
      throw badInput("Enrollment password must be at least 8 characters");
    }
    if (await this.isEnrolled()) {
      throw new VaultError(CODES.ALREADY_ENROLLED, "A vault is already enrolled on this device");
    }

    const iterations = options.iterations || DEFAULT_PBKDF2_ITERATIONS;
    const salt = randomSalt();
    const kdfParams = { kdfId: KDF.PBKDF2_SHA256, iterations };
    const master = deriveMasterKey(password, salt, kdfParams);
    const { encKey, macKey } = expandKeys(master, salt);

    const dek = crypto.randomBytes(KEY_LEN);
    const wrapNonce = crypto.randomBytes(WRAP_NONCE_LEN);
    const wrappedDek = wrapDek(dek, encKey, wrapNonce);
    const verifier = hkdf(macKey, salt, VERIFIER_INFO, 32).toString("hex");

    const record = {
      version: ENROLLMENT_VERSION,
      kdfId: kdfParams.kdfId,
      iterations,
      salt: salt.toString("base64"),
      wrapNonce: wrapNonce.toString("base64"),
      wrappedDek: wrappedDek.toString("base64"),
      verifier,
      name: typeof options.name === "string" ? options.name.slice(0, 64) : "Local vault",
      createdAt: new Date(this.now()).toISOString(),
    };

    await fsp.mkdir(path.dirname(this.enrollmentPath), { recursive: true });
    // Write then restrict: avoids a window where the file is world-readable.
    await fsp.writeFile(this.enrollmentPath, JSON.stringify(record, null, 2), { mode: 0o600 });
    await fsp.chmod(this.enrollmentPath, 0o600).catch(() => {});

    const session = this._issueSession({ dek, guest: false, name: record.name });
    return { sessionId: session.id, name: record.name, createdAt: record.createdAt };
  }

  // ---- unlock -------------------------------------------------------------

  async unlock(password) {
    if (typeof password !== "string" || password.length === 0) {
      throw badInput("A password is required");
    }
    if (this.lockoutUntil > this.now()) {
      throw new VaultError(CODES.LOCKED_OUT, "Too many failed attempts; the vault is temporarily locked", {
        lockoutUntil: this.lockoutUntil,
      });
    }
    const record = await this._readEnrollment();
    const salt = Buffer.from(record.salt, "base64");
    const kdfParams = { kdfId: record.kdfId, iterations: record.iterations };
    const master = deriveMasterKey(password, salt, kdfParams);
    const { encKey, macKey } = expandKeys(master, salt);

    const expected = hkdf(macKey, salt, VERIFIER_INFO, 32);
    const actual = Buffer.from(record.verifier, "hex");
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      this.failedAttempts += 1;
      if (this.failedAttempts >= this.maxAttempts) {
        this.lockoutUntil = this.now() + this.lockoutMs;
        this.failedAttempts = 0;
        throw new VaultError(CODES.LOCKED_OUT, "Too many failed attempts; the vault is temporarily locked", {
          lockoutUntil: this.lockoutUntil,
        });
      }
      throw new VaultError(CODES.AUTH_FAILED, "Incorrect password", {
        remainingAttempts: this.maxAttempts - this.failedAttempts,
      });
    }

    this.failedAttempts = 0;
    const dek = unwrapDek(Buffer.from(record.wrappedDek, "base64"), encKey, Buffer.from(record.wrapNonce, "base64"));
    const session = this._issueSession({ dek, guest: false, name: record.name });
    return { sessionId: session.id, name: record.name, expiresAt: session.expiresAt };
  }

  /**
   * Issue a non-privileged guest session. It holds no key and cannot be used to
   * encrypt or decrypt anything; it exists only so the UI can be explored.
   */
  createGuestSession() {
    const session = this._issueSession({ dek: null, guest: true, name: "Guest preview" });
    return { sessionId: session.id, guest: true };
  }

  // ---- session lifecycle --------------------------------------------------

  activeSessions() {
    return [...this.sessions.values()].filter((s) => !s.revoked);
  }

  validate(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new VaultError(CODES.SESSION_REQUIRED, "No active vault session");
    if (session.revoked) throw new VaultError(CODES.SESSION_REVOKED, "This vault session has been revoked");
    return session;
  }

  /**
   * Return the DEK for an authenticated, non-guest session. Main-process only.
   */
  getDek(sessionId) {
    const session = this.validate(sessionId);
    if (session.guest || !session.dek) {
      throw new VaultError(CODES.SESSION_REQUIRED, "Guest preview sessions have no vault key");
    }
    return session.dek;
  }

  touch(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session && !session.revoked) {
      session.lastActivity = this.now();
      session.expiresAt = session.lastActivity + this.idleLockMs;
      this._armIdleTimer();
    }
  }

  /**
   * Change the idle window for current and future sessions (task 14). Existing
   * sessions are re-armed against the new value immediately, so lowering the
   * timeout takes effect at once rather than only after the next activity.
   */
  setIdleLockMs(ms) {
    const value = Number(ms);
    if (!Number.isFinite(value) || value < 1000) return false;
    this.idleLockMs = value;
    const now = this.now();
    for (const session of this.sessions.values()) {
      session.expiresAt = session.lastActivity + this.idleLockMs;
      if (session.expiresAt <= now) session.expiresAt = now + 1;
    }
    this._armIdleTimer();
    return true;
  }

  revoke(sessionId, reason = "user") {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    if (session.dek) session.dek.fill(0);
    session.dek = null;
    session.revoked = true;
    session.revokedReason = reason;
    this.sessions.delete(sessionId);
    this._armIdleTimer();
    // Every revocation path (user lock, lock-all, idle sweep, quit) reports
    // here so the owner can tell the renderer its session is gone.
    if (this.onRevoke) {
      try {
        this.onRevoke({ sessionId, reason });
      } catch {
        // Notification failure must not undo a completed revocation.
      }
    }
    return true;
  }

  lockAll(reason = "lock-all") {
    let count = 0;
    for (const id of [...this.sessions.keys()]) {
      if (this.revoke(id, reason)) count += 1;
    }
    return count;
  }

  // ---- internals ----------------------------------------------------------

  _issueSession({ dek, guest, name }) {
    const id = crypto.randomBytes(24).toString("hex");
    const issuedAt = this.now();
    const session = {
      id,
      guest,
      name,
      dek,
      issuedAt,
      lastActivity: issuedAt,
      expiresAt: issuedAt + this.idleLockMs,
      revoked: false,
    };
    this.sessions.set(id, session);
    this._armIdleTimer();
    return session;
  }

  _armIdleTimer() {
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
    if (this.sessions.size === 0) return;
    const nextExpiry = Math.min(...[...this.sessions.values()].map((s) => s.expiresAt));
    const delay = Math.max(0, nextExpiry - this.now());
    this._idleTimer = setTimeout(() => this._sweepExpired(), delay);
    if (this._idleTimer.unref) this._idleTimer.unref();
  }

  _sweepExpired() {
    const t = this.now();
    for (const [id, session] of [...this.sessions.entries()]) {
      if (session.expiresAt <= t) this.revoke(id, "idle-timeout");
    }
  }

  async _readEnrollment() {
    let raw;
    try {
      raw = await fsp.readFile(this.enrollmentPath, "utf8");
    } catch {
      throw new VaultError(CODES.NOT_ENROLLED, "No vault has been enrolled on this device");
    }
    let record;
    try {
      record = JSON.parse(raw);
    } catch {
      throw new VaultError(CODES.UNSUPPORTED_FORMAT, "Vault enrollment record is corrupt");
    }
    if (record.version !== ENROLLMENT_VERSION) {
      throw new VaultError(CODES.UNSUPPORTED_FORMAT, `Unsupported enrollment version ${record.version}`);
    }
    return record;
  }
}

function wrapDek(dek, encKey, nonce) {
  const cipher = crypto.createCipheriv("aes-256-gcm", encKey, nonce);
  const ct = Buffer.concat([cipher.update(dek), cipher.final()]);
  return Buffer.concat([ct, cipher.getAuthTag()]);
}

function unwrapDek(wrapped, encKey, nonce) {
  if (wrapped.length < 16) throw new VaultError(CODES.INTEGRITY_FAILED, "Wrapped key is malformed");
  const tag = wrapped.subarray(wrapped.length - 16);
  const ct = wrapped.subarray(0, wrapped.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", encKey, nonce);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    throw new VaultError(CODES.INTEGRITY_FAILED, "Wrapped key failed its authentication check");
  }
}

module.exports = { VaultSessionManager, ENROLLMENT_VERSION, DEFAULT_IDLE_LOCK_MS };
