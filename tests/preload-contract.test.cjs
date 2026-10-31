"use strict";

/**
 * Verifies the preload surface: only enumerated channels are exposed, no raw
 * ipcRenderer or Node primitives leak into the renderer, and unknown event
 * subscriptions are refused.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("module");

const invocations = [];
const listeners = new Map();
const exposed = {};

const fakeElectron = {
  contextBridge: {
    exposeInMainWorld: (key, value) => {
      exposed[key] = value;
    },
  },
  ipcRenderer: {
    invoke: async (channel, payload) => {
      invocations.push({ channel, payload });
      return { ok: true, data: {} };
    },
    on: (channel, fn) => {
      listeners.set(channel, fn);
    },
    removeListener: (channel) => {
      listeners.delete(channel);
    },
    send: (channel) => invocations.push({ channel, send: true }),
  },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") return fakeElectron;
  return originalLoad.call(this, request, parent, isMain);
};

require("../electron/preload.js");

test("preload exposes only the two expected bridges", () => {
  assert.deepEqual(Object.keys(exposed).sort(), ["electronAPI", "knouxcrypt"]);
});

test("no raw ipcRenderer, require or process leak into the renderer API", () => {
  const api = exposed.electronAPI;
  assert.equal(api.ipcRenderer, undefined);
  assert.equal(api.require, undefined);
  assert.equal(api.process, undefined);
  assert.equal(typeof api.vault, "object");
  assert.equal(typeof exposed.knouxcrypt.isElectron, "boolean");
});

test("the legacy disk surface fails closed instead of reaching arbitrary channels", async () => {
  const api = exposed.electronAPI;
  assert.equal(api.legacy.isSupported, false);
  const res = await api.legacy.invoke("get-system-info");
  assert.equal(res.ok, false);
  assert.equal(res.error.code, "UNSUPPORTED");
  // Subscribing to a legacy event must be inert, not a real ipcRenderer.on call.
  const unsubscribe = api.legacy.on("operation-progress", () => {});
  assert.equal(typeof unsubscribe, "function");
  assert.equal(listeners.has("operation-progress"), false);
  assert.equal(typeof api.removeListener, "function");
});

test("vault bridge calls the documented channels with the documented payloads", async () => {
  const api = exposed.electronAPI;
  invocations.length = 0;

  await api.vault.status();
  await api.vault.unlock("pw");
  await api.vault.encryptText("sid", "hello");
  await api.vault.lock("sid", "user");

  assert.deepEqual(invocations.map((i) => i.channel), [
    "vault:status",
    "vault:unlock",
    "vault:encrypt-text",
    "vault:lock",
  ]);
  assert.deepEqual(invocations[1].payload, { password: "pw" });
  assert.deepEqual(invocations[2].payload, { sessionId: "sid", text: "hello" });
  assert.deepEqual(invocations[3].payload, { sessionId: "sid", reason: "user" });
});

test("only allow-listed main-to-renderer events can be subscribed to", () => {
  const api = exposed.electronAPI;
  const allowed = api.on("vault:progress", () => {});
  assert.equal(typeof allowed, "function");
  assert.ok(listeners.has("vault:progress"));

  // An arbitrary channel must not register a listener.
  const refused = api.on("ipc-renderer-anything", () => {});
  assert.equal(typeof refused, "function");
  assert.equal(listeners.has("ipc-renderer-anything"), false);

  allowed();
  assert.equal(listeners.has("vault:progress"), false);
});

test("revocation events are subscribable through the documented surface", () => {
  const api = exposed.electronAPI;
  assert.equal(typeof api.vault.onRevoked, "function");

  const unsubscribe = api.vault.onRevoked(() => {});
  assert.equal(typeof unsubscribe, "function");
  assert.ok(listeners.has("vault:revoked"), "vault:revoked must be registered");

  unsubscribe();
  assert.equal(listeners.has("vault:revoked"), false);
});

test("subscriptions to non-allow-listed events never reach ipcRenderer", () => {
  const api = exposed.electronAPI;
  listeners.clear();
  api.on("vault:enroll", () => {});
  api.on("shell:exec", () => {});
  api.on("app-quit", () => {});
  assert.deepEqual([...listeners.keys()], [], "only allow-listed events may register a listener");
});

test("window controls are fire-and-forget on named channels", () => {
  const api = exposed.electronAPI;
  invocations.length = 0;
  api.window.minimize();
  api.window.maximize();
  api.window.close();
  assert.deepEqual(invocations.map((i) => i.channel), ["window-minimize", "window-maximize", "window-close"]);
});

test("batch 09 bridges call the documented channels", async () => {
  const api = exposed.electronAPI;
  invocations.length = 0;

  await api.vault.autofillGet();
  await api.vault.autofillUpdate({ suggestions: true });
  await api.vault.advisorFilters();
  await api.vault.advisorReview("Vault");
  await api.vault.pairingStart({ label: "x" });
  await api.vault.pairingStatus("sid");
  await api.vault.pairingConfirm("sid", { matches: true, phrase: "a b" });
  await api.vault.pairingCancel("sid");
  await api.vault.pairingList();
  await api.vault.passwordAudit("hunter2");

  assert.deepEqual(invocations.map((i) => i.channel), [
    "vault:autofill-get",
    "vault:autofill-update",
    "vault:advisor-filters",
    "vault:advisor-review",
    "vault:pairing-start",
    "vault:pairing-status",
    "vault:pairing-confirm",
    "vault:pairing-cancel",
    "vault:pairing-list",
    "vault:password-audit",
  ]);
  assert.deepEqual(invocations[1].payload, { suggestions: true });
  assert.deepEqual(invocations[3].payload, { filter: "Vault" });
  assert.deepEqual(invocations[6].payload, { sessionId: "sid", matches: true, phrase: "a b" });
  assert.deepEqual(invocations[9].payload, { input: "hunter2" });
});
