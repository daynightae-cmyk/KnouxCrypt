"use strict";

/**
 * Real GitHub authentication through the OAuth 2.0 Device Authorization Grant
 * (RFC 8628). This module runs in the Electron main process because the GitHub
 * OAuth endpoints do not send CORS headers and therefore cannot be called from
 * the renderer.
 *
 * Security contract:
 *   - The access token is used once, in this process, to read the public
 *     profile, and is then dropped. It is never returned to the renderer, never
 *     written to disk, and never used to unlock the local vault.
 *   - Only public identity fields (login, display name, id, profile URL) leave
 *     this module.
 *   - Every failure is a typed error with a fixed, non-reflective message so a
 *     provider response body cannot leak into the UI or the logs.
 *   - The client id is public by design in the device flow; no client secret is
 *     accepted or stored.
 */

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";
const VERIFICATION_URI = "https://github.com/login/device";

const SCOPES = "read:user";

const CODES = Object.freeze({
  NOT_CONFIGURED: "GH_NOT_CONFIGURED",
  BAD_INPUT: "GH_BAD_INPUT",
  NETWORK: "GH_NETWORK",
  PROVIDER: "GH_PROVIDER",
  DEVICE_FLOW_DISABLED: "GH_DEVICE_FLOW_DISABLED",
  EXPIRED: "GH_EXPIRED",
  ACCESS_DENIED: "GH_ACCESS_DENIED",
  NO_SESSION: "GH_NO_SESSION",
  PROTOCOL: "GH_PROTOCOL",
});

class GitHubAuthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GitHubAuthError";
    this.code = code;
  }
}

/**
 * GitHub client ids are public identifiers. OAuth Apps use a 20-character hex
 * id; GitHub Apps use prefixed ids such as `Iv1.0123...`. Accept both shapes
 * without trying to be clever about a provider we do not control.
 */
function normalizeClientId(value) {
  if (typeof value !== "string") {
    throw new GitHubAuthError(CODES.BAD_INPUT, "A GitHub OAuth App client ID is required.");
  }
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9._-]{10,64}$/.test(trimmed)) {
    throw new GitHubAuthError(
      CODES.BAD_INPUT,
      "That does not look like a GitHub client ID. Copy the Client ID from your OAuth App settings.",
    );
  }
  return trimmed;
}

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

async function readJson(fetchImpl, url, options) {
  let response;
  // A provider that never answers must not leave the sign-in panel waiting
  // forever. The signal also bounds reading the response body.
  const signal =
    typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(20000)
      : undefined;
  try {
    response = await fetchImpl(url, signal ? { ...options, signal } : options);
  } catch {
    throw new GitHubAuthError(CODES.NETWORK, "Could not reach GitHub. Check your connection and try again.");
  }
  let text;
  try {
    text = await response.text();
  } catch {
    throw new GitHubAuthError(CODES.NETWORK, "The GitHub response could not be read.");
  }
  if (!text) {
    throw new GitHubAuthError(CODES.PROTOCOL, "GitHub returned an empty response.");
  }
  try {
    return { status: response.status, data: JSON.parse(text) };
  } catch {
    // Do not include the body: it is untrusted and may contain credentials.
    throw new GitHubAuthError(CODES.PROTOCOL, "GitHub returned a response this app could not parse.");
  }
}

function mapProviderError(code) {
  switch (code) {
    case "authorization_pending":
      return null;
    case "slow_down":
      return null;
    case "expired_token":
      return new GitHubAuthError(CODES.EXPIRED, "This GitHub sign-in code expired. Start again.");
    case "access_denied":
      return new GitHubAuthError(CODES.ACCESS_DENIED, "GitHub sign-in was cancelled on the GitHub page.");
    case "device_flow_disabled":
      return new GitHubAuthError(
        CODES.DEVICE_FLOW_DISABLED,
        "Device Flow is disabled for this OAuth App. Enable it in the GitHub OAuth App settings.",
      );
    case "incorrect_client_credentials":
    case "unauthorized_client":
      return new GitHubAuthError(
        CODES.PROVIDER,
        "GitHub rejected this client ID. Check that it belongs to an OAuth App with Device Flow enabled.",
      );
    case "unsupported_grant_type":
      return new GitHubAuthError(CODES.PROTOCOL, "GitHub did not accept the device grant for this app.");
    default:
      return new GitHubAuthError(CODES.PROVIDER, "GitHub refused the sign-in request.");
  }
}

