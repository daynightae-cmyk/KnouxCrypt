"use strict";

/**
 * Validated IPC surface for app-scoped maintenance.
 *
 * Mirrors the vault/auth contracts: handlers never throw at the renderer and
 * every result is `{ ok, data }` or `{ ok: false, error: { code, message } }`.
 * The renderer can measure app-owned temp/cache folders, ask for a confirmed
 * cleanup, and open the real Windows maintenance pages. It cannot pass an
 * arbitrary path, so it cannot turn this surface into a filesystem API.
 */

const { ipcMain } = require("electron");
const { MaintenanceError } = require("./service");

const CHANNELS = Object.freeze({
  INFO: "maintenance:info",
  SCAN: "maintenance:scan",
  CLEAN: "maintenance:clean",
  OPEN_PANEL: "maintenance:open-panel",
});

function safe(handler) {
  return async (event, payload) => {
    try {
      return { ok: true, data: await handler(event, payload) };
    } catch (err) {
      if (err instanceof MaintenanceError) {
        return { ok: false, error: { code: err.code, message: err.message } };
      }
      return {
        ok: false,
        error: { code: "MAINTENANCE_INTERNAL", message: "The maintenance task failed unexpectedly." },
      };
    }
  };
}

function requireObject(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new MaintenanceError("BAD_INPUT", "Request payload must be an object.");
  }
  return payload;
}

function registerMaintenanceIpc(options = {}) {
  const service = options.service;
  if (!service) throw new Error("registerMaintenanceIpc requires a service");

  ipcMain.handle(CHANNELS.INFO, safe(async () => service.info()));
  ipcMain.handle(CHANNELS.SCAN, safe(async () => service.scan()));
  ipcMain.handle(
    CHANNELS.CLEAN,
    safe(async (_event, payload) => {
      const p = requireObject(payload);
      return service.clean({ confirm: p.confirm === true });
    }),
  );
  ipcMain.handle(
    CHANNELS.OPEN_PANEL,
    safe(async (_event, payload) => {
      const p = requireObject(payload);
      if (typeof p.panel !== "string" || p.panel.length === 0 || p.panel.length > 32) {
        throw new MaintenanceError("BAD_INPUT", "A panel id is required.");
      }
      return service.openPanel({ panel: p.panel });
    }),
  );

  return function unregisterMaintenanceIpc() {
    for (const channel of Object.values(CHANNELS)) ipcMain.removeHandler(channel);
  };
}

module.exports = { CHANNELS, registerMaintenanceIpc };
