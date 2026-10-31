"use strict";

/**
 * Encrypted archive support (task 21).
 *
 * A minimal, self-contained ZIP reader/writer over Node's built-in zlib. The
 * archive bytes are then sealed with the vault engine, so an archive at rest is
 * an authenticated AES-256-GCM container rather than a readable ZIP.
 *
 * Extraction is the risky direction: an archive is untrusted input, so entry
 * names are validated against directory traversal and every entry is bounded so
 * a crafted archive cannot fill the disk. Entry names are always reduced to a
 * basename on creation, so KnouxCrypt never writes an archive with a path.
 */
const crypto = require("crypto");
const path = require("path");
const zlib = require("zlib");

const { VaultError, CODES } = require("./errors");

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const EOCD_MIN = 22;
const MAX_COMMENT = 0xffff;

const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

// Bounds. These are enforced, not advisory: exceeding them fails the call.
const MAX_ENTRIES = 4096;
const MAX_ENTRY_BYTES = 512 * 1024 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_NAME_BYTES = 255;

function badInput(message) {
  return new VaultError(CODES.BAD_INPUT, message);
}

/** DOS date/time as used by the ZIP format, from a Date. */
function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** Reduce a path to a safe single-segment entry name. */
function entryNameFor(filePath, taken) {
  // Split on both separators rather than using path.basename, so a Windows path
  // is reduced correctly even when the code runs on Linux (and vice versa).
  const parts = String(filePath || "").split(/[\\/]+/).filter(Boolean);
  let base = parts.length ? parts[parts.length - 1] : "";
  base = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!base || base === "." || base === "..") base = "file";
  if (Buffer.byteLength(base, "utf8") > MAX_NAME_BYTES) {
    const ext = path.extname(base).slice(0, 16);
    base = base.slice(0, MAX_NAME_BYTES - ext.length - 1) + ext;
  }
  let name = base;
  let n = 1;
  while (taken.has(name)) {
    const ext = path.extname(base);
    const stem = base.slice(0, base.length - ext.length);
    name = `${stem} (${n})${ext}`;
    n += 1;
  }
  taken.add(name);
  return name;
}

/**
 * Build a ZIP buffer from in-memory entries. Kept separate from the filesystem
 * so the same code path can be exercised without touching disk.
 */
function buildZip(entries, { compression = true, now = new Date() } = {}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw badInput("An archive needs at least one entry");
  }
  if (entries.length > MAX_ENTRIES) {
    throw badInput(`An archive may hold at most ${MAX_ENTRIES} entries`);
  }
  const { time, date } = dosDateTime(now);
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  let total = 0;

  for (const entry of entries) {
    const name = Buffer.from(String(entry.name), "utf8");
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), "utf8");
    if (raw.length > MAX_ENTRY_BYTES) throw badInput("An archive entry is too large");
    total += raw.length;
    if (total > MAX_TOTAL_BYTES) throw badInput("The archive contents are too large");

    const deflated = compression ? zlib.deflateRawSync(raw, { level: 6 }) : raw;
    const useDeflate = compression && deflated.length < raw.length;
    const stored = useDeflate ? deflated : raw;
    const method = useDeflate ? METHOD_DEFLATE : METHOD_STORE;
    const crc = zlib.crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIG, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, stored);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_SIG, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + stored.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(EOCD_MIN);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

/** Locate and parse the end-of-central-directory record. */
function readEocd(buffer) {
  const minOffset = Math.max(0, buffer.length - EOCD_MIN - MAX_COMMENT);
  for (let i = buffer.length - EOCD_MIN; i >= minOffset; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) {
      const count = buffer.readUInt16LE(i + 10);
      const cdSize = buffer.readUInt32LE(i + 12);
      const cdOffset = buffer.readUInt32LE(i + 16);
      if (cdOffset + cdSize > buffer.length) break;
      return { count, cdSize, cdOffset };
    }
  }
  throw new VaultError(CODES.INTEGRITY_FAILED, "The archive has no readable central directory");
}

/** Reject an entry name that would escape the target directory. */
function assertSafeEntryName(name) {
  const raw = String(name || "");
  if (!raw) throw new VaultError(CODES.INTEGRITY_FAILED, "The archive holds an unnamed entry");
  if (raw.includes("\u0000")) throw new VaultError(CODES.INTEGRITY_FAILED, "The archive holds an invalid entry name");
  if (raw.includes("\\")) throw new VaultError(CODES.INTEGRITY_FAILED, "The archive entry name uses a backslash path");
  if (raw.startsWith("/") || /^[A-Za-z]:/.test(raw)) {
    throw new VaultError(CODES.INTEGRITY_FAILED, "The archive entry name is an absolute path");
  }
  const segments = raw.split("/");
  if (segments.some((s) => s === "..")) {
    throw new VaultError(CODES.INTEGRITY_FAILED, "The archive entry name escapes the target directory");
  }
  return raw;
}

