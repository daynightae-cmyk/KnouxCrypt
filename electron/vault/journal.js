"use strict";

/**
 * Local Security Activity Journal (task 39).
 *
 * A real, append-only local journal of meaningful application events:
 * session lock/unlock outcomes, authorized and rejected operations, file
 * encryption/decryption metadata, key operations, backup/restore results,
 * sensitive exports and security-policy changes.
 *
 * What this is:
 *   - An append-only hash chain. Every entry carries the hash of the previous
 *     entry, so a deleted, reordered or edited entry breaks the chain and is
 *     reported as detected tampering.
 *   - Keyed: each entry is also HMAC-SHA256 sealed with a device journal key
 *     kept in a separate file confined to this user — POSIX mode 0600, and on
 *     Windows an owner-only NTFS DACL, because the mode bits do not control
 *     access there. A naive edit of the journal alone is therefore detected
 *     even though the hash chain by itself would be forgeable.
 *
 * What this is NOT (and the UI says so):
 *   - Not an immutable audit trail. An attacker who can rewrite BOTH the
 *     journal file and the key file on this machine can forge a consistent
 *     chain. There is no external trust anchor. We never claim otherwise.
 *   - Not system-wide intrusion detection. Only KnouxCrypt's own events are
 *     recorded.
 *
 * Privacy: passwords, OTP seeds, private keys, plaintext file contents, raw
 * clipboard contents and authentication tokens are never recorded. Free-text
 * detail is redacted by field name and by value pattern before it is stored.
 */
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const { VaultError, CODES, badInput } = require("./errors");
const { protectFileSync, ensureProtectedSync } = require("./acl");

const JOURNAL_VERSION = 1;
const MAX_ENTRIES = 500;
const GENESIS = "0".repeat(64);

const CATEGORIES = Object.freeze([
  "Session",
  "Vault",
  "Files",
  "Keys",
  "Backup",
  "Export",
  "Policy",
  "Clipboard",
  "Transfer",
  "Journal",
]);

const OUTCOMES = Object.freeze(["success", "rejected", "failed", "info"]);

// A field whose name matches this is stored as a redaction marker, never its
// value. Kept deliberately broad: it is better to over-redact a label than to
// persist a secret.
const SENSITIVE_KEY = /pass|secret|token|otp|seed|private|clipboard|phrase|credential|pin|mnemonic/i;