class GitHubAuthService {
  /**
   * @param {object} options
   * @param {Function} [options.fetchImpl] injectable fetch for tests
   * @param {string} [options.clientId] public OAuth App client id
   * @param {string} [options.userAgent]
   * @param {Function} [options.now]
   * @param {Function} [options.randomId]
   */
  constructor(options) {
    const opts = options || {};
    this._fetch = opts.fetchImpl || globalThis.fetch;
    this._userAgent = opts.userAgent || "KnouxCrypt/2025.1.0";
    this._now = opts.now || (() => Date.now());
    this._randomId = opts.randomId || (() => require("node:crypto").randomUUID());
    this._clientId = "";
    this._identity = null;
    this._session = null;
    this._pollInFlight = null;
    if (opts.clientId) this.setClientId(opts.clientId);
  }

  setClientId(value) {
    const normalized = normalizeClientId(value);
    if (normalized !== this._clientId) {
      // A pending code belongs to the previous OAuth App.
      this._session = null;
    }
    this._clientId = normalized;
    return normalized;
  }

  get clientId() {
    return this._clientId;
  }

  status() {
    return {
      // The configured state is knowable without a network call.
      configured: Boolean(this._clientId),
      authenticated: Boolean(this._identity),
      user: this._identity,
      pending: this._publicSession(),
      verificationUri: VERIFICATION_URI,
      scope: SCOPES,
    };
  }

  _publicSession() {
    const session = this._session;
    if (!session) return null;
    const expiresIn = Math.max(0, Math.ceil((session.expiresAt - this._now()) / 1000));
    if (expiresIn <= 0) return null;
    return {
      id: session.id,
      userCode: session.userCode,
      verificationUri: session.verificationUri,
      verificationUriComplete: session.verificationUriComplete || null,
      expiresIn,
      interval: session.interval,
    };
  }

