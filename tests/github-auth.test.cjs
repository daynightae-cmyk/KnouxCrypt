"use strict";

/**
 * GitHub sign-in is a real OAuth 2.0 Device Authorization flow. These tests
 * pin the security-relevant properties: no token ever leaves the service, the
 * device code never leaves the main process, polling follows RFC 8628, and
 * provider errors map to stable typed codes.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("module");

const {
  GitHubAuthService,
  GitHubAuthError,
  CODES,
  normalizeClientId,
  DEVICE_CODE_URL,
  TOKEN_URL,
  USER_URL,
} = require("../electron/auth/github");
const { GitHubConfigStore } = require("../electron/auth/config-store");

function response(data, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => (typeof data === "string" ? data : JSON.stringify(data)),
  };
}

function devicePayload(overrides) {
  return {
    device_code: "device-secret-code",
    user_code: "ABCD-1234",
    verification_uri: "https://github.com/login/device",
    verification_uri_complete: "https://github.com/login/device?user_code=ABCD-1234",
    expires_in: 900,
    interval: 5,
    ...overrides,
  };
}

function profilePayload(overrides) {
  return {
    id: 12345,
    login: "knoux-user",
    name: "Knoux User",
    html_url: "https://github.com/knoux-user",
    ...overrides,
  };
}

/** A fetch double that routes by URL and records every request. */
function router(routes) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const handler = routes[url];
    if (!handler) throw new Error(`unexpected fetch: ${url}`);
    return handler(calls.length, options);
  };
  return { fetchImpl, calls };
}

test("client ids are validated without pretending to know GitHub's format", () => {
  assert.equal(normalizeClientId("  Iv1.0123456789abcdef  "), "Iv1.0123456789abcdef");
  assert.equal(normalizeClientId("0123456789abcdef0123"), "0123456789abcdef0123");
  assert.throws(() => normalizeClientId("short"), (err) => err.code === CODES.BAD_INPUT);
  assert.throws(() => normalizeClientId("has spaces inside"), (err) => err.code === CODES.BAD_INPUT);
  assert.throws(() => normalizeClientId(""), (err) => err.code === CODES.BAD_INPUT);
  assert.throws(() => normalizeClientId(null), (err) => err.code === CODES.BAD_INPUT);
});

test("status is honest before any client id is configured", () => {
  const service = new GitHubAuthService({ fetchImpl: async () => { throw new Error("no network"); } });
  assert.deepEqual(service.status(), {
    configured: false,
    authenticated: false,
    user: null,
    pending: null,
    verificationUri: "https://github.com/login/device",
    scope: "read:user",
  });
  return assert.rejects(service.begin(), (err) => err.code === CODES.NOT_CONFIGURED);
});

test("begin requests a device code and returns only public flow state", async () => {
  const { fetchImpl, calls } = router({
    [DEVICE_CODE_URL]: () => response(devicePayload()),
  });
  const service = new GitHubAuthService({ fetchImpl, clientId: "Iv1.0123456789abcdef" });

  const session = await service.begin();

  assert.equal(session.userCode, "ABCD-1234");
  assert.equal(session.verificationUri, "https://github.com/login/device");
  assert.equal(session.interval, 5);
  assert.ok(session.id);
  assert.equal(session.deviceCode, undefined, "device code must stay in the main process");
  assert.ok(!JSON.stringify(session).includes("device-secret-code"));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, DEVICE_CODE_URL);
  assert.equal(calls[0].options.method, "POST");
  assert.match(calls[0].options.body, /client_id=Iv1\.0123456789abcdef/);
  assert.match(calls[0].options.body, /scope=read%3Auser/);
  assert.equal(calls[0].options.headers.Authorization, undefined, "device-code requests carry no token");

  assert.equal(service.status().pending.userCode, "ABCD-1234");
});