/**
 * Read the directory of a ZIP buffer. Nothing is decompressed here, so listing
 * an archive is safe even for a hostile one.
 */
function listZip(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < EOCD_MIN) {
    throw new VaultError(CODES.INTEGRITY_FAILED, "That is not a readable archive");
  }
  const { count, cdSize, cdOffset } = readEocd(buffer);
  if (count > MAX_ENTRIES) throw badInput(`An archive may hold at most ${MAX_ENTRIES} entries`);
  const entries = [];
  let cursor = cdOffset;
  const end = cdOffset + cdSize;
  for (let i = 0; i < count; i += 1) {
    if (cursor + 46 > end) throw new VaultError(CODES.INTEGRITY_FAILED, "The archive directory is truncated");
    if (buffer.readUInt32LE(cursor) !== CENTRAL_SIG) {
      throw new VaultError(CODES.INTEGRITY_FAILED, "The archive directory is malformed");
    }
    const method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const compSize = buffer.readUInt32LE(cursor + 20);
    const uncompSize = buffer.readUInt32LE(cursor + 24);
    const nameLen = buffer.readUInt16LE(cursor + 28);
    const extraLen = buffer.readUInt16LE(cursor + 30);
    const commentLen = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLen).toString("utf8");
    entries.push({ name, method, crc, compSize, uncompSize, localOffset });
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * Extract a ZIP buffer into memory. Every entry is bounded and its CRC is
 * verified, so a truncated or corrupted archive fails instead of yielding
 * silently damaged files.
 */
function extractZip(buffer) {
  const directory = listZip(buffer);
  const out = [];
  let total = 0;
  for (const entry of directory) {
    const name = assertSafeEntryName(entry.name);
    if (name.endsWith("/")) continue; // directory record, nothing to write
    if (entry.method !== METHOD_STORE && entry.method !== METHOD_DEFLATE) {
      throw new VaultError(CODES.INTEGRITY_FAILED, `Unsupported compression method ${entry.method}`);
    }
    if (entry.uncompSize > MAX_ENTRY_BYTES) throw badInput("An archive entry is too large");
    total += entry.uncompSize;
    if (total > MAX_TOTAL_BYTES) throw badInput("The archive expands to too much data");

    const at = entry.localOffset;
    if (at + 30 > buffer.length || buffer.readUInt32LE(at) !== LOCAL_SIG) {
      throw new VaultError(CODES.INTEGRITY_FAILED, "The archive entry header is malformed");
    }
    const nameLen = buffer.readUInt16LE(at + 26);
    const extraLen = buffer.readUInt16LE(at + 28);
    const start = at + 30 + nameLen + extraLen;
    const stop = start + entry.compSize;
    if (stop > buffer.length) throw new VaultError(CODES.INTEGRITY_FAILED, "The archive entry is truncated");

    const stored = buffer.subarray(start, stop);
    let data;
    if (entry.method === METHOD_STORE) {
      data = Buffer.from(stored);
    } else {
      try {
        data = zlib.inflateRawSync(stored, { maxOutputLength: MAX_ENTRY_BYTES });
      } catch {
        throw new VaultError(CODES.INTEGRITY_FAILED, "The archive entry could not be decompressed");
      }
    }
    if (data.length !== entry.uncompSize) {
      throw new VaultError(CODES.INTEGRITY_FAILED, "The archive entry size does not match the directory");
    }
    if (zlib.crc32(data) !== entry.crc) {
      throw new VaultError(CODES.INTEGRITY_FAILED, "The archive entry failed its checksum");
    }
    out.push({ name, data });
  }
  return out;
}

/** Cheap sniff so the caller can tell a ZIP from a sealed container. */
function looksLikeZip(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 4 && buffer.readUInt32LE(0) === LOCAL_SIG;
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

module.exports = {
  buildZip,
  listZip,
  extractZip,
  looksLikeZip,
  assertSafeEntryName,
  entryNameFor,
  sha256,
  MAX_ENTRIES,
  MAX_ENTRY_BYTES,
  MAX_TOTAL_BYTES,
};
