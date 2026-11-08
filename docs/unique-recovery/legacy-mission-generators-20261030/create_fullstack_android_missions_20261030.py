#!/usr/bin/env python3
"""Create KNOUX CRYPT Android vertical-slice mission specs, no source changes."""
from pathlib import Path
import hashlib, json, re, sys, textwrap
ROOT=Path(r"D:\KnouxCrypt")
OUT=ROOT/"missions"/"fullstack-android"
VIS=ROOT/"visuals"/"ANIMA_MISSIONS_01-44"
if not (ROOT/".git").exists(): raise SystemExit("STOP: source repository not found")
if OUT.exists(): raise SystemExit("STOP: output folder already exists; refuse overwrite")
if not VIS.is_dir(): raise SystemExit("STOP: owner visual missions directory missing")
names=[
"SPLASH_ENTRY","SECURE_ACCESS_LOGIN","HOME","FILE_CIPHER","SHADOW_VAULT","SECURE_NOTES",
"NOTES_EDITOR","PASSWORDS","PASSWORD_DETAIL","AUTHENTICATOR","AUTH_IMPORT","KEY_FORGE",
"KEY_DETAILS","PRIVACY","BACKUP","SECURE_SHARE","HASH_INTEGRITY","TEXT_CIPHER",
"DIGITAL_SIGNATURE","CERTIFICATE_INSPECTOR","ENCRYPTED_ARCHIVE","LOCAL_TRANSFER",
"FINGERPRINT_VERIFY","METADATA_CLEANER","CLIPBOARD_GUARD","SECURE_RANDOM",
"HMAC_AUTHENTICITY","PUBLIC_KEY_QR","VAULT_COLLECTIONS","DOCUMENT_VIEWER",
"VAULT_KEY_ROTATION","CIPHERTEXT_PACKAGE_INSPECTOR","ANDROID_AUTOFILL",
"OFFLINE_SECURITY_ADVISOR","MULTI_DEVICE_PAIRING","PASSWORD_STRENGTH_AUDIT",
"ARGON2ID_KEY_DERIVATION","SIGNATURE_STUDIO","LOCAL_SECURITY_ACTIVITY",
"TRANSFER_WIZARD","EXPIRING_SECRET_CAPSULE","SESSION_PRIVACY_CONTROLS",
"FILE_INTEGRITY_TOOL","SECURE_CLIPBOARD"
]
# Each row: functionality; data shape; Android/OS integration; security/failure mode; tested acceptance; prerequisites.
rows = {
1: ("Show approved deer logo and cinematic eye ignition, accessible Touch to Enter, transition to Auth only.",
"EntrySession, SoundPreference, MotionPreference; no sensitive data persisted.",
"Compose splash with Activity lifecycle, splash API, Navigation Compose, reduced-motion-aware draw layers.",
"No fake biometric verification; no automatic audio or blocking 3-second startup delay.",
"Double tap does not duplicate navigation; motion disabled respects settings; process restart lands safely.","00"),
2: ("Local vault onboarding/unlock using BiometricPrompt or device credential; optional GitHub and passkey buttons are capability gated; proceed to Home only after real key-use authorization.",
"AuthSession, LockPolicy, UnlockAttempt, ProviderCapability; no raw credential storage.",
"Android BiometricPrompt, Keystore CryptoObject, Credential Manager only when configured; app lifecycle lock.",
"Fail closed on cancellation, lockouts, invalidated keys, device biometric changes; never treat visual UI as auth.",
"Wrong passphrase, OS cancellation, background-lock, reboot and biometric-change tests; no auth bypass.","00,31"),
3: ("Render eight home service entries backed by actual capability registry, live vault state, real usage counters and consistent navigation.",
"ServiceCapability, VaultHealth, SecurityState, StorageUsage; values measured not invented.",
"Compose Navigation, StateFlow viewmodels, Android insets and back-stack restore.",
"Never display 'protected', 'ready', 'connected' for services without proven state.",
"Eight cards navigate or show honest unsupported state; light/dark, Arabic RTL, small-screen screenshot checks.","00,02"),
4: ("SAF import file, choose key and output Uri, stream authenticated encryption/decryption, verify package, export ciphertext and cancel safely.",
"FileJob, EnvelopeHeader, EncryptedChunk, IntegrityReceipt, OutputUriGrant.",
"Storage Access Framework DocumentsContract, foreground user-visible transfer when eligible, scoped Uri permissions.",
"Unique nonce per chunk, authenticated metadata, truncation detection, crash-safe staging; never delete plaintext source automatically.",
"Wrong key, 0B/1B/4GB, revoked URI, disk-full, crash resume, truncated and modified ciphertext negative tests.","00,02,31"),
5: ("Import photos/video/audio using picker; encrypted item grid with locked thumbnails, view/play via controlled stream, categories, restore/export.",
"VaultItem, EncryptedMediaBlob, MediaType, GalleryCollection, MediaThumbCache.",
"Android Photo Picker, Media3 for guarded playback, Compose LazyVerticalGrid, app-private storage.",
"No persistent plaintext thumbnails or leaks through cache, recents, backup, screenshots, or exported URI.",
"Import/view/cancel/export; media types and orientation; lock screen while playing; corrupted video handling.","00,04,29"),
6: ("List/search/tag/group encrypted notes, create/edit/delete/archive, accurate count and modified timestamp.",
"NoteRecord, NoteTag, SearchIndexToken, DeletedNoteMarker, LocalDraftRef.",
"Room + encrypted columns or protected encrypted files; Compose list + encrypted search index.",
"Never persist plaintext in database, widget, logs, search suggestions or backup.",
"Create/search/reopen after reboot; lock clears previews; import hostile text; delete/undo policies.","00,02"),
7: ("Rich text editor matching the Notes reference; encrypt autosave, version history, undo and conflict handling.",
"NoteRevision, DraftState, AutosaveCheckpoint, EditConflict, AttachmentRef.",
"Compose BasicTextField, IME insets, lifecycle aware autosave with coroutine debounce.",
"Never write draft to plaintext cache or keyboard suggestions intentionally; sanitize pasted content.",
"Rotate/resume edit, forced process kill, 2 rapid edits, failed save, empty attachment and restored draft.","00,06"),
8: ("Password/credential vault list with reveal/copy/lock/search/generation/add, categories and card item management.",
"VaultCredential, CredentialCategory, SecretVersion, PasswordPolicy, ClipboardLease.",
"Encrypted Room repository, AndroidX credentials only if enabled, Compose lazy rows.",
"Secrets encrypted at rest; masked default; biometric re-auth for reveal; no implicit clipboard persistence.",
"Add/edit/remove/reveal, auto-lock, clipboard expiry, negative import and database leak tests.","00,02,31"),
9: ("Credential detail screen, view/edit username, URL, notes, secret, history, safe copy, strength indication.",
"CredentialDetail, SecretRevision, SecretAccessAudit, ClipboardLease.",
"Compose detail route with SavedStateHandle, password generator navigation and confirmation dialogs.",
"No plaintext deep link, screen state persistence, unrestricted accessibility exposure or clipboard exposure.",
"Reveal needs recent unlock, return preserves selected record, URL validation, cancel/edit without loss.","08,36"),
10: ("RFC 6238 TOTP counter, optional HOTP if implemented, local authenticator list, manual add, copy with warning.",
"OtpAccount, OtpSecretEnvelope, OtpAlgorithm, OtpClockOffset, OtpCounter.",
"Android monotonic clock plus wall-clock time correction guidance; QR APIs only under explicit camera consent.",
"No test codes labeled real, no seed logging, no cloud export without encrypted package.",
"RFC vectors SHA-1/256/512 where supported, rollover, clock drift, invalid seed, restart, offline mode.","00,02,11"),
11: ("Import otpauth URI/QR or supported migration format; preview account list and commit to encrypted store on consent.",
"OtpImportPreview, ParsedOtpauth, ImportError, DuplicateMatch.",
"CameraX or Android scanner only after permission; Android document picker and clipboard handoff.",
"Reject unsupported migration format or malformed URI; never silently upload seeds; no secret logs.",
"Malformed QR, duplicate accounts, unsupported hash, URI injection, cancel import leaves store untouched.","10"),
12: ("Device key inventory, generate, use and revoke eligible keys; signing and share tools; protected hardware status.",
"KeyDescriptor, KeyPolicy, KeyUseReceipt, KeyOrigin, RotationRecord.",
"Android Keystore, provider capability checks, Compose KeyForge screen.",
"StrongBox/hardware-backed only when attested; never expose non-exportable private keys or fake readiness.",
"Keystore unavailable, alias exists, invalidate key, sign/verify vectors and unsupported algo UX.","00,02,31"),
13: ("Key detail page with alias/algorithm/hardware-backed evidence, public fingerprint, signature verify and rotation actions.",
"KeyDetails, KeyAttestationResult, Fingerprint, UsagePolicy, RotateRequest.",
"Android Keystore API + KeyInfo and optional supported attestation certificate chain.",
"No private key export; distinguish software/TEE/StrongBox and unknown status honestly.",
"Key alias mismatch, public fingerprint stable, rotate rollback, unsupported attestation and no-key state.","12,31"),
14: ("Privacy center shows measured app privacy controls, screenshot policy, permissions, real biometric availability and safe recovery status.",
"PermissionStatus, PrivacySetting, BackupStatus, BiometricCapability, SessionLockState.",
"Android permission APIs, lifecycle, BiometricManager, settings deep links only for real system pages.",
"Do not claim device-wide scan, GitHub linked or secured backup without actual evidence.",
"Toggle persistence, denied permissions, recovery stale state, RTL and accessibility.","00,02,15"),
15: ("Encrypted backup export, selected vault sections, password-derived recovery wrapper, restore preview and fresh-device restore.",
"BackupManifest, BackupEnvelope, KdfPolicy, RestorePlan, RestoreReport.",
"SAF CreateDocument/OpenDocument, WorkManager for deferrable backup tasks, lifecycle-aware restore.",
"User-controlled recovery key; Argon2id vetted memory limits, complete authenticated container and atomic restore.",
"Wrong password, tampering, device replacement, interrupted backup, old schema migration, no partial overwrite.","00,31,37"),
16: ("Encrypt-to-recipient package, recipient identity verification, Android Sharesheet ciphertext-only handoff and import.",
"RecipientKey, SharePackage, ExpiryPolicy, Receipt, RecipientConsent.",
"Android Sharesheet ACTION_SEND with scoped content URI, Contacts optional explicit permission.",
"End-to-end secrecy only after actual key agreement; TTL cannot revoke copied ciphertext; no plaintext intents.",
"Wrong recipient, tampered envelope, expired policy vs true revocation, share cancel, malicious URI.","00,12,28"),
17: ("Hash input/files, SHA-256/SHA-512 comparison, hash copy and checksum history without uploading content.",
"HashJob, HashResult, HashComparison, InputUri.",
"MessageDigest and stream read via SAF; Compose result/compare panel.",
"Hashing is integrity signal not encryption/authentication; avoid false authenticity claims.",
"NIST/known vectors, 0B/large data, cancel, modified input and copy-state tests.","00"),
18: ("Encrypt/decrypt short text with reviewed AEAD, base64/hex conversion marked as encoding, export package.",
"TextCipherRequest, EnvelopeString, EncodingOption, TextCipherResult.",
"Android JCA provider AES-GCM, Compose text fields with IME handling.",
"Unique nonce, authenticated associated data, no ECB/CBC homemade crypto or plaintext logs.",
"Unicode/RTL, empty string, malformed base64, wrong key, altered tag, copy timeout.","00,31"),
19: ("Sign a chosen file/text and verify against public key, show binary signature and verification evidence.",
"SignRequest, VerifyRequest, SignatureEnvelope, VerificationEvidence.",
"Android Keystore Signature for supported ECDSA/RSA-PSS/Ed25519 provider availability.",
"Signature proves possession of matching key, not identity; reject weak algorithms and invalid key use.",
"Good/bad vector, wrong key, modified input, algorithm mismatch and revoked key tests.","12,13"),
20: ("Inspect X.509 PEM/DER certificates, issuer, SANs, expiry, chain and fingerprint with trust meaning explained.",
"CertificateParsed, ExtensionMap, ChainResult, TrustAnchorPolicy.",
"CertificateFactory and PKIX CertPathValidator with bounded parser inputs.",
"Parsing is not trust validation; unknown root or expired certificate must be explicitly marked.",
"Malformed ASN.1, huge chain, expired, self-signed, unknown CA, invalid signatures.","00,19"),
21: ("Create/list/extract encrypted archive with safe filenames, quotas and authenticated package manifest.",
"ArchiveEntry, ArchiveManifest, ArchiveWriteJob, ExtractionPlan.",
"SAF document and tree contracts, streamed ZIP handling with limits, encryption engine.",
"Reject path traversal, zip bombs, symlink escapes, partial writes and corrupted authenticated archives.",
"../ entry, compression bomb, duplicates, interrupted extraction, malicious metadata, restore.","00,04"),
22: ("Transfer encrypted file locally, recipient discovery/consent, QR confirmation and resumable transport if implemented.",
"PeerSession, TransferOffer, TransferChunk, TransferAck, DeviceIdentity.",
"Nearby Connections or Wi-Fi Direct only after capability/permission approval; no fake network transport.",
"Mutual key verification, replay prevention, no plaintext on wire, resume integrity.",
"Unknown peer, airplane mode, disconnect, replay, truncated chunk and cancel before acceptance.","00,16,40"),
23: ("Display cryptographic fingerprint comparison and optionally OS biometric re-auth when relevant.",
"FingerprintComparison, TrustDecision, VerificationReceipt.",
"BiometricPrompt only for the owner's local re-auth; public-key fingerprint comparison as separate UI.",
"Never confuse biometric fingerprint with cryptographic key fingerprint; explicit trust acknowledgement.",
"Mismatch, revoked key, cancel, re-enrollment, untrusted device and clipboard-laundered fingerprint.","00,13"),
24: ("Inspect/remove selected EXIF, XMP and document metadata with before/after preview and opt-in export.",
"MetadataInventory, RedactionSelection, SanitizedExport, MetadataReport.",
"ExifInterface plus format-aware vetted parsers and SAF export, never broad filesystem writes.",
"Do not claim complete sanitization for unknown formats; never change original without consent.",
"GPS removed, embedded thumbnail retained warning, unsupported formats, failed export, Unicode names.","00,05"),
25: ("Display clipboard exposure state and guard UI with explicit user paste/copy/clear actions.",
"ClipboardLease, ClipboardWarning, ClipboardOwnershipState.",
"Android ClipboardManager APIs subject to OS restrictions, lifecycle and foreground limits.",
"Clipboard may be read by OS/apps; clearing is best effort and must not delete user data silently.",
"Foreground/background, Android versions, user changed clipboard, timeout only if ownership verified.","00,08"),
26: ("CSPRNG studio for bytes, passwords and recovery codes with configurable length and entropy explanation.",
"EntropyRequest, RandomBytes, PasswordPolicy, RandomOutput.",
"SecureRandom with provider check, Compose slider/input and protected copy.",
"Never use Math.random, deterministic test mode in production, or label bytes as proof of strength.",
"Known constraints, distribution smoke check, invalid bounds, clipboard handling, power interruption.","00"),
27: ("HMAC-SHA-256 tag generation/verification for text and files with explicit secret key provenance.",
"HmacRequest, HmacResult, KeySelector, VerificationResult.",
"Mac/JCA and Android Keystore-backed keys where compatible; stream read.",
"Use constant-time tag comparison, no key display by default, no invented signature identity.",
"RFC 4231 vectors, changed message, wrong key, empty inputs and timing-safe verify.","00,12"),
28: ("Present/scans public key fingerprints as QR with manual cross-check and imported recipient identity.",
"PublicKeyExchange, PublicKeyQrPayload, KeyFingerprint, RecipientTrust.",
"QR generation/scanning Android library vetted for size and permissions.",
"QR carries public information only; trust not automatically established without out-of-band compare.",
"Malformed QR, oversized payload, swapped key, repeat import, denied camera.","12,23"),
29: ("Folder/tag protected media and documents into collections with filters, move and export permissions.",
"VaultCollection, CollectionMembership, EncryptedMetadata, ItemLink.",
"Room encrypted metadata and Compose nested navigation; no public media index writes.",
"No plaintext title leakage; moving collections never reuses nonce or loses blob references.",
"Create/rename/search/move, duplicate title, locked state, corrupted membership and delete/undo.","05"),
30: ("Protected document viewer with PDF/text preview, zoom, safe handoff and no plaintext residue.",
"ProtectedDocument, ViewSession, RenderPage, TemporaryContentLease.",
"PdfRenderer for supported PDF, scoped in-memory/temp staging with cleanup, FLAG_SECURE where supported.",
"Temporary decrypted content must not linger in cache or recents; unsupported formats handled honestly.",
"Password-protected PDF, huge page, rotation, background lock, corrupted file, share consent.","04,05"),
31: ("Key version migration wizard to rewrap or re-encrypt items with progress, rollback, interrupted resume and key retirement.",
"KeyVersion, RotationBatch, RotationCheckpoint, KeyUsePolicy.",
"Keystore versioned aliases, atomic Room transaction boundaries and WorkManager if eligible.",
"Never discard old wrapping keys until each item verified and restore path proven; unique nonce.",
"Crash mid-rotation, old key gone, corrupted item, mixed versions, reboot and rollback.","00,02"),
32: ("Ciphertext package inspector showing format version, verified metadata, algorithm IDs and tamper status.",
"EnvelopeHeader, CiphertextManifest, ValidationReport, CompatibilityState.",
"Bounded package parser, authenticated AAD checks, Uri stream and Compose schema viewer.",
"Reject malformed length/truncation/unsafe claims, display unverified fields distinctly.",
"Forged size/header, unknown version, nonces, tags, huge header, downgrade, truncated package.","04"),
33: ("Android AutofillService for verified password entries with explicit user enablement, safe matching and scoped fill.",
"AutofillCandidate, DatasetRequest, AppWebDomainMatch, AutofillConsent.",
"Android AutofillService/AssistStructure, Credential Manager compatibility when suitable.",
"Prevent phishing via hostname/package mismatch and unlocked-vault check; no automatic secret disclosure.",
"Valid/invalid field matching, locked vault, malicious lookalike domain, disabled service, reboot.","08,09"),
34: ("Offline security advisor using deterministic locally documented checklists, contextual warnings and evidence references.",
"AdvisorRule, AdvisoryFinding, RiskEvidence, DismissalRecord.",
"On-device rules; any optional AI must run separately with explicit non-secret prompts.",
"No unsupported intrusion claims; never access user secret data or transmit diagnostics silently.",
"Airplane mode, false positive messaging, source attribution, conflicting signals and dismiss state.","14,39"),
35: ("Multi-device pairing initiation/confirm, peer identity fingerprints, encrypted shared-key provisioning and revocation.",
"PairingSession, DevicePublicKey, PairingConfirmation, RevocationReceipt.",
"Android QR/BLE/nearby transports gated by capability, explicit approvals and audited cryptographic protocol.",
"No silent key export of Keystore-only material; handle device loss and recovery separately.",
"MITM substitute, expired invitation, cancelled QR, replay, disconnect, mismatched fingerprints.","12,16,28"),
36: ("Password strength audit for local vault entries without transmitting secrets; reuse checks and actionable remediation.",
"StrengthMetric, PasswordAuditFinding, ReuseFingerprint, AuditSummary.",
"On-device password evaluation library after review; decrypted fields only briefly in memory.",
"Do not log plaintext or upload hashes to third-party leak APIs without explicit consent and privacy review.",
"Weak/reused/unique, empty secret, massive vault performance, lock during scan and no false 'safe' label.","08"),
37: ("Argon2id password-based key derivation settings with controlled memory, time, salt and versioned KDF envelope.",
"KdfParameters, DerivedKeyPurpose, DerivationJob, MemoryBudget.",
"Vetted Argon2id dependency with Android ABI and memory compatibility checks; fallback must be explicit.",
"Never silently downgrade to PBKDF2/low-memory settings; zero/limit sensitive intermediates where possible.",
"Known Argon2id vectors, low-memory OOM handling, wrong password, upgrade/compatibility.","00"),
38: ("Signature studio with detached/attached outputs, key selection, verify and export in supported formats.",
"SignaturePackage, SignerPublicKey, SignerSelection, ExportFormat.",
"JCA/Keystore signing and SAF import/export with strict format IDs.",
"Distinguish verified cryptographic signature from trust in signer identity; no private key export.",
"Large-file sign, malformed signature, unsupported provider, mixed format and expiry UI.","12,19"),
39: ("Local security activity timeline using real auditable app actions, consented data retention and filtering.",
"SecurityEvent, AuditCategory, AuditRetention, SecurityAlert.",
"Encrypted Room audit repository, lifecycle event observability, no privileged system log access.",
"No fabricated camera/watch/spyware claims; never store secret values or raw credentials in events.",
"Audit events from real actions, timestamp changes, tamper warning, retention and disabled state.","00,14"),
40: ("Guided encrypted transfer wizard select -> encrypt -> verify receiver -> share -> verify receipt.",
"TransferDraft, TransferStage, RecipientValidation, TransferReceipt.",
"Compose navigation state machine + SAF + Sharesheet or approved peer transport.",
"No plaintext transfer, required confirmation at each trust boundary, no fake delivery receipt.",
"Back/cancel each step, recipient mismatch, interrupted network, replay and resume.","04,16,22"),
41: ("Create expiring secret capsule with encrypt/share, open-count metadata and honest expiry limitation messaging.",
"SecretCapsule, CapsulePolicy, CapsuleEnvelope, RedemptionReceipt.",
"Versioned encrypted package; optional remote expiry enforcement only with explicit backend architecture.",
"Offline copied ciphertext cannot be revoked; never claim remote deletion unless enforceable.",
"Expired offer, manipulated device clock, offline copy, wrong key, consumed link, server unavailable.","16,40"),
42: ("Session privacy preferences auto-lock, app switch masking, screenshot policies, clipboard timeout and privacy controls.",
"SessionPolicy, DeviceLockState, ScreenshotPolicy, ClipboardPolicy.",
"FLAG_SECURE, lifecycle events, BiometricPrompt integration, DataStore for nonsecret settings.",
"Prevent bypass via background/recents, never promise protection from compromised OS.",
"Background timeout, rotate, app restore, screen cast, changing settings and lockout.","02,14"),
43: ("End-to-end file checksum inspector with streaming hash, comparison and verified file identity evidence.",
"FileIntegrityJob, ChecksumManifest, IntegrityDifference, VerificationHistory.",
"SAF streaming MessageDigest, Compose progress; WorkManager for eligible deferrable jobs.",
"Hash alone doesn't prove trusted source; compare with user-provided trusted reference.",
"Modified file, wrong checksum, 4GB, cancellation, corrupt URI and timeout.","04,17"),
44: ("Secure clipboard action screen with copy warnings, clear/expiration, exact owner checks and minimal exposure UI.",
"SecureCopyLease, ClipboardLeaseOwner, ClipboardClearResult, CopySource.",
"Android ClipboardManager and OS clipboard APIs with version-aware restrictions.",
"Cannot guarantee global clipboard deletion or prevent third-party access; no silent clip replacement.",
"Copied twice, modified by other app, timer expires, background OS limitations and lock.","25,08")
}
assert len(names)==44 and len(rows)==44 and all(i in rows for i in range(1,45))
def write(p,content):
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(content.strip()+"\n", encoding="utf-8",newline="\n")

