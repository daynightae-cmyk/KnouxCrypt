"use strict";

/**
 * Argon2id Key Derivation Studio (task 37).
 *
 * This is a real, vetted Argon2id (RFC 9106, Argon2 v1.3) derivation using the
 * maintained, pure-WASM `hash-wasm` implementation. It is exposed as an
 * *additional* studio profile; the vault container itself keeps its existing
 * KDF (PBKDF2 / scrypt) so no second incompatible vault format is introduced.
 *
 * Design constraints:
 *   - The derivation runs on a worker thread so the Electron main process stays
 *     responsive; a cancellation is a real `worker.terminate()`.
 *   - Parameter bounds are validated against RFC 9106 recommended ranges before
 *     anything is allocated, so a hostile header cannot request unbounded
 *     memory or CPU.
 *   - The passphrase is never logged, never returned, and its worker copy is
 *     zeroized after use. The derived tag is only returned when the caller
 *     explicitly asks for it.
 *   - The salt is either freshly random or supplied for a known-answer test.
 */
const crypto = require("crypto");
const path = require("path");
const { Worker } = require("worker_threads");

const { VaultError, CODES, badInput } = require("./errors");

// RFC 9106 recommends t>=1, m>=8 KiB per lane, p in [1, 64]. We additionally
// cap the total so a single request cannot exhaust the machine.
const LIMITS = Object.freeze({
  minMemoryKiB: 8,
  maxMemoryKiB: 4 * 1024 * 1024, // 4 GiB ceiling
  minIterations: 1,
  maxIterations: 64,
  minParallelism: 1,
  maxParallelism: 64,
  minHashLength: 16,
  maxHashLength: 64,
});

const PROFILES = Object.freeze([
  {
    id: "INTERACTIVE",
    label: "Interactive",
    memoryKiB: 64 * 1024,
    iterations: 2,
    parallelism: 1,
    hashLength: 32,
  },
  {
    id: "MODERATE",
    label: "Moderate",
    memoryKiB: 256 * 1024,
    iterations: 3,
    parallelism: 1,
    hashLength: 32,
  },
  {
    id: "SENSITIVE",
    label: "Sensitive",
    memoryKiB: 1024 * 1024,
    iterations: 4,
    parallelism: 1,
    hashLength: 32,
  },
]);

function intIn(value, field, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw badInput(`${field} must be an integer between ${min} and ${max}`);
  }
  return value;
}

/**
 * Validate and normalize a parameter set. Accepts either a named profile or an
 * explicit object; explicit values always win but must stay within bounds.
 */
function resolveParams(request = {}) {
  const profile = request.profile ? PROFILES.find((p) => p.id === request.profile) : null;
  if (request.profile && !profile) throw badInput(`Unknown profile "${request.profile}"`);
  const base = profile || PROFILES[0];

  const memoryKiB = intIn(
    request.memoryKiB === undefined ? base.memoryKiB : request.memoryKiB,
    "Memory (KiB)",
    LIMITS.minMemoryKiB,
    LIMITS.maxMemoryKiB,
  );
  const iterations = intIn(
    request.iterations === undefined ? base.iterations : request.iterations,
    "Time cost",
    LIMITS.minIterations,
    LIMITS.maxIterations,
  );
  const parallelism = intIn(
    request.parallelism === undefined ? base.parallelism : request.parallelism,
    "Parallelism",
    LIMITS.minParallelism,
    LIMITS.maxParallelism,
  );
  const hashLength = intIn(
    request.hashLength === undefined ? base.hashLength : request.hashLength,
    "Output length",
    LIMITS.minHashLength,
    LIMITS.maxHashLength,
  );
  // Argon2 requires at least 8 KiB per lane.
  if (memoryKiB < 8 * parallelism) {
    throw badInput("Memory must be at least 8 KiB per lane of parallelism");
  }
  return { memoryKiB, iterations, parallelism, hashLength, profile: base.id };
}

class Argon2Studio {
  constructor(options = {}) {
    this.workerPath = options.workerPath || path.join(__dirname, "argon2worker.js");
    this.spawn = options.spawn || ((workerPath) => new Worker(workerPath));
    this.now = options.now || (() => Date.now());
    this.timeoutMs = options.timeoutMs || 5 * 60 * 1000;
    this.active = new Map();
  }

