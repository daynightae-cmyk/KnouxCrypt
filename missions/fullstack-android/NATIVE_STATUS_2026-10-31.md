# NATIVE IMPLEMENTATION STATUS — 2026-10-31

**Branch:** `android/native-implementation-20261031`
**Implementation commit:** `2975ec6b7508b9f51305a808470475453e1cf3ed`
**Security P0 commit:** `c3f718f7cee4b8f663b05e9d3aae858101554029`
**Argon2id/KNP2 commit:** `a2ec4b7d2122e40fa5182ade580245b9c26c7c30`
**Backup/restore commit:** `aedb4c3f88910af4962d2ed517a1df2f1e8736ea`
**Revocation boundary + TASK 31 commit:** `176d8c38557893b773e598f596dd81c8aea90240`
**Session privacy commit:** `3091032a7059e1ab3a52166436558350d6346030`
**Keystore IV compatibility fix:** `ca7a1bce8ec6108318f6d60907218777d236ca56`
**File integrity commit:** `1d26033d1cc89b4d0d68e1bb6da4ff6b1a8c5a90`
**HMAC + review hardening commit:** `f82010e1761326fe7262c57f887d16288f320abb`
**HMAC cancellation commit:** `012456058ca7f4579b93d5dc168a608a910f8977`
**Clipboard Guard + Secure Clipboard commit:** `25b5acb6cffea6e4cc6423b07370ec5eae726c93`
**Package Inspector source commit:** `fdbcb81d6974e0efaf6ed3165fc23b4d99397f53`
**Password strength audit (TASK 36) commit:** `6db826329ba2131196d3b232b350ff19f9350258`
**Branch sync to main (fast-forward) before TASK 36:** `607e9c3`
**PR #14 reconciliation merge:** `b4fe65c`
**Main merge (owner-requested consolidation):** `4bdb5614d415b2c8a8c07056af13fd8849b75c02`
**Base:** `integration/knoux-crypt-android-ready-20261030` @ `8f6f992`
**PR #14 branch untouched:** `android/task00-foundation-review` @ `310665d` (still unmerged, not deleted).

**Overall:** native foundation is BUILD_VERIFIED and JVM-TESTED on the Windows machine; every native runtime/security claim below remains DEVICE_UNVERIFIED. No APK was installed or launched.

## Verification ledger (actual, this session)

| Check | Command | Result |
|---|---|---|
| Crypto + data unit tests | `./gradlew :core:security:test :core:data:test` | PASS — 40 tests, 0 failures |
| App unit tests | `./gradlew :app:testDebugUnitTest` | PASS — 4 tests, 0 failures |
| Debug APK | `./gradlew :app:assembleDebug` | PASS — 14,383,574 bytes |
| APK SHA-256 | `sha256sum` | `7608ea31a33f4beb1a64c3ef776deb63a53358f01a26c5494d885e6f36482cd9` |
| Android lint | `./gradlew :app:lintDebug` | PASS — 0 errors, 12 warnings (dependency updates, API-33 attribute) |
| Instrumented test sources | `./gradlew :app:compileDebugAndroidTestKotlin :core:data:compileDebugAndroidTestKotlin` | PASS (compiled, **NOT RUN**) |
| Current security tests (fresh, split) | `./gradlew :core:security:test --rerun-tasks --no-daemon -Dorg.gradle.jvmargs=-Xmx1024m...` | PASS, exit 0 — **54 tests** |
| Current data tests (fresh, split) | `./gradlew :core:data:testDebugUnitTest --rerun-tasks --no-daemon ...` | PASS, exit 0 — **63 tests** |
| Current app tests (fresh, split) | `./gradlew :app:testDebugUnitTest --rerun-tasks --no-daemon ...` | PASS, exit 0 — **11 tests** |
| Aggregate JVM | result XML count | **132 tests, 0 skipped, 0 failures, 0 errors** (security 58, data 63, app 11) |
| Current lint | `./gradlew :core:data:lintDebug :app:lintDebug --no-daemon` | PASS, exit 0 — 0 errors (10 app/8 core warnings) |
| Current debug APK | `./gradlew :app:compileDebugAndroidTestKotlin :core:data:compileDebugAndroidTestKotlin :app:assembleDebug --no-daemon` | PASS — 17,728,991 bytes, SHA-256 `1dc5d6fc…3e3e` |
| Combined 1.5 GiB run | single `--rerun-tasks` invocation | **INCONCLUSIVE** — host JVM crashed (malloc/`hs_err`), not a test failure; split runs above are authoritative |
| Device availability | `adb devices`; `HypervisorPresent` | **No device; False** → no emulator |

Test distribution (current): security 58 (FileEnvelope 13 + KNF2 8 + Hashing 3 + HMAC 2 + PackageInspector 4 + Argon2id 3 + Foundation 10 + PassphraseEnvelope 8 + Totp 7); data 63 (SecretCodec 6, SecurityBoundary 26, VaultKeyRotation 16, VaultBackup 10, VaultKeyWrapper 3, SessionPrivacyPolicy 2); app 11 (Catalog 4, HmacJobGate 3, HmacStreamer 2, ClipboardLeasePolicy 2).

## Classification by mission

