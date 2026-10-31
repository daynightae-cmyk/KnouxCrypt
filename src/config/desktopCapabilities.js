// Desktop service capability registry.
//
// Every card must expose platformCapability, permissionNeeds, requiresNetwork,
// providerReady, realTestEvidence and displayStatus. displayStatus may only be
// ACTIVE/VERIFIED when the evidence names a test that actually runs in this
// repository (see scripts/check-capabilities.cjs, which enforces this).

export const DISPLAY_STATUS = Object.freeze({
  PLANNED: "PLANNED",
  PARTIAL: "PARTIAL",
  ACTIVE: "ACTIVE",
  VERIFIED: "VERIFIED",
  UNAVAILABLE: "UNAVAILABLE",
});

export const DESKTOP_CAPABILITIES = Object.freeze([
  {
    id: "SPLASH_ENTRY",
    title: "Splash & Entry Sequence",
    platformCapability: "Electron BrowserWindow with frameless cinematic splash, 3s timed hand-off to the main window, sandboxed renderer.",
    permissionNeeds: [],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "scripts/electron-lifecycle-check.cjs (boots the real main.js, observes splash -> main window hand-off, built renderer mount, sandboxed preload)",
      "tests/electron-hardening.test.cjs (CSP, navigation denial, no admin requirement, packaging files)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "The splash-to-main hand-off, built-renderer loading and sandboxed preload are verified by a real Electron process run on Linux. Windows EXE execution is still unverified in this environment.",
  },
  {
    id: "SECURE_ACCESS_LOGIN",
    title: "Secure Access",
    platformCapability:
      "Real local vault enrollment and unlock. PBKDF2-HMAC-SHA256 (600k iterations) wraps a random 256-bit vault key; the key is held only in the Electron main process.",
    permissionNeeds: [],
    requiresNetwork: false,
    providerReady: false,
    realTestEvidence: [
      "tests/vault-session.test.cjs (enroll, unlock, lockout, revocation, idle lock, guest isolation)",
      "tests/vault-ipc.test.cjs (channel registration, payload validation, typed errors)",
      "tests/preload-contract.test.cjs (bridge surface, fail-closed legacy invoke, allow-listed events)",
      "scripts/electron-runtime-check.cjs (real Electron process: enroll and unlock across the IPC boundary)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Password enrollment/unlock, session revocation and lockout are implemented and covered by automated tests. Biometrics, GitHub OAuth and Passkey are explicitly NOT configured and are labelled as such in the UI.",
  },
  {
    id: "HOME",
    title: "Command Home",
    platformCapability: "Dashboard reads live vault status (enrolled/locked/unlocked/guest) and the real main-process activity log over IPC.",
    permissionNeeds: [],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/vault-service.test.cjs (status reflects real enrollment and session state)",
      "scripts/check-all-routes.cjs (Home renders in ar and en)",
      "tests/electron-hardening.test.cjs (legacy disk surface fails closed so no fabricated drive status is shown)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Status text is derived from the vault service. The legacy disk/volume provider is absent, so those screens report unavailable instead of fabricated 'protected' statuses.",
  },
  {
    id: "FILE_CIPHER",
    title: "File Cipher",
    platformCapability:
      "Streaming authenticated file encryption with AES-256-GCM in 1 MiB chunks, HKDF-SHA256 key separation, plaintext SHA-256 digest, trailing HMAC-SHA256, atomic temp-file commit and cancellation.",
    permissionNeeds: [],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/vault-engine.test.cjs (corruption, truncation, chunk reorder, wrong key, path conflict, abort cleanup)",
      "tests/vault-service.test.cjs (end-to-end file encrypt/decrypt, cancellation, revoked session)",
      "tests/vault-ipc.test.cjs (file operation IPC validation)",
      "scripts/electron-runtime-check.cjs (real Electron process: encrypt/decrypt round trip, tamper and truncation rejection)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Real authenticated encryption with negative tests for corrupted files, wrong passwords, aborted writes, revoked sessions and path conflicts, exercised in a real Electron process. Windows EXE runtime verification is still pending.",
  },
  {
    id: "SHADOW_VAULT",
    title: "Shadow Vault",
    platformCapability:
      "Reads real record counts from the encrypted vault record store while a session is unlocked. Media/photo import is NOT implemented.",
    permissionNeeds: [],
    requiresNetwork: false,
    providerReady: false,
    realTestEvidence: [
      "tests/vault-store.test.cjs (encrypted store read/write, tamper and truncation rejection, guest and revoked session refusal)",
      "scripts/electron-runtime-check.cjs (real Electron process: no plaintext secret remains in the store file)",
    ],
    displayStatus: DISPLAY_STATUS.PARTIAL,
    displayStatusReason:
      "The gallery is a labelled reference layout and no media is read. Only the record-store counts are real, and media import remains unavailable rather than simulated.",
  },
  {
    id: "NOTES",
    title: "Secure Notes",
    platformCapability:
      "Notes are persisted in the encrypted vault record store (AES-256-GCM container, atomic write) when a session is unlocked; otherwise an in-memory, labelled preview set is shown.",
    permissionNeeds: [],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/vault-store.test.cjs (note records round trip, no plaintext on disk, tamper rejection, guest refusal)",
      "tests/vault-ipc.test.cjs (store channels validated over IPC)",
      "scripts/electron-runtime-check.cjs (real Electron process: note written, read back and removed over the live IPC bridge)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Note create/update/delete write through the real encrypted store and are covered by automated tests and a real Electron process. The desktop UI persists only while the vault is unlocked.",
  },
  {
    id: "NOTES_EDITOR",
    title: "Notes Editor",
    platformCapability:
      "Editing a note updates the corresponding record in the encrypted vault record store; a locked vault keeps the editor read-only against preview data.",
    permissionNeeds: [],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/vault-store.test.cjs (record update replaces rather than duplicates)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Edits are persisted as encrypted records with the same tamper detection as the File Cipher container.",
  },
  {
    id: "PASSWORDS",
    title: "Passwords",
    platformCapability:
      "Credential records are stored in the encrypted vault record store; the generator uses the platform CSPRNG with rejection sampling.",
    permissionNeeds: [],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/vault-store.test.cjs (credential records are stored separately from notes, no plaintext on disk)",
      "tests/password-generator.test.cjs (CSPRNG output length, pool coverage, no modulo bias, distinct values)",
      "tests/vault-ipc.test.cjs (credential store channels validated over IPC)",
      "scripts/electron-runtime-check.cjs (real Electron process: credential written to the encrypted store over the live IPC bridge)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Credential storage and generation are real and tested. Autofill, password auditing and browser integration remain unimplemented previews and are labelled as such.",
  },
  {
    id: "PASSWORD_DETAIL",
    title: "Password Detail",
    platformCapability:
      "A single credential is read from the encrypted vault record store by id; reveal and copy act on the stored record, and no value is rendered until the user asks for it.",
    permissionNeeds: [],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/vault-store.test.cjs (single-record read, update and removal against the encrypted store)",
      "tests/vault-ipc.test.cjs (record-level IPC validation and guest refusal)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Detail, edit and delete operate on the real stored record. Site-URL reputation checks are not implemented and are not claimed.",
  },
  {
    id: "AUTHENTICATOR",
    title: "Authenticator",
    platformCapability:
      "RFC 6238 TOTP and RFC 4226 HOTP computed in the Electron main process with HMAC-SHA1/256/512; the Base32 secret lives only in the encrypted store and is never sent to the renderer.",
    permissionNeeds: ["Unlocked vault session"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/totp.test.cjs (RFC 4226 Appendix D and RFC 6238 Appendix B vectors for SHA-1, SHA-256 and SHA-512)",
      "tests/vault-ipc.test.cjs (add/list/code/remove over IPC, secret never returned, duplicate and malformed-secret refusal, guest refusal)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Codes are computed from stored secrets and agree with the published RFC vectors. Camera QR scanning is not implemented and remains a labelled preview.",
  },
  {
    id: "AUTH_IMPORT",
    title: "2FA Import",
    platformCapability:
      "Accounts are added by Base32 secret through the same validated IPC path as manual entry; duplicate accounts are refused rather than silently shadowed.",
    permissionNeeds: ["Unlocked vault session"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/totp.test.cjs (Base32 decoding accepts padding, spaces and lowercase, and refuses weak or malformed secrets)",
      "tests/vault-ipc.test.cjs (malformed secret and duplicate account refusal over IPC)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Secret import is real and validated. otpauth:// URI parsing and camera QR scanning are not implemented and are labelled as unavailable.",
  },
  {
    id: "KEY_FORGE",
    title: "Key Forge",
    platformCapability:
      "Key pairs are generated with Node/OpenSSL for Ed25519, P-256, P-384, RSA-2048/4096 and HMAC-256; private material is sealed in the encrypted store and export requires explicit confirmation.",
    permissionNeeds: ["Unlocked vault session"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/vault-ipc.test.cjs (key generation for a supported algorithm, inventory without private material, unsupported-algorithm refusal, confirmation-gated private export, guest refusal)",
      "tests/vault-store.test.cjs (the key collection is encrypted like every other record store)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Generation, storage and confirmation-gated export are real and tested. The inventory shows public material only.",
  },
  {
    id: "KEY_DETAILS",
    title: "Key Details",
    platformCapability:
      "Fingerprints are computed as SHA-256 over the SPKI public key (or over the secret for symmetric keys) and are shown from the stored record.",
    permissionNeeds: ["Unlocked vault session"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/vault-ipc.test.cjs (fingerprint format asserted as 64 hex characters, inventory carries no private material)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Fingerprints are derived from the real key material. No external trust chain or CA validation is claimed.",
  },
  {
    id: "PRIVACY_CENTER",
    title: "Privacy Center",
    platformCapability:
      "App-scoped privacy preferences (idle auto-lock window, lock-on-suspend, clipboard clearing, log retention) are stored on disk and enforced in the main process. The OS suspend and screen-lock events lock the vault through Electron powerMonitor.",
    permissionNeeds: ["None for settings", "Unlocked vault session to change settings"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/batch04-services.test.cjs (defaults on a missing file, clamping of out-of-range values, non-numeric refusal, persistence across reload, listener notification, corrupt-file fallback, and re-arming of the live session idle window)",
      "scripts/electron-lifecycle-check.cjs (the main process wires powerMonitor suspend and lock-screen to vault lock-all)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Preferences are persisted and applied to the real session idle timer. The app does not and cannot claim OS-wide permission or surveillance control, so those are labelled unavailable.",
  },
  {
    id: "BACKUP",
    title: "Backup & Recovery",
    platformCapability:
      "Encrypted versioned backups: a single authenticated container holds a manifest with a SHA-256 per collection plus every encrypted collection. Restore validates the manifest and checksums and is atomic, rolling back if a write fails.",
    permissionNeeds: ["Unlocked vault session", "Explicit confirmation for restore"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/batch04-services.test.cjs (round-trip and checksum verification, wrong-key refusal, tamper detection, truncation refusal, empty-file refusal, NOT_FOUND for a missing file, confirmation required for restore, atomic restore, path-traversal id rejection, and end-to-end create/list/inspect/restore through the service)",
      "tests/vault-store.test.cjs (the underlying store is encrypted like every other record store)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Backups are real AES-256-GCM containers written with a temp-file-then-rename and verified against a sealed manifest. Cloud or remote backup destinations are not implemented.",
  },
  {
    id: "SECURE_SHARE",
    title: "Secure Share",
    platformCapability:
      "Encrypted share packages with two explicit models: a shared-secret package keyed by PBKDF2-HMAC-SHA256, or a recipient-key package whose content key is wrapped with RSA-OAEP-SHA256 for the recipient's public key. Expiry is recorded and enforced on open.",
    permissionNeeds: ["Unlocked vault session", "Recipient public key or share passphrase"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/batch04-services.test.cjs (shared-secret open with the right passphrase only, short-passphrase refusal, passphrase required, RSA recipient open with the matching private key only, wrong-key refusal, non-RSA refusal, expiry enforcement on open, past-expiry refusal at creation, malformed-envelope refusal, tamper detection, empty-payload refusal, and service-level create/open)",
      "tests/vault-engine.test.cjs (the container format the package is built on)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Packages are real authenticated containers. Expiry is enforced when a package is opened, but an already-exported copy cannot be forcibly recalled, and the UI states this. No server-side delivery or revocation service exists.",
  },
  {
    id: "HASH_INTEGRITY",
    title: "Hash & Integrity",
    platformCapability:
      "Real digests over text or a chosen file with SHA-256, SHA-384, SHA-512, SHA3-256 and SHA3-512 through Node/OpenSSL, plus a constant-time digest comparison. MD5 and SHA-1 are refused.",
    permissionNeeds: ["Read access to the selected file"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/batch05-inspection.test.cjs (published SHA-256 value for \"abc\", every offered digest, MD5/SHA-1 refusal, file digest matches raw bytes, NOT_FOUND for a missing file, empty-input refusal, exact and length-mismatch comparison, non-hex refusal, and service-level hashCompute/hashCompare)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Hashing and constant-time comparison are real and tested. The screen reports only digests it actually computed; no integrity conclusion is drawn for a file the user has not selected.",
  },
  {
    id: "TEXT_CIPHER",
    title: "Text Cipher",
    platformCapability:
      "Encrypt and decrypt short text with the same AES-256-GCM vault engine used for files, keyed by the unlocked vault key, returning a base64 authenticated container.",
    permissionNeeds: ["Unlocked vault session"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/vault-service.test.cjs (real text encrypt/decrypt through the service, wrong-key refusal, revoked-session refusal)",
      "tests/vault-engine.test.cjs (the buffer container format, tamper and truncation detection)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Text is genuinely encrypted with the vault key; a locked or guest session cannot run it. The output is a real container, not a placeholder string.",
  },
  {
    id: "SIGNATURE",
    title: "Digital Signature",
    platformCapability:
      "Detached signatures over text or a chosen file using keys stored in the vault: Ed25519, ECDSA P-256/P-384 and RSA-2048/4096. Verification works with a public key and needs no unlocked vault.",
    permissionNeeds: ["Unlocked vault session to sign", "A signing key in the vault"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/batch05-inspection.test.cjs (Ed25519 round-trip, tamper detection, RSA round-trip with a foreign key refused, garbage-signature refusal without throwing, non-private-key and unknown-algorithm refusal, stored-key sign then verify, session required to sign, public-PEM verification after lock, NOT_FOUND for an unknown key id, and service-level certificateInspect)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Signing and verification are real Node/OpenSSL operations against vault-held keys. Private material never leaves the main process; only the detached signature and public key are returned.",
  },
  {
    id: "CERTIFICATE_INSPECTOR",
    title: "Certificate Inspector",
    platformCapability:
      "Parse a PEM X.509 certificate and report subject, issuer, serial, validity window with an expired/not-yet-valid verdict, self-signed check, SHA-256 fingerprint, subject alternative names and public key type.",
    permissionNeeds: ["The certificate text or PEM file"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/batch05-inspection.test.cjs (a real openssl-generated certificate parsed for subject, SAN, dates and self-signed status; an expired certificate reported expired; non-PEM and malformed-PEM refusal; service-level parsing)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Parsing uses Node's X509Certificate, so the reported fields are real. KnouxCrypt ships no CA trust store, so a certificate is never labelled trusted; the self-signed result is reported as a fact.",
  },
]);

export function capabilityById(id) {
  return DESKTOP_CAPABILITIES.find((card) => card.id === id) || null;
}

export default DESKTOP_CAPABILITIES;
