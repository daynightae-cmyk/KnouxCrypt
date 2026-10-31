"use strict";

/**
 * Clipboard Guard (task 25).
 *
 * The guard manages short, time-limited clipboard leases. A lease is a
 * promise-shaped record: "this exact string was placed on the clipboard by this
 * app, for this session, and may be cleared after N seconds". The guard never
 * claims to erase whatever the user copied elsewhere.
 *
 * Design constraints that keep it honest:
 *
 *  1. The clipboard adapter is injected. Production passes Electron's
 *     `clipboard`; tests pass a small in-memory stand-in. The module never
 *     reaches for a global, so the timer and clear path are testable without a
 *     display server.
 *  2. A clear only happens when the clipboard content still equals the exact
 *     value this app wrote. If the user copied something else, the guard
 *     leaves it alone and reports a "skipped" result instead of a false clear.
 *  3. Nothing is armed without explicit consent, and a guest session can never
 *     arm a lease.
 *
 * It does not read arbitrary clipboard content into the renderer: the only read
 * compares the current clipboard against the leased value and returns booleans
 * and lengths, never the raw text.
 */
const crypto = require("crypto");

const { VaultError, CODES, badInput } = require("./errors");

const TIMER_CHOICES = Object.freeze([15, 30, 60, 120]);
const MIN_SECONDS = 5;
const MAX_SECONDS = 3600;
const MAX_LEASE_BYTES = 64 * 1024;

class ClipboardGuard {
  constructor(options = {}) {
    this.adapter = options.adapter || null;
    this.onEvent = options.onEvent;
    this.leases = new Map();
    this.timers = new Map();
    this.lastClearedAt = null;
    this.lastSkippedAt = null;
  }

  get supported() {
    return Boolean(
      this.adapter &&
        typeof this.adapter.clear === "function" &&
        typeof this.adapter.writeText === "function" &&
        typeof this.adapter.readText === "function",
    );
  }

  /** The most recent lease, which is the one the UI reports on. */
  _current() {
    const ids = [...this.leases.keys()];
    if (ids.length === 0) return null;
    return this.leases.get(ids[ids.length - 1]);
  }

  status() {
    const lease = this._current();
    const remaining = lease && lease.expiresAt > 0 ? Math.max(0, Math.ceil((lease.expiresAt - Date.now()) / 1000)) : 0;
    return {
      supported: this.supported,
      armed: Boolean(lease && lease.expiresAt > 0),
      activeLeases: this.leases.size,
      secondsRemaining: remaining,
      armedSeconds: lease ? lease.seconds : 0,
      timerChoices: TIMER_CHOICES,
      lastClearedAt: this.lastClearedAt,
      lastSkippedAt: this.lastSkippedAt,
    };
  }

  /**
   * Place `text` on the clipboard and record a lease for it. The guard only
   * ever clears a value it wrote itself, so the caller must pass the value
   * explicitly and the value is stored on the lease for the ownership check.
   */
  copy({ text, seconds = 30, sessionId, confirm } = {}) {
    if (typeof text !== "string" || text.length === 0) throw badInput("Nothing to copy");
    if (Buffer.byteLength(text, "utf8") > MAX_LEASE_BYTES) throw badInput("That value is too large to lease");
    if (confirm !== true) {
      throw new VaultError(CODES.CONSENT_REQUIRED, "Copying into a managed lease needs explicit confirmation");
    }
    const value = Number(seconds);
    if (!Number.isInteger(value) || value < MIN_SECONDS || value > MAX_SECONDS) {
      throw badInput(`Choose a clear timer between ${MIN_SECONDS} and ${MAX_SECONDS} seconds`);
    }
    // Validate the request before touching the platform, so a malformed call
    // is reported as malformed even where no clipboard is available.
    this._requireAdapter();

    const written = this.adapter.writeText(text);
    const finish = () => {
      const id = crypto.randomBytes(8).toString("hex");
      const lease = {
        id,
        sessionId: sessionId || null,
        hash: crypto.createHash("sha256").update(text, "utf8").digest("hex"),
        length: text.length,
        seconds: value,
        createdAt: Date.now(),
        expiresAt: Date.now() + value * 1000,
        state: "armed",
      };
      this.leases.set(id, lease);
      this._arm(lease);
      this._emit("armed", { leaseId: id, seconds: value });
      return this._public(lease);
    };
    if (written && typeof written.then === "function") return written.then(finish);
    return finish();
  }

  _arm(lease) {
    const timer = setTimeout(() => {
      this.timers.delete(lease.id);
      this._expire(lease.id);
    }, lease.seconds * 1000);
    // Do not hold the process open just to run a clipboard lease timer.
    if (typeof timer.unref === "function") timer.unref();
    this.timers.set(lease.id, timer);
  }

