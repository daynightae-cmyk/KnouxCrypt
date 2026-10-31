// Shared, truthful copy for real vault operation results.
export const ERROR_COPY = Object.freeze({
  AUTH_FAILED: "Authentication failed: the file is corrupt, was tampered with, or the wrong key was used.",
  INTEGRITY_FAILED: "Integrity check failed. The file does not match its recorded digest.",
  TRUNCATED: "The file is truncated or is not a complete vault container.",
  NOT_A_VAULT: "This file is not a KnouxCrypt vault container.",
  PATH_CONFLICT: "The output file already exists. Choose another destination.",
  NOT_FOUND: "The selected file no longer exists.",
  IO_FAILED: "The operation could not be written to disk.",
  SESSION_REQUIRED: "Unlock the vault before encrypting or decrypting.",
  SESSION_REVOKED: "Your session was revoked. Unlock again to continue.",
  LOCKED_OUT: "Too many failed attempts. Wait before trying again.",
  CANCELLED: "Operation cancelled. No output file was written.",
  UNSUPPORTED_FORMAT: "This container format version is not supported.",
  BAD_INPUT: "Check the selected file and destination.",
  UNAVAILABLE: "The vault engine is unavailable in this preview.",
});

export const CIPHER_HELP = Object.freeze({
  "Encryption Details": "Files are encrypted with AES-256-GCM in 1 MiB authenticated chunks. The container records the plaintext SHA-256 and carries a trailing HMAC so truncation is detectable.",
  "Recovery Requirements": "You need the vault password (or the device's vault key) to decrypt. Without it the content is unrecoverable; there is no backdoor.",
  "Container Format": "KnouxCrypt vault format KNXVLT01: 96-byte authenticated header, length-prefixed GCM frames, end-of-stream sentinel, and a trailing HMAC-SHA256 over every frame byte.",
  "Key Derivation": "Enrollment uses PBKDF2-HMAC-SHA256 (600,000 iterations) to wrap a random 256-bit vault key, which is then separated into encryption and MAC keys with HKDF-SHA256.",
  Integrity: "Every chunk is authenticated by its GCM tag, the whole stream is authenticated by a trailing HMAC, and the recovered plaintext is compared against the digest recorded in the header.",
});

export function formatBytes(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
