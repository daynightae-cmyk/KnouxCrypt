"use strict";

/**
 * Android Autofill preview (task 33).
 *
 * This is a desktop build. It cannot enable Android Autofill, register a
 * credential provider, or open the device's Autofill settings screen — the
 * Android service that would do that is not part of this application.
 *
 * What it can honestly do is keep a small set of *preview* toggles the user
 * flips while reading about Autofill, persisted locally with the same care as
 * any other app preference. The toggles are labelled as preview state and the
 * capability report always states that native Autofill and the settings CTA are
 * unavailable, so nothing on this screen can be mistaken for a real Android
 * permission change.
 */
const fsp = require("fs/promises");
const path = require("path");

const { VaultError, CODES, badInput } = require("./errors");

const PREVIEW_VERSION = 1;
const DEFAULTS = Object.freeze({ suggestions: false, mask: true, confirmation: true });
const KEYS = Object.freeze(Object.keys(DEFAULTS));

class AutofillPreview {
  constructor(options = {}) {
    if (!options.file) throw badInput("AutofillPreview needs a file path");
    this.file = options.file;
    this.current = { ...DEFAULTS };
  }

  async load() {
    try {
      const raw = await fsp.readFile(this.file, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === PREVIEW_VERSION && parsed.values) {
        this.current = this._coerce(parsed.values);
      }
    } catch {
      this.current = { ...DEFAULTS };
    }
    return this.snapshot();
  }

  /**
   * A fixed report of what this platform can and cannot do. It is derived from
   * the build, not from a probe, so it never changes to flatter the UI.
   */
  capabilities() {
    return {
      platform: "desktop",
      nativeAutofill: false,
      canRegisterProvider: false,
      canOpenSettings: false,
      reason: "Android Autofill is provided by the Android operating system and is not available in the desktop build.",
    };
  }

  snapshot() {
    return { version: PREVIEW_VERSION, values: { ...this.current }, capabilities: this.capabilities() };
  }

  async update(patch = {}) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      throw badInput("The preview update must be an object");
    }
    const next = { ...this.current };
    for (const key of KEYS) {
      if (key in patch) next[key] = Boolean(patch[key]);
    }
    this.current = next;
    await this._write();
    return this.snapshot();
  }

  _coerce(values) {
    const out = { ...DEFAULTS };
    for (const key of KEYS) if (key in values) out[key] = Boolean(values[key]);
    return out;
  }

  async _write() {
    const body = JSON.stringify({ version: PREVIEW_VERSION, values: this.current }, null, 2);
    const tmp = `${this.file}.tmp`;
    try {
      await fsp.mkdir(path.dirname(this.file), { recursive: true });
      await fsp.writeFile(tmp, body, { mode: 0o600 });
      await fsp.rename(tmp, this.file);
    } catch {
      throw new VaultError(CODES.IO_FAILED, "Could not write the Autofill preview file");
    }
  }
}

module.exports = { AutofillPreview, PREVIEW_VERSION, DEFAULTS, KEYS };
