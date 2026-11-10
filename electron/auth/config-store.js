"use strict";

/**
 * Persists the public GitHub OAuth App client id in the Electron user-data
 * directory. A client id is not a secret in the device flow, but the file is
 * still written atomically and owner-only where the platform supports it.
 *
 * Nothing else is stored here: no access token, no identity, no session.
 */
const fs = require("fs");
const path = require("path");

class GitHubConfigStore {
  constructor(options) {
    const opts = options || {};
    if (!opts.filePath) throw new Error("GitHubConfigStore requires a filePath");
    this._filePath = opts.filePath;
    this._fs = opts.fsImpl || fs;
  }

  get filePath() {
    return this._filePath;
  }

  read() {
    try {
      const raw = this._fs.readFileSync(this._filePath, "utf8");
      const parsed = JSON.parse(raw);
      return { clientId: typeof parsed?.clientId === "string" ? parsed.clientId : "" };
    } catch {
      return { clientId: "" };
    }
  }

  write(patch) {
    const current = this.read();
    const next = {
      clientId: typeof patch?.clientId === "string" ? patch.clientId.trim() : current.clientId,
    };
    const dir = path.dirname(this._filePath);
    this._fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = `${this._filePath}.${process.pid}.tmp`;
    this._fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    this._fs.renameSync(tmp, this._filePath);
    return next;
  }

  clear() {
    try {
      this._fs.unlinkSync(this._filePath);
    } catch {
      // Already absent.
    }
  }
}

module.exports = { GitHubConfigStore };