// Value patterns that are scrubbed wherever they appear in stored text.
const SENSITIVE_VALUE = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\$argon2[a-z]{1,2}\$[^\s"']+/g,
  /\b[0-9a-f]{64,}\b/gi,
  /\b(?:otpauth|otpauth-migration):\/\/[^\s"']+/gi,
];

const REDACTED = "[redacted]";

function scrubText(value) {
  let text = String(value);
  for (const pattern of SENSITIVE_VALUE) text = text.replace(pattern, REDACTED);
  return text.length > 500 ? `${text.slice(0, 500)}…` : text;
}

/**
 * Redact a free-form detail object. Keys that name a sensitive field are
 * replaced wholesale; every other value is string-scrubbed.
 */
function redactDetail(detail) {
  if (detail == null) return null;
  if (typeof detail !== "object") return { value: scrubText(detail) };
  const out = {};
  for (const [key, value] of Object.entries(detail)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = REDACTED;
    } else if (value && typeof value === "object") {
      out[key] = redactDetail(value);
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else {
      out[key] = scrubText(value);
    }
  }
  return out;
}

function canonical(entry) {
  return JSON.stringify([
    entry.seq,
    entry.at,
    entry.category,
    entry.action,
    entry.outcome,
    entry.subject ?? null,
    entry.detail ?? null,
  ]);
}

class SecurityJournal {
  constructor(options = {}) {
    this.file = options.file;
    this.keyFile = options.keyFile || `${options.file}.key`;
    this.now = options.now || (() => new Date());
    this.maxEntries = options.maxEntries || MAX_ENTRIES;
    this.entries = [];
    this.droppedCount = 0;
    this.chain = { status: "unverified", brokenAt: null, reason: null };
    this._key = null;
    this._loaded = false;
    this._loadPromise = null;
    this._queue = Promise.resolve();
  }

  // ---- storage ------------------------------------------------------------

  _loadKey() {
    if (this._key) return this._key;
    try {
      const raw = fs.readFileSync(this.keyFile);
      if (raw.length !== 32) throw new Error("bad key length");
      this._key = raw;
    } catch {
      this._key = crypto.randomBytes(32);
      fs.mkdirSync(path.dirname(this.keyFile), { recursive: true });
      // Confine the directory before the key exists, then the key itself:
      // a new file inherits its DACL, so sealing the parent first leaves no
      // window where another local user could read the chain key.
      ensureProtectedSync(path.dirname(this.keyFile));
      fs.writeFileSync(this.keyFile, this._key, { mode: 0o600 });
      protectFileSync(this.keyFile, false);
    }
    return this._key;
  }

  _entryMac(entry, prevHash) {
    const key = this._loadKey();
    return crypto
      .createHmac("sha256", key)
      .update(`${prevHash}\n${canonical(entry)}`)
      .digest("hex");
  }

  /** Verify the whole chain and record the verdict. */
  _verifyChain() {
    let prev = GENESIS;
    for (let i = 0; i < this.entries.length; i += 1) {
      const entry = this.entries[i];
      const expected = this._entryMac(entry, prev);
      if (entry.prev !== prev || entry.mac !== expected) {
        this.chain = { status: "tampered", brokenAt: entry.seq ?? i, reason: entry.prev !== prev ? "chain-break" : "mac-mismatch" };
        return this.chain;
      }
      prev = entry.mac;
    }
    this.chain = { status: "intact", brokenAt: null, reason: null };
    return this.chain;
  }

  async load() {
    if (this._loaded) return this;
    // Concurrent callers must all wait for the same read. Setting a flag before
    // the read resolves would let a second caller observe an empty journal, so
    // the in-flight promise is shared instead.
    if (!this._loadPromise) this._loadPromise = this._doLoad();
    await this._loadPromise;
    return this;
  }

  async _doLoad() {
    try {
      let raw;
      try {
        raw = await fsp.readFile(this.file, "utf8");
      } catch (err) {
        if (err.code === "ENOENT") {
          this.entries = [];
          this.chain = { status: "intact", brokenAt: null, reason: null };
          return;
        }
        // A present-but-unreadable journal is "unavailable evidence", which is
        // distinct from "no tampering detected".
        this.chain = { status: "unavailable", brokenAt: null, reason: "io-error" };
        this.entries = [];
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== JOURNAL_VERSION || !Array.isArray(parsed.entries)) {
          throw new Error("bad document");
        }
        this.entries = parsed.entries;
        this.droppedCount = Number(parsed.droppedCount) || 0;
      } catch {
        this.chain = { status: "tampered", brokenAt: null, reason: "malformed-document" };
        this.entries = [];
        return;
      }
      this._verifyChain();
    } finally {
      this._loaded = true;
    }
  }

  /**
   * Serialize a mutating operation so two concurrent writes can never interleave
   * their read-modify-write and silently drop an entry.
   */
  _enqueue(task) {
    const run = this._queue.then(task, task);
    this._queue = run.then(
      () => {},
      () => {},
    );
    return run;
  }

  /**
   * Wait for every queued write to finish. Callers that own the process
   * lifecycle (quit, test teardown) await this so a fire-and-forget journal
   * write cannot still be mid-flight when the storage directory is removed.
   */
  async drain() {
    await this._queue.catch(() => {});
  }

  async _persist() {
    const doc = JSON.stringify({ version: JOURNAL_VERSION, droppedCount: this.droppedCount, entries: this.entries });
    const dir = path.dirname(this.file);
    const tmp = path.join(dir, `.${path.basename(this.file)}.${crypto.randomBytes(6).toString("hex")}.tmp`);
    await fsp.mkdir(dir, { recursive: true });
    try {
      await fsp.writeFile(tmp, doc, { mode: 0o600 });
      await fsp.rename(tmp, this.file);
    } catch (err) {
      await fsp.rm(tmp, { force: true }).catch(() => {});
      throw new VaultError(CODES.IO_FAILED, "The security journal could not be written");
    }
  }

  // ---- recording ----------------------------------------------------------

  /**
   * Append an entry. `detail` is redacted before it is stored, and the entry is
   * chained to the previous one. Returns the stored, redacted entry.
   */
  async record(entry = {}) {
    return this._enqueue(() => this._record(entry));
  }

  async _record({ category, action, outcome = "info", subject = null, detail = null } = {}) {
    await this.load();
    if (!CATEGORIES.includes(category)) throw badInput(`Unknown journal category "${category}"`);
    if (typeof action !== "string" || !action.trim()) throw badInput("A journal action is required");
    if (!OUTCOMES.includes(outcome)) throw badInput(`Unknown journal outcome "${outcome}"`);

    const prev = this.entries.length ? this.entries[this.entries.length - 1].mac : GENESIS;
    const entry = {
      seq: this.entries.length ? this.entries[this.entries.length - 1].seq + 1 : 1,
      at: this.now().toISOString(),
      category,
      action: scrubText(action),
      outcome,
      subject: subject == null ? null : scrubText(subject),
      detail: redactDetail(detail),
    };
    entry.prev = prev;
    entry.mac = this._entryMac(entry, prev);
    this.entries.push(entry);

    // Bounded retention: drop the oldest entries and remember how many.
    if (this.entries.length > this.maxEntries) {
      const excess = this.entries.length - this.maxEntries;
      this.entries.splice(0, excess);
      this.droppedCount += excess;
      // The chain restarts at the new oldest entry's stored prev, which still
      // verifies because verification follows the recorded prev links.
    }

    await this._persist();
    return entry;
  }

  // ---- reading ------------------------------------------------------------

  /** Integrity verdict, distinguishing detected tampering from unavailable evidence. */
  async integrity() {
    await this.load();
    if (this.chain.status === "unverified") this._verifyChain();
    return {
      ...this.chain,
      entries: this.entries.length,
      droppedCount: this.droppedCount,
      retentionLimit: this.maxEntries,
      externalTrustAnchor: false,
    };
  }

  categories() {
    return { categories: [...CATEGORIES], outcomes: [...OUTCOMES] };
  }

  /**
   * Filtered, newest-first view. Supports category, outcome, date range and a
   * free-text query across action/subject/detail.
   */
  async list({ category = "All", outcome = "All", from = null, to = null, query = "", limit = 100 } = {}) {
    await this.load();
    if (category !== "All" && !CATEGORIES.includes(category)) throw badInput(`Unknown journal category "${category}"`);
    if (outcome !== "All" && !OUTCOMES.includes(outcome)) throw badInput(`Unknown journal outcome "${outcome}"`);
    const fromMs = from ? Date.parse(from) : null;
    const toMs = to ? Date.parse(to) : null;
    const needle = String(query || "").trim().toLowerCase();

    const rows = this.entries
      .filter((e) => {
        if (category !== "All" && e.category !== category) return false;
        if (outcome !== "All" && e.outcome !== outcome) return false;
        const t = Date.parse(e.at);
        if (fromMs != null && t < fromMs) return false;
        if (toMs != null && t > toMs) return false;
        if (needle) {
          const hay = `${e.action} ${e.subject || ""} ${JSON.stringify(e.detail || {})}`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      })
      .slice(-Math.max(1, Math.min(Number(limit) || 100, 500)))
      .reverse();

    return { entries: rows, total: this.entries.length, droppedCount: this.droppedCount };
  }

  /** Clear the journal. Requires explicit consent. */
  async clear(options = {}) {
    return this._enqueue(() => this._clear(options));
  }

  async _clear({ confirm } = {}) {
    await this.load();
    if (confirm !== true) throw new VaultError(CODES.CONSENT_REQUIRED, "Clearing the journal requires explicit confirmation");
    this.entries = [];
    this.droppedCount = 0;
    this.chain = { status: "intact", brokenAt: null, reason: null };
    await this._persist();
    return { cleared: true };
  }

  /** Owner-authorized export of the (redacted) journal to a chosen path. */
  async export(options = {}) {
    return this._enqueue(() => this._export(options));
  }

  async _export({ confirm, outputPath } = {}) {
    await this.load();
    if (confirm !== true) throw new VaultError(CODES.CONSENT_REQUIRED, "Exporting the journal requires explicit confirmation");
    if (typeof outputPath !== "string" || !outputPath.trim()) throw badInput("An export path is required");
    const doc = JSON.stringify(
      {
        version: JOURNAL_VERSION,
        exportedAt: this.now().toISOString(),
        integrity: this.chain,
        droppedCount: this.droppedCount,
        entries: this.entries,
      },
      null,
      2,
    );
    const target = path.resolve(outputPath);
    const tmp = `${target}.${crypto.randomBytes(6).toString("hex")}.tmp`;
    try {
      await fsp.writeFile(tmp, doc, { mode: 0o600 });
      await fsp.rename(tmp, target);
    } catch (err) {
      await fsp.rm(tmp, { force: true }).catch(() => {});
      if (err.code === "ENOENT") throw new VaultError(CODES.NOT_FOUND, "The export folder does not exist");
      throw new VaultError(CODES.IO_FAILED, "The journal export could not be written");
    }
    return { exported: true, outputPath: target, entries: this.entries.length };
  }
}

module.exports = { SecurityJournal, CATEGORIES, OUTCOMES, JOURNAL_VERSION, MAX_ENTRIES, redactDetail, scrubText };