| ID | Mission | Status |
|---|---|---|
| 00 | Native foundation | **BUILD_VERIFIED + JVM-TESTED**; device/security review open |
| 01 | Splash entry | **BUILD_VERIFIED** (UI); device screenshot open |
| 02 | Secure access login | **BUILD_VERIFIED + JVM-TESTED (25 boundary/revocation tests)**; BiometricPrompt/Keystore runtime **DEVICE_UNVERIFIED**; locked-state reset removed, atomic gate rotation added, lock now waits for in-flight authorized commits |
| 03 | Home | **BUILD_VERIFIED + catalog tests**; device visual parity open |
| 04 | File cipher | **BUILD_VERIFIED + core TESTED (18 = KNF1 13 + KNF2 5)**: new device files use wrapped per-file DEK KNF2, legacy KNF1 readable; SAF/device open |
| 05 | Shadow vault | PLANNED — design-only placeholder |
| 06 | Secure notes | **BUILD_VERIFIED + codec TESTED**; Room/device test open |
| 07 | Notes editor | PLANNED as a dedicated task (inline editor exists inside 06) |
| 08 | Passwords | **BUILD_VERIFIED + codec TESTED**; sensitive-copy clipboard timeout wired; autofill/device open |
| 09 | Password detail | **SOURCE_IMPLEMENTED + JVM_TESTED (17 new) + RULES DEVICE_VERIFIED (3 instrumented Room tests) — SCREEN DEVICE_UNVERIFIED / AUDIT_PENDING**: `password_detail/{recordId}` route, live-capability load with LOADING/READY/MISSING/UNREADABLE/LOCKED states, masked secret with 60 s freshness gate and 15 s auto-hide, managed-lease copy, validated origin, plaintext-free bounded history, session-only access log, real SecureRandom generator |
| 10 | Authenticator | **BUILD_VERIFIED + TOTP TESTED (RFC 6238)**; device clock/UI open |
| 11 | Auth import | **SOURCE_IMPLEMENTED + JVM_TESTED (13) + RULES DEVICE_VERIFIED (1 instrumented) — UI DEVICE_UNVERIFIED**: otpauth TOTP + bounded migration protobuf parser, ZXing image picker, CameraX scanner, per-account preview, duplicate Skip/Replace, atomic batch commit, typed refusals for HOTP/MD5/malformed |
| 12 | Key Forge | **BUILD_VERIFIED** (ephemeral key only); persistent keyring open |
| 13 | Key details | **SOURCE_IMPLEMENTED + JVM_TESTED (4) + METADATA DEVICE_VERIFIED (1 instrumented) — SCREEN DEVICE_UNVERIFIED**: real Keystore alias/algorithm/purposes/protection class from KeyInfo, keyring integrity fingerprint, honest "no public key / signing unsupported" states, rotation delegated to the existing authorized wizard |
| 14 | Privacy Center | **BUILD_VERIFIED** (UI); security review open |
| 15 | Backup / Recovery | **PARTIAL / BUILD_VERIFIED + TESTED_LOCAL (10)**: KNP2/Argon2id data export & conflict-safe restore; rotation exists separately but the root is retained and gate recovery is absent; SAF **DEVICE_UNVERIFIED** |
| 16 | Secure share | PLANNED |
| 17 | Hash & Integrity | **BUILD_VERIFIED + TESTED**; device SAF open |
| 18 | Text cipher | **BUILD_VERIFIED + TESTED (8)**; KNP2/Argon2id writes, KNP1 readable; device UI open |
| 19 | Digital signature | **SOURCE_IMPLEMENTED + JVM_TESTED (7) + CRYPTO DEVICE_VERIFIED (1 instrumented) — SCREEN DEVICE_UNVERIFIED**: detached SHA-256 signatures (ECDSA P-256 or RSA-2048 per device), Keystore key with a vault-encrypted software fallback for providers without asymmetric support, content-changed vs invalid-signature verdicts, public key export, no identity claim |
| 20 | Certificate inspector | PLANNED |
| 21 | Encrypted archive | PLANNED (KNF1 core exists; archive UI does not) |
| 22 | Local transfer | PLANNED |
| 23 | Fingerprint verify | **SOURCE_IMPLEMENTED + JVM_TESTED (5) — SCREEN DEVICE_UNVERIFIED**: SSH-style `SHA256:` fingerprint of public-key SPKI, compare against a pasted fingerprint or public key, imported public keys stored encrypted |
| 24 | Metadata cleaner | PLANNED |
| 25 | Clipboard guard | **BUILD_VERIFIED + JVM_TESTED (policy) — DEVICE_UNVERIFIED**: metadata-only exposure, managed/foreign/expired states, explicit clear, no silent foreign clearing; reuses TASK 42 service |
| 26 | Secure random | **BUILD_VERIFIED + TESTED**; device UI open |
| 27 | HMAC authenticity | **BUILD_VERIFIED + JVM_TESTED (RFC 4231) — DEVICE_UNVERIFIED**: text/file streaming HMAC-SHA-256, constant-time verify, local key handling, HMAC Lab route |
| 28 | Public-key QR | **SOURCE_IMPLEMENTED + QR DEVICE_VERIFIED (round-trip decode) — SCREEN DEVICE_UNVERIFIED**: ZXing-generated code carrying `knouxkey:v1:` public-key URI with fingerprint and plain text beside it |
| 29 | Vault collections | PLANNED |
| 30 | Document viewer | PLANNED |
| 31 | Vault key rotation | **SOURCE_IMPLEMENTED + JVM_TESTED (15) — DEVICE_UNVERIFIED / AUDIT_PENDING**: root-wrapped DEK hierarchy, KNC2/room v2, reauth, journal, resumable batches, retirement guard, real wizard; KNF2 device files + legacy KNF1 readable, root retained |
| 32 | Package inspector | **BUILD_VERIFIED + JVM_TESTED (4) — DEVICE_UNVERIFIED**: bounded KNF1/KNF2/KNP1/KNP2 header metadata, structural vs authenticity separation, forged/truncated rejection; SAF UI |
| 33 | Android autofill | PLANNED |
| 34 | Offline advisor | PLANNED |
| 35 | Multi-device pairing | PLANNED |
| 36 | Password strength audit | **SOURCE_IMPLEMENTED + JVM_TESTED (12 engine + 12 audit) — DEVICE_UNVERIFIED / AUDIT_PENDING**: offline deterministic strength model v1, vault-wide reuse/blank/stale/unreadable audit through the revocation boundary, transient grouping digest, gaps never reported as clean, `password_audit` route |
| 37 | Argon2id KDF | **BUILD_VERIFIED + TESTED_LOCAL (KAT)** — KNP2, KDF tool; passphrase files still KNF1/PBKDF2; device files KNF2; DEVICE_UNVERIFIED |
| 38 | Signature studio | PLANNED |
| 39 | Security activity | PLANNED |
| 40 | Transfer wizard | PLANNED |
| 41 | Expiring capsule | PLANNED |
| 42 | Session privacy controls | **BUILD_VERIFIED + JVM_TESTED policy (2) — DEVICE_UNVERIFIED**: configurable auto-lock, screen-off lock, clipboard timeout + lock clear, screenshot policy, app-switch cover, mutation/revocation serialization |
| 43 | File integrity tool | **BUILD_VERIFIED + JVM_TESTED (hash vectors) — DEVICE_UNVERIFIED**: streaming SHA-256, checksum validation, match/mismatch evidence, cancel, in-memory reports, dedicated `file_integrity` route reusing Hash & Integrity |
| 44 | Secure clipboard | **BUILD_VERIFIED + JVM_TESTED (policy) — DEVICE_UNVERIFIED**: managed copy action, hidden staged value, timeout/clear, guard linkage; no guaranteed erasure |
| 45 | Final integration/verification | **SOURCE-LEVEL AUDIT DONE / DEVICE PARTIALLY VERIFIED / RELEASE_BLOCKED / AUDIT_PENDING**: 34 Tools destinations (20 implemented / 14 design-only) plus the non-catalog `password_detail`, `auth_import` and `key_details` routes; 212 JVM tests and 13 instrumented tests passing on one Android 15 handset; device/signing/audit/visual gates remain open |