test("polling handles pending, slow_down, then completion without leaking the token", async () => {
  let now = 1_700_000_000_000;
  let tokenCalls = 0;
  const { fetchImpl, calls } = router({
    [DEVICE_CODE_URL]: () => response(devicePayload()),
    [TOKEN_URL]: () => {
      tokenCalls += 1;
      if (tokenCalls === 1) return response({ error: "authorization_pending" });
      if (tokenCalls === 2) return response({ error: "slow_down" });
      return response({ access_token: "gho_super_secret_token", token_type: "bearer", scope: "read:user" });
    },
    [USER_URL]: () => response(profilePayload()),
  });
  const service = new GitHubAuthService({
    fetchImpl,
    clientId: "Iv1.0123456789abcdef",
    now: () => now,
  });

  const session = await service.begin();
  const first = await service.poll(session.id);
  assert.equal(first.status, "pending");
  assert.equal(first.interval, 5);

  const second = await service.poll(session.id);
  assert.equal(second.status, "pending");
  assert.equal(second.interval, 10, "slow_down must add five seconds");

  const done = await service.poll(session.id);
  assert.equal(done.status, "complete");
  assert.equal(done.user.login, "knoux-user");
  assert.equal(done.user.name, "Knoux User");
  assert.equal(done.user.htmlUrl, "https://github.com/knoux-user");
  assert.ok(!JSON.stringify(done).includes("gho_super_secret_token"), "the access token must not be returned");
  assert.ok(!JSON.stringify(service.status()).includes("gho_super_secret_token"));

  // The token is used exactly once, in the Authorization header, and never
  // appears in a URL or a request body.
  const userCall = calls.find((c) => c.url === USER_URL);
  assert.equal(userCall.options.headers.Authorization, "Bearer gho_super_secret_token");
  assert.ok(!userCall.url.includes("gho_super_secret_token"));
  assert.equal(calls.filter((c) => c.url === USER_URL).length, 1);

  const tokenCallsSeen = calls.filter((c) => c.url === TOKEN_URL);
  assert.equal(tokenCallsSeen.length, 3);
  assert.match(tokenCallsSeen[0].options.body, /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code/);
  assert.match(tokenCallsSeen[0].options.body, /device_code=device-secret-code/);

  const status = service.status();
  assert.equal(status.authenticated, true);
  assert.equal(status.user.login, "knoux-user");
  assert.equal(status.pending, null);

  service.signOut();
  assert.equal(service.status().authenticated, false);
  assert.equal(service.status().user, null);
});

test("expired codes are rejected and the session is cleared", async () => {
  let now = 1_700_000_000_000;
  const { fetchImpl } = router({
    [DEVICE_CODE_URL]: () => response(devicePayload({ expires_in: 60 })),
  });
  const service = new GitHubAuthService({
    fetchImpl,
    clientId: "Iv1.0123456789abcdef",
    now: () => now,
  });
  const session = await service.begin();

  now += 61_000;
  await assert.rejects(service.poll(session.id), (err) => err.code === CODES.EXPIRED);
  assert.equal(service.status().pending, null);
  await assert.rejects(service.poll(session.id), (err) => err.code === CODES.NO_SESSION);
});

test("provider errors map to stable codes and do not reflect response bodies", async () => {
  const cases = [
    ["access_denied", CODES.ACCESS_DENIED],
    ["expired_token", CODES.EXPIRED],
    ["device_flow_disabled", CODES.DEVICE_FLOW_DISABLED],
    ["incorrect_client_credentials", CODES.PROVIDER],
    ["unsupported_grant_type", CODES.PROTOCOL],
    ["something_new", CODES.PROVIDER],
  ];

  for (const [providerError, expected] of cases) {
    const { fetchImpl } = router({
      [DEVICE_CODE_URL]: () => response(devicePayload()),
      [TOKEN_URL]: () => response({ error: providerError, error_description: "reflected-secret-detail" }),
    });
    const service = new GitHubAuthService({ fetchImpl, clientId: "Iv1.0123456789abcdef" });
    const session = await service.begin();
    await assert.rejects(service.poll(session.id), (err) => {
      assert.equal(err.code, expected);
      assert.ok(!err.message.includes("reflected-secret-detail"));
      return true;
    });
  }
});

test("network and malformed responses fail closed with typed errors", async () => {
  const offline = new GitHubAuthService({
    fetchImpl: async () => { throw new Error("ECONNREFUSED"); },
    clientId: "Iv1.0123456789abcdef",
  });
  await assert.rejects(offline.begin(), (err) => err.code === CODES.NETWORK);

  const html = new GitHubAuthService({
    fetchImpl: async () => response("<html>not json</html>"),
    clientId: "Iv1.0123456789abcdef",
  });
  await assert.rejects(html.begin(), (err) => err.code === CODES.PROTOCOL);

  const missingCode = new GitHubAuthService({
    fetchImpl: async () => response({ user_code: "ABCD-1234" }),
    clientId: "Iv1.0123456789abcdef",
  });
  await assert.rejects(missingCode.begin(), (err) => err.code === CODES.PROTOCOL);
});

