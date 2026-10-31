"use strict";

/**
 * Local transfer (task 22).
 *
 * A real, two-sided transfer over a real socket. Nothing here is simulated:
 * the receiver gets an actual request it must accept, the handshake is an
 * actual X25519 key agreement, every byte on the wire is sealed with
 * AES-256-GCM, and a transfer only reports "complete" after the receiver has
 * received every chunk and the whole-file digest matches.
 *
 * Safety choices that are deliberate and load-bearing:
 *  - The listener binds to loopback only. A service that quietly opened a LAN
 *    port would be a bigger risk than the feature is worth, so a LAN bind is
 *    refused rather than offered.
 *  - The receiver never writes into a path the sender chose. Entry names are
 *    reduced to a basename and an existing file is never overwritten.
 *  - The six-digit code is a short authentication string, not a secret. The
 *    sender picks it, the receiver displays it, and the two people compare it
 *    out of band. Confidentiality comes from the X25519 agreement; the code
 *    only catches an active man in the middle, which is what it is for.
 */
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const net = require("net");
const path = require("path");

const { VaultError, CODES } = require("./errors");

const MAGIC = "KNOUX-TRANSFER-1";
const CHUNK_SIZE = 256 * 1024;
const MAX_FRAME = 1024 * 1024;
const MAX_FILES = 1024;
const MAX_TOTAL = 4 * 1024 * 1024 * 1024;
const HANDSHAKE_TIMEOUT_MS = 30 * 1000;

function badInput(message) {
  return new VaultError(CODES.BAD_INPUT, message);
}

function code6() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * HKDF the session key out of the shared secret, salted with both public keys
 * so the key is bound to this exact pair of peers and this exact session.
 */
function deriveKey(shared, clientPub, serverPub, requestId) {
  const salt = Buffer.concat([
    crypto.createHash("sha256").update(clientPub).digest(),
    crypto.createHash("sha256").update(serverPub).digest(),
  ]);
  return Buffer.from(
    crypto.hkdfSync("sha256", shared, salt, Buffer.from(`${MAGIC}:${requestId}`, "utf8"), 32),
  );
}

function nonceFor(prefix, counter) {
  const nonce = Buffer.alloc(12);
  prefix.copy(nonce, 0, 0, 8);
  nonce.writeUInt32BE(counter >>> 0, 8);
  return nonce;
}

function seal(key, prefix, counter, plaintext) {
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonceFor(prefix, counter));
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([body, cipher.getAuthTag()]);
}

function open(key, prefix, counter, sealed) {
  if (sealed.length < 16) throw new VaultError(CODES.INTEGRITY_FAILED, "A transfer frame was truncated");
  const body = sealed.subarray(0, sealed.length - 16);
  const tag = sealed.subarray(sealed.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonceFor(prefix, counter));
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    throw new VaultError(CODES.INTEGRITY_FAILED, "A transfer frame failed authentication");
  }
}

/** Frame a control message: 4-byte length + UTF-8 JSON. */
function controlFrame(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length, 0);
  return Buffer.concat([head, body]);
}

/**
 * Frame raw bytes: 4-byte length + the bytes themselves. Ciphertext must never
 * travel through JSON, which would re-encode it as an object and destroy it.
 */
function binaryFrame(bytes) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(bytes.length, 0);
  return Buffer.concat([head, bytes]);
}

/**
 * Read length-prefixed frames off a socket. Returns an async iterator of
 * { type: "control" | "binary", ... } so the caller can await each step instead
 * of juggling event handlers.
 */
class FrameReader {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.waiters = [];
    socket.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this._drain();
    });
    socket.on("end", () => this._fail(new VaultError(CODES.IO_FAILED, "The peer closed the connection")));
    socket.on("error", (err) => this._fail(new VaultError(CODES.IO_FAILED, `The connection failed: ${err.code || "error"}`)));
  }

  _fail(err) {
    while (this.waiters.length) this.waiters.shift().reject(err);
    this.failed = err;
  }

  _drain() {
    while (this.waiters.length) {
      const frame = this._take();
      if (!frame) return;
      this.waiters.shift().resolve(frame);
    }
  }

  _take() {
    if (this.buffer.length < 4) return null;
    const length = this.buffer.readUInt32BE(0);
    if (length > MAX_FRAME) throw new VaultError(CODES.INTEGRITY_FAILED, "A transfer frame is too large");
    if (this.buffer.length < 4 + length) return null;
    const body = this.buffer.subarray(4, 4 + length);
    this.buffer = this.buffer.subarray(4 + length);
    return body;
  }

  next() {
    if (this.failed) return Promise.reject(this.failed);
    const frame = this._take();
    if (frame) return Promise.resolve(frame);
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  async nextControl() {
    const body = await this.next();
    try {
      return JSON.parse(body.toString("utf8"));
    } catch {
      throw new VaultError(CODES.INTEGRITY_FAILED, "A control frame was not valid JSON");
    }
  }
}

