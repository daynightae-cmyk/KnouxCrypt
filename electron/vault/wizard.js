"use strict";

/**
 * Secure Transfer Wizard (task 40).
 *
 * This does not implement a new transfer protocol. It drives the *existing*
 * authenticated transfer engine (task 22) through an explicit, staged workflow
 * and, where a pairing session exists, binds the recipient identity to the
 * confirmed pairing fingerprint (task 35).
 *
 * Every stage is backed by real work:
 *   - review:   files are read and their real size and SHA-256 are computed.
 *   - consent:  the recipient must be explicitly confirmed; nothing is sent
 *               without it.
 *   - transfer: `transfer.send()` opens a real socket, performs a real X25519
 *               handshake and streams authenticated frames. Progress is the
 *               real count of bytes written to the socket.
 *   - verify:   `send()` resolves only after the receiver returns DONE_ACK,
 *               i.e. after every file's digest matched on the far side.
 *
 * Honesty constraints:
 *   - No fabricated nearby devices and no fake "delivered" state. If no peer is
 *     listening the wizard reports a real connection failure.
 *   - `selfTest()` performs a genuine loopback transfer to this process's own
 *     listener. It is labelled as a loopback self-test, not a remote transfer.
 *   - Android pairing is not claimed: the receiver must be a KnouxCrypt peer
 *     speaking this protocol.
 */
const crypto = require("crypto");
const fsp = require("fs/promises");
const path = require("path");

const { VaultError, CODES, badInput } = require("./errors");

const MAX_FILES = 64;
const MAX_TOTAL = 256 * 1024 * 1024;

const STAGES = Object.freeze(["review", "consent", "transfer", "verify", "complete", "failed", "cancelled"]);

