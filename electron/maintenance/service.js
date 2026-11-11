"use strict";

/**
 * App-scoped maintenance service for System Care.
 *
 * The app is not an antivirus and must not pretend to be one. What it can do
 * honestly is:
 *
 *   - report real device facts (CPU, memory, free disk space, uptime)
 *   - measure the temp and cache files that belong to KnouxCrypt
 *   - remove only those app-owned temp/cache files, with explicit confirmation
 *   - open the real Windows maintenance pages for program removal, updates,
 *     storage and security instead of pretending to change OS settings
 *
 * Every delete is confined to a fixed root computed in this module. No path is
 * ever accepted from the renderer, symlinks are skipped, and a locked file is
 * counted as a failure rather than retried forever.
 */

const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");

const MAX_ENTRIES = 20000;
const MAX_DEPTH = 6;

const PANELS = Object.freeze({
  apps: Object.freeze({ id: "apps", label: "Installed apps", uri: "ms-settings:appsfeatures" }),
  updates: Object.freeze({ id: "updates", label: "Windows Update", uri: "ms-settings:windowsupdate" }),
  storage: Object.freeze({ id: "storage", label: "Storage settings", uri: "ms-settings:storagesense" }),
  security: Object.freeze({ id: "security", label: "Windows Security", uri: "windowsdefender://" }),
});

class MaintenanceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MaintenanceError";
    this.code = code;
  }
}

function badInput(message) {
  return new MaintenanceError("BAD_INPUT", message);
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function defaultRoots(userDataPath) {
  const base = path.resolve(userDataPath);
  return [
    { id: "documents", label: "Decrypted document temp", path: path.join(base, "vault-documents"), cleanable: true },
    { id: "cache", label: "Chromium cache", path: path.join(base, "Cache"), cleanable: true },
    { id: "code-cache", label: "Compiled code cache", path: path.join(base, "Code Cache"), cleanable: true },
    { id: "gpu-cache", label: "GPU cache", path: path.join(base, "GPUCache"), cleanable: true },
    { id: "dawn-cache", label: "WebGPU cache", path: path.join(base, "DawnCache"), cleanable: true },
    { id: "crashpad", label: "Crash reports", path: path.join(base, "Crashpad", "reports"), cleanable: true },
    { id: "logs", label: "Application logs", path: path.join(base, "logs"), cleanable: true },
  ];
}

async function directorySize(root) {
  const result = { files: 0, bytes: 0, skipped: 0, truncated: false };
  let seen = 0;

  async function walk(current, depth) {
    if (depth > MAX_DEPTH) {
      result.skipped += 1;
      return;
    }
    let entries;
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      result.skipped += 1;
      return;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (seen >= MAX_ENTRIES) {
        result.truncated = true;
        return;
      }
      seen += 1;
      const full = path.join(current, entry.name);
      // A symlink or junction can point outside the approved root. Skip it:
      // following one would turn a cache count into a filesystem-wide walk.
      if (entry.isSymbolicLink()) {
        result.skipped += 1;
        continue;
      }
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        const stat = await fsp.lstat(full);
        result.files += 1;
        result.bytes += stat.size;
      } catch {
        result.skipped += 1;
      }
    }
  }

  try {
    const stat = await fsp.lstat(root);
    if (stat.isDirectory()) await walk(root, 0);
    else if (stat.isFile()) {
      result.files = 1;
      result.bytes = stat.size;
    }
  } catch {
    // Missing roots are normal: a cache directory appears after first use.
  }
  return result;
}

async function collectFiles(root) {
  const files = [];

  async function walk(current, depth) {
    if (depth > MAX_DEPTH) return;
    let entries;
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= MAX_ENTRIES) return;
      const full = path.join(current, entry.name);
      if (!isInside(root, full)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
        continue;
      }
      if (entry.isFile()) files.push(full);
    }
  }

  await walk(root, 0);
  return files;
}

async function deleteTree(root) {
  const files = await collectFiles(root);
  let removedFiles = 0;
  let freedBytes = 0;
  let failedFiles = 0;
  for (const file of files) {
    try {
      const stat = await fsp.lstat(file);
      if (!stat.isFile()) continue;
      await fsp.rm(file, { force: true });
      removedFiles += 1;
      freedBytes += stat.size;
    } catch {
      failedFiles += 1;
    }
  }
  return { removedFiles, freedBytes, failedFiles };
}