Catalog accounting: 34 destinations total = **20 IMPLEMENTED**, **0 BLOCKED**, **14 DESIGN_ONLY** (Recovery is implemented for encrypted data export/restore; gate recovery remains out of scope. Key rotation is an internal Account wizard, not a new Tools destination. Password Audit is a Tools destination added by TASK 36). Eight Home cards preserved in the accepted order.

## Reality of the implementation

- Modules: `:app`, `:core:designsystem`, `:core:security`, `:core:data`.
- Entry flow, 8 Home cards, 34-tool directory, AR/EN search + RTL + reduced motion, Account, truthful Privacy, encrypted KNP2 data backup/restore.
- KNC1/KNC2 small-record AEAD, KNF2 wrapped-per-file-DEK device files with legacy KNF1 readable, KNF1/passphrase files, KNP2/Argon2id text with KNP1 readable, RFC 6238 TOTP, SHA-256/HMAC, SecureRandom.
- Keystore: non-exportable master data key; auth-per-use unlock keys + check token; sealed session capability; 30 s background lock; atomic owner-authorized gate rotation with no locked-state reset. **The data key is not auth-bound per use** — documented in-app and here.
- Room stores only ciphertext rows plus id/kind/timestamp; DataStore stores nonsecret settings only; Android backup is disabled; no INTERNET permission.

## Risks and gaps

1. **Device verification started, not finished**: the first hardware run (2026-11-01, itel S686LN /
   Android 15 / API 35) executed all 8 instrumented tests green and behaviourally confirmed the
   auth-bound gate and the screenshot policy on one handset. Still missing on real hardware: install
   lifecycle and rotation, backup/restore through SAF, clipboard vendor behaviour, package inspector
   on a real file, screen-off timing, TalkBack/font-scaling and canonical screenshots. No device
   class coverage beyond this single low-cost TEE handset, and no independent review.
2. **No security audit**: formats and code are tested but not reviewed externally; no fuzzing or dependency CVE scan.
3. **Crypto scope**: KNP2 text uses Argon2id; passphrase files remain KNF1/PBKDF2 and device files use KNF2; record DEK rotation exists but the Keystore root is retained and lost-gate recovery is absent; no large-file soak; nonce/key-usage limits not formally analyzed.
4. **Auth binding**: master key use is gated by the app capability, not per-use biometric authorization.
5. **Design-only majority**: 17 tools remain explicit placeholders; they do not fake operations.
6. **Gate recovery**: a biometric-invalidated or lost gate shows a truthful non-destructive recovery-required state. Data can be backed up/restored, but the gate and Keystore root key cannot be restored. Data-key rotation exists; the root key is retained for KNF1 files.
7. **Biometric cipher identity**: unlock passes the exact prepared `Cipher` back to the domain and rejects substitution; real `BiometricPrompt` same-instance behavior is still DEVICE_UNVERIFIED.
6. **Visual parity**: PR15 is the accepted baseline, not pixel certification; the external Preview artifact is not the APK.
7. **PR14 review branch** remains unmerged and untouched. The owner requested consolidation of this implementation branch into `main`; a normal conflict-free merge was pushed at `4bdb561`. This does not constitute device verification, release approval, signing or an audit.

## Safe next actions (dependency-aware)

