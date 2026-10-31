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
**PR #14 reconciliation merge:** `b4fe65c`
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
| Current security tests (fresh, split) | `./gradlew :core:security:test --rerun-tasks --no-daemon -Dorg.gradle.jvmargs=-Xmx1024m...` | PASS, exit 0 — **49 tests** |
| Current data tests (fresh, split) | `./gradlew :core:data:testDebugUnitTest --rerun-tasks --no-daemon ...` | PASS, exit 0 — **61 tests** |
| Current app tests (fresh, split) | `./gradlew :app:testDebugUnitTest --rerun-tasks --no-daemon ...` | PASS, exit 0 — **4 tests** |
| Aggregate JVM | result XML count | **114 tests, 0 skipped, 0 failures, 0 errors** (security 49, data 61, app 4) |
| Current lint | `./gradlew :core:data:lintDebug :app:lintDebug --no-daemon` | PASS, exit 0 — 0 errors (10 app/8 core warnings) |
| Current debug APK | `./gradlew :app:compileDebugAndroidTestKotlin :core:data:compileDebugAndroidTestKotlin :app:assembleDebug --no-daemon` | PASS — 17,651,518 bytes, SHA-256 `e69ba386…af815` |
| Combined 1.5 GiB run | single `--rerun-tasks` invocation | **INCONCLUSIVE** — host JVM crashed (malloc/`hs_err`), not a test failure; split runs above are authoritative |
| Device availability | `adb devices`; `HypervisorPresent` | **No device; False** → no emulator |

Test distribution (current): security 49 (FileEnvelope 13 + KNF2 5 + Hashing 3 + Argon2id 3 + Foundation 10 + PassphraseEnvelope 8 + Totp 7); data 61 (SecretCodec 6, SecurityBoundary 25, VaultKeyRotation 15, VaultBackup 10, VaultKeyWrapper 3, SessionPrivacyPolicy 2); app 4.

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
| 09 | Password detail | PLANNED (edit dialog exists inside 08) |
| 10 | Authenticator | **BUILD_VERIFIED + TOTP TESTED (RFC 6238)**; device clock/UI open |
| 11 | Auth import | PLANNED |
| 12 | Key Forge | **BUILD_VERIFIED** (ephemeral key only); persistent keyring open |
| 13 | Key details | PLANNED |
| 14 | Privacy Center | **BUILD_VERIFIED** (UI); security review open |
| 15 | Backup / Recovery | **PARTIAL / BUILD_VERIFIED + TESTED_LOCAL (10)**: KNP2/Argon2id data export & conflict-safe restore; rotation exists separately but the root is retained and gate recovery is absent; SAF **DEVICE_UNVERIFIED** |
| 16 | Secure share | PLANNED |
| 17 | Hash & Integrity | **BUILD_VERIFIED + TESTED**; device SAF open |
| 18 | Text cipher | **BUILD_VERIFIED + TESTED (8)**; KNP2/Argon2id writes, KNP1 readable; device UI open |
| 19 | Digital signature | PLANNED |
| 20 | Certificate inspector | PLANNED |
| 21 | Encrypted archive | PLANNED (KNF1 core exists; archive UI does not) |
| 22 | Local transfer | PLANNED |
| 23 | Fingerprint verify | PLANNED |
| 24 | Metadata cleaner | PLANNED |
| 25 | Clipboard guard | PLANNED |
| 26 | Secure random | **BUILD_VERIFIED + TESTED**; device UI open |
| 27 | HMAC authenticity | PLANNED (HMAC primitive tested; no screen) |
| 28 | Public-key QR | PLANNED |
| 29 | Vault collections | PLANNED |
| 30 | Document viewer | PLANNED |
| 31 | Vault key rotation | **SOURCE_IMPLEMENTED + JVM_TESTED (15) — DEVICE_UNVERIFIED / AUDIT_PENDING**: root-wrapped DEK hierarchy, KNC2/room v2, reauth, journal, resumable batches, retirement guard, real wizard; KNF2 device files + legacy KNF1 readable, root retained |
| 32 | Package inspector | PLANNED (KNF1 reader exists internally) |
| 33 | Android autofill | PLANNED |
| 34 | Offline advisor | PLANNED |
| 35 | Multi-device pairing | PLANNED |
| 36 | Password strength audit | PLANNED |
| 37 | Argon2id KDF | **BUILD_VERIFIED + TESTED_LOCAL (KAT)** — KNP2, KDF tool; passphrase files still KNF1/PBKDF2; device files KNF2; DEVICE_UNVERIFIED |
| 38 | Signature studio | PLANNED |
| 39 | Security activity | PLANNED |
| 40 | Transfer wizard | PLANNED |
| 41 | Expiring capsule | PLANNED |
| 42 | Session privacy controls | **BUILD_VERIFIED + JVM_TESTED policy (2) — DEVICE_UNVERIFIED**: configurable auto-lock, screen-off lock, clipboard timeout + lock clear, screenshot policy, app-switch cover, mutation/revocation serialization |
| 43 | File integrity tool | **BUILD_VERIFIED + JVM_TESTED (hash vectors) — DEVICE_UNVERIFIED**: streaming SHA-256, checksum validation, match/mismatch evidence, cancel, in-memory reports, dedicated `file_integrity` route reusing Hash & Integrity |
| 44 | Secure clipboard | PLANNED |
| 45 | Final integration/verification | **BLOCKED by device availability** |