async function diskFacts(targetPath) {
  try {
    if (typeof fsp.statfs === "function") {
      const stats = await fsp.statfs(targetPath);
      const totalBytes = Number(stats.blocks) * Number(stats.bsize);
      const freeBytes = Number(stats.bavail) * Number(stats.bsize);
      if (Number.isFinite(totalBytes) && Number.isFinite(freeBytes)) {
        return { totalBytes, freeBytes, usedBytes: Math.max(0, totalBytes - freeBytes) };
      }
    }
  } catch {
    // statfs is not available on every filesystem or Node build.
  }
  return null;
}

class MaintenanceService {
  constructor(options = {}) {
    if (typeof options.userDataPath !== "string" || !options.userDataPath) {
      throw badInput("MaintenanceService requires a userDataPath");
    }
    this.userDataPath = path.resolve(options.userDataPath);
    this.roots = Array.isArray(options.roots) && options.roots.length ? options.roots : defaultRoots(this.userDataPath);
    for (const root of this.roots) {
      if (!root || typeof root.path !== "string" || !isInside(this.userDataPath, path.resolve(root.path))) {
        throw badInput("Every maintenance root must live inside the application data directory");
      }
    }
    this.openExternal = typeof options.openExternal === "function" ? options.openExternal : null;
  }

  panels() {
    return Object.values(PANELS).map(({ id, label }) => ({ id, label }));
  }

  async info() {
    const platform = process.platform;
    return {
      platform,
      windows: platform === "win32",
      panels: this.panels(),
      panelSupport: platform === "win32" ? "native" : "unavailable",
      scope: "app",
      cleansOsTemp: false,
      modifiesOsSettings: false,
    };
  }

  async scan() {
    const locations = [];
    let totalFiles = 0;
    let totalBytes = 0;
    let cleanableBytes = 0;
    for (const root of this.roots) {
      const measured = await directorySize(root.path);
      const entry = {
        id: root.id,
        label: root.label,
        path: root.path,
        cleanable: root.cleanable !== false,
        files: measured.files,
        bytes: measured.bytes,
        skipped: measured.skipped,
        truncated: measured.truncated,
      };
      locations.push(entry);
      totalFiles += entry.files;
      totalBytes += entry.bytes;
      if (entry.cleanable) cleanableBytes += entry.bytes;
    }

    const memoryTotal = os.totalmem();
    const memoryFree = os.freemem();
    return {
      scope: "app",
      locations,
      totalFiles,
      totalBytes,
      cleanableBytes,
      device: {
        platform: process.platform,
        release: os.release(),
        arch: process.arch,
        cpuModel: os.cpus?.()[0]?.model || "Unknown CPU",
        cpuCount: os.cpus?.().length || 1,
        loadAverage: os.loadavg?.().map((value) => Math.round(value * 100) / 100) || [],
        memoryTotal,
        memoryFree,
        memoryUsed: Math.max(0, memoryTotal - memoryFree),
        uptimeSeconds: Math.round(os.uptime()),
        appUptimeSeconds: Math.round(process.uptime()),
        disk: await diskFacts(this.userDataPath),
      },
    };
  }

  async clean(payload = {}) {
    if (payload.confirm !== true) {
      throw badInput("Cleaning app temp files requires explicit confirmation");
    }
    const details = [];
    let removedFiles = 0;
    let freedBytes = 0;
    let failedFiles = 0;
    for (const root of this.roots) {
      if (root.cleanable === false) continue;
      const result = await deleteTree(root.path);
      details.push({ id: root.id, label: root.label, ...result });
      removedFiles += result.removedFiles;
      freedBytes += result.freedBytes;
      failedFiles += result.failedFiles;
    }
    return {
      scope: "app",
      removedFiles,
      freedBytes,
      failedFiles,
      locations: details,
      completedAt: new Date().toISOString(),
    };
  }

  async openPanel(payload = {}) {
    const panel = PANELS[payload.panel];
    if (!panel) throw badInput("Unknown maintenance panel");
    if (process.platform !== "win32") {
      throw new MaintenanceError("UNAVAILABLE", "Windows maintenance pages are only available on Windows");
    }
    if (!this.openExternal) {
      throw new MaintenanceError("UNAVAILABLE", "The system shell is not available in this process");
    }
    await this.openExternal(panel.uri);
    return { opened: true, panel: panel.id, uri: panel.uri };
  }
}

module.exports = {
  MaintenanceService,
  MaintenanceError,
  PANELS,
  defaultRoots,
  directorySize,
  isInside,
};