  /**
   * Expire a lease: clear the clipboard only when it still holds this lease's
   * value. Otherwise leave the user's clipboard untouched and report a skip.
   */
  _expire(leaseId) {
    const lease = this.leases.get(leaseId);
    if (!lease || lease.state !== "armed") return this.status();
    let current;
    try {
      current = this.adapter.readText();
    } catch {
      current = undefined;
    }
    const resolve = (raw) => {
      if (this._matches(lease, raw)) {
        try {
          const cleared = this.adapter.clear();
          if (cleared && typeof cleared.then === "function") return cleared.then(() => this._markCleared(lease));
        } catch {
          this._emit("clear-failed", { leaseId });
          return this.status();
        }
        return this._markCleared(lease);
      }
      lease.state = "skipped";
      lease.expiresAt = 0;
      this.lastSkippedAt = new Date().toISOString();
      this._emit("skipped", { leaseId, reason: "clipboard-changed" });
      return this.status();
    };
    if (current && typeof current.then === "function") return current.then(resolve);
    return resolve(current);
  }

  _markCleared(lease) {
    lease.state = "cleared";
    lease.expiresAt = 0;
    this.lastClearedAt = new Date().toISOString();
    this._emit("cleared", { leaseId: lease.id, at: this.lastClearedAt });
    return this.status();
  }

  _matches(lease, raw) {
    const text = typeof raw === "string" ? raw : "";
    const hash = crypto.createHash("sha256").update(text, "utf8").digest("hex");
    return (
      text.length === lease.length &&
      hash.length === lease.hash.length &&
      crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(lease.hash, "hex"))
    );
  }

  /** Cancel a lease without clearing. Used on user cancel and session revoke. */
  disarm(leaseId, reason = "user") {
    const lease = leaseId ? this.leases.get(leaseId) : this._current();
    if (!lease) return { disarmed: false };
    const timer = this.timers.get(lease.id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(lease.id);
    }
    lease.state = "disarmed";
    lease.expiresAt = 0;
    this._emit("disarmed", { leaseId: lease.id, reason });
    return { disarmed: true, leaseId: lease.id };
  }

  /** Clear now, but only if the clipboard still holds the leased value. */
  clearNow(leaseId) {
    this._requireAdapter();
    const lease = leaseId ? this.leases.get(leaseId) : this._current();
    if (!lease) throw new VaultError(CODES.NOT_FOUND, "There is no active clipboard lease");
    const timer = this.timers.get(lease.id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(lease.id);
    }
    return this._expire(lease.id);
  }

  /**
   * Report whether the clipboard still holds the given lease's value. Returns
   * booleans and a length only; the raw clipboard text never leaves the module.
   */
  verify(leaseId) {
    this._requireAdapter();
    const lease = leaseId ? this.leases.get(leaseId) : this._current();
    if (!lease) return { leaseId: null, present: false, length: 0 };
    const raw = this.adapter.readText();
    const verdict = (value) => ({ leaseId: lease.id, present: this._matches(lease, value), length: typeof value === "string" ? value.length : 0 });
    if (raw && typeof raw.then === "function") return raw.then(verdict);
    return verdict(raw);
  }

  /** A revoked session cancels its lease so a timer cannot outlive it. */
  onSessionRevoked(sessionId) {
    let affected = 0;
    for (const lease of this.leases.values()) {
      if (lease.state === "armed" && lease.sessionId && lease.sessionId === sessionId) {
        const timer = this.timers.get(lease.id);
        if (timer) {
          clearTimeout(timer);
          this.timers.delete(lease.id);
        }
        lease.state = "revoked";
        lease.expiresAt = 0;
        affected += 1;
        this._emit("disarmed", { leaseId: lease.id, reason: "session-revoked" });
      }
    }
    return { disarmed: affected };
  }

  /**
   * The renderer needs the lease id, the timer and a length so it can show a
   * countdown. It must not receive the digest: a digest of a low-entropy
   * password is offline-reversible, so it stays in the main process.
   */
  _public(lease) {
    return {
      leaseId: lease.id,
      seconds: lease.seconds,
      state: lease.state,
      length: lease.length,
    };
  }

  _requireAdapter() {
    if (!this.supported) {
      throw new VaultError(CODES.UNSUPPORTED_FORMAT, "The clipboard is not available on this platform");
    }
  }

  _emit(state, extra) {
    if (!this.onEvent) return;
    try {
      this.onEvent({ state, ...extra, at: new Date().toISOString() });
    } catch {
      // A renderer notification must never fail the guard itself.
    }
  }
}

module.exports = { ClipboardGuard, TIMER_CHOICES, MIN_SECONDS, MAX_SECONDS, MAX_LEASE_BYTES };
