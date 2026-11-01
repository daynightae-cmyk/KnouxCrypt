"use strict";

/**
 * File Integrity baselines (task 43).
 *
 * A real SHA-256 (or SHA-512) baseline manifest of a set of files, plus a real
 * comparison that reports which files are unchanged, changed, missing or newly
 * added. Hashing streams each file, so a large file never has to fit in memory.
 *
 * Honesty constraints:
 *   - The manifest is a local record only. It detects that a file differs from
 *     when the manifest was taken; it does not prove who changed it or that the
 *     manifest itself is trustworthy. There is no signature and no external
 *     trust anchor, and the UI says so.
 *   - Verification is read-only. It never rewrites, repairs or deletes a file.
 */
const crypto = require("crypto");
const fsp = require("fs/promises");
const path = require("path");

const { VaultError, CODES, badInput } = require("./errors");

const MANIFEST_FORMAT = "KNXMAN01";
const MANIFEST_VERSION = 1;
const ALGORITHMS = Object.freeze({ "SHA-256": "sha256", "SHA-512": "sha512" });
const MAX_FILES = 5000;

function digestFor(algorithm) {
  const digest = ALGORITHMS[algorithm];
  if (!digest) throw badInput(`Unsupported integrity algorithm "${algorithm}"`);
  return digest;
}

/** Stream a file through a hash so arbitrarily large files are supported. */
async function hashFile(file, algorithm) {
  const digest = digestFor(algorithm);
  let handle;
  try {
    handle = await fsp.open(file, "r");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw new VaultError(CODES.IO_FAILED, `The file "${path.basename(file)}" could not be read`);
  }
  try {
    const hash = crypto.createHash(digest);
    const buf = Buffer.alloc(1024 * 1024);
    let bytes = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buf, 0, buf.length, null);
      if (bytesRead === 0) break;
      hash.update(buf.subarray(0, bytesRead));
      bytes += bytesRead;
    }
    return { sha: hash.digest("hex"), size: bytes };
  } finally {
    await handle.close();
  }
}

class IntegrityBaseline {
  constructor(options = {}) {
    this.now = options.now || (() => new Date());
  }

  algorithms() {
    return { algorithms: Object.keys(ALGORITHMS) };
  }

  /** Build a real manifest for the given files. */
  async create({ files, algorithm = "SHA-256", label = "Baseline" } = {}) {
    if (!Array.isArray(files) || files.length === 0) throw badInput("Select at least one file to baseline");
    if (files.length > MAX_FILES) throw badInput("Too many files in one baseline");
    digestFor(algorithm);
    const entries = [];
    for (const file of files) {
      const abs = path.resolve(file);
      const result = await hashFile(abs, algorithm);
      if (!result) throw new VaultError(CODES.NOT_FOUND, `The file "${path.basename(file)}" was not found`);
      entries.push({ path: abs, name: path.basename(abs), sha: result.sha, size: result.size });
    }
    return {
      format: MANIFEST_FORMAT,
      version: MANIFEST_VERSION,
      label: String(label).slice(0, 64),
      algorithm,
      createdAt: this.now().toISOString(),
      count: entries.length,
      entries,
    };
  }

  /** Write a manifest to disk with owner-only permissions (atomic). */
  async save({ manifest, outputPath } = {}) {
    if (!manifest || manifest.format !== MANIFEST_FORMAT) throw badInput("A valid manifest is required");
    if (typeof outputPath !== "string" || !outputPath.trim()) throw badInput("An output path is required");
    const target = path.resolve(outputPath);
    const tmp = `${target}.${crypto.randomBytes(6).toString("hex")}.tmp`;
    try {
      await fsp.writeFile(tmp, JSON.stringify(manifest, null, 2), { mode: 0o600 });
      await fsp.rename(tmp, target);
    } catch (err) {
      await fsp.rm(tmp, { force: true }).catch(() => {});
      if (err.code === "ENOENT") throw new VaultError(CODES.NOT_FOUND, "The output folder does not exist");
      throw new VaultError(CODES.IO_FAILED, "The manifest could not be written");
    }
    return { saved: true, outputPath: target, count: manifest.count };
  }

  /** Load a manifest from disk. */
  async load(manifestPath) {
    let raw;
    try {
      raw = await fsp.readFile(manifestPath, "utf8");
    } catch (err) {
      if (err.code === "ENOENT") throw new VaultError(CODES.NOT_FOUND, "The manifest was not found");
      throw new VaultError(CODES.IO_FAILED, "The manifest could not be read");
    }
    let manifest;
    try {
      manifest = JSON.parse(raw);
    } catch {
      throw new VaultError(CODES.BAD_INPUT, "The manifest is not valid JSON");
    }
    if (manifest.format !== MANIFEST_FORMAT || !Array.isArray(manifest.entries)) {
      throw new VaultError(CODES.NOT_A_VAULT, "That is not a KnouxCrypt integrity manifest");
    }
    return manifest;
  }

  /**
   * Compare the filesystem against a manifest. Reports unchanged, changed,
   * missing and added files. Read-only.
   */
  async compare({ manifest, manifestPath, extraFiles = [] } = {}) {
    const base = manifest || (manifestPath ? await this.load(manifestPath) : null);
    if (!base || !Array.isArray(base.entries)) throw badInput("A manifest is required");
    const algorithm = base.algorithm || "SHA-256";
    digestFor(algorithm);

    const unchanged = [];
    const changed = [];
    const missing = [];
    const seen = new Set();

    for (const entry of base.entries) {
      seen.add(entry.path);
      const result = await hashFile(entry.path, algorithm);
      if (!result) {
        missing.push({ path: entry.path, name: entry.name, expected: entry.sha });
      } else if (result.sha === entry.sha && result.size === entry.size) {
        unchanged.push({ path: entry.path, name: entry.name, sha: result.sha });
      } else {
        changed.push({ path: entry.path, name: entry.name, expected: entry.sha, actual: result.sha, sizeDelta: result.size - entry.size });
      }
    }

    const added = [];
    for (const file of extraFiles) {
      const abs = path.resolve(file);
      if (seen.has(abs)) continue;
      const result = await hashFile(abs, algorithm);
      if (result) added.push({ path: abs, name: path.basename(abs), sha: result.sha, size: result.size });
    }

    return {
      algorithm,
      label: base.label,
      createdAt: base.createdAt,
      summary: {
        unchanged: unchanged.length,
        changed: changed.length,
        missing: missing.length,
        added: added.length,
        total: base.entries.length,
      },
      unchanged,
      changed,
      missing,
      added,
      verified: changed.length === 0 && missing.length === 0,
    };
  }
}

module.exports = { IntegrityBaseline, MANIFEST_FORMAT, ALGORITHMS, hashFile };