1. **Device/audit gate:** run the new rotation, Keystore/KNF2 and Room migration instrumentation on real hardware; test privacy timing/clipboard and file-integrity SAF/cancel/4GB; capture AR/EN screenshots; commission independent review. TASK 31/42/43 are source-implemented but DEVICE_UNVERIFIED/AUDIT_PENDING. Root retention for existing external KNF1 files remains documented.
2. **Remaining vertical slices:** 05 Vault/Shadow Vault, 07 Notes editor, 11 Auth import (dependency-ready), 19 Signatures, 21 Archive, 28 QR, 30 Document viewer, 33 Autofill, remaining design-only services.
3. **Device gate:** follow `DEVICE_VERIFICATION_CHECKLIST.md`; install `app-debug.apk`, run all instrumented classes (access, Keystore record/KDK1/KNF2, Room migration), test privacy timing/clipboard/screen capture, HMAC/file integrity/package inspector, then capture Compose screenshots at 360/390/441 widths in EN/AR and compare against canonical references.
4. **Quality gate:** detekt/ktlint, dependency locking, CVE scan, R8 shrinking (BouncyCastle adds 3.18 MB), and a real CI workflow (the PR14 template remains uninstalled).

## TASK 23 fingerprint verify + TASK 28 public-key QR — 2026-11-01

- Public-key fingerprints use the SSH-style `SHA256:<base64url>` form over the key's SPKI bytes,
  with known-answer vectors and case/whitespace-tolerant comparison. A fingerprint identifies a
  public key only; no secret is ever fingerprinted.
- The fingerprint screen compares this device's signing key against a pasted fingerprint or public
  key and keeps imported public keys as encrypted vault records; the QR screen renders the public
  key as a scannable `knouxkey:v1:` URI with the fingerprint and the plain text next to it. Both
  reuse the TASK 19 signing engine.
- Verification: **212 JVM tests, 0 failures** (security 102, data 93, app 17); `:core:data`
  **13/13 PASS** on the itel S686LN; the new app-module QR test decodes the generated code back
  to the exact URI; lint 0 errors; clean APK 19,712,121 bytes, SHA-256 `e03a0baf…94f0`, installed
  and cold-started without crash entries.
- Both screens are DEVICE_UNVERIFIED (unlocked session needed). The app-module entry-flow UI test
  passes when the phone is free — it passed in the earlier device runs — and currently fails while
  another app holds the foreground; that is an environment condition, not an app crash.

## TASK 19 digital signature — 2026-11-01

- Detached signatures over the SHA-256 digest of the content: SHA-256/ECDSA P-256 or
  SHA-256/RSA-2048, chosen by what the device supports. Verdicts separate "content changed"
  from "invalid signature" from "malformed", and any other algorithm is refused.
- **Device finding that changed the design**: the itel S686LN's AndroidKeyStore provider implements
  only AES — it answers "no such algorithm: EC for provider AndroidKeyStore" and the same for RSA.
  The signing service therefore has two honest origins: a Keystore key when the platform can
  create one, or a software EC key pair stored as an encrypted vault record (protected by the
  Keystore-rooted data-key hierarchy, explicitly not hardware-backed). The UI states which one is
  in use.
- Stored records keep the signature, digest, public key and algorithm — never the signed document.
  Verification proves possession of the matching private key and never claims an identity.
- Verification: **207 JVM tests, 0 failures** (security 97, data 93, app 17); instrumented
  **13/13 PASS** on the itel S686LN including `SigningDeviceTest`, which signs on the device,
  verifies with the exported public key, refuses altered content and asserts the stored row holds
  no private key material; lint 0 errors; clean APK 19,712,121 bytes, SHA-256 `4f48d6d0…fa2057`,
  installed and cold-started without crash entries.
- Screen layout, RTL and the copy interactions remain DEVICE_UNVERIFIED (unlocked session needed).

## TASK 13 key details — 2026-11-01

- `KeystoreManager.masterKeyDetails()` reports the platform's own view of the vault key: alias,
  algorithm and size from `KeyInfo`, the returned purpose flags, the protection class
  (StrongBox / trusted environment / software) and the user-authentication flag. The unlocked-device
  row is labelled "requested at creation" because `KeyInfo` does not report it back, and no
  creation date is shown because Keystore entries do not expose one.
- A symmetric, non-exportable key has no public key, so the screen keeps "View public key" and
  "Verify a signature" disabled with the reason on screen instead of inventing an identity. The
  keyring fingerprint is a SHA-256 over the alias and the wrapped data keys as stored: an integrity
  signal, not a shareable identity, never transmitted.
- Rotation reuses the existing authorized wizard; no second engine. Key Forge gained the entry
  point so the approved Key Forge page can reach the details.
- Verification: **200 JVM tests, 0 failures** (+4); `:core:data:connectedDebugAndroidTest`
  **12/12 PASS** on the itel S686LN including `KeyDetailsDeviceTest`, which asserts the platform
  really answers with alias/AES/256-bit/encrypt+decrypt and a concrete protection class; lint
  0 errors; APK installed and cold-started without crash-buffer entries.
- Screen layout, RTL and the rotation hand-off stay **DEVICE_UNVERIFIED** (they need an unlocked
  session). This batch is still isolated on the branch; no merge into `main` was performed.

## Living stag, cinematic audio, adaptive icon, TASK 11 import — 2026-11-01

- **Living stag**: additive eye halos/slits at measured asset coordinates with two independent
  random cycles, antler travelling light, ≤10 motes and one restrained spark; runs only while the
  screen is started, frozen under reduced motion, artwork untouched. Details in
  `NATIVE_EXPERIENCE_EVIDENCE_2026-11-01.md`.
- **Audio**: original synthesised 19.5 s ambient bed + five interface one-shots, looping
  MediaPlayer with fades and audio-focus handling, SoundPool taps, persisted opt-in settings
  (master default **off**), Privacy Center controls and an honest preview. Success sounds play only
  after the domain call succeeds.