foundation="""# TASK 00 - Native Android full-stack foundation

STATUS: PLANNED. This is an execution spec, not a claim that Android is already implemented.

## Objective
Create the production Android Kotlin/Jetpack Compose vertical foundation alongside existing React/Electron assets WITHOUT deleting or replacing them. Preserve the current cinematic KNOUX stag-K identity and approved designs. Never migrate insecure legacy JavaScript crypto to native.

## Implementation
1. Inspect Git and Vercel/Anima agent output, collect actual current origin/main, all unique branches/worktrees/stash, existing Android Gradle modules and screenshot assets. Do not rebuild anything already done.
2. Native Android: Gradle Kotlin DSL; Kotlin; Compose + Material 3 themed KNOUX tokens; Navigation Compose; ViewModel + StateFlow + Coroutines; Hilt or selected DI; Room for nonsecret metadata and correctly encrypted sensitive fields; DataStore for nonsecret settings; WorkManager only for valid background work.
3. Modules, if appropriate to repo: :app, :core:designsystem, :core:domain, :core:crypto, :core:keyring, :core:storage, :core:files, :core:capability, :core:testing; :feature:<name> modules as actual boundaries, not empty scaffolding.
4. Crypto boundary: audited AEAD with unique nonces and AAD, versioned envelope, authenticated chunked file streaming, Android Keystore wrapping and explicit fallback, dedicated encrypted restore/recovery. No custom block modes or unauthenticated legacy primitives. Define key lifecycle, error types and event audit.
5. Security: OWASP MASVS checks, least Android permissions, no analytics on secrets, threat model and signed-app provenance; do not claim StrongBox/Keystore hardware guarantees without runtime evidence.
6. Android entry route: SPLASH_ENTRY -> SECURE_ACCESS_LOGIN -> HOME. Require real lock policy to access actual secrets; temporary demo entry is explicitly feature-flagged and disabled in release.
7. App UI: use current approved screen images as reference, implement real native Compose components; not a screenshot wrapped in click hotspots; compare snapshots for responsive Android, dark mode, RTL, reduced motion, clipping, safe areas, and logo clearance.
8. If an external service is truly needed, define threat boundary, minimal ciphertext-only DTO schema, authentication, authorization, data retention, abuse limits, OpenAPI contract, staging and server test suite before making server calls. Offline features remain fully native; a server is NOT fabricated to call them 'full-stack'.
9. Establish build/test scripts, emulator/device provisioning within disk budget, detekt/ktlint, security vectors, Android instrumented tests, accessibility and screenshot regression CI. Check actual latest Google Play target SDK requirements before release.
10. Maintain one truthful feature registry: PLANNED, UNSUPPORTED, IMPLEMENTED_UNVERIFIED, TESTED, AUDITED. Every claim tied to SHA, test command, report and actual device evidence.

## Acceptance
Android debug build installs and launches on a tested Android device/emulator; route stack and lock state function; core AEAD tests pass independent vectors; no actual secrets in logs; screenshot parity assessed; CI and gradle outputs archived; app remains independent of Windows BitLocker/VeraCrypt assumptions. No PASS without evidence.
"""
write(OUT/"00_ANDROID_FOUNDATION"/"TASK.md",foundation)

