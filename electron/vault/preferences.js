"use strict";

/**
 * Local privacy preferences (task 14).
 *
 * These are app-scoped settings, not claims about the operating system. Only
 * values the app can actually enforce are stored here:
 *
 *   idleLockSeconds  — how long an unlocked session may sit idle
 *   lockOnSuspend    — lock the vault when the OS suspends or locks the screen
 *   clearClipboard   — opt-in clipboard clearing (enforced by the clipboard tool)
 *   retentionDays    — how long the local activity log is kept
 *
 * Nothing here is presented as OS-wide surveillance detection or permission
 * control, because the app has neither.
 */
const fsp = require("fs/promises");
const path = require("path");

const { VaultError, CODES, badInput } = require("./errors");
const { ensureProtected, protectFile, isPermissionDenial } = require("./acl");

const PREFERENCES_VERSION = 1;
const IDLE_MIN_SECONDS = 30;
const IDLE_MAX_SECONDS = 24 * 60 * 60;
const RETENTION_MIN_DAYS = 1;
const RETENTION_MAX_DAYS = 365;

const DEFAULTS = Object.freeze({
  idleLockSeconds: 300,
  lockOnSuspend: true,
  clearClipboard: false,
  retentionDays: 30,
});

class Preferences {
  constructor(options = {}) {
    this.file = options.file;
    this.current = { ...DEFAULTS };
    this.onChange = options.onChange;
  }

  async load() {
    try {
      const raw = await fsp.readFile(this.file, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === PREFERENCES_VERSION) {
        this.current = this._validate({ ...DEFAULTS, ...parsed.values });
      }
    } catch {
      // A missing or unreadable preferences file falls back to safe defaults.
      this.current = { ...DEFAULTS };
    }
    return this.snapshot();
  }

  snapshot() {
    return { version: PREFERENCES_VERSION, values: { ...this.current } };
  }

  /**
   * Apply a partial update. Unknown keys are ignored and out-of-range values are
   * clamped, so a bad renderer payload cannot put the app into an unsafe state.
   */
  async update(patch = {}) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      throw badInput("Preferences must be an object");
    }
    const next = { ...this.current };
    if ("idleLockSeconds" in patch) {
      next.idleLockSeconds = clampInt(patch.idleLockSeconds, IDLE_MIN_SECONDS, IDLE_MAX_SECONDS, "idleLockSeconds");
    }
    if ("retentionDays" in patch) {
      next.retentionDays = clampInt(patch.retentionDays, RETENTION_MIN_DAYS, RETENTION_MAX_DAYS, "retentionDays");
    }
    if ("lockOnSuspend" in patch) next.lockOnSuspend = Boolean(patch.lockOnSuspend);
    if ("clearClipboard" in patch) next.clearClipboard = Boolean(patch.clearClipboard);

    this.current = this._validate(next);
    await this._write();
    if (this.onChange) {
      try {
        this.onChange(this.snapshot());
      } catch {
        // A listener failure must not fail the settings write.
      }
    }
    return this.snapshot();
  }

  _validate(values) {
    return {
      idleLockSeconds: clampInt(values.idleLockSeconds, IDLE_MIN_SECONDS, IDLE_MAX_SECONDS, "idleLockSeconds"),
      retentionDays: clampInt(values.retentionDays, RETENTION_MIN_DAYS, RETENTION_MAX_DAYS, "retentionDays"),
      lockOnSuspend: Boolean(values.lockOnSuspend),
      clearClipboard: Boolean(values.clearClipboard),
    };
  }

  async _write() {
    const body = JSON.stringify({ version: PREFERENCES_VERSION, values: this.current }, null, 2);
    const tmp = `${this.file}.tmp`;
    try {
      await fsp.mkdir(path.dirname(this.file), { recursive: true });
      await ensureProtected(path.dirname(this.file));
      await fsp.writeFile(tmp, body, { mode: 0o600 });
      await protectFile(tmp);
      await fsp.rename(tmp, this.file);
      await protectFile(this.file);
    } catch (err) {
      if (isPermissionDenial(err)) {
        throw new VaultError(CODES.PERMISSION_DENIED, "The preferences location does not allow this user to write");
      }
      throw new VaultError(CODES.IO_FAILED, "Could not write the preferences file");
    }
  }
}

function clampInt(value, min, max, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw badInput(`${label} must be a number`);
  const rounded = Math.round(number);
  return Math.min(max, Math.max(min, rounded));
}

module.exports = {
  Preferences,
  PREFERENCES_VERSION,
  DEFAULTS,
  IDLE_MIN_SECONDS,
  IDLE_MAX_SECONDS,
  RETENTION_MIN_DAYS,
  RETENTION_MAX_DAYS,
};