- **Launcher**: adaptive icon with the approved stag inset over obsidian, monochrome layer included.
- **TASK 11 import**: strict `otpauth://totp` parser and bounded Google Authenticator migration
  decoder, QR via ZXing (image) and CameraX (live, permission-gated), preview with per-item
  Skip/Replace for duplicates, multi-page batches committed only when complete, and an atomic
  Room `@Upsert` batch behind one authorization boundary. Typed refusals for HOTP/MD5/unknown
  digits/malformed payloads; no secrets logged, no network permission.
- Verification: **196 JVM tests, 0 failures** (security 90 / data 89 / app 17; +25 this batch);
  lint 0 errors; `:core:data:connectedDebugAndroidTest` **11/11 PASS** on the itel S686LN including
  the import batch; clean APK **19,683,839 bytes, SHA-256 `0509758a…c7fd4f0`**, installed and
  cold-started with an empty crash buffer.
- Known gaps: stag visuals, audio character/focus behaviour, launcher rendering, camera preview,
  picker flow and RTL for the import screen are **IMPLEMENTED_UNVERIFIED** — the owner was not
  available for the unlocked screen or an on-device listen. No merge into `main` was performed for
  this batch; it is isolated on the branch for owner review.

## Bilingual failures, quieter Keystore, and TASK 09 password detail — 2026-11-01 (`f20937b` + this commit)

- Baseline was re-checked first: branch and `main` at `337feb9`, clean tree, two worktrees, no CI
  workflow installed, and `origin/main` ahead by Desktop PR #24 (`d1aaeb2`). That commit touches only
  `electron/`, `src/`, `scripts/` and `tests/` — zero overlap with `native-android/` — so it was
  integrated by fast-forward before any Android work started.
- **Localisation defect fixed.** Every secure-access and rotation failure is now a typed `AccessError`
  category carrying both Arabic and English sentences (`AccessError.kt`), with the platform or domain
  text preserved as `detail` so an unrecognised cause is never replaced by a generic line or a
  success. `AccessViewModel`, `RotationAuthBroker`, `AccessScreen`, `AccountScreen`,
  `VaultKeyRotationScreen` and `MainActivity` were moved off raw strings; the BiometricPrompt code
  mapping now also covers `ERROR_CANCELED`, `ERROR_NO_DEVICE_CREDENTIAL` and `ERROR_UNABLE_TO_PROCESS`.
  Six regression tests assert that no category ships without distinct Arabic and English text and that
  cancellation, lockout, invalidation, re-enrollment block and the unknown-failure detail keep their
  meanings (`app … AccessErrorTest`).
- **Keystore probe noise reduced.** `SessionManager` caches the fixed master-key alias's protection
  class and throttles the probe to once per 5 s while nothing is provisioned, so UI recomposition
  stops generating repeated binder calls. The cached value is display metadata and is never consulted
  for authorization. `SessionManager` also records when a capability was minted
  (`sessionAgeMillis()`), which is what the new reveal window is measured against.
- **TASK 09 password detail implemented as a real slice.** New route `password_detail/{recordId}`
  (UUID only — no plaintext deep link), `CredentialDetailViewModel` loading through the
  revocation-checked repository with distinct LOADING/READY/MISSING/UNREADABLE/LOCKED states, masked secret with
  a 60 s session-freshness gate and 15 s auto-hide, managed-lease copy for secret/username/origin,
  validated `http(s)` origin that rejects embedded credentials, bounded plaintext-free revision
  history (`PasswordPayload.revisions`, legacy rows still decode), a session-only access log, and a
  real `SecureRandom` generator (uniform, one character per selected class, 8–64 clamped, refuses an
  empty selection) matching the reference controls. The Passwords list now opens this screen and its
  duplicate inline edit dialog was removed.
- Two new pure modules carry the rules so the screen cannot drift: `PasswordCredential.kt`
  (`CredentialOrigins`, `PasswordRevisions`, `CredentialRevealPolicy`, `CredentialDiff`) and
  `PasswordGenerator.kt` in `:core:security`.
- Verification: **179 JVM tests, 0 failures** (security 77, data 85, app 17 — 23 new tests in this
  phase); lint 0 errors; `:core:data:connectedDebugAndroidTest` **10/10 PASS on the itel S686LN**,
  including the three new detail tests against real Room. The first hardware run of the history test
  failed with `UnlockReenrollmentBlockedException` — the app's own P0 rule — and was corrected to
  assert that rule rather than bypass it.
- Clean-build APK: **17,273,312 bytes, SHA-256 `9d0eeb9eea62d5f3e8c624acdfc5e4e1b8871ef23a9fc0aba4d3c43b6215f242`**,
  installed and cold-started on the device with no crash-buffer entries. The detail **screen** was not
  rendered on hardware: it needs an authenticated session, so layout, RTL, TalkBack, keyboard, the
  reveal countdown and canonical screenshots remain DEVICE_UNVERIFIED. No audit, no release claim.

## First real-device run — itel S686LN, Android 15 / API 35 — 2026-11-01

- Owner attached a physical handset (`itel S686LN`, arm64-v8a, security patch 2026-09-05,
  `hardware_keystore=200`, fingerprint present). The clean-build APK
  `a39077d7…06ea` (17,191,392 bytes) installed via `:app:installDebug`.
- Instrumented suites ran for the first time: `:core:data:connectedDebugAndroidTest` **7/7 PASS**
  (real-root record roundtrip, provider-chosen IV, KDK1 wrapped DEK, KNF2 device file, gate key
  user-auth-bound, Room 1→2 migration, TASK 36 audit over real Room rows) and
  `:app:connectedDebugAndroidTest` **1/1 PASS** (splash → guest Home is honest and navigable).
