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
  {
    id: "ARCHIVE",
    title: "Encrypted Archive",
    platformCapability:
      "Build a ZIP from chosen files in memory, then seal it with the vault engine as an authenticated AES-256-GCM container. Listing, extracting and traversal validation are all real.",
    permissionNeeds: [
      "Unlocked vault session",
      "Read access to the selected files",
      "Write access to the chosen output path",
    ],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/batch06-workflows.test.cjs (round-trip of a real archive through create, inspect and extract, byte-identical extraction, plain-zip signature absent from the output, wrong-key refusal, corruption refusal, overwrite refusal, traversal-name rejection, entry-count and size bounds, and atomic-write cleanup)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "The archive is a real ZIP sealed by the real vault engine. There is no external archive tool involved and no compression claim that is not performed.",
  },
  {
    id: "LOCAL_TRANSFER",
    title: "Local Transfer",
    platformCapability:
      "Transfer files between two KnouxCrypt instances over loopback: an X25519 handshake, AES-256-GCM sealed chunks, a receiver-side consent step and a per-file SHA-256 check before the sender is told the transfer completed.",
    permissionNeeds: [
      "Unlocked vault session on both devices",
      "Loopback network access only",
      "Write access to the receiver's chosen folder",
    ],
    requiresNetwork: true,
    providerReady: true,
    realTestEvidence: [
      "tests/batch06-workflows.test.cjs (two real service instances over a real socket: byte-identical delivery of a 700 KB file, receiver accept and decline, tampered-ciphertext rejection, refusal to bind a non-loopback address, entry-name sanitisation, and listener teardown on session revocation)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "The transfer is real: a genuine socket, a genuine key agreement and genuine authenticated chunks. The six-digit code is a short authentication string the two people compare, not a secret, and the UI says so. Only loopback is supported; a LAN bind is refused.",
  },
  {
    id: "FINGERPRINT_VERIFY",
    title: "Fingerprint Verify",
    platformCapability:
      "Compute the SHA-256 fingerprint of a vault public key, a pasted PEM key or a certificate file, and compare two fingerprints in constant time with a group-by-group match report.",
    permissionNeeds: ["The public key, PEM material or key file", "Unlocked vault session only to read a stored key"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/batch06-workflows.test.cjs (fingerprint of a real generated key matches an independent SHA-256 of its SPKI DER, identical comparison, single-character difference detected with the first mismatch located, length-mismatch reporting, non-hex refusal, certificate fingerprinting, and NOT_FOUND for an unknown key id)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Fingerprints are computed from real key material. A match proves the keys are the same; it does not by itself prove who owns the key, and the UI states that limit rather than implying identity verification.",
  },
  {
    id: "METADATA_CLEANER",
    title: "Metadata Cleaner",
    platformCapability:
      "Inspect real file metadata and write a metadata-stripped copy of a JPEG by filtering whole segments, with no image re-encoding. The original file is never modified.",
    permissionNeeds: [
      "Read access to the source file",
      "Write access to the chosen destination",
    ],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/batch06-workflows.test.cjs (a synthetic JPEG carrying EXIF, XMP, ICC and COM segments: group presence detection, byte-exact removal of the requested groups, image data left untouched, refusal to write over the source, refusal of a non-JPEG, refusal of an empty removal set, and NOT_FOUND for a missing file)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Only JPEG is rewritten, and it is rewritten byte-exactly. GPS, capture date and camera details share one EXIF block, so the UI says that removing one removes all three rather than implying per-field control. Other formats are refused, not faked.",
  },
  {
    id: "CLIPBOARD_GUARD",
    title: "Clipboard Guard",
    platformCapability:
      "Time-limited clipboard leases over the real Electron clipboard. A value is placed on the clipboard with an explicit lease, and the lease clears it on expiry or on demand, but only when the clipboard still holds the exact value this app wrote.",
    permissionNeeds: ["Clipboard read/write access (granted by Electron at runtime)", "Explicit per-copy confirmation"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/batch07-privacy-labs.test.cjs (lease clears an unchanged clipboard, a user-copied replacement is left untouched and reported as skipped, arming without confirmation is refused, out-of-range timers are refused, the real expiry timer clears on its own, revoking the owning session disarms the lease, verify returns booleans only, and an unsupported platform fails closed)",
      "tests/vault-ipc.test.cjs (consent is enforced at the IPC boundary, a truthy string is not accepted as consent, status/verify/clear round-trip through the real channel contract, and a headless build without an adapter fails closed)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "The guard clears only a value it wrote itself and skips when the clipboard changed, so it never erases unrelated content. It cannot promise global clipboard erasure: another application may have copied the value, the OS may keep a history, and clipboard managers are outside this process's control. The UI states that limit.",
  },
  {
    id: "SECURE_RANDOM",
    title: "Secure Random",
    platformCapability:
      "Generate hex, URL-safe base64, passphrases and passwords from the operating-system CSPRNG (crypto.randomBytes), with unbiased rejection sampling for word and character selection and reported entropy.",
    permissionNeeds: ["None beyond running the application"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/batch07-privacy-labs.test.cjs (hex length and charset, URL-safe base64 uniqueness, passphrase words drawn only from the validated 256-word list, passwords free of ambiguous characters, entropy computed from the generator, rejection sampling discards out-of-range bytes, an 8000-draw uniformity band, bad type/length refusal, and a source scan proving Math.random is absent)",
      "tests/vault-ipc.test.cjs (the channel validates type and length and returns real CSPRNG bytes)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Output comes from crypto.randomBytes and selection uses rejection sampling, so it is unbiased. The reported entropy is the generator's theoretical entropy, not a certification of the OS entropy pool; the UI labels it as such rather than claiming a validated RNG.",
  },
  {
    id: "HMAC_AUTHENTICITY",
    title: "HMAC Authenticity",
    platformCapability:
      "Compute HMAC-SHA-256/384/512 over text or a streamed file, and compare two tags in constant time. Large files are streamed in 1 MiB chunks so memory use stays bounded.",
    permissionNeeds: ["The shared key (used and discarded)", "Read access to the file when hashing a file"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/batch07-privacy-labs.test.cjs (RFC 4231 case 1 vectors for SHA-256/384/512, RFC 4231 cases 3 and 4, the 4-byte case-2 key refused by the minimum-key policy, a 3 MiB streamed file matching Node's own HMAC over the same bytes, NOT_FOUND for a missing file, message-and-file conflict refused, constant-time comparison mismatches, short key/weak algorithm/empty message refused, and the key never echoed back)",
      "tests/vault-ipc.test.cjs (the channel validates algorithm, key length and payload, and never returns the key)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "A matching tag proves the data was not altered and that the comparer knows the key. It does not prove who sent it, because anyone holding the key can produce the same tag. The UI distinguishes integrity and key knowledge from sender identity rather than calling a match 'authentic'.",
  },
  {
    id: "PUBLIC_KEY_QR",
    title: "Public Key QR",
    platformCapability:
      "Render a real, scannable QR matrix from public key material (a stored vault key's public PEM, or pasted public text), with the key fingerprint shown alongside. Private key material is refused.",
    permissionNeeds: ["Unlocked vault session only to select a stored key", "No elevated privileges"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/batch07-privacy-labs.test.cjs (the generated matrix decodes back to the exact payload through an independent QR reader, a stored key renders its public PEM with its fingerprint and no private material, private key material refused, empty and oversized payloads refused, unknown key id NOT_FOUND, and a secret-only key refused)",
      "tests/vault-ipc.test.cjs (the channel refuses private key material at the boundary)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "The matrix is produced by the vetted qrcode encoder and verified by decoding it again. A QR of a public key shares public material only; it is not an identity claim and the fingerprint is shown so a reader can verify it out of band. Encoding a private key is refused, not merely discouraged.",
  },
  {
    id: "COLLECTIONS",
    title: "Vault Collections",
    platformCapability:
      "Nested, encrypted collections. Metadata (names, tags, item names) is sealed inside the vault store; item files are encrypted into real AES-256-GCM containers on disk.",
    permissionNeeds: ["Unlocked vault session only", "No elevated privileges"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/batch08-vaulttools.test.cjs (nesting and depth limits, tags normalised, an item is encrypted at rest and decrypts byte-for-byte, duplicate names renamed rather than overwritten, move keeps the blob and copy re-encrypts under a fresh nonce, a non-empty collection needs a confirmed recursive delete, search runs over decrypted metadata with no plaintext index on disk, locked-state reads denied, guest sessions refused)",
      "tests/vault-ipc.test.cjs (channels registered and payloads validated)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Collections and items are stored with the same authenticated container format as the File Cipher. Reads require an unlocked session; a revoked or guest session is refused. Search is performed in memory over decrypted metadata, so no plaintext index is written to disk.",
  },
  {
    id: "DOCUMENT_VIEWER",
    title: "Protected Document Viewer",
    platformCapability:
      "Decrypt a supported document (text, image, PDF) into a private mode-0600 temporary file, show bounded content and delete the plaintext on close, on lock and on quit. Stale files from a crash are swept at startup.",
    permissionNeeds: ["Unlocked vault session only", "No elevated privileges"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/batch08-vaulttools.test.cjs (open keeps exactly one private temp file, close deletes it, a revoked session closes every open document and removes the plaintext, the startup sweep clears orphaned files, unsupported formats refused, large documents paged through bounded chunks)",
      "tests/vault-ipc.test.cjs (viewer channels registered and validated)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "The viewer decrypts to an owner-only temp file and deletes it deterministically; this is verified by tests. It does not claim to prevent OS-level screen capture, which no in-process viewer can do.",
  },
  {
    id: "VAULT_KEY_ROTATION",
    title: "Vault Key Rotation",
    platformCapability:
      "Two real rotation modes: rewrap re-wraps the data-encryption key under a new password, and reencrypt rewrites every stored container under a fresh key. Journaled, verified against the new password and rolled back on failure.",
    permissionNeeds: ["Unlocked vault session only", "Explicit confirmation", "No elevated privileges"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/batch08-vaulttools.test.cjs (rewrap keeps data readable and only changes the wrapper, reencrypt rewrites containers and the old key can no longer open them, the old password stops working, confirmation and length are enforced, a failed reencrypt rolls the enrollment back so the old password still opens the vault, a completed reencrypt refuses a rollback, preflight refuses while a rotation is pending)",
      "tests/vault-ipc.test.cjs (rotation channels registered and validated)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Rotation is a real key operation with a journal, a post-rotation reopen check and a rollback path, all covered by tests. There is no spinner: every stage maps to a filesystem action that either succeeds or is rolled back.",
  },
  {
    id: "PACKAGE_INSPECTOR",
    title: "Ciphertext Package Inspector",
    platformCapability:
      "Parse a container header without a key (reported as unauthenticated claims) and stream-verify the whole package against the vault key: header MAC, per-chunk GCM tags, trailing content MAC and plaintext digest.",
    permissionNeeds: ["Unlocked vault session only for authenticated verification", "Header parsing needs no session"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/batch08-vaulttools.test.cjs (header inspection reports unauthenticated claims and never claims decryptability, a non-vault file is NOT_A_VAULT, verification succeeds with the right key, a tampered byte and a truncated file both fail, a foreign key fails, an unsupported version is refused)",
      "tests/vault-ipc.test.cjs (package channels registered and validated)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "The inspector distinguishes an unauthenticated header claim from an authenticated verification, and it never claims decryptability without performing the authenticated check. Verification never writes plaintext; only a digest is recomputed.",
  },
  {
    id: "ANDROID_AUTOFILL",
    title: "Android Autofill Control",
    platformCapability:
      "Desktop-side preview toggles for the Android Autofill concept, persisted as an app preference. The build reports that native Autofill, credential-provider registration and the settings CTA are unavailable on this platform.",
    permissionNeeds: ["None — the preview toggles require no OS permission", "No Android provider is registered"],
    requiresNetwork: false,
    providerReady: false,
    realTestEvidence: [
      "tests/batch09-devices.test.cjs (preview defaults, toggles persist and reload, unknown keys ignored, out-of-range payload refused, and the capability report always reports nativeAutofill/canRegisterProvider/canOpenSettings as false)",
      "tests/vault-ipc.test.cjs (autofill channels registered and payloads validated)",
    ],
    displayStatus: DISPLAY_STATUS.PARTIAL,
    displayStatusReason:
      "Only the local preview is real. Android Autofill itself is provided by the Android OS, which the desktop build cannot reach, so native autofill, provider registration and the settings CTA are reported UNAVAILABLE rather than simulated.",
  },
  {
    id: "OFFLINE_ADVISOR",
    title: "Offline Security Advisor",
    platformCapability:
      "A local readiness review built from the state this application actually owns: enrollment, session state, privacy preferences, backup count, transfer listener and armed clipboard leases. Topics the app cannot see are listed as manual checks.",
    permissionNeeds: ["None — no OS scan is performed", "No elevated privileges"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/batch09-devices.test.cjs (observed rows quote real preference and status values, an unlocked session is flagged for attention, a missing backup is flagged, manual topics are never marked passed, filters are enforced, and the report states it did not scan the OS)",
      "tests/vault-ipc.test.cjs (advisor channels registered and payloads validated)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Every OBSERVED row is derived from a real value this app holds, and each carries its evidence string. Rows the app cannot observe are labelled MANUAL and are never reported as passed, so the review cannot be mistaken for an operating-system audit.",
  },
  {
    id: "DEVICE_PAIRING",
    title: "Multi-Device Pairing",
    platformCapability:
      "Loopback pairing handshake: two ephemeral X25519 key pairs, a real Diffie-Hellman agreement and an HKDF-SHA256 short authentication string, compared in constant time. No socket is opened and no remote device is contacted.",
    permissionNeeds: ["None — loopback only", "No elevated privileges", "No network access"],
    requiresNetwork: false,
    providerReady: false,
    realTestEvidence: [
      "tests/batch09-devices.test.cjs (a real X25519 agreement derives a six-word phrase, a wrong phrase or a declined match is refused, confirmation is constant-time, sessions expire and are swept, the private keys never cross the boundary, and the report always states networkOpened=false)",
      "tests/vault-ipc.test.cjs (pairing channels registered and payloads validated)",
    ],
    displayStatus: DISPLAY_STATUS.PARTIAL,
    displayStatusReason:
      "The key agreement and phrase comparison are real, but both roles run inside this process: it is not a pairing with a second physical device and it does not create a trusted remote device. The UI states the loopback limit explicitly.",
  },
  {
    id: "PASSWORD_AUDIT",
    title: "Password Strength Audit",
    platformCapability:
      "Offline password strength estimator in the spirit of zxcvbn: dictionary, repeat, sequence, keyboard and date matchers, a dynamic-programming guess estimate and a 0-4 score. Runs locally; nothing is stored or transmitted.",
    permissionNeeds: ["None — the input stays in memory", "No network access"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/batch09-devices.test.cjs (known-weak inputs score low and known-strong inputs score high, monotonicity across lengths, deterministic output, dictionary/repeat/sequence/keyboard/date patterns detected, over-long input refused, and the result states breachChecked=false and storedInput=false)",
      "tests/vault-ipc.test.cjs (the audit channel validates input and returns a real estimate)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "The estimate is a real local computation and is deterministic, which is what makes it testable. It does not consult a breach database and does not assess a stored credential, and the result carries those limits as explicit fields rather than leaving the reader to assume.",
  },
  {
    id: "KEY_DERIVATION",
    title: "Argon2id Key Derivation Studio",
    platformCapability:
      "Real Argon2id (RFC 9106, Argon2 v1.3) derivation via the maintained pure-WASM hash-wasm implementation, executed on a worker thread with RFC 9106 parameter bounds, random salt generation and real cancellation by worker termination.",
    permissionNeeds: ["None — runs locally", "No network access"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/batch10-advanced.test.cjs (canonical Argon2id known-answer vector matches, RFC 9106 associated-data vectors are reported as unsupported rather than silently mismatched, out-of-range memory/time/parallelism/length are refused, random salt is generated, reveal=false returns only a fingerprint, cancellation terminates the worker, and the result never contains the passphrase)",
      "tests/vault-ipc.test.cjs (the argon2 channels are registered and validate their payloads)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "The derivation is a real Argon2id computation that reproduces the canonical reference vector. It is offered as an additional studio; the vault container keeps its existing PBKDF2/scrypt format, and hash-wasm's lack of associated-data support is stated explicitly instead of being papered over.",
  },
  {
    id: "SIGNATURE_STUDIO",
    title: "Signature Studio",
    platformCapability:
      "Real detached signatures over real stored keys (Ed25519, P-256, P-384, RSA) with independent verification, public-key fingerprints and a session-gated export of the signature record.",
    permissionNeeds: ["An unlocked vault session for signing and export"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/batch10-advanced.test.cjs (a real sign/verify round-trip succeeds, a corrupted message or signature fails verification, a mismatched key fails, signing without an unlocked session is refused, and the export refuses a locked or guest session)",
      "tests/vault-ipc.test.cjs (signature channels are registered and validate their payloads)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Signing and verification use Node/OpenSSL through the existing key service and report the real verdict. A cryptographically valid signature is not presented as a verified real-world identity.",
  },
  {
    id: "SECURITY_ACTIVITY",
    title: "Security Activity Journal",
    platformCapability:
      "Append-only, HMAC-sealed and hash-chained local journal of real application events with field- and value-level secret redaction, filtering, retention and an owner-authorized export.",
    permissionNeeds: ["Explicit confirmation to clear or export", "No network access"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/batch10-advanced.test.cjs (editing an entry, deleting an entry, reordering entries or corrupting the document is detected as tampering; secrets such as passwords, PEM private keys and 64-hex values are redacted; filtering by category/outcome/query works; clear and export require confirmation; the integrity report states externalTrustAnchor=false)",
      "tests/vault-ipc.test.cjs (journal channels are registered and validate their payloads)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "The journal is a real chained, keyed log with real tamper detection and real redaction. It is explicitly not claimed to be externally immutable: an attacker who rewrites both the journal and its key file can forge a consistent chain, and the report says so.",
  },
  {
    id: "TRANSFER_WIZARD",
    title: "Secure Transfer Wizard",
    platformCapability:
      "Staged workflow over the existing authenticated transfer engine (task 22): real file review with SHA-256, explicit recipient consent, real socket handshake and streaming, and a receipt only after the receiver acknowledges every digest.",
    permissionNeeds: ["An unlocked vault session", "A KnouxCrypt peer listening on the chosen port"],
    requiresNetwork: true,
    providerReady: false,
    realTestEvidence: [
      "tests/batch10-advanced.test.cjs (a genuine loopback self-test transfers files over a real socket and re-hashes what landed on disk; sending without consent is refused; a connection to a closed port fails with a typed error rather than a fabricated success; an unknown wizard id is refused)",
      "tests/vault-ipc.test.cjs (wizard channels are registered and validate their payloads)",
    ],
    displayStatus: DISPLAY_STATUS.PARTIAL,
    displayStatusReason:
      "The workflow, hashing, consent gate, socket transfer and receipt are all real, and a loopback self-test proves the wiring end to end. No second physical device is invented and Android is not claimed as a peer, so the card is PARTIAL rather than ACTIVE.",
  },
  {
    id: "SECRET_CAPSULE",
    title: "Expiring Secret Capsule",
    platformCapability:
      "Local, self-contained expiring secret container: AES-256-GCM with PBKDF2-HMAC-SHA256 (600k iterations) key derivation, an authenticated header, real expiry and access-limit enforcement, and atomic owner-only save.",
    permissionNeeds: ["No network access", "The capsule passphrase to open"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/batch11-finaltools.test.cjs (create/open round-trip returns the secret, a wrong passphrase or altered ciphertext is refused, an expired capsule is refused, the access limit is enforced, a malformed or non-capsule envelope is refused, and the result states remoteRevocable=false)",
      "tests/vault-ipc.test.cjs (capsule channels are registered and validate their payloads)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "The encryption, key derivation, expiry and access-limit enforcement are real. The capsule is local only and carries remoteRevocable=false, so it is never presented as a revocable remote link.",
  },
  {
    id: "SESSION_PRIVACY",
    title: "Session Privacy Controls",
    platformCapability:
      "Real policy layer over the session manager, privacy preferences and clipboard guard: live idle auto-lock, lock on OS suspend/screen-lock, clipboard clearing and journal retention, with a redacted session view.",
    permissionNeeds: ["An unlocked vault session to change policy"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/batch11-finaltools.test.cjs (an idle-lock change is applied live to the session manager, out-of-range values are refused, the policy report marks each control enforced/not enforced with its mechanism, and the redacted view contains no session id, key or secret)",
      "tests/vault-ipc.test.cjs (session-privacy channels are registered and validate their payloads)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Each control maps to a real enforcement point that the app actually has, and the report marks osScope=false. Screenshot or notification privacy is not offered because the app cannot enforce it.",
  },
  {
    id: "FILE_INTEGRITY",
    title: "File Integrity Baselines",
    platformCapability:
      "Streamed SHA-256/SHA-512 baseline manifests with a real comparison that reports unchanged, changed, missing and added files, plus atomic owner-only save and load.",
    permissionNeeds: ["An unlocked vault session is not required for hashing", "Read access to the baselined files"],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/batch11-finaltools.test.cjs (a baseline detects an unchanged file, a modified file, a missing file and an added file; SHA-512 is supported; a malformed manifest is refused; a file not found during baseline creation is refused; comparison is read-only)",
      "tests/vault-ipc.test.cjs (integrity channels are registered and validate their payloads)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Hashing and comparison are real and streamed. The manifest is a local, unsigned record: it detects divergence from the baseline but proves neither who changed a file nor that the manifest itself is authentic, and the UI says so.",
  },
  {
    id: "SECURE_CLIPBOARD",
    title: "Secure Clipboard",
    platformCapability:
      "Time-limited clipboard leases managed by the existing clipboard guard (task 25): the guard only clears a value this app wrote, and only if it is still present, reporting a skipped result otherwise.",
    permissionNeeds: ["Explicit confirmation to arm a lease", "A platform clipboard adapter"],
    requiresNetwork: false,
    providerReady: false,
    realTestEvidence: [
      "tests/batch11-finaltools.test.cjs (the secure-clipboard status reports the real adapter support, the guard refuses to arm without consent, a clear is skipped when the clipboard content changed, and the status states guaranteedOsErase=false)",
      "tests/vault-ipc.test.cjs (the secure-clipboard channel is registered)",
    ],
    displayStatus: DISPLAY_STATUS.PARTIAL,
    displayStatusReason:
      "The lease, timer and ownership-checked clear are real. It cannot guarantee OS-wide clipboard erasure, and in a headless environment there is no clipboard adapter, so the card is PARTIAL and states guaranteedOsErase=false rather than overclaiming.",
  },
]);

export function capabilityById(id) {
  return DESKTOP_CAPABILITIES.find((card) => card.id === id) || null;
}

export default DESKTOP_CAPABILITIES;