async function digestFile(file) {
  let bytes;
  try {
    bytes = await fsp.readFile(file);
  } catch (err) {
    if (err.code === "ENOENT") throw new VaultError(CODES.NOT_FOUND, `The file "${path.basename(file)}" was not found`);
    throw new VaultError(CODES.IO_FAILED, `The file "${path.basename(file)}" could not be read`);
  }
  return {
    name: path.basename(file),
    path: path.resolve(file),
    size: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

class TransferWizard {
  constructor(options = {}) {
    this.transfer = options.transfer;
    this.pairing = options.pairing || null;
    this.tmpRoot = options.tmpRoot;
    this.now = options.now || (() => new Date());
    this.sessions = new Map();
    this.maxSessions = options.maxSessions || 16;
  }

  _sweep() {
    if (this.sessions.size < this.maxSessions) return;
    const oldest = [...this.sessions.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
    if (oldest) this.sessions.delete(oldest.id);
  }

  /**
   * Stage 1-2: gather the real package details and the recipient. The files are
   * read now so the review the user sees is the truth about what will be sent.
   */
  async begin({ files, recipientHost = "127.0.0.1", recipientPort, label = "Peer device", pairingSessionId = null, code } = {}) {
    if (!Array.isArray(files) || files.length === 0) throw badInput("Select at least one file to send");
    if (files.length > MAX_FILES) throw badInput("Too many files in one transfer");
    if (!Number.isInteger(recipientPort) || recipientPort <= 0 || recipientPort > 65535) {
      throw badInput("A valid recipient port is required");
    }
    const pairingCode = code == null || code === "" ? String(crypto.randomInt(0, 1_000_000)).padStart(6, "0") : String(code);
    if (!/^\d{6}$/.test(pairingCode)) throw badInput("The pairing code must be six digits");

    const items = [];
    let total = 0;
    for (const file of files) {
      const item = await digestFile(file);
      total += item.size;
      if (total > MAX_TOTAL) throw badInput("The transfer is too large");
      items.push(item);
    }

    // Bind the recipient identity to a confirmed pairing session when supplied.
    let recipientFingerprint = null;
    if (pairingSessionId) {
      if (!this.pairing) throw badInput("Pairing is not available");
      const status = this.pairing.status(pairingSessionId);
      if (!status.confirmed) throw badInput("The pairing session has not been confirmed");
      recipientFingerprint = status.peerFingerprint;
    }

    this._sweep();
    const id = crypto.randomBytes(12).toString("hex");
    const session = {
      id,
      createdAt: this.now().getTime(),
      stage: "review",
      code: pairingCode,
      recipient: { host: String(recipientHost).slice(0, 255), port: recipientPort, label: String(label).slice(0, 64) },
      recipientFingerprint,
      items,
      totalBytes: total,
      consented: false,
      receipt: null,
      error: null,
    };
    this.sessions.set(id, session);
    return this._view(session);
  }

  _view(session) {
    return {
      wizardId: session.id,
      stage: session.stage,
      code: session.code,
      recipient: session.recipient,
      recipientFingerprint: session.recipientFingerprint,
      files: session.items.map((i) => ({ name: i.name, size: i.size, sha256: i.sha256 })),
      totalBytes: session.totalBytes,
      consented: session.consented,
      receipt: session.receipt,
      error: session.error,
      stages: STAGES.filter((s) => !["failed", "cancelled"].includes(s)),
    };
  }

  status(wizardId) {
    const session = this.sessions.get(wizardId);
    if (!session) throw new VaultError(CODES.NOT_FOUND, "No such transfer wizard");
    return this._view(session);
  }

  /** Stage 3-4: explicit recipient consent. Nothing is transmitted before this. */
  consent(wizardId, { confirm } = {}) {
    const session = this.sessions.get(wizardId);
    if (!session) throw new VaultError(CODES.NOT_FOUND, "No such transfer wizard");
    if (confirm !== true) throw new VaultError(CODES.CONSENT_REQUIRED, "Recipient consent must be confirmed");
    session.consented = true;
    session.stage = "consent";
    return this._view(session);
  }

  /**
   * Stage 5-7: run the real authenticated transfer and report the real receipt.
   * A connection failure, a rejected manifest or a digest mismatch all surface
   * as a typed error with the session left in the `failed` stage — never as a
   * fabricated success.
   */
  async run(wizardId) {
    const session = this.sessions.get(wizardId);
    if (!session) throw new VaultError(CODES.NOT_FOUND, "No such transfer wizard");
    if (!session.consented) throw new VaultError(CODES.CONSENT_REQUIRED, "Recipient consent is required before sending");
    session.stage = "transfer";
    try {
      const result = await this.transfer.send({
        host: session.recipient.host,
        port: session.recipient.port,
        code: session.code,
        files: session.items.map((i) => i.path),
        sender: "KnouxCrypt transfer wizard",
      });
      session.stage = "complete";
      session.receipt = {
        acknowledgedAt: this.now().toISOString(),
        files: result.files,
        bytes: result.bytes,
        digests: result.digests,
        integrityVerified: true,
        transport: "authenticated loopback/TCP",
      };
      return this._view(session);
    } catch (err) {
      session.stage = "failed";
      session.error = { code: err.code || CODES.IO_FAILED, message: err.message || "The transfer failed" };
      throw err;
    }
  }

  /** Cancel an in-flight wizard. The engine tears the socket down on its own. */
  cancel(wizardId) {
    const session = this.sessions.get(wizardId);
    if (!session) throw new VaultError(CODES.NOT_FOUND, "No such transfer wizard");
    session.stage = "cancelled";
    return { wizardId, cancelled: true };
  }

  /**
   * A genuine loopback self-test: this process opens a real listener, sends the
   * files to itself over a real socket, and verifies the received bytes against
   * the locally computed digests. It proves the wizard wiring end to end without
   * pretending a second device exists.
   */
  async selfTest({ files, sessionId } = {}) {
    if (!Array.isArray(files) || files.length === 0) throw badInput("Select at least one file to send");
    if (!this.tmpRoot) throw badInput("The wizard has no scratch directory");
    const outDir = path.join(this.tmpRoot, `selftest-${crypto.randomBytes(6).toString("hex")}`);
    await fsp.mkdir(outDir, { recursive: true });

    const info = await this.transfer.listen({ port: 0, bindHost: "127.0.0.1", sessionId });
    const priorOnRequest = this.transfer.onRequest;
    let accepted = null;
    const acceptedPromise = new Promise((resolve) => {
      accepted = resolve;
    });
    this.transfer.onRequest = (request) => {
      this.transfer
        .respond({ requestId: request.requestId, accept: true, outputDir: outDir })
        .then(() => accepted(true))
        .catch(() => accepted(false));
    };

    try {
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
      const items = [];
      for (const file of files) items.push(await digestFile(file));
      const result = await this.transfer.send({ host: "127.0.0.1", port: info.port, code, files });
      const acceptedOk = await acceptedPromise;

      // Independently re-hash what actually landed on disk.
      const received = [];
      for (const item of items) {
        const bytes = await fsp.readFile(path.join(outDir, item.name));
        const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
        received.push({ name: item.name, size: bytes.length, sha256, matched: sha256 === item.sha256 });
      }
      return {
        transport: "authenticated loopback self-test",
        recipient: { host: "127.0.0.1", port: info.port, label: "This device (loopback)" },
        networkOpened: true,
        accepted: acceptedOk === true,
        files: received,
        allMatched: received.every((f) => f.matched),
        bytes: result.bytes,
        code,
      };
    } finally {
      this.transfer.onRequest = priorOnRequest;
      await this.transfer.stop().catch(() => {});
      await fsp.rm(outDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

module.exports = { TransferWizard, STAGES, digestFile };