Catalog accounting: 34 destinations total = **12 IMPLEMENTED**, **0 BLOCKED**, **22 DESIGN_ONLY** (Recovery is implemented for encrypted data export/restore; gate recovery remains out of scope. Key rotation is an internal Account wizard, not a new Tools destination). Eight Home cards preserved in the accepted order.

## Reality of the implementation

- Modules: `:app`, `:core:designsystem`, `:core:security`, `:core:data`.
- Entry flow, 8 Home cards, 34-tool directory, AR/EN search + RTL + reduced motion, Account, truthful Privacy, encrypted KNP2 data backup/restore.
- KNC1/KNC2 small-record AEAD, KNF2 wrapped-per-file-DEK device files with legacy KNF1 readable, KNF1/passphrase files, KNP2/Argon2id text with KNP1 readable, RFC 6238 TOTP, SHA-256/HMAC, SecureRandom.
- Keystore: non-exportable master data key; auth-per-use unlock keys + check token; sealed session capability; 30 s background lock; atomic owner-authorized gate rotation with no locked-state reset. **The data key is not auth-bound per use** — documented in-app and here.
- Room stores only ciphertext rows plus id/kind/timestamp; DataStore stores nonsecret settings only; Android backup is disabled; no INTERNET permission.

## Risks and gaps

1. **No device verification**: no install, launch, lifecycle, predictive Back, rotation, biometric, Keystore, SAF, or screenshot evidence.
2. **No security audit**: formats and code are tested but not reviewed externally; no fuzzing or dependency CVE scan.
3. **Crypto scope**: KNP2 text uses Argon2id; passphrase files remain KNF1/PBKDF2 and device files use KNF2; record DEK rotation exists but the Keystore root is retained and lost-gate recovery is absent; no large-file soak; nonce/key-usage limits not formally analyzed.
4. **Auth binding**: master key use is gated by the app capability, not per-use biometric authorization.
5. **Design-only majority**: 23 tools remain explicit placeholders; they do not fake operations.
6. **Gate recovery**: a biometric-invalidated or lost gate shows a truthful non-destructive recovery-required state. Data can be backed up/restored, but the gate and Keystore root key cannot be restored. Data-key rotation exists; the root key is retained for KNF1 files.
7. **Biometric cipher identity**: unlock passes the exact prepared `Cipher` back to the domain and rejects substitution; real `BiometricPrompt` same-instance behavior is still DEVICE_UNVERIFIED.
6. **Visual parity**: PR15 is the accepted baseline, not pixel certification; the external Preview artifact is not the APK.
7. **PR14 review branch** remains unmerged and untouched; this branch must be reviewed before any merge to `main`.

## Safe next actions (dependency-aware)

1. **Device/audit gate:** run the new rotation, Keystore/KNF2 and Room migration instrumentation on real hardware; test privacy timing/clipboard and file-integrity SAF/cancel/4GB; capture AR/EN screenshots; commission independent review. TASK 31/42/43 are source-implemented but DEVICE_UNVERIFIED/AUDIT_PENDING. Root retention for existing external KNF1 files remains documented.
2. **Vertical slices:** 05 Vault (uses KNF1), 07 Notes editor, 09 Password detail, 21 Archive (uses KNF1), 44 Secure Clipboard (timeout exists; dedicated service still planned).
3. **Device gate:** obtain a physical Android 8.0+ device with strong biometrics; install `app-debug.apk`, run all instrumented classes (access, Keystore record/KDK1/KNF2, Room migration), test privacy timing/clipboard/screen capture, then capture Compose screenshots at 360/390/441 widths in EN/AR and compare against canonical references.
4. **Quality gate:** detekt/ktlint, dependency locking, CVE scan, R8 shrinking (BouncyCastle adds 3.18 MB), and a real CI workflow (the PR14 template remains uninstalled).

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

No merge to `main`, release, signing, Play upload, or production claim was performed.
