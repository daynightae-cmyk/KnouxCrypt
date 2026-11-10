"use strict";

/**
 * Validated IPC surface for GitHub sign-in.
 *
 * Mirrors the vault IPC contract: handlers never throw at the renderer, every
 * result is `{ ok, data }` or `{ ok: false, error: { code, message } }`, and
 * payloads are shape-checked before the service sees them. The renderer can
 * read identity, start and poll a device authorization, and open the GitHub
 * verification page. It cannot read the OAuth access token because the token
 * never crosses this boundary.
 */
const { ipcMain, shell } = require("electron");
const { GitHubAuthError, CODES, normalizeClientId } = require("./github");

const CHANNELS = Object.freeze({
  STATUS: "auth:github:status",
  CONFIGURE: "auth:github:configure",
  BEGIN: "auth:github:begin",
  POLL: "auth:github:poll",
  CANCEL: "auth:github:cancel",
  SIGN_OUT: "auth:github:sign-out",
  OPEN: "auth:github:open",
});

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

function safe(handler) {
  return async (event, payload) => {
    try {
      return { ok: true, data: await handler(event, payload) };
    } catch (err) {
      if (err instanceof GitHubAuthError) {
        return { ok: false, error: { code: err.code, message: err.message } };
      }
      return {
        ok: false,
        error: { code: "GH_INTERNAL", message: "GitHub sign-in failed unexpectedly." },
      };
    }
  };
}

function requireString(value, field, max = 256) {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw new GitHubAuthError(CODES.BAD_INPUT, `${field} is required.`);
  }
  return value;
}

function requireObject(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new GitHubAuthError(CODES.BAD_INPUT, "Request payload must be an object.");
  }
  return payload;
}

/**
 * @param {object} options
 * @param {import("./github").GitHubAuthService} options.service
 * @param {import("./config-store").GitHubConfigStore} options.store
 * @param {Function} [options.getWindow] unused today, kept for parity/logging
 */
function registerGitHubAuthIpc(options) {
  const { service, store } = options || {};
  if (!service || !store) throw new Error("registerGitHubAuthIpc requires a service and a store");

  ipcMain.handle(
    CHANNELS.STATUS,
    safe(async () => service.status()),
  );

  ipcMain.handle(
    CHANNELS.CONFIGURE,
    safe(async (_event, payload) => {
      const p = requireObject(payload);
      const clientId = normalizeClientId(requireString(p.clientId, "clientId", 64));
      // Persist first: a configuration the app cannot remember is not a
      // configuration the user can rely on.
      store.write({ clientId });
      service.setClientId(clientId);
      return service.status();
    }),
  );

  ipcMain.handle(
    CHANNELS.BEGIN,
    safe(async () => service.begin()),
  );

  ipcMain.handle(
    CHANNELS.POLL,
    safe(async (_event, payload) => {
      const p = requireObject(payload);
      return service.poll(requireString(p.sessionId, "sessionId", 128));
    }),
  );

  ipcMain.handle(
    CHANNELS.CANCEL,
    safe(async (_event, payload) => {
      const p = payload ? requireObject(payload) : {};
      const sessionId = p.sessionId === undefined ? null : requireString(p.sessionId, "sessionId", 128);
      return service.cancel(sessionId);
    }),
  );

  ipcMain.handle(
    CHANNELS.SIGN_OUT,
    safe(async () => service.signOut()),
  );

  ipcMain.handle(
    CHANNELS.OPEN,
    safe(async (_event, payload) => {
      const p = requireObject(payload);
      const raw = requireString(p.url, "url", 2048);
      let parsed;
      try {
        parsed = new URL(raw);
      } catch {
        throw new GitHubAuthError(CODES.BAD_INPUT, "That is not a valid GitHub link.");
      }
      if (parsed.protocol !== "https:" || !GITHUB_HOSTS.has(parsed.hostname)) {
        throw new GitHubAuthError(CODES.BAD_INPUT, "Only GitHub pages can be opened from the sign-in panel.");
      }
      await shell.openExternal(parsed.toString());
      return { opened: true, url: parsed.toString() };
    }),
  );

  return function unregisterGitHubAuthIpc() {
    for (const channel of Object.values(CHANNELS)) {
      ipcMain.removeHandler(channel);
    }
  };
}

module.exports = {
  CHANNELS,
  registerGitHubAuthIpc,
  safe,
  GITHUB_HOSTS,
};
