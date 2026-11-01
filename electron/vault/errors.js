"use strict";

/**
 * Typed error taxonomy for the KnouxCrypt vault engine.
 * Every error carries a stable `code` so the UI can map it to a truthful state
 * instead of collapsing distinct failures into a generic "failed".
 */
class VaultError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "VaultError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

const CODES = Object.freeze({
  BAD_INPUT: "BAD_INPUT",
  UNSUPPORTED_FORMAT: "UNSUPPORTED_FORMAT",
  NOT_A_VAULT: "NOT_A_VAULT",
  AUTH_FAILED: "AUTH_FAILED",
  INTEGRITY_FAILED: "INTEGRITY_FAILED",
  TRUNCATED: "TRUNCATED",
  PATH_CONFLICT: "PATH_CONFLICT",
  NOT_FOUND: "NOT_FOUND",
  IO_FAILED: "IO_FAILED",
  // The path exists but the platform will not let this user create or replace
  // it — a POSIX write-bit denial or a Windows NTFS DENY ACE. Distinct from
  // IO_FAILED so the UI can say "you do not have permission here" instead of
  // collapsing it into a generic write failure.
  PERMISSION_DENIED: "PERMISSION_DENIED",
  SESSION_REQUIRED: "SESSION_REQUIRED",
  SESSION_REVOKED: "SESSION_REVOKED",
  LOCKED_OUT: "LOCKED_OUT",
  ALREADY_ENROLLED: "ALREADY_ENROLLED",
  NOT_ENROLLED: "NOT_ENROLLED",
  CANCELLED: "CANCELLED",
  CONSENT_REQUIRED: "CONSENT_REQUIRED",
});

function badInput(message) {
  return new VaultError(CODES.BAD_INPUT, message);
}

module.exports = { VaultError, CODES, badInput };