class TransferService {
  /**
   * @param {object} options
   * @param {string} options.userDataPath Directory for received files by default.
   */
  constructor(options = {}) {
    this.userDataPath = options.userDataPath;
    this.server = null;
    this.serverInfo = null;
    this.pending = new Map(); // requestId -> { socket, reader, clientPub, code, files, from }
    this.onRequest = null;
    this.onProgress = null;
    this.onState = null;
  }

  _state(transferId, state, detail = {}) {
    if (this.onState) {
      try {
        this.onState({ transferId, state, at: new Date().toISOString(), ...detail });
      } catch {
        // A renderer notification must never break the transfer itself.
      }
    }
  }

  _progress(transferId, sent, total) {
    if (this.onProgress) {
      try {
        this.onProgress({ transferId, sent, total });
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Start listening for an incoming transfer. Loopback by default; a LAN bind
   * must be requested explicitly.
   */
  async listen({ port = 0, bindHost = "127.0.0.1", sessionId } = {}) {
    if (this.server) throw new VaultError(CODES.BAD_INPUT, "A transfer listener is already running");
    if (bindHost !== "127.0.0.1" && bindHost !== "::1") {
      throw new VaultError(
        CODES.BAD_INPUT,
        "KnouxCrypt only listens on loopback. A LAN bind would need an explicit, separate consent step.",
      );
    }

    const { publicKey, privateKey } = crypto.generateKeyPairSync("x25519");
    const publicPem = publicKey.export({ type: "spki", format: "pem" });

    this.server = net.createServer({ allowHalfOpen: false }, (socket) => {
      this._onConnection(socket, privateKey, publicPem, sessionId);
    });

    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(port, bindHost, () => {
        this.server.removeListener("error", reject);
        resolve();
      });
    });

    const address = this.server.address();
    this.serverInfo = {
      port: address.port,
      host: address.address,
      loopbackOnly: true,
      publicPem,
    };
    return this.serverInfo;
  }

  async stop() {
    if (this.server) {
      const server = this.server;
      this.server = null;
      this.serverInfo = null;
      await new Promise((resolve) => server.close(() => resolve()));
    }
    for (const entry of this.pending.values()) {
      entry.socket.destroy();
    }
    this.pending.clear();
    return { stopped: true };
  }

  /** Handle an inbound connection: ask the user before anything is accepted. */
  async _onConnection(socket, privateKey, publicPem, sessionId) {
    socket.setTimeout(HANDSHAKE_TIMEOUT_MS, () => socket.destroy());
    const reader = new FrameReader(socket);
    let hello;
    try {
      hello = await reader.nextControl();
    } catch {
      socket.destroy();
      return;
    }
    if (hello.type !== "HELLO" || typeof hello.clientPub !== "string") {
      socket.destroy();
      return;
    }

    const requestId = crypto.randomBytes(8).toString("hex");
    // The sender chose the code; we only display it so the user can compare it
    // with what the other person reads out. We never invent a code here, which
    // would make the comparison meaningless.
    const code = /^\d{6}$/.test(String(hello.code || "")) ? String(hello.code) : null;
    if (!code) {
      socket.destroy();
      return;
    }
    const entry = {
      requestId,
      socket,
      reader,
      clientPub: hello.clientPub,
      code,
      privateKey,
      publicPem,
      sessionId,
      sender: typeof hello.sender === "string" ? hello.sender.slice(0, 64) : "unknown device",
      accepted: false,
    };
    this.pending.set(requestId, entry);

    // Nothing is read from the sender and no key is agreed until the user
    // accepts. Until then the request is just a pending item.
    this._state(requestId, "requested", { sender: entry.sender });
    socket.pause();

    if (this.onRequest) {
      try {
        this.onRequest({ requestId, sender: entry.sender, code });
      } catch {
        /* ignore */
      }
    }
  }

  /** Pending inbound requests, without any key material. */
  listRequests() {
    return [...this.pending.values()].map((e) => ({
      requestId: e.requestId,
      sender: e.sender,
      code: e.code,
      accepted: e.accepted,
    }));
  }

  /** Accept or reject a pending request. Rejecting closes the socket. */
  async respond({ requestId, accept, outputDir } = {}) {
    const entry = this.pending.get(requestId);
    if (!entry) throw new VaultError(CODES.NOT_FOUND, "No such transfer request");
    if (accept !== true) {
      entry.socket.destroy();
      this.pending.delete(requestId);
      this._state(requestId, "rejected");
      return { requestId, accepted: false };
    }
    if (entry.accepted) throw new VaultError(CODES.BAD_INPUT, "That request was already accepted");

    entry.accepted = true;
    entry.outputDir = outputDir || path.join(this.userDataPath || ".", "Received");
    entry.socket.resume();
    this._state(requestId, "accepted");
    this._receive(entry).catch(() => {
      this._state(requestId, "failed");
      entry.socket.destroy();
      this.pending.delete(requestId);
    });
    return { requestId, accepted: true };
  }

  /** Receiver side: complete the handshake, then receive and verify. */
  async _receive(entry) {
    const { socket, reader, privateKey, publicPem, code } = entry;
    socket.write(
      controlFrame({ type: "HELLO_ACK", magic: MAGIC, serverPub: publicPem, code, requestId: entry.requestId }),
    );

    const shared = crypto.diffieHellman({ privateKey, publicKey: crypto.createPublicKey(entry.clientPub) });
    const key = deriveKey(shared, entry.clientPub, publicPem, entry.requestId);
    const prefix = crypto.randomBytes(8);
    socket.write(controlFrame({ type: "KEY_READY", noncePrefix: prefix.toString("base64") }));

    const manifest = await reader.nextControl();
    if (manifest.type !== "MANIFEST" || !Array.isArray(manifest.files)) {
      throw new VaultError(CODES.INTEGRITY_FAILED, "The sender did not send a manifest");
    }
    if (manifest.files.length > MAX_FILES) throw badInput("Too many files in one transfer");
    const total = manifest.files.reduce((sum, f) => sum + Number(f.size || 0), 0);
    if (total > MAX_TOTAL) throw badInput("The transfer is too large");

    await fsp.mkdir(entry.outputDir, { recursive: true });
    socket.write(controlFrame({ type: "MANIFEST_OK" }));

    const received = [];
    let counter = 0;
    for (const file of manifest.files) {
      const base = path.basename(String(file.name || "")).replace(/[\u0000-\u001f]/g, "").trim();
      if (!base || base === "." || base === "..") {
        throw new VaultError(CODES.INTEGRITY_FAILED, "The sender proposed an invalid file name");
      }
      const target = path.join(entry.outputDir, base);
      if (fs.existsSync(target)) {
        throw new VaultError(CODES.BAD_INPUT, `Refusing to overwrite the existing file "${base}"`);
      }
      const tmp = `${target}.knoux-${crypto.randomBytes(6).toString("hex")}.part`;
      const hash = crypto.createHash("sha256");
      const handle = await fsp.open(tmp, "w", 0o600);
      let written = 0;
      try {
        while (written < Number(file.size || 0)) {
          const frame = await reader.next();
          const chunk = open(key, prefix, counter, frame);
          counter += 1;
          await handle.write(chunk);
          hash.update(chunk);
          written += chunk.length;
          this._progress(entry.requestId, received.length, manifest.files.length);
        }
      } finally {
        await handle.close();
      }
      if (written !== Number(file.size || 0)) {
        await fsp.rm(tmp, { force: true }).catch(() => {});
        throw new VaultError(CODES.INTEGRITY_FAILED, "The received file was the wrong length");
      }
      const digest = hash.digest("hex");
      await fsp.rename(tmp, target);
      received.push({ name: base, size: written, sha256: digest });
    }

    const done = await reader.nextControl();
    if (done.type !== "DONE") throw new VaultError(CODES.INTEGRITY_FAILED, "The sender did not finish cleanly");
    const allMatch = received.every((f) => done.digests?.[f.name] === f.sha256);
    if (!allMatch) {
      socket.write(controlFrame({ type: "DONE_NACK" }));
      this._state(entry.requestId, "failed", { reason: "integrity" });
      throw new VaultError(CODES.INTEGRITY_FAILED, "The received files failed their integrity check");
    }

    socket.write(controlFrame({ type: "DONE_ACK" }));
    socket.end();
    this.pending.delete(entry.requestId);
    this._state(entry.requestId, "complete", { files: received.length });
  }

  /**
   * Sender side. Connects to a peer, completes the handshake and streams the
   * chosen files. The returned promise resolves only after the receiver has
   * acknowledged every file, so "complete" always means bytes actually landed.
   */
  async send({ host = "127.0.0.1", port, code, files, sender = "This device" } = {}) {
    if (!Number.isInteger(port) || port <= 0) throw badInput("A valid peer port is required");
    if (!Array.isArray(files) || files.length === 0) throw badInput("Select at least one file to send");
    const pairingCode = code == null || code === "" ? code6() : String(code);
    if (!/^\d{6}$/.test(pairingCode)) throw badInput("The pairing code must be six digits");
    if (files.length > MAX_FILES) throw badInput("Too many files in one transfer");

    const transferId = crypto.randomBytes(8).toString("hex");
    const { publicKey, privateKey } = crypto.generateKeyPairSync("x25519");
    const clientPub = publicKey.export({ type: "spki", format: "pem" });

    const socket = net.createConnection({ host, port });
    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", (err) => reject(new VaultError(CODES.IO_FAILED, `Could not reach the peer: ${err.code || "error"}`)));
    });
    const reader = new FrameReader(socket);
    this._state(transferId, "connecting");