- Build defect found only by hardware: `:core:data:mergeDebugAndroidTestJavaResource` collided on
  `META-INF/versions/9/OSGI-INF/MANIFEST.MF` (BouncyCastle vs jspecify), so the instrumentation APK
  could not be packaged at all. Fixed with the same `packaging` exclude `:app` already had; the JVM
  suite and `:core:data:lintDebug` were re-run green afterwards (156 tests, 0 failures).
- Gate behaviour: `Lock now` returned the app to the Access screen (`Vault state: Locked`,
  `Session: No access`, `Strong biometric: Ready`). `Unlock with biometrics` raised the real
  SystemUI sheet and it stayed pending at t+1/4/20 s with **no capability minted**; the session only
  opened after the owner touched the sensor. While that sheet was up, `uiautomator dump` returned an
  empty tree. This is behavioural support for the P0 claim, on one device, not an audit.
- Screenshot policy measured: with `blockScreenshots = true`, `screencap` of the foreground app is
  0.36 % non-black (system bar only) on two different screens — no card or field is recoverable.
- Account/Access states render honestly on hardware, including the boundary line
  `بوابة جلسة · ليست لكل استخدام` (session gate, not per-use) and `Data key: TEE`.
- New gaps this run exposed: Latin-only failure strings inside the Arabic UI
  (`Authentication cancelled.`), no canonical screenshot comparison yet (capture must be toggled off
  first), repeated `keystore2 KEY_NOT_FOUND` binder traffic while the Account screen is displayed,
  and the fact that every authenticated item now requires an owner fingerprint touch.
- Evidence: `DEVICE_VERIFICATION_2026-11-01_ITEL_S686LN.md` plus raw XMLs and dumps in
  `device-evidence/knoux-crypt-android-2026-11-01-itel-s686ln/`. Statuses moved to
  DEVICE_VERIFIED (single handset) only for what actually ran; TASK 36's screen, rotation end-to-end,
  SAF backup, clipboard timing and accessibility remain DEVICE_UNVERIFIED. No audit, no release.

## Password strength audit — TASK 36 — 2026-11-01 (`6db8263`)

- The branch was first fast-forwarded to `main` (`607e9c3`) so this work sits on the consolidated
  Desktop + Android history; the pre-change baseline suite was green (132 tests, 0 failures).
- New offline deterministic strength model (`PasswordStrength`, v1) in `:core:security`:
  observed character-class pool, `length · log2(pool)` entropy, documented multiplicative
  penalties (repeated run, sequential run, keyboard row, year-like digits, repeated unit, known
  weak word, wrapped weak word) and structural caps so length cannot rescue a known-weak shape.
  Metrics expose pool, raw/effective bits, level and flags; the evaluator never retains the value.
- New `PasswordAuditService` in `:core:data` scans the live vault through the existing
  authorization boundary: revocation checked before the id list, before each record and before
  the report is returned; `ensureActive()` + `yield()` per record; notes/TOTP rows skipped by
  kind; duplicates grouped by a transient SHA-256 digest that is cleared before returning.
  Weak, reused, blank, stale (>365 d) and unreadable rows become findings; findings cap at 50
  with truncation flagged.
- No false reassurance: a lock or cancellation publishes **no report**, unreadable rows force
  `COMPLETED_WITH_GAPS`, and `isClean` requires complete coverage plus zero findings.
- New Compose route `password_audit` (catalog `PASSWORD_AUDIT` implemented, unlock-required) with
  idle/running/completed/gaps/locked/cancelled/failed states, per-record progress, cancel,
  coverage and distribution cards, reuse clusters, reason labels, re-run and a Passwords link.
  The ViewModel drops the report (decrypted titles) the moment the session locks. EN/AR + RTL,
  existing visual components, no new dependency.
- Claim-boundary corrections in the same pass: Passwords no longer says records are KNC1 with no
  clipboard clearing (KNC2 with readable legacy rows, managed clearing with timeout + lock), and
  Key Forge/Key Derivation notes now describe the implemented managed clipboard instead of
  "not auto-cleared yet".
- Verification: 24 new tests (12 strength known-answer/cap/monotonicity/no-leak, 12 audit
  including lock-mid-scan, cancellation, gaps, stale clock, truncation, 200-record progress,
  stale-capability refusal and kind filtering). Aggregate **156 tests, 0 failures** (security 70,
  data 75, app 11); lint 0 errors (12 app/10 core warnings, unchanged); `PasswordAuditRoomTest`
  compiled but **NOT RUN**.
- APK: the first artifact came from an incremental build (17,759,009 bytes,
  `49182316…8fb3`). After `:app:clean :app:assembleDebug` the reproducible package is
  **17,191,392 bytes, SHA-256 `a39077d7f4707aca269725020add894f484061ef922b57d4fda2fe40cc9d06ea`**
  — quote the clean-build hash as canonical.
- Re-verified after consolidation: TASK 36 merged into `main` (`6d451ae`), `main` merged with the
  Desktop PRs #20/#21 work (`0851785`, zero file overlap with `native-android/`), and the whole
  Android gate was re-run green on that merged baseline (156 tests, 0 failures; same APK hash).
  The branch was then fast-forwarded to the same `0851785` commit, so local `main`,
  `origin/main`, this branch and `origin/` all point at one tree.
- Catalog is now 17 implemented / 0 blocked / 17 design-only, still 34 unique destinations and 8
  Home cards. Strength is a local heuristic, not a breach check (no network, 48-entry weak list);
  UI rendering, RTL, TalkBack, real Room timing and 1,000-record performance remain
  DEVICE_UNVERIFIED; no audit. See `36_PASSWORD_STRENGTH_AUDIT/EVIDENCE.md` and checklist §10.

