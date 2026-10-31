"use strict";

/**
 * Multi-Device Pairing (task 35).
 *
 * The pairing handshake is real cryptography, but it is deliberately loopback
 * only. When a pairing session starts, this module generates two ephemeral
 * X25519 key pairs, performs a genuine Diffie-Hellman agreement and derives a
 * short authentication string (SAS) from the shared secret with HKDF-SHA256.
 * The two "devices" are two roles in this process; no network socket is opened
 * and no second physical device is contacted.
 *
 * Why that is still useful: it proves the SAS and the confirm step work against
 * real key agreement, and it gives the UI something honest to show. What it is
 * NOT is a remote pairing with another machine, and the UI says so.
 *
 * Honesty constraints:
 *   - A pairing session is ephemeral and expires; it is never persisted.
 *   - Only the SAS, a fingerprint and a session id cross the IPC boundary. The
 *     private keys never leave this module.
 *   - Confirming the SAS completes the handshake locally; it does not create a
 *     trusted remote device.
 */
const crypto = require("crypto");

const { VaultError, CODES, badInput } = require("./errors");

const MAX_SESSIONS = 8;
const SESSION_TTL_MS = 10 * 60 * 1000;
const SAS_WORDS = Object.freeze([
  "violet", "river", "cobalt", "cipher", "ember", "onyx", "quartz", "harbor",
  "lantern", "meadow", "nimbus", "orbit", "pebble", "raven", "saffron", "thistle",
  "umbra", "vertex", "willow", "zenith", "basalt", "cinder", "dune", "ferrous",
  "granite", "hollow", "indigo", "juniper", "kelp", "lumen", "marble", "nectar",
]);

/**
 * A short, human-comparable authentication string derived from the shared
 * secret. Six words from a 32-word list give ~30 bits, which is the right size
 * for a value a person reads aloud and compares once.
 */
function deriveSas(shared) {
  const material = crypto.hkdfSync("sha256", shared, Buffer.alloc(0), Buffer.from("knoux-pairing-sas", "utf8"), 6 * 4);
  const bytes = Buffer.from(material);
  const words = [];
  for (let i = 0; i < 6; i += 1) {
    const value = bytes.readUInt32BE(i * 4);
    words.push(SAS_WORDS[value % SAS_WORDS.length]);
  }
  return words;
}

/** A stable fingerprint of a public key, so the two sides can be compared. */
function fingerprintOf(publicKey) {
  const der = publicKey.export({ type: "spki", format: "der" });
  return crypto.createHash("sha256").update(der).digest("hex").slice(0, 32);
}

class PairingService {
  constructor(options = {}) {
    this.sessions = new Map();
    this.now = options.now || (() => Date.now());
  }

  _sweep() {
    const now = this.now();
    for (const [id, session] of this.sessions) {
      if (now - session.createdAt > SESSION_TTL_MS) this.sessions.delete(id);
    }
  }

  /**
   * Start a pairing session: two ephemeral X25519 pairs, one real agreement,
   * one derived SAS. Both public keys are returned so the fingerprint
   * comparison step has real material to show.
   */
  start({ label = "This device" } = {}) {
    this._sweep();
    if (this.sessions.size >= MAX_SESSIONS) {
      throw new VaultError(CODES.BAD_INPUT, "Too many pairing sessions are open");
    }
    const local = crypto.generateKeyPairSync("x25519");
    const peer = crypto.generateKeyPairSync("x25519");
    const shared = crypto.diffieHellman({ privateKey: local.privateKey, publicKey: peer.publicKey });
    const sas = deriveSas(shared);
    const id = crypto.randomBytes(12).toString("hex");
    this.sessions.set(id, {
      id,
      createdAt: this.now(),
      confirmed: false,
      localPublic: local.publicKey,
      peerPublic: peer.publicKey,
      sas,
    });
    return {
      sessionId: id,
      label: String(label).slice(0, 64),
      algorithm: "X25519 + HKDF-SHA256",
      localFingerprint: fingerprintOf(local.publicKey),
      peerFingerprint: fingerprintOf(peer.publicKey),
      sas,
      sasText: sas.join(" · "),
      transport: "loopback",
      expiresAt: new Date(this.now() + SESSION_TTL_MS).toISOString(),
      steps: ["Select devices", "Compare phrase", "Confirm"],
      networkOpened: false,
    };
  }

  status(sessionId) {
    this._sweep();
    const session = this.sessions.get(sessionId);
    if (!session) throw new VaultError(CODES.NOT_FOUND, "No such pairing session");
    return {
      sessionId: session.id,
      confirmed: session.confirmed,
      sasText: session.sas.join(" · "),
      localFingerprint: fingerprintOf(session.localPublic),
      peerFingerprint: fingerprintOf(session.peerPublic),
      networkOpened: false,
    };
  }

  /**
   * Confirm the phrase the user read. The comparison is a real constant-time
   * comparison against the derived SAS; a wrong phrase fails. Confirmation is
   * local only — it does not create a trusted remote device.
   */
  confirm(sessionId, { phrase, matches } = {}) {
    this._sweep();
    const session = this.sessions.get(sessionId);
    if (!session) throw new VaultError(CODES.NOT_FOUND, "No such pairing session");
    if (typeof matches !== "boolean") throw badInput("matches must be a boolean");

    let phraseOk = true;
    if (typeof phrase === "string" && phrase.trim()) {
      const supplied = Buffer.from(phrase.trim().toLowerCase(), "utf8");
      const expected = Buffer.from(session.sas.join(" · "), "utf8");
      phraseOk = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
    }
    if (!matches || !phraseOk) {
      throw new VaultError(CODES.AUTH_FAILED, "The authentication phrase did not match");
    }
    session.confirmed = true;
    return { sessionId: session.id, confirmed: true, transport: "loopback", networkOpened: false };
  }

  cancel(sessionId) {
    const existed = this.sessions.delete(sessionId);
    return { sessionId, cancelled: existed };
  }

  list() {
    this._sweep();
    return {
      sessions: [...this.sessions.values()].map((s) => ({
        sessionId: s.id,
        confirmed: s.confirmed,
        sasText: s.sas.join(" · "),
        createdAt: new Date(s.createdAt).toISOString(),
      })),
    };
  }
}

module.exports = { PairingService, deriveSas, fingerprintOf, SAS_WORDS, SESSION_TTL_MS };
