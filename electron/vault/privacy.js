"use strict";

/**
 * Session Privacy Controls (task 42).
 *
 * A real policy layer over the session manager, the privacy preferences and the
 * clipboard guard. Every control here maps to something the app genuinely
 * enforces, and the report says exactly how — nothing is presented as OS-wide
 * enforcement the app does not have.
 *
 * Controls:
 *   - idleLockSeconds: enforced by the session manager, which revokes a session
 *     after that much inactivity. Applied live to current sessions.
 *   - lockOnSuspend:   enforced by the main process on the OS `suspend` and
 *     `lock-screen` powerMonitor events.
 *   - clearClipboard:  enforced by the clipboard guard, which clears a lease it
 *     wrote when the timer fires.
 *   - retentionDays:   enforced by the local security journal's bounded
 *     retention.
 *
 * Sensitive-state redaction: `redactedSession()` returns only booleans and
 * counts (locked/unlocked, active session count, last activity), never a session
 * id, key or secret.
 */
const { VaultError, CODES, badInput } = require("./errors");

const POLICY_FIELDS = Object.freeze(["idleLockSeconds", "lockOnSuspend", "clearClipboard", "retentionDays"]);
const IDLE_MIN_SECONDS = 30;
const IDLE_MAX_SECONDS = 24 * 60 * 60;

class SessionPrivacy {
  constructor(options = {}) {
    this.preferences = options.preferences;
    this.manager = options.manager;
    this.clipboard = options.clipboard || null;
    this.journal = options.journal || null;
    this.onPolicyChange = options.onPolicyChange || null;
  }

  /**
   * The current policy with, for each control, whether it is enforced and how.
   * `osScope` is false everywhere: these are app-scoped, not system-wide.
   */
  async policy() {
    const { values } = this.preferences.snapshot();
    const clipboardSupported = this.clipboard ? this.clipboard.supported : false;
    return {
      values,
      osScope: false,
      controls: [
        {
          id: "idleLockSeconds",
          label: "Idle auto-lock",
          enforced: true,
          mechanism: "Session manager revokes the session after this much inactivity",
          value: values.idleLockSeconds,
          min: IDLE_MIN_SECONDS,
          max: IDLE_MAX_SECONDS,
        },
        {
          id: "lockOnSuspend",
          label: "Lock on sleep / screen lock",
          enforced: true,
          mechanism: "Main process locks on the OS suspend and lock-screen events",
          value: values.lockOnSuspend,
        },
        {
          id: "clearClipboard",
          label: "Clear clipboard after use",
          enforced: clipboardSupported,
          mechanism: clipboardSupported
            ? "Clipboard guard clears a lease it wrote when the timer fires"
            : "No clipboard adapter is available in this environment",
          value: values.clearClipboard,
        },
        {
          id: "retentionDays",
          label: "Activity retention",
          enforced: Boolean(this.journal),
          mechanism: this.journal ? "Local security journal bounded retention" : "No journal is configured",
          value: values.retentionDays,
        },
      ],
    };
  }

  /**
   * Update one or more policy fields. Values are validated here and again by the
   * preferences layer. An idle change is applied live to current sessions.
   */
  async update(patch = {}) {
    if (patch === null || typeof patch !== "object") throw badInput("A policy patch object is required");
    for (const key of Object.keys(patch)) {
      if (!POLICY_FIELDS.includes(key)) throw badInput(`Unknown policy field "${key}"`);
    }
    if ("idleLockSeconds" in patch) {
      const v = patch.idleLockSeconds;
      if (!Number.isInteger(v) || v < IDLE_MIN_SECONDS || v > IDLE_MAX_SECONDS) {
        throw badInput(`Idle auto-lock must be between ${IDLE_MIN_SECONDS} and ${IDLE_MAX_SECONDS} seconds`);
      }
    }
    if ("lockOnSuspend" in patch && typeof patch.lockOnSuspend !== "boolean") throw badInput("lockOnSuspend must be a boolean");
    if ("clearClipboard" in patch && typeof patch.clearClipboard !== "boolean") throw badInput("clearClipboard must be a boolean");
    if ("retentionDays" in patch) {
      const v = patch.retentionDays;
      if (!Number.isInteger(v) || v < 1 || v > 365) throw badInput("retentionDays must be between 1 and 365");
    }

    const { values } = await this.preferences.update(patch);
    if ("idleLockSeconds" in patch && this.manager && typeof this.manager.setIdleLockMs === "function") {
      this.manager.setIdleLockMs(values.idleLockSeconds * 1000);
    }
    if (this.onPolicyChange) {
      try {
        this.onPolicyChange({ ...values });
      } catch {
        /* a notification must never break the update */
      }
    }
    return this.policy();
  }

  /**
   * A redacted view of session state for display. Contains no session ids, keys
   * or secrets — only booleans and counts.
   */
  async redactedSession() {
    if (!this.manager) return { available: false };
    const status = await this.manager.status();
    return {
      available: true,
      locked: Boolean(status.locked),
      activeSessions: Number(status.activeSessions) || 0,
      guestActive: Boolean(status.guestActive),
      lockoutUntil: Number(status.lockoutUntil) || 0,
      idleLockSeconds: Math.round((this.manager.idleLockMs || 0) / 1000),
      redacted: ["sessionId", "dek", "password", "privateKey", "token"],
    };
  }
}

module.exports = { SessionPrivacy, POLICY_FIELDS };