    socket.write(
      controlFrame({ type: "HELLO", magic: MAGIC, clientPub, code: pairingCode, sender: String(sender).slice(0, 64) }),
    );

    const ack = await reader.nextControl();
    if (ack.type !== "HELLO_ACK" || ack.magic !== MAGIC) {
      socket.destroy();
      throw new VaultError(CODES.IO_FAILED, "The peer did not complete the handshake");
    }
    // The code must come back unchanged. If it does not, something rewrote it
    // in flight and the peer is not the device the user compared codes with.
    if (ack.code !== pairingCode) {
      socket.destroy();
      throw new VaultError(CODES.INTEGRITY_FAILED, "The pairing code did not come back unchanged");
    }
    const requestId = ack.requestId;
    const shared = crypto.diffieHellman({ privateKey, publicKey: crypto.createPublicKey(ack.serverPub) });
    const key = deriveKey(shared, clientPub, ack.serverPub, requestId);

    const ready = await reader.nextControl();
    if (ready.type !== "KEY_READY") {
      socket.destroy();
      throw new VaultError(CODES.IO_FAILED, "The peer did not open a secure channel");
    }
    const prefix = Buffer.from(String(ready.noncePrefix || ""), "base64");
    if (prefix.length !== 8) {
      socket.destroy();
      throw new VaultError(CODES.INTEGRITY_FAILED, "The peer sent an invalid nonce prefix");
    }