## Package inspector + TASK 45 source audit — 2026-10-31 (`fdbcb81`)

- New bounded `PackageInspector` parses KNF1/KNF2/KNP1/KNP2 header metadata without keys or decryption; shows structure and explicitly marks AEAD authenticity unverified. 4 JVM parser tests cover valid KNF/KNP, forged wrapped length, truncated and unknown headers.
- `PACKAGE_INSPECTOR` route is implemented; catalog is 16 implemented / 0 blocked / 18 design-only, with 34 unique destinations and 8 Home cards.
- TASK 45 evidence records the source-level integration audit and the real blockers: no device, no independent audit, no signing/Play release, no device screenshots, and 18 design-only services. TASK 45 is not complete.
- Aggregate 132 tests, 0 failures; APK 17,728,991 bytes; lint 0 errors. Device/runtime security remains DEVICE_UNVERIFIED.

## HMAC cancellation + clipboard guard/action — 2026-10-31 (`0124560`, `25b5acb`)

- HMAC results are generation-gated; changed inputs, Clear Key, Cancel and overlaps invalidate older jobs. A cancellation watcher closes blocking inputs best-effort; job/chunk checks prevent late result publication. Deterministic gate, blocking-stream, concurrency and late-chunk KNF2 tests were added.
- TASK 25 Clipboard Guard uses the existing managed-lease service: metadata-only exposure, exact same-process ownership, managed/expired/foreign states, explicit destructive clear with confirmation, never silent foreign clearing, and no guaranteed erasure.
- TASK 44 Secure Clipboard is a distinct managed-copy action screen: hidden staged value, timeout/lock clearing, active lease metadata and guard links. Dependencies 25/08 were verified before starting.
- Aggregate suite 128 tests, 0 failures; APK 17,714,701 bytes; lint 0 errors. Device clipboard/vendor/OS behavior remains DEVICE_UNVERIFIED; no audit.

## HMAC and review hardening — 2026-10-31 (`f82010e`)

- HMAC Authenticity Lab (route `hmac`) generates/verifies HMAC-SHA-256 for text and streamed SAF files; RFC 4231 vectors, constant-time verification, local UTF-8 key handling and no signature-identity claim.
- Review hardening: KNF1 survives two record-key rotations with the root retained and root retirement rejected; KNF2 truncated wrapped-key/tag failures emit no first plaintext; in-flight KNF2 decryption aborts on lock; file-integrity UI separates integrity match from authenticity/trust.
- Aggregate 120 tests, 0 failures; APK 17,677,116 bytes; lint 0 errors. Device/SAF/UI remain DEVICE_UNVERIFIED; no audit. TASK 44 is not dependency-ready: TASK 25 remains unimplemented.
- Device verification steps are consolidated in `DEVICE_VERIFICATION_CHECKLIST.md`.

## File integrity — 2026-10-31 (`1d26033`)

- `FILE_INTEGRITY` now routes to the existing Hash & Integrity screen (no duplicate screen) with a dedicated title: SAF streaming SHA-256, 64-hex validation, explicit match/mismatch, cancel, and copyable in-memory verification reports.
- 3 new streaming known-answer/size-mismatch/constant-time tests; aggregate suite 114 tests, 0 failures; APK 17,651,518 bytes; lint 0 errors. SAF/4GB/cancellation/rotation and visual parity remain DEVICE_UNVERIFIED; no audit.
- Catalog is now 12 implemented / 0 blocked / 22 design-only; 34 destinations and 8 Home cards unchanged.

## Keystore randomized-IV compatibility — 2026-10-31 (`ca7a1bc`)

- Fixed three provider-IV violations: KDK1 wrapping and KNC1/KNC2 record encryption now let Keystore choose the GCM IV and persist `Cipher.iv`; new device-key files use KNF2 with a random per-file DEK wrapped by the root, so chunk nonces never use the Keystore key. KNF1 device files remain decryptable; old KNF1 device encryption fails closed for non-exportable keys.
- Formats/aliases are unchanged. JVM tests cover KDK1/KNC1/KNC2 legacy caller-IV blobs, KNF2 round-trip/tamper/truncation, non-exportable rejection and legacy KNF1; real-root record/KDK1/KNF2 instrumented tests compile but are NOT RUN.
- The old combined Gradle run crashed the host JVM from memory pressure; split 1 GiB runs are authoritative: 111 tests, 0 failures. Keystore/KNF2/record behavior remains DEVICE_UNVERIFIED and AUDIT_PENDING.

## Session privacy controls — 2026-10-31 (`3091032`)

- Persisted auto-lock timeout, screen-off lock, clipboard timeout, FLAG_SECURE policy and app-switch cover; live application in MainActivity; sensitive copies from Passwords/Key Forge/Key Derivation clear after timeout and on every lock.
- Policy tests 2; clipboard/lifecycle behavior remains DEVICE_UNVERIFIED. Android may retain clipboard data after process death; the Compose cover is best-effort.

## Revocation boundary + vault data-key rotation — 2026-10-31 (`176d8c3`)

