"use strict";

/**
 * App-scoped maintenance tests.
 *
 * The Repair section can only be honest if the numbers it shows come from real files
 * and the cleanup can only touch roots this service computed itself. These
 * tests build real temp trees on disk, exercise the scanner and the confirmed
 * cleaner, and drive the IPC surface with a stubbed Electron so the channel
 * contract is checked headlessly.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

const handlers = new Map();
const fakeElectron = {
  ipcMain: {
    handle: (channel, fn) => handlers.set(channel, fn),
    removeHandler: (channel) => handlers.delete(channel),
  },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") return fakeElectron;
  return originalLoad.call(this, request, parent, isMain);
};

const {
  MaintenanceService,
  MaintenanceError,
  PANELS,
} = require("../electron/maintenance/service");
const { registerMaintenanceIpc, CHANNELS } = require("../electron/maintenance/ipc");

function makeWorkspace() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "knoux-maintenance-"));
  const userData = path.join(base, "userData");
  const roots = [
    { id: "documents", label: "Decrypted document temp", path: path.join(userData, "vault-documents"), cleanable: true },
    { id: "cache", label: "Chromium cache", path: path.join(userData, "Cache"), cleanable: true },
    { id: "logs", label: "Application logs", path: path.join(userData, "logs"), cleanable: false },
  ];
  fs.mkdirSync(userData, { recursive: true });
  return { base, userData, roots };
}

async function writeFile(file, bytes) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, Buffer.alloc(bytes, 7));
}

async function exists(target) {
  try {
    await fsp.stat(target);
    return true;
  } catch {
    return false;
  }
}

test("the service refuses to start without a userData path", () => {
  assert.throws(() => new MaintenanceService({}), (err) => err instanceof MaintenanceError && err.code === "BAD_INPUT");
  assert.throws(() => new MaintenanceService({ userDataPath: "" }), (err) => err.code === "BAD_INPUT");
});

test("every configured root must stay inside the application data directory", () => {
  const { userData, base } = makeWorkspace();
  assert.throws(
    () => new MaintenanceService({
      userDataPath: userData,
      roots: [{ id: "escape", label: "Escape", path: path.join(base, "outside") }],
    }),
    (err) => err instanceof MaintenanceError && err.code === "BAD_INPUT",
  );
  assert.throws(
    () => new MaintenanceService({
      userDataPath: userData,
      roots: [{ id: "parent", label: "Parent", path: path.join(userData, "..") }],
    }),
    (err) => err.code === "BAD_INPUT",
  );
});

test("scan measures real files and reports real device facts", async () => {
  const { userData, roots } = makeWorkspace();
  try {
    await writeFile(path.join(userData, "vault-documents", "a.bin"), 1024);
    await writeFile(path.join(userData, "vault-documents", "nested", "b.bin"), 2048);
    await writeFile(path.join(userData, "Cache", "c.bin"), 512);
    await writeFile(path.join(userData, "logs", "app.log"), 256);

    const service = new MaintenanceService({ userDataPath: userData, roots });
    const scan = await service.scan();

    assert.equal(scan.scope, "app");
    assert.equal(scan.totalFiles, 4);
    assert.equal(scan.totalBytes, 3840);
    assert.equal(scan.cleanableBytes, 3584, "only cleanable roots count toward the cleanup total");
    assert.equal(scan.locations.find((entry) => entry.id === "documents").files, 2);
    assert.equal(scan.locations.find((entry) => entry.id === "documents").bytes, 3072);
    assert.equal(scan.locations.find((entry) => entry.id === "logs").cleanable, false);

    assert.equal(typeof scan.device.cpuCount, "number");
    assert.ok(scan.device.cpuCount >= 1);
    assert.ok(scan.device.memoryTotal > 0);
    assert.ok(scan.device.memoryUsed >= 0);
    assert.ok(scan.device.uptimeSeconds >= 0);
    assert.ok(scan.device.disk === null || scan.device.disk.totalBytes > 0);
  } finally {
    fs.rmSync(path.dirname(userData), { recursive: true, force: true });
  }
});

test("a missing root scans as zero instead of failing", async () => {
  const { userData, roots } = makeWorkspace();
  try {
    const service = new MaintenanceService({ userDataPath: userData, roots });
    const scan = await service.scan();
    assert.equal(scan.totalFiles, 0);
    assert.equal(scan.totalBytes, 0);
    assert.equal(scan.locations.length, 3);
    assert.equal(scan.locations.every((entry) => entry.files === 0 && entry.bytes === 0), true);
  } finally {
    fs.rmSync(path.dirname(userData), { recursive: true, force: true });
  }
});

test("the scanner stops at its depth limit instead of walking forever", async () => {
  const { userData, roots } = makeWorkspace();
  try {
    let deep = path.join(userData, "vault-documents");
    for (let i = 0; i < 9; i += 1) deep = path.join(deep, `d${i}`);
    await writeFile(path.join(deep, "buried.bin"), 4096);
    await writeFile(path.join(userData, "vault-documents", "shallow.bin"), 128);

    const service = new MaintenanceService({ userDataPath: userData, roots });
    const scan = await service.scan();
    const documents = scan.locations.find((entry) => entry.id === "documents");
    assert.equal(documents.files, 1, "the file below the depth limit is not counted");
    assert.equal(documents.bytes, 128);
    assert.ok(documents.skipped >= 1);
  } finally {
    fs.rmSync(path.dirname(userData), { recursive: true, force: true });
  }
});

test("cleanup requires explicit confirmation", async () => {
  const { userData, roots } = makeWorkspace();
  try {
    await writeFile(path.join(userData, "Cache", "c.bin"), 64);
    const service = new MaintenanceService({ userDataPath: userData, roots });
    await assert.rejects(() => service.clean({}), (err) => err instanceof MaintenanceError && err.code === "BAD_INPUT");
    await assert.rejects(() => service.clean({ confirm: "yes" }), (err) => err.code === "BAD_INPUT");
    assert.equal(await exists(path.join(userData, "Cache", "c.bin")), true, "nothing is deleted without confirm:true");
  } finally {
    fs.rmSync(path.dirname(userData), { recursive: true, force: true });
  }
});

test("a confirmed cleanup deletes only app-owned cleanable roots", async () => {
  const { userData, roots } = makeWorkspace();
  try {
    await writeFile(path.join(userData, "vault-documents", "a.bin"), 1024);
    await writeFile(path.join(userData, "Cache", "c.bin"), 512);
    await writeFile(path.join(userData, "logs", "app.log"), 256);
    const unrelated = path.join(userData, "unrelated", "keep.bin");
    await writeFile(unrelated, 2048);

    const service = new MaintenanceService({ userDataPath: userData, roots });
    const result = await service.clean({ confirm: true });

    assert.equal(result.scope, "app");
    assert.equal(result.removedFiles, 2);
    assert.equal(result.freedBytes, 1536);
    assert.equal(result.failedFiles, 0);
    assert.equal(await exists(path.join(userData, "vault-documents", "a.bin")), false);
    assert.equal(await exists(path.join(userData, "Cache", "c.bin")), false);
    assert.equal(await exists(path.join(userData, "logs", "app.log")), true, "non-cleanable roots are preserved");
    assert.equal(await exists(unrelated), true, "files outside the configured roots are untouched");
    assert.equal(await exists(path.join(userData, "vault-documents")), true, "directories are kept, only files are removed");

    const scan = await service.scan();
    assert.equal(scan.cleanableBytes, 0);
    assert.equal(scan.totalFiles, 1, "the preserved log is still counted");
  } finally {
    fs.rmSync(path.dirname(userData), { recursive: true, force: true });
  }
});

test("a payload cannot add a path or widen the cleanup roots", async () => {
  const { userData, roots, base } = makeWorkspace();
  try {
    const outside = path.join(base, "outside", "secret.bin");
    await writeFile(outside, 4096);
    await writeFile(path.join(userData, "Cache", "c.bin"), 64);

    const service = new MaintenanceService({ userDataPath: userData, roots });
    const result = await service.clean({
      confirm: true,
      path: outside,
      roots: [{ id: "outside", label: "Outside", path: path.join(base, "outside"), cleanable: true }],
    });

    assert.equal(result.removedFiles, 1);
    assert.equal(result.freedBytes, 64);
    assert.equal(await exists(outside), true, "a renderer-supplied path is ignored");
  } finally {
    fs.rmSync(path.dirname(userData), { recursive: true, force: true });
  }
});

test("selective cleanup deletes only the requested folder ids", async () => {
  const { userData, roots } = makeWorkspace();
  try {
    await writeFile(path.join(userData, "vault-documents", "a.bin"), 1024);
    await writeFile(path.join(userData, "Cache", "c.bin"), 512);
    await writeFile(path.join(userData, "logs", "app.log"), 256);

    const service = new MaintenanceService({ userDataPath: userData, roots });
    const result = await service.clean({ confirm: true, ids: ["documents"] });

    assert.deepEqual(result.selectedIds, ["documents"]);
    assert.equal(result.removedFiles, 1);
    assert.equal(result.freedBytes, 1024);
    assert.equal(await exists(path.join(userData, "vault-documents", "a.bin")), false);
    assert.equal(await exists(path.join(userData, "Cache", "c.bin")), true, "an unselected root is preserved");
    assert.equal(await exists(path.join(userData, "logs", "app.log")), true);

    const scan = await service.scan();
    assert.equal(scan.cleanableBytes, 512, "only the selected root was cleaned");
  } finally {
    fs.rmSync(path.dirname(userData), { recursive: true, force: true });
  }
});

test("selective cleanup deduplicates ids and skips non-cleanable roots", async () => {
  const { userData, roots } = makeWorkspace();
  try {
    await writeFile(path.join(userData, "vault-documents", "a.bin"), 128);
    await writeFile(path.join(userData, "logs", "app.log"), 256);

    const service = new MaintenanceService({ userDataPath: userData, roots });
    const result = await service.clean({ confirm: true, ids: ["documents", "documents", "logs"] });

    assert.deepEqual(result.selectedIds, ["documents", "logs"]);
    assert.equal(result.removedFiles, 1, "the duplicate id is not cleaned twice and the non-cleanable log root is skipped");
    assert.equal(result.freedBytes, 128);
    assert.equal(await exists(path.join(userData, "logs", "app.log")), true);
  } finally {
    fs.rmSync(path.dirname(userData), { recursive: true, force: true });
  }
});

test("selective cleanup refuses unknown, empty or malformed id lists", async () => {
  const { userData, roots } = makeWorkspace();
  try {
    await writeFile(path.join(userData, "Cache", "c.bin"), 64);
    const service = new MaintenanceService({ userDataPath: userData, roots });

    await assert.rejects(() => service.clean({ confirm: true, ids: [] }), (err) => err instanceof MaintenanceError && err.code === "BAD_INPUT");
    await assert.rejects(() => service.clean({ confirm: true, ids: "documents" }), (err) => err.code === "BAD_INPUT");
    await assert.rejects(() => service.clean({ confirm: true, ids: ["../escape"] }), (err) => err.code === "BAD_INPUT");
    await assert.rejects(() => service.clean({ confirm: true, ids: ["documents", "not-a-root"] }), (err) => err.code === "BAD_INPUT");
    assert.equal(await exists(path.join(userData, "Cache", "c.bin")), true, "a refused request deletes nothing");
  } finally {
    fs.rmSync(path.dirname(userData), { recursive: true, force: true });
  }
});

test("the IPC surface validates selective ids before reaching the service", async () => {
  const { userData, roots } = makeWorkspace();
  try {
    await writeFile(path.join(userData, "vault-documents", "a.bin"), 256);
    await writeFile(path.join(userData, "Cache", "c.bin"), 128);
    const service = new MaintenanceService({ userDataPath: userData, roots });
    const unregister = registerMaintenanceIpc({ service });
    const call = (channel, payload) => handlers.get(channel)({}, payload);

    const empty = await call(CHANNELS.CLEAN, { confirm: true, ids: [] });
    assert.equal(empty.ok, false);
    assert.equal(empty.error.code, "BAD_INPUT");

    const nonString = await call(CHANNELS.CLEAN, { confirm: true, ids: [42] });
    assert.equal(nonString.ok, false);
    assert.equal(nonString.error.code, "BAD_INPUT");

    const oversized = await call(CHANNELS.CLEAN, { confirm: true, ids: ["x".repeat(33)] });
    assert.equal(oversized.ok, false);
    assert.equal(oversized.error.code, "BAD_INPUT");

    const tooMany = await call(CHANNELS.CLEAN, { confirm: true, ids: Array.from({ length: 33 }, () => "documents") });
    assert.equal(tooMany.ok, false);
    assert.equal(tooMany.error.code, "BAD_INPUT");

    const unknown = await call(CHANNELS.CLEAN, { confirm: true, ids: ["not-a-root"] });
    assert.equal(unknown.ok, false);
    assert.equal(unknown.error.code, "BAD_INPUT");

    const cleaned = await call(CHANNELS.CLEAN, { confirm: true, ids: ["cache"] });
    assert.equal(cleaned.ok, true);
    assert.deepEqual(cleaned.data.selectedIds, ["cache"]);
    assert.equal(cleaned.data.removedFiles, 1);
    assert.equal(await exists(path.join(userData, "Cache", "c.bin")), false);
    assert.equal(await exists(path.join(userData, "vault-documents", "a.bin")), true, "the unselected root survives an IPC selective clean");

    unregister();
  } finally {
    fs.rmSync(path.dirname(userData), { recursive: true, force: true });
  }
});

test("info reports the real platform, app scope and the native panel inventory", async () => {
  const { userData, roots } = makeWorkspace();
  try {
    const service = new MaintenanceService({ userDataPath: userData, roots });
    const info = await service.info();
    assert.equal(info.platform, process.platform);
    assert.equal(info.windows, process.platform === "win32");
    assert.equal(info.scope, "app");
    assert.equal(info.cleansOsTemp, false);
    assert.equal(info.modifiesOsSettings, false);
    assert.deepEqual(info.panels.map((panel) => panel.id).sort(), Object.keys(PANELS).sort());
    assert.equal(info.panels.length, 5);
    assert.ok(info.panels.some((panel) => panel.id === "recovery"), "the recovery panel is part of the inventory");
  } finally {
    fs.rmSync(path.dirname(userData), { recursive: true, force: true });
  }
});

test("openPanel refuses an unknown panel before touching the shell", async () => {
  const { userData, roots } = makeWorkspace();
  try {
    let opened = null;
    const service = new MaintenanceService({
      userDataPath: userData,
      roots,
      openExternal: async (uri) => { opened = uri; },
    });
    await assert.rejects(() => service.openPanel({ panel: "definitely-not-a-panel" }), (err) => err instanceof MaintenanceError && err.code === "BAD_INPUT");
    assert.equal(opened, null, "the shell is never invoked for an unknown panel");
  } finally {
    fs.rmSync(path.dirname(userData), { recursive: true, force: true });
  }
});

test("openPanel uses the real Windows URI only on Windows", async () => {
  const { userData, roots } = makeWorkspace();
  try {
    const opened = [];
    const service = new MaintenanceService({
      userDataPath: userData,
      roots,
      openExternal: async (uri) => { opened.push(uri); },
    });

    if (process.platform === "win32") {
      const result = await service.openPanel({ panel: "apps" });
      assert.deepEqual(result, { opened: true, panel: "apps", uri: "ms-settings:appsfeatures" });
      assert.deepEqual(opened, ["ms-settings:appsfeatures"]);
    } else {
      await assert.rejects(() => service.openPanel({ panel: "apps" }), (err) => err.code === "UNAVAILABLE");
      assert.deepEqual(opened, []);
    }
  } finally {
    fs.rmSync(path.dirname(userData), { recursive: true, force: true });
  }
});

test("the IPC surface validates payloads and returns typed results", async () => {
  const { userData, roots } = makeWorkspace();
  try {
    await writeFile(path.join(userData, "vault-documents", "a.bin"), 1024);
    const service = new MaintenanceService({ userDataPath: userData, roots });
    const unregister = registerMaintenanceIpc({ service });
    const call = (channel, payload) => {
      const fn = handlers.get(channel);
      assert.ok(fn, `handler for ${channel} is registered`);
      return fn({}, payload);
    };

    const info = await call(CHANNELS.INFO);
    assert.equal(info.ok, true);
    assert.equal(info.data.scope, "app");

    const scan = await call(CHANNELS.SCAN);
    assert.equal(scan.ok, true);
    assert.equal(scan.data.totalFiles, 1);

    const refused = await call(CHANNELS.CLEAN, { confirm: "true" });
    assert.equal(refused.ok, false);
    assert.equal(refused.error.code, "BAD_INPUT");

    const nullPayload = await call(CHANNELS.CLEAN, null);
    assert.equal(nullPayload.ok, false);
    assert.equal(nullPayload.error.code, "BAD_INPUT");

    const cleaned = await call(CHANNELS.CLEAN, { confirm: true, roots: [{ path: userData }] });
    assert.equal(cleaned.ok, true);
    assert.equal(cleaned.data.removedFiles, 1);
    assert.equal(await exists(path.join(userData, "vault-documents", "a.bin")), false);

    const badPanel = await call(CHANNELS.OPEN_PANEL, { panel: 42 });
    assert.equal(badPanel.ok, false);
    assert.equal(badPanel.error.code, "BAD_INPUT");

    unregister();
    assert.equal(handlers.size, 0, "unregister removes every maintenance handler");
  } finally {
    fs.rmSync(path.dirname(userData), { recursive: true, force: true });
  }
});
