/**
 * Boot-view preload.
 *
 * The boot window needs exactly three things: the state the main process is
 * actually in (with the real build version that state carries), and the two
 * buttons of the recovery panel. Nothing else is exposed — no filesystem, no
 * vault, and no general `on(channel)` subscription the document could point at
 * an arbitrary channel.
 *
 * This bridge is not an authentication path. It carries no session, no key and
 * no unlock capability; the vault API surface lives in preload.js and is only
 * attached to the main window.
 */

const { contextBridge, ipcRenderer } = require("electron");

// Fixed checkpoints the main process can report. Unknown values are dropped so
// a future channel change cannot make the boot view say something it does not
// know to be true.
const STATES = new Set(["opening", "retrying", "interface_ready", "failed"]);

function sanitize(payload) {
  if (!payload || typeof payload.state !== "string" || !STATES.has(payload.state)) return null;
  return {
    state: payload.state,
    detail: typeof payload.detail === "string" ? payload.detail.slice(0, 400) : "",
    version: typeof payload.version === "string" ? payload.version.slice(0, 32) : "",
  };
}

const bridge = {
  onState(callback) {
    if (typeof callback !== "function") return () => {};
    const handler = (_event, payload) => {
      const state = sanitize(payload);
      if (state) callback(state);
    };
    ipcRenderer.on("boot:state", handler);
    return () => ipcRenderer.removeListener("boot:state", handler);
  },

  // One-way, whitelisted requests: the boot document can ask for nothing else.
  retry: () => ipcRenderer.send("boot:retry"),
  quit: () => ipcRenderer.send("boot:quit"),
};

contextBridge.exposeInMainWorld("knouxCryptBoot", bridge);