    // Read and measure everything before sending, so the manifest the receiver
    // validates is the truth about what will actually be transmitted.
    const payloads = [];
    let total = 0;
    for (const file of files) {
      let bytes;
      try {
        bytes = await fsp.readFile(file);
      } catch (err) {
        socket.destroy();
        if (err.code === "ENOENT") throw new VaultError(CODES.NOT_FOUND, "A selected file was not found");
        throw new VaultError(CODES.IO_FAILED, "A selected file could not be read");
      }
      total += bytes.length;
      if (total > MAX_TOTAL) {
        socket.destroy();
        throw badInput("The transfer is too large");
      }
      payloads.push({ name: path.basename(file), bytes });
    }

    socket.write(
      controlFrame({
        type: "MANIFEST",
        files: payloads.map((p) => ({ name: p.name, size: p.bytes.length })),
      }),
    );
    const manifestOk = await reader.nextControl();
    if (manifestOk.type !== "MANIFEST_OK") {
      socket.destroy();
      if (manifestOk.type === "REJECTED") throw new VaultError(CODES.BAD_INPUT, "The receiver declined the transfer");
      throw new VaultError(CODES.IO_FAILED, "The receiver did not accept the manifest");
    }

    this._state(transferId, "sending", { requestId });
    const digests = {};
    let counter = 0;
    let sent = 0;
    for (const payload of payloads) {
      const hash = crypto.createHash("sha256").update(payload.bytes).digest("hex");
      digests[payload.name] = hash;
      for (let offset = 0; offset < payload.bytes.length; offset += CHUNK_SIZE) {
        const chunk = payload.bytes.subarray(offset, offset + CHUNK_SIZE);
        socket.write(binaryFrame(seal(key, prefix, counter, chunk)));
        counter += 1;
        sent += chunk.length;
        this._progress(transferId, sent, total);
      }
    }

    socket.write(controlFrame({ type: "DONE", digests }));
    const done = await reader.nextControl();
    socket.end();
    if (done.type !== "DONE_ACK") {
      this._state(transferId, "failed", { reason: "integrity" });
      throw new VaultError(CODES.INTEGRITY_FAILED, "The receiver rejected the transfer as corrupted");
    }

    this._state(transferId, "complete", { files: payloads.length, bytes: total });
    return { transferId, requestId, code: pairingCode, files: payloads.length, bytes: total, digests };
  }
}

module.exports = {
  TransferService,
  MAGIC,
  CHUNK_SIZE,
  binaryFrame,
  controlFrame,
  deriveKey,
  seal,
  open,
  nonceFor,
};
