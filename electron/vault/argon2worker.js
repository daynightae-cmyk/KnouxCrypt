"use strict";

/**
 * Argon2id derivation worker (task 37).
 *
 * A derivation at the RFC 9106 profile costs hundreds of milliseconds and
 * allocates tens to hundreds of megabytes, so it runs here, on a worker thread,
 * instead of blocking the Electron main process. The worker receives the
 * passphrase and salt, runs the vetted hash-wasm Argon2id (RFC 9106 / Argon2
 * v1.3), and posts back either the tag (only when the caller asked to reveal it)
 * or a fingerprint of the tag. It never logs anything.
 *
 * Cancellation is implemented by the parent calling `worker.terminate()`.
 */
const { parentPort } = require("worker_threads");
const crypto = require("crypto");
const { argon2id } = require("hash-wasm");

parentPort.on("message", async (job) => {
  try {
    const password = Buffer.from(job.passwordBase64, "base64");
    const salt = Buffer.from(job.saltBase64, "base64");
    const params = job.params;

    const started = process.hrtime.bigint();
    let tagHex;
    try {
      tagHex = await argon2id({
        password,
        salt,
        parallelism: params.parallelism,
        iterations: params.iterations,
        memorySize: params.memoryKiB,
        hashLength: params.hashLength,
        outputType: "hex",
      });
    } finally {
      // Best-effort zeroization of the passphrase buffer copy.
      password.fill(0);
    }
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;

    const tag = Buffer.from(tagHex, "hex");
    const fingerprint = crypto.createHash("sha256").update(tag).digest("hex");
    const result = {
      ok: true,
      durationMs,
      tagFingerprint: fingerprint,
      tagHex: job.reveal === true ? tagHex : null,
      tagBytes: tag.length,
    };
    // Zeroize the tag buffer copy once the reply has been serialized.
    const reply = JSON.stringify(result);
    tag.fill(0);
    parentPort.postMessage(JSON.parse(reply));
  } catch (err) {
    parentPort.postMessage({ ok: false, message: err && err.message ? String(err.message) : "derivation failed" });
  }
});