for i,slug in enumerate(names,1):
    n=f"{i:02d}"
    flow,data,platform,security,tests,deps=rows[i]
    module=slug.lower()
    visual=f"visuals/ANIMA_MISSIONS_01-44/{n}_{slug}/{n}_{slug}.png"
    prompt=f"visuals/ANIMA_MISSIONS_01-44/{n}_{slug}/{n}_{slug}.txt"
    path=OUT/f"{n}_{slug}"/"TASK.md"
    route=slug
    contract=f"""# TASK {n} - {slug.replace('_',' ').title()}

**Status:** PLANNED / NOT YET IMPLEMENTED. **Priority:** {'P0' if i in [1,2,3,4,12,15,31] else 'P1' if i<=30 else 'P2 dependent on reviewed prerequisites'}.
**Feature ID:** \`{route}\`. **Prerequisite tasks:** {deps}. **Owner:** future local Android integration agent.
**Approved visual reference:** \`{visual}\`.
**Anima screen instruction:** \`{prompt}\`.
These file paths are local reference mappings; inspect actual presence and approvals before using. Never treat a concept image as a tested production screen.

## User-facing service: end-to-end behavior
{flow}

## Native Android implementation - not a web wrapper
- Reuse Android foundation from TASK 00 and code already implemented/verified. Implement \`feature:{module}\` or merge into an existing compatible feature module; avoid duplicating screens, ViewModels, routes or services.
- Compose UI must reproduce the approved screen: stag-K artwork, geometry, lighting, page-specific motion, content spacing, responsive insets, Android back stack, accessibility, Arabic RTL/English LTR, keyboard and real component tap states.
- Bind actual ViewModel StateFlow to real use cases and repository operations: \`Load{slug.title().replace('_','')}State\`, \`Execute{slug.title().replace('_','')}Action\`, \`Observe{slug.title().replace('_','')}Events\` are proposed domain names, not an instruction to add three redundant classes unconditionally.
- User must see distinct idle, loading, ready, completed, rejected, cancelled, unsupported, permission-denied and recoverable-error states as appropriate. No dead buttons, fake spinners, fake success statuses or animations standing in for backend work.
- Screen-specific UI behavior: {flow}
- On-demand visual motion must derive from the page purpose; violet sparks remain behind text, pointer-events cannot intercept touches, safe-area layout takes precedence over ornamental effects. Sound optional, OFF by default.

## Data contracts and persistence
- Domain entities and DTOs to define and version: {data}
- Repository functions: list/load; create/import; validate; execute; observe progress; update/delete/export/restore only when relevant to this service.
- Persist real encrypted data at rest when needed; DataStore only for nonsecret settings; Room with ciphertext boundaries and safe migrations; lifecycle-aware cancellation and automatic lock handling.
- Never put raw secrets, OTP seeds, plaintext files, derived keys, PINs, private keys or sensitive URLs into logs, crash analytics, unencrypted Room tables or Compose saved state.
- Errors must be typed, user-actionable and remain stable across process death; no silent fallback to fake demo data.

## Platform integration
{platform}
- Map OS permissions to real Android permission requests or system pickers; do not request obsolete broad storage privileges. Handle revoked grants, locked device, background restrictions and unsupported hardware.
- Full vertical stack means Compose UI -> ViewModel -> domain use case -> vetted core service -> encrypted local repository and/or OS API -> observable real outcome.
- Network or server implementation is conditional on a real requirement: explicit consent, provider credentials and documented trust boundary. If no remote component is needed, an entirely OFFLINE NATIVE full-stack feature is correct; never build a pointless server.

## Threat model and failure behavior
{security}
- Use established keyring, AEAD and versioned package APIs. Never implement private crypto primitives, migrate unauthenticated legacy algorithms blindly, or claim untested Android capabilities.
- Define failure, rollback, integrity and recovery semantics before destructive effects; original user data preserved until separately approved operation.
- For any user data that cannot be safely accessed, show truthful unavailable/permission-required state instead of simulated completion.

## Feature test plan - mandatory before closure
- Primary user workflow executes end-to-end on device, including process restart, screen rotate, lifecycle, Android back navigation and repeated invocation.
- Negative/edge cases specific to the service: {tests}
- Unit tests (known-answer vectors where cryptography relevant), repository persistence test, integration tests with real OS boundaries, Compose UI tests and device screenshot comparison against provided visual; test at narrow widths, high font scaling, RTL and reduced motion.
- Confirm zero known secret leakage in persistent storage, clipboard/screenshots/logcat, deep links and exported URIs for applicable threat boundaries.
- Test error/cancel/retry semantics, content integrity, and build/CI jobs. If blocked by absent backend/keys/hardware, label BLOCKED and show verified unsupported UI instead of claiming implemented.

## Delivery evidence and done definition
- Report actual modified Kotlin/Gradle files, working route, dependency updates, tests run and their raw results, Git SHA/branch, screenshots/diffs, emulator/phone API level and runtime behavior.
- A feature is COMPLETE only after the real UI, core service and persistence/OS/optional backend integration behave correctly with evidence. A React/Anima prototype, compiled Compose UI or passing build alone is NOT proof.
- Integrate the completed module safely with previous feature routes, preserve existing approved layout and unique code; move to task {i+1:02d} ONLY after documenting the actual state, or continue under explicit BLOCKED condition with no fake closure.
"""
    write(path,contract)

