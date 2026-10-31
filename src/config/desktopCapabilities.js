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
]);

export function capabilityById(id) {
  return DESKTOP_CAPABILITIES.find((card) => card.id === id) || null;
}

export default DESKTOP_CAPABILITIES;