  /** Parameter bounds and named profiles, so the UI cannot offer an unsafe cost. */
  params() {
    return { limits: { ...LIMITS }, profiles: PROFILES.map((p) => ({ ...p })) };
  }

  /**
   * Cancel an in-flight derivation. Returns whether a job was actually running.
   * The worker is terminated, which aborts the WASM computation immediately and
   * rejects the pending `derive()` promise with CANCELLED.
   */
  cancel(operationId) {
    const worker = this.active.get(operationId);
    if (!worker) return { operationId, cancelled: false };
    this.active.delete(operationId);
    worker.terminate().catch(() => {});
    return { operationId, cancelled: true };
  }

  /**
   * Run a real Argon2id derivation on a worker thread.
   *
   * @param {object} request
   * @param {string} request.passphrase   the secret to derive from
   * @param {object} [request.params]      profile id or explicit costs
   * @param {string} [request.saltHex]     for a known-answer test; random if absent
   * @param {boolean} [request.reveal]     return the derived tag (default false)
   */
  async derive(request = {}) {
    const passphrase = request.passphrase;
    if (typeof passphrase !== "string" || passphrase.length === 0) {
      throw new VaultError(CODES.BAD_INPUT, "A passphrase is required");
    }
    if (Buffer.byteLength(passphrase, "utf8") > 1024) {
      throw badInput("The passphrase is too long (max 1024 bytes)");
    }
    const params = resolveParams(request.params || request);

    let salt;
    let saltGenerated = false;
    if (request.saltHex !== undefined && request.saltHex !== null) {
      if (typeof request.saltHex !== "string" || !/^[0-9a-fA-F]{16,64}$/.test(request.saltHex) || request.saltHex.length % 2 !== 0) {
        throw badInput("The salt must be an even-length hex string of 8-32 bytes");
      }
      salt = Buffer.from(request.saltHex, "hex");
    } else {
      salt = crypto.randomBytes(16);
      saltGenerated = true;
    }

    const worker = this.spawn(this.workerPath);
    const startedAt = this.now();
    const operationId = request.operationId || crypto.randomBytes(8).toString("hex");
    this.active.set(operationId, worker);

    const outcome = await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        worker.removeAllListeners();
        this.active.delete(operationId);
        fn(value);
      };
      const timer = setTimeout(() => {
        finish(reject, new VaultError(CODES.IO_FAILED, "The derivation timed out"));
      }, this.timeoutMs);
      if (timer.unref) timer.unref();

      worker.once("message", (msg) => finish(resolve, msg));
      worker.once("error", (err) => finish(reject, new VaultError(CODES.IO_FAILED, `The derivation worker failed: ${err.code || err.message}`)));
      worker.once("exit", (code) => {
        if (code !== 0) finish(reject, new VaultError(CODES.CANCELLED, "The derivation was cancelled"));
      });

      worker.postMessage({
        passwordBase64: Buffer.from(passphrase, "utf8").toString("base64"),
        saltBase64: salt.toString("base64"),
        params,
        reveal: request.reveal === true,
      });
    }).finally(() => {
      // terminate() is a no-op if the worker already exited; it guarantees the
      // worker (and its WASM memory) is released either way.
      this.active.delete(operationId);
      worker.terminate().catch(() => {});
    });

    if (!outcome.ok) {
      throw new VaultError(CODES.BAD_INPUT, outcome.message || "The derivation failed");
    }

    return {
      operationId,
      algorithm: "Argon2id",
      version: "1.3 (v=19)",
      profile: params.profile,
      memoryKiB: params.memoryKiB,
      iterations: params.iterations,
      parallelism: params.parallelism,
      hashLength: params.hashLength,
      saltHex: salt.toString("hex"),
      saltGenerated,
      tagFingerprint: outcome.tagFingerprint,
      tagHex: outcome.tagHex,
      durationMs: Math.round(outcome.durationMs),
      wallMs: this.now() - startedAt,
      // Non-secret parameters are safe to export for reproducibility.
      paramsExportable: {
        algorithm: "Argon2id",
        version: 19,
        memoryKiB: params.memoryKiB,
        iterations: params.iterations,
        parallelism: params.parallelism,
        hashLength: params.hashLength,
        saltHex: salt.toString("hex"),
      },
    };
  }
}

module.exports = { Argon2Studio, LIMITS, PROFILES, resolveParams };