final="""# TASK 45 - Native Android integration, security and release gates

Status: PLANNED. This is the last gate, not a pre-approved release.

1. Reconcile all TASK 00..44, source and latest remote main; protect unique visual and local commits, branches, worktrees, stashes and untracked assets. Never reset/clean/force without owner approval.
2. Validate 44 route registrations, biometric gate, cryptographic lifecycles, storage migrations, export/import contracts, offline operation, optional provider boundaries, and failure handling.
3. Lock down service capability claims and hidden placeholder states; blocked P2 services remain disabled and explicit if provider/hardware/security audit unavailable.
4. Run gradle tests + lint + Android instrumented suites + property/fuzz/negative crypto tests + key rotation and recovery DRILL on a separate device. Inspect raw output.
5. Compare each native Compose screen to its exact approved reference. Check no visual regressions on Splash, Auth, Home, deer logo eye animation, violet particles, keyboard, RTL, small screens, Dark/Day and touch affordance.
6. Security: Android Keystore behavior on tested devices, permission downgrade, replay/tamper, nonces, encrypted logs audit, backup exclusion, release keystore provenance and supply-chain/SBOM. Independent review needed for strong security marketing claims.
7. Build signed AAB with authorized signing key only, verify Android target/permissions policies and pre-launch report, review CI and publish only with explicit owner authorization.
8. Evidence-ledger per feature: sha, branch, PR, merged, deployed, installed, raw commands/results, screenshots and release track. Distinguish implemented, unverified, unmerged, unpushed, unreleased and blocked.
9. Never announce 100%, COMPLETE, AUDITED, RELEASED or Google Play approval without evidence for each applicable gate.
"""
write(OUT/"45_FINAL_INTEGRATION"/"TASK.md",final)
readme="""# KNOUX CRYPT - Android Full-Stack Execution Missions (46 tasks)

## Delivery model
This folder holds **44 screen-by-screen vertical service missions**, plus **00 native foundation** and **45 final integration/release**. It is separate from Anima/Vercel visual work and does not change UI code or repository history by itself. Everything starts PLANNED.

### Execution order
00 Android foundation -> 01 Splash -> 02 Secure Access -> 03 Home -> 04..44 actual services (respect dependency notes) -> 45 integrated device test/release gates.

### Exact directory mapping
Each numbered task is one directory with exactly one \`TASK.md\`. A task describes: approved UI parity, Android Kotlin/Compose implementation, domain models, crypto/privacy boundaries, persistence, optional network backend when genuinely required, per-feature errors, tests and verified deliverables.

### Non-negotiable guardrails
- Production path: Kotlin + Jetpack Compose, Android Keystore and vetted crypto, scoped storage, Room encrypted content and modern lifecycle. **Not** Electron, React Native or website-in-WebView.
- UI reference: owner-approved KNOUX identity and screenshot, one image per screen. Preserve active Vercel/Anima visual agent work; avoid parallel edits to its files.
- Android local gate: Splash -> Secure Access -> Home; once production auth is implemented, it must not be bypassable. Demo-only visual login is never production access.
- Security: authentic encryption, nonce and key lifecycle, documented recovery, no simulated progress/status, no 'unhackable' claims, meaningful device and tamper tests.
- Server code ONLY for features that actually need remote services and only with provider approval/consent: ciphertext-only sync, key exchange metadata, OAuth server-side auth when approved; never offload raw vault keys/secret plaintext.
- Treat each task as a dependency-complete vertical slice; do not create 44 empty screens and claim full stack.
- If external keys, credentials, account ownership or destructive/release actions are needed, BLOCKED is the correct non-interactive stop. Continue safe independent tasks without asking repeated questions.

### Source of truth
Review \`android-spec/ANDROID_ARCHITECTURE.md\`, \`android-spec/CRYPTO_SECURITY_CONTRACT.md\`, \`missions/SERVICE_CATALOG.md\`, and the latest remote main and current visual code. Existing 35 missions remain useful, not superseded or deleted.

### Begin
Read \`LOCAL_AGENT_AFTER_VISUALS.md\` in this directory for an executable, evidence-led implementation mandate.
"""
write(OUT/"README.md",readme)
handoff="""# KNOUX CRYPT - LOCAL ANDROID AGENT: EXECUTE AFTER VERCEL/ANIMA VISUAL WORK

YOU ARE THE IMPLEMENTATION AGENT FOR AN ANDROID NATIVE APPLICATION.
THIS IS EXECUTION, NOT A DESIGN DISCUSSION OR A PLANNING-ONLY REPORT.
Read this entire mandate, then TASK 00 and each TASK 01..45.

## Work ownership and readiness
The Vercel/Anima agent is currently editing screens and the GitHub repository. DO NOT run a competing edit on the same app files. Start the actual Android port only after the user says the visual agent has finished or there is clear evidence that its current branch/PR has been merged/reconciled. Do not assume a process is finished from one silent minute.

## Step A - establish Git reality before ANY write
1. Confirm exact local repo path, git status --short, git rev-parse HEAD, git remote -v, git ls-remote origin refs/heads/main, git branch -avv, git worktree list --porcelain, git stash list, reflog and all local untracked screenshots/files.
2. Compare origin/main with remote live HEAD and GitHub PR status. Existing local planning branch is distinct from production main and may have unique mission work; NEVER discard it as outdated. Determine which work exists only in local branches/worktrees or agent PRs.
3. Establish a non-destructive preservation point and inventory; export patch/bundle or copy untracked work to reviewed safe location before risky reconciliation. Do not rewrite Git history, hard reset, clean, force push, delete branches/worktrees or overwrite assets.
4. Fetch remote refs, then build a reconciliation matrix: REMOTE MAIN, LOCAL CURRENT, UNIQUE BRANCHES, ACTIVE AGENTS, APPROVED UI assets, UNMERGED TASK BRANCHES. Merge/cherry-pick scoped work only after confirming uniqueness, conflicts and current visual acceptance. Make integrated changes on a dedicated Android feature branch, leaving main clean until reviewed.
5. Read the latest actual source and mission notes. If Vercel's work remains in flight, do read-only reconciliation, then stop at the boundary rather than colliding with another agent.

## Step B - implement native Android, service by service
1. TASK 00: Create tested Gradle Kotlin DSL Android app with Jetpack Compose UI, Navigation, MVVM/StateFlow, DI, Room protected repository, Keystore-backed keyring and vetted crypto. Do NOT reuse insecure JS block cipher as production crypto.
2. Implement 01 Splash -> 02 Secure Access -> 03 Home, adhering to the ORIGINAL purple stag-K visual identity. Preserve logo proportions, center auth block, collision-free wordmark, safe areas, ambient violet particles, reduced motion and optional sound.
3. For each TASK 04..44: read its file; inspect existing implementation and avoid duplicate work; implement the complete vertical path: native Compose screen + state and forms + domain workflow + crypto/OS/native services + real encrypted storage where applicable + optional consented backend only if necessary + errors/cancel/restore + tests.
4. All routes must resolve, be locked appropriately, and retain navigation/back state. Integrate unfinished P2 only with truthful disabled/gated state; do not claim a dummy demo is complete.
5. Every service's fully functional production behavior must follow Android platform realities: Scoped Storage, Photo Picker, BiometricPrompt, Android Keystore, WorkManager, AutofillService, ClipboardManager, NDK only where justified, signed AAB, release prerequisites. Determine tested minSdk/targetSdk from current Android/Google Play requirements.
6. Implement end-to-end security with AEAD, versioned envelopes, vetted algorithms, fresh nonces, authenticated chunking, reliable key rotation, recovery across devices and no secret exposure in logs. External sync must never receive raw plaintext secrets or device Keystore keys.
7. Maintain visual parity with each approved PNG, including dimension ratios, logo gap, spacings, gravity/centering, motion and RTL. No full-screen screenshot with invisible taps.

## Step C - independent audit gates
For EACH task report: REALITY -> RISKS -> UNIQUE WORK -> GAPS -> SAFE NEXT ACTION.
Mark exactly PLANNED, BLOCKED, PRESENT_UNMERGED, IMPLEMENTED_UNVERIFIED, TESTED, MERGED_NOT_RELEASED or RELEASED only when raw evidence supports it.
Run unit tests, negative cryptographic vectors, instrumented device tests, screenshot diffs and build. Record commands, exact output, current commit SHA, target branch, deployment and physical/emulator validation. A build passing alone != production. Preserve independent agent evidence and failed tests.

## Step D - finish and reconcile
After task 44, complete TASK 45: integrate modules, test hostile inputs and interrupted operations, verify recovery on a second device, security review and signed Android App Bundle. Only push reviewed scoped commits; merge after actual CI and code review. Publishing to Google Play, signing account changes, new billing/provider setup, deleting user data or destructive Git actions need owner authorization; do not invent credentials or bypass those decisions.

## Autonomy and no-interruption rule
Work autonomously in non-destructive bounds. When information is available in repo/code/CI, inspect it rather than asking. If a task is blocked on missing API key, external provider, permission, hardware or owner approval, document BLOCKED with evidence, disable unavailable functionality honestly, and continue the next safe independent task. Do not fake closure or silently skip a P0 security requirement.

## Minimal final report
1. Verified HEAD, source and branch vs remote; 2. Visual source and SHA; 3. Feature tasks completed with actual tests; 4. Unique work preserved; 5. Unmerged/unpushed work; 6. Remaining blockers; 7. Safest next action.
"""
write(OUT/"LOCAL_AGENT_AFTER_VISUALS.md",handoff)
data={"count":len(names),"tasks":[{"id":f"{i:02d}","name":n,"prerequisites":rows[i][5],"path":f"{i:02d}_{n}/TASK.md"} for i,n in enumerate(names,1)]}
write(OUT/"TASK_INDEX.json",json.dumps(data,indent=2))
# Strict verification: count, route, alignment and readability.
dirs=[p for p in OUT.iterdir() if p.is_dir()]
assert len(dirs)==46, len(dirs)
assert sum((p/"TASK.md").exists() for p in dirs)==46
assert len([p for p in OUT.iterdir() if p.is_file()])==4
for i,slug in enumerate(names,1):
    expected=VIS/f"{i:02d}_{slug}"/f"{i:02d}_{slug}.png"
    if not expected.is_file(): raise RuntimeError(f"Missing visual {expected}")
    t=(OUT/f"{i:02d}_{slug}"/"TASK.md").read_text(encoding="utf-8")
    assert len(t)>2500 and "DONE" not in t[:250]
print("BUILT",OUT)
print("FOLDERS",len(dirs),"TASKS",len(names),"TASK_FILES",46,"ROOT_DOCS",4)
print("BYTES",sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file()))
print("SHA256",hashlib.sha256("".join(p.read_text(encoding="utf-8") for p in sorted(OUT.rglob("*.md"))).encode()).hexdigest())