test("a 404 from the device endpoint is reported as a configuration problem", async () => {
  const service = new GitHubAuthService({
    fetchImpl: async () => response({ error: "Not Found" }, 404),
    clientId: "Iv1.0123456789abcdef",
  });
  await assert.rejects(service.begin(), (err) => {
    assert.equal(err.code, CODES.PROVIDER);
    assert.match(err.message, /Device Flow|client ID/i);
    return true;
  });
});

test("cancel only cancels the matching authorization", async () => {
  const { fetchImpl } = router({ [DEVICE_CODE_URL]: () => response(devicePayload()) });
  const service = new GitHubAuthService({ fetchImpl, clientId: "Iv1.0123456789abcdef" });
  const session = await service.begin();

  assert.deepEqual(service.cancel("some-other-id"), { cancelled: false });
  assert.equal(service.status().pending.userCode, "ABCD-1234");
  assert.deepEqual(service.cancel(session.id), { cancelled: true });
  assert.equal(service.status().pending, null);
});

test("client id validation errors surface as typed GitHubAuthError instances", () => {
  try {
    normalizeClientId("bad id");
    assert.fail("expected a throw");
  } catch (err) {
    assert.ok(err instanceof GitHubAuthError);
    assert.equal(err.name, "GitHubAuthError");
    assert.equal(err.code, CODES.BAD_INPUT);
  }
});

test("the config store persists only the public client id", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "knoux-github-"));
  const filePath = path.join(dir, "auth", "github.json");
  const store = new GitHubConfigStore({ filePath });

  assert.deepEqual(store.read(), { clientId: "" });
  store.write({ clientId: "Iv1.0123456789abcdef" });
  assert.deepEqual(store.read(), { clientId: "Iv1.0123456789abcdef" });

  const raw = fs.readFileSync(filePath, "utf8");
  assert.ok(raw.includes("Iv1.0123456789abcdef"));
  assert.ok(!/token|secret/i.test(raw), "the config file must not grow credential fields");
  store.clear();
  assert.deepEqual(store.read(), { clientId: "" });
});

test("the IPC boundary validates input, persists configuration and blocks non-GitHub links", async () => {
  const handlers = new Map();
  const opened = [];
  const fakeElectron = {
    ipcMain: {
      handle: (channel, fn) => handlers.set(channel, fn),
      removeHandler: (channel) => handlers.delete(channel),
    },
    shell: {
      openExternal: async (url) => { opened.push(url); },
    },
  };

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "electron") return fakeElectron;
    return originalLoad.call(this, request, parent, isMain);
  };
  let ipc;
  try {
    ipc = require("../electron/auth/ipc.js");
  } finally {
    Module._load = originalLoad;
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "knoux-github-ipc-"));
  const store = new GitHubConfigStore({ filePath: path.join(dir, "github.json") });
  const service = new GitHubAuthService({ fetchImpl: async () => { throw new Error("no network in this test"); } });
  const unregister = ipc.registerGitHubAuthIpc({ service, store });

  const call = (channel, payload) => handlers.get(channel)({}, payload);

  const before = await call(ipc.CHANNELS.STATUS);
  assert.equal(before.ok, true);
  assert.equal(before.data.configured, false);

  const invalid = await call(ipc.CHANNELS.CONFIGURE, { clientId: "nope" });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, CODES.BAD_INPUT);
  assert.equal(store.read().clientId, "");

  const configured = await call(ipc.CHANNELS.CONFIGURE, { clientId: "Iv1.0123456789abcdef" });
  assert.equal(configured.ok, true);
  assert.equal(configured.data.configured, true);
  assert.equal(store.read().clientId, "Iv1.0123456789abcdef");

  const evil = await call(ipc.CHANNELS.OPEN, { url: "https://evil.example/login" });
  assert.equal(evil.ok, false);
  assert.equal(evil.error.code, CODES.BAD_INPUT);
  assert.deepEqual(opened, []);

  const legit = await call(ipc.CHANNELS.OPEN, { url: "https://github.com/login/device?user_code=ABCD-1234" });
  assert.equal(legit.ok, true);
  assert.deepEqual(opened, ["https://github.com/login/device?user_code=ABCD-1234"]);

  const missingSession = await call(ipc.CHANNELS.POLL, {});
  assert.equal(missingSession.ok, false);
  assert.equal(missingSession.error.code, CODES.BAD_INPUT);

  const internal = await call(ipc.CHANNELS.BEGIN);
  assert.equal(internal.ok, false);
  assert.equal(internal.error.code, "GH_NETWORK");

  unregister();
  assert.equal(handlers.size, 0);
});