  async begin() {
    if (!this._clientId) {
      throw new GitHubAuthError(
        CODES.NOT_CONFIGURED,
        "GitHub sign-in needs an OAuth App client ID. Add one in the setup panel first.",
      );
    }

    // Re-use a live code rather than starting a second device authorization.
    if (this._session) {
      const live = this._publicSession();
      if (live) return live;
      this._session = null;
    }

    const body = new URLSearchParams({ client_id: this._clientId, scope: SCOPES });
    const { status, data } = await readJson(this._fetch, DEVICE_CODE_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": this._userAgent,
      },
      body: body.toString(),
    });

    if (!data || typeof data !== "object") {
      throw new GitHubAuthError(CODES.PROTOCOL, "GitHub returned an unexpected device-code response.");
    }
    if (status === 404) {
      throw new GitHubAuthError(
        CODES.PROVIDER,
        "GitHub did not recognise this client ID, or Device Flow is not enabled for it.",
      );
    }
    if (data.error) {
      const mapped = mapProviderError(data.error);
      if (mapped) throw mapped;
      throw new GitHubAuthError(CODES.PROVIDER, "GitHub refused to issue a sign-in code.");
    }
    if (
      typeof data.device_code !== "string" ||
      !data.device_code ||
      typeof data.user_code !== "string" ||
      !data.user_code
    ) {
      throw new GitHubAuthError(CODES.PROTOCOL, "GitHub did not return a usable sign-in code.");
    }

    const expiresIn = toInt(data.expires_in, 900);
    const interval = toInt(data.interval, 5);
    this._session = {
      id: this._randomId(),
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri:
        typeof data.verification_uri === "string" && data.verification_uri
          ? data.verification_uri
          : VERIFICATION_URI,
      verificationUriComplete:
        typeof data.verification_uri_complete === "string" ? data.verification_uri_complete : null,
      interval,
      expiresAt: this._now() + expiresIn * 1000,
    };

    return this._publicSession();
  }

  async poll(sessionId) {
    if (!this._session || this._session.id !== sessionId) {
      throw new GitHubAuthError(CODES.NO_SESSION, "This GitHub sign-in request is no longer active. Start again.");
    }
    if (this._pollInFlight) return this._pollInFlight;

    this._pollInFlight = this._poll()
      .finally(() => {
        this._pollInFlight = null;
      });
    return this._pollInFlight;
  }

  async _poll() {
    const session = this._session;
    if (!session) {
      throw new GitHubAuthError(CODES.NO_SESSION, "This GitHub sign-in request is no longer active. Start again.");
    }
    if (this._now() >= session.expiresAt) {
      this._session = null;
      throw new GitHubAuthError(CODES.EXPIRED, "This GitHub sign-in code expired. Start again.");
    }

    const body = new URLSearchParams({
      client_id: this._clientId,
      device_code: session.deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });

    const { data } = await readJson(this._fetch, TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": this._userAgent,
      },
      body: body.toString(),
    });

    if (!data || typeof data !== "object") {
      throw new GitHubAuthError(CODES.PROTOCOL, "GitHub returned an unexpected token response.");
    }

    if (data.error) {
      if (data.error === "authorization_pending") {
        return this._pendingResult();
      }
      if (data.error === "slow_down") {
        // RFC 8628 section 3.5: increase the polling interval by 5 seconds.
        session.interval += 5;
        return this._pendingResult();
      }
      const mapped = mapProviderError(data.error);
      this._session = null;
      throw mapped || new GitHubAuthError(CODES.PROVIDER, "GitHub refused the sign-in request.");
    }

    const accessToken = data.access_token;
    if (typeof accessToken !== "string" || !accessToken) {
      throw new GitHubAuthError(CODES.PROTOCOL, "GitHub approved the sign-in but returned no token.");
    }

    // The token stays a local binding for exactly this call. It is never
    // stored on the session, the instance, or disk, and never returned.
    const user = await this._fetchIdentity(accessToken);

    this._session = null;
    this._identity = user;
    return { status: "complete", interval: 0, user };
  }

  _pendingResult() {
    const session = this._session;
    const expiresIn = session ? Math.max(0, Math.ceil((session.expiresAt - this._now()) / 1000)) : 0;
    return {
      status: "pending",
      interval: session ? session.interval : 5,
      expiresIn,
    };
  }

  async _fetchIdentity(accessToken) {
    const { data } = await readJson(this._fetch, USER_URL, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": this._userAgent,
      },
    });

    if (!data || typeof data !== "object" || typeof data.login !== "string" || !data.login) {
      throw new GitHubAuthError(CODES.PROTOCOL, "GitHub approved the sign-in but the profile could not be read.");
    }

    return {
      id: typeof data.id === "number" ? data.id : null,
      login: data.login,
      name: typeof data.name === "string" && data.name ? data.name : null,
      htmlUrl:
        typeof data.html_url === "string" && data.html_url.startsWith("https://github.com/")
          ? data.html_url
          : `https://github.com/${data.login}`,
      fetchedAt: this._now(),
    };
  }

  cancel(sessionId) {
    if (!this._session) return { cancelled: false };
    if (sessionId && this._session.id !== sessionId) return { cancelled: false };
    this._session = null;
    return { cancelled: true };
  }

  signOut() {
    this._session = null;
    this._identity = null;
    return { signedOut: true };
  }
}

module.exports = {
  GitHubAuthService,
  GitHubAuthError,
  CODES,
  normalizeClientId,
  DEVICE_CODE_URL,
  TOKEN_URL,
  USER_URL,
  VERIFICATION_URI,
  SCOPES,
};
