"use strict";

/**
 * Clipboard Guard (task 25).
 *
 * The guard clears the operating-system clipboard after a countdown. Two things
 * keep it honest:
 *
 *  1. The clipboard adapter is injected. In production it is Electron's
 *     `clipboard`; in tests it is a small in-memory stand-in. The module never
 *     reaches for a global, so the timer and the clear path are testable
 *     without a display server.
 *  2. Clearing is opt-in. Arming requires an explicit `confirm` and the stored
 *     `clearClipboard` preference, so the app cannot silently take over the
 *     user's clipboard.
 *
 * The guard only ever writes its own fixed demo placeholder. It does not read
 * arbitrary clipboard content, and the one read it performs is an explicit
 * "is the demo placeholder still there?" check.
 */
const { VaultError, CODES, badInput } = require("./errors");

// The single string the guard is allowed to place on the clipboard. It is not a
// secret and it is not user-supplied, so a bug here cannot leak anything.
const DEMO_PLACEHOLDER = "KNOUX-DEMO-CLIPBOARD-PLACEHOLDER";

const TIMER_CHOICES = Object.freeze([15, 30, 60, 120]);
const MIN_SECONDS = 5;
const MAX_SECONDS = 3600;

class ClipboardGuard {
  constructor(options = {}) {
    this.adapter = options.adapter || null;
    this.onEvent = options.onEvent;
    this.timer = null;
    this.armedUntil = 0;
    this.armedSeconds = 0;
    this.ownerSessionId = null;
    this.lastClearedAt = null;
  }

  get supported() {
    return Boolean(this.adapter && typeof this.adapter.clear === "function" && typeof this.adapter.writeText === "function");
  }

  status() {
    const remaining = this.timer ? Math.max(0, Math.ceil((this.armedUntil - Date.now()) / 1000)) : 0;
    return {
      supported: this.supported,
      armed: Boolean(this.timer),
      secondsRemaining: remaining,
      armedSeconds: this.armedSeconds,
      timerChoices: TIMER_CHOICES,
      lastClearedAt: this.lastClearedAt,
      placeholder: DEMO_PLACEHOLDER,
    };
  }

  /**
   * Put the fixed demo placeholder on the clipboard. This is the only write the
   * guard performs, and it never touches real user content.
   */
  copyDemo() {
    this._requireAdapter();
    const value = this.adapter.writeText(DEMO_PLACEHOLDER);
    if (value && typeof value.then === "function") {
      return value.then(() => ({ copied: true, placeholder: DEMO_PLACEHOLDER }));
    }
    return { copied: true, placeholder: DEMO_PLACEHOLDER };
  }

  /**
   * Arm a real countdown. `confirm` must be true: an automatic clipboard clear
   * is destructive to whatever the user copied next, so it needs consent every
   * time rather than a remembered setting alone.
   */
  arm({ seconds, confirm, sessionId } = {}) {
    this._requireAdapter();
    if (confirm !== true) {
      throw new VaultError(CODES.CONSENT_REQUIRED, "Clipboard clearing needs explicit confirmation each time");
    }
    const value = Number(seconds);
    if (!Number.isInteger(value) || value < MIN_SECONDS || value > MAX_SECONDS) {
      throw badInput(`Choose a clear timer between ${MIN_SECONDS} and ${MAX_SECONDS} seconds`);
    }
    this.disarm("rearmed");
    this.armedSeconds = value;
    this.armedUntil = Date.now() + value * 1000;
    this.ownerSessionId = sessionId || null;
    this.timer = setTimeout(() => {
      this.timer = null;
      this._clear("timer");
    }, value * 1000);
    // Do not hold the process open just to run a clipboard timer.
    if (typeof this.timer.unref === "function") this.timer.unref();
    this._emit("armed", { seconds: value });
    return this.status();
  }

  disarm(reason = "user") {
    const wasArmed = Boolean(this.timer);
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.armedUntil = 0;
    this.ownerSessionId = null;
    if (wasArmed) this._emit("disarmed", { reason });
    return { armed: false, wasArmed };
  }

  /** Clear immediately, on demand. */
  clearNow() {
    this._requireAdapter();
    this.disarm("cleared-now");
    this._clear("user");
    return this.status();
  }

  /**
   * Explicit check of whether the demo placeholder is still on the clipboard.
   * This is the only clipboard read, and it compares against the placeholder
   * rather than returning whatever is there, so real clipboard content never
   * crosses into the renderer.
   */
  verifyDemo() {
    this._requireAdapter();
    if (typeof this.adapter.readText !== "function") {
      throw new VaultError(CODES.UNSUPPORTED_FORMAT, "This platform does not expose a clipboard read");
    }
    const raw = this.adapter.readText();
    if (raw && typeof raw.then === "function") {
      return raw.then((text) => this._verdict(text));
    }
    return this._verdict(raw);
  }

  /** Called when the owning session is revoked, so a timer cannot outlive it. */
  onSessionRevoked(sessionId) {
    if (this.timer && this.ownerSessionId && this.ownerSessionId === sessionId) {
      this.disarm("session-revoked");
      return true;
    }
    return false;
  }

  _verdict(raw) {
    const text = typeof raw === "string" ? raw : "";
    return { placeholderPresent: text === DEMO_PLACEHOLDER, length: text.length };
  }

  _clear(reason) {
    try {
      const result = this.adapter.clear();
      if (result && typeof result.then === "function") {
        return result.then(() => this._afterClear(reason));
      }
    } catch {
      // A clipboard that refuses to clear must not crash the main process; the
      // failure is reported through the event instead.
      this._emit("clear-failed", { reason });
      return undefined;
    }
    return this._afterClear(reason);
  }

  _afterClear(reason) {
    this.lastClearedAt = new Date().toISOString();
    this.armedUntil = 0;
    this._emit("cleared", { reason, at: this.lastClearedAt });
    return this.status();
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

module.exports = { ClipboardGuard, DEMO_PLACEHOLDER, TIMER_CHOICES, MIN_SECONDS, MAX_SECONDS };