- Lock/revocation is serialized with a coroutine mutation gate: a lock waits for an already-authorized commit and no mutation starts after revocation. `save`, `delete`, backup restore and rotation batches use it; tests pause DAO writes and assert the invariant.
- New KEK/DEK hierarchy: non-exportable `knoux.master.v2` wraps random DEKs (KDK1), records carry `keyVersion` (Room v2 migration, KNC2 version-authenticated envelope), and wrapped keys live in DataStore.
- Rotation requires fresh biometric reauth, journals source/target, migrates in verified Room batches, serves mixed versions, verifies all target rows, cuts over under the revocation gate, and retires only zero-dependency DEKs. Interruption before/after cutover is resumable.
- 15 rotation tests + revocation/backup/codec tests; aggregate suite 111 tests, 0 failures. APK 17,642,827 bytes; lint 0 errors. Device/Keystore/BiometricPrompt/Room migration and visual parity remain DEVICE_UNVERIFIED; audit pending. Root key is retained; existing external KNF1 files are not automatically migrated.

## Backup & restore — 2026-10-31 (`aedb4c3`)

- KNP2/Argon2id data backup of typed records via SAF; preview counts/conflicts without plaintext; import refuses conflicts and writes atomically; restore re-encrypts under the new device key.
- UI is honest that files/media, the Keystore root key and biometric-gate recovery are not included; 1 MiB plaintext cap.
- 9 new backup tests; full suite 79 tests, 0 failures; APK 17,600,138 bytes; lint 0 errors. Device/SAF remains DEVICE_UNVERIFIED.
- TASK 31 rotation is still the blocking P0; TASK 15 is not fully closed.

## Argon2id / KNP2 — 2026-10-31 (`a2ec4b7`)

- Argon2id v1.3 (Bouncy Castle, pure Java) matches the published reference vector; KNP2 authenticates memory/time/parallelism and re-validates bounds before allocation.
- KNP1/PBKDF2 remains readable; new text seals never downgrade. Text Cipher and Privacy copy updated truthfully.
- `KEY_DERIVATION` is now a real local workbench (route `key_derivation`) with explicit cost choices, real derivation, OOM/error states and no persistence.
- Passphrase files remain KNF1/PBKDF2; device files use KNF2. TASK 31/TASK 15 remain device-unverified and the root is retained. Device rendering/timing remain DEVICE_UNVERIFIED.

## Security P0 closure — 2026-10-31 (`c3f718f`)

- Capability minting now requires a verified auth-bound gate operation; UI state cannot unlock.
- Fresh enrollment is refused when a master key or any gate token exists; guest/locked reset was removed.
- Gate replacement is atomic across two frozen aliases; cancellation or crash keeps the old gate; master key and ciphertext are untouched.
- Repository flows, in-flight reads/writes and file chunk loops revalidate the capability; decrypted ViewModel state is cleared on lock.
- 21 new JVM tests cover guest reset/re-enrollment, stale and locked capabilities, in-flight revocation, invalidation, corrupt/substituted tokens, rotation atomicity and format compatibility. Biometric/Keystore behavior remains DEVICE_UNVERIFIED.

The owner-requested consolidation merge to `main` was performed at `4bdb561` (normal merge, no force, no history rewrite). No release, signing, Play upload, production or device-verified security claim was made.

## Secure Share — 2026-11-01 (TASK 16)

- Recipient encryption uses X25519 key agreement + HKDF-SHA-256 from the Bouncy Castle build already
  shipped for Argon2id; an EC/RSA **signing** key is refused by name, and `knouxkey:v1` QRs cannot be
  imported as recipients. KSR1 is a versioned, authenticated, multi-recipient container with an
  encrypted metadata block and per-chunk AAD binding the full header.
- The identity key is a software X25519 pair stored as an encrypted vault record and labelled
  `vault-software`, because the tested handset's Keystore offers no asymmetric algorithm.
- Sealing is impossible until the recipient's full fingerprint has been typed back and matched; the
  sender is added as an ordinary extra recipient so their own copy reopens.
- Only KSR1 ciphertext can leave: the Sharesheet path re-reads the file header and refuses anything
  that is not `KSR1`, through a FileProvider scoped to `cache/shares/` alone. Cancel, lock, failure
  and screen destruction delete the temporary package/plaintext files.
- 35 new JVM tests (247 total, 0 failures) including RFC 7748 and RFC 5869 known answers; lint 0
  errors; APK 19,930,079 bytes `c3d05d88…a84d`, reproduced byte-for-byte by a second clean build.
- `ShareDeviceTest` is written but **NOT RUN** (no handset attached in this pass). Cross-device
  end-to-end sharing, the screen layout, RTL, camera import and the Sharesheet handoff remain
  DEVICE_UNVERIFIED, and KSR1 is AUDIT_PENDING. See `16_SECURE_SHARE/EVIDENCE.md`.

## Signature Studio — 2026-11-01 (TASK 38)

- Built on the TASK 19 engine rather than a second one: `SigningService` still chooses Keystore vs
  the encrypted software key and reports which, `DigitalSignatureService` still does the crypto.
- KSG1 (detached) and KSA1 (attached) are versioned packages with strict, allocation-safe parsing.
  A JVM test caught the first draft signing only the content, which left the metadata block — file
  name, recorded size, recorded digest — rewritable under a still-valid signature; digest mode 2 now
  binds `SHA-256(content) ‖ SHA-256(metadata)`, and mode 1 stays readable instead of reinterpreted.
- Reports keep two answers separate: the signature is valid for these bytes, and the signer key is or
  is not one this vault stores. Valid-but-unknown is shown as exactly that.
- TASK 19's "verify an external signature" panel was renamed and annotated: KNOUX signs the SHA-256
  digest of the content, so standard third-party signatures over raw text do not verify there.
- 18 new JVM tests (265 total, 0 failures); lint 0 errors; APK 19,995,615 bytes
  `687ed540…fca9`, reproduced byte-for-byte. `SignatureStudioDeviceTest` is written but NOT RUN —
  no handset was attached, so the studio stays DEVICE_UNVERIFIED and AUDIT_PENDING.
