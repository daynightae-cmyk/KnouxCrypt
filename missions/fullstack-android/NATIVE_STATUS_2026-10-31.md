# NATIVE IMPLEMENTATION STATUS — 2026-10-31

**Branch:** `android/native-implementation-20261031`
**Implementation commit:** `2975ec6b7508b9f51305a808470475453e1cf3ed`
**Security P0 commit:** `c3f718f7cee4b8f663b05e9d3aae858101554029`
**Argon2id/KNP2 commit:** `a2ec4b7d2122e40fa5182ade580245b9c26c7c30`
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
| Argon2id fresh JVM suite | `./gradlew :core:security:test :core:data:test :app:testDebugUnitTest --rerun-tasks` | PASS — **70 tests**, 0 failures, 0 errors |
| Argon2id debug APK | `./gradlew :app:assembleDebug` | PASS — 17,562,730 bytes, SHA-256 `8ff7768b…97af73` (BouncyCastle adds 3.18 MB) |
| Security P0 lint | `./gradlew :core:data:lintDebug :app:lintDebug` | PASS — 0 errors |
| Device availability | `adb devices`; `HypervisorPresent` | **No device; False** → no emulator |

Test distribution: FileEnvelope 13, PassphraseEnvelope 6, TOTP/Base32/hash/random 7, PR14 Foundation 10, SecretCodec 4, Catalog/search 4.

## Classification by mission

| ID | Mission | Status |
|---|---|---|
| 00 | Native foundation | **BUILD_VERIFIED + JVM-TESTED**; device/security review open |
| 01 | Splash entry | **BUILD_VERIFIED** (UI); device screenshot open |
| 02 | Secure access login | **BUILD_VERIFIED + JVM-TESTED (21 boundary tests)**; BiometricPrompt/Keystore runtime **DEVICE_UNVERIFIED**; locked-state reset removed, atomic gate rotation added |
| 03 | Home | **BUILD_VERIFIED + catalog tests**; device visual parity open |
| 04 | File cipher | **BUILD_VERIFIED + core TESTED (13)**; SAF/device open |
| 05 | Shadow vault | PLANNED — design-only placeholder |
| 06 | Secure notes | **BUILD_VERIFIED + codec TESTED**; Room/device test open |
| 07 | Notes editor | PLANNED as a dedicated task (inline editor exists inside 06) |
| 08 | Passwords | **BUILD_VERIFIED + codec TESTED**; clipboard/autofill open |
| 09 | Password detail | PLANNED (edit dialog exists inside 08) |
| 10 | Authenticator | **BUILD_VERIFIED + TOTP TESTED (RFC 6238)**; device clock/UI open |
| 11 | Auth import | PLANNED |
| 12 | Key Forge | **BUILD_VERIFIED** (ephemeral key only); persistent keyring open |
| 13 | Key details | PLANNED |
| 14 | Privacy Center | **BUILD_VERIFIED** (UI); security review open |
| 15 | Backup / Recovery | **BLOCKED** — honest no-export screen |
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
| 31 | Vault key rotation | PLANNED — security-critical next |
| 32 | Package inspector | PLANNED (KNF1 reader exists internally) |
| 33 | Android autofill | PLANNED |
| 34 | Offline advisor | PLANNED |
| 35 | Multi-device pairing | PLANNED |
| 36 | Password strength audit | PLANNED |
| 37 | Argon2id KDF | **BUILD_VERIFIED + TESTED_LOCAL (KAT)** — KNP2, KDF tool; KNF1 files still PBKDF2; DEVICE_UNVERIFIED |
| 38 | Signature studio | PLANNED |
| 39 | Security activity | PLANNED |
| 40 | Transfer wizard | PLANNED |
| 41 | Expiring capsule | PLANNED |
| 42 | Session privacy controls | **PARTIAL / BUILD_VERIFIED**: 30 s lock, explicit lock, decrypted-state clearing, lock-aware repository/file checks; remaining privacy controls PLANNED |
| 43 | File integrity tool | PLANNED (hash screen covers part of 43) |
| 44 | Secure clipboard | PLANNED |
| 45 | Final integration/verification | **BLOCKED by device availability** |

Catalog accounting: 34 destinations total = **10 IMPLEMENTED**, **1 BLOCKED (Recovery)**, **23 DESIGN_ONLY**. Eight Home cards preserved in the accepted order.

## Reality of the implementation

- Modules: `:app`, `:core:designsystem`, `:core:security`, `:core:data`.
- Entry flow, 8 Home cards, 34-tool directory, AR/EN search + RTL + reduced motion, Account, truthful Privacy/Recovery.
- KNC1 small-record AEAD (PR14 code reused), KNF1 chunked file AEAD, KNP2/Argon2id passphrase envelope with KNP1 readable, RFC 6238 TOTP, SHA-256/HMAC, SecureRandom.
- Keystore: non-exportable master data key; auth-per-use unlock keys + check token; sealed session capability; 30 s background lock; atomic owner-authorized gate rotation with no locked-state reset. **The data key is not auth-bound per use** — documented in-app and here.
- Room stores only ciphertext rows plus id/kind/timestamp; DataStore stores nonsecret settings only; Android backup is disabled; no INTERNET permission.

## Risks and gaps

1. **No device verification**: no install, launch, lifecycle, predictive Back, rotation, biometric, Keystore, SAF, or screenshot evidence.
2. **No security audit**: formats and code are tested but not reviewed externally; no fuzzing or dependency CVE scan.
3. **Crypto scope**: KNP2 text uses Argon2id; KNF1 file containers still use PBKDF2; no vault-key rotation or recovery; no large-file soak; nonce/key-usage limits not formally analyzed.
4. **Auth binding**: master key use is gated by the app capability, not per-use biometric authorization.
5. **Design-only majority**: 24 tools remain explicit placeholders; they do not fake operations.
6. **Gate recovery**: a biometric-invalidated or lost gate now shows a truthful non-destructive recovery-required state; restore is BLOCKED on TASK 15.
7. **Biometric cipher identity**: unlock passes the exact prepared `Cipher` back to the domain and rejects substitution; real `BiometricPrompt` same-instance behavior is still DEVICE_UNVERIFIED.
6. **Visual parity**: PR15 is the accepted baseline, not pixel certification; the external Preview artifact is not the APK.
7. **PR14 review branch** remains unmerged and untouched; this branch must be reviewed before any merge to `main`.

## Safe next actions (dependency-aware)

1. **SecurityCritical:** TASK 31 vault-key rotation is the remaining P0 blocker; TASK 15 backup/recovery depends on it and on the now-implemented KNP2/Argon2id wrapper. Then 02 per-use data-key binding. Independent device execution and audit remain owner gates.
2. **Vertical slices:** 05 Vault (uses KNF1), 07 Notes editor, 09 Password detail, 21 Archive (uses KNF1), 43 File Integrity.
3. **Device gate:** obtain a physical Android 8.0+ device with strong biometrics; install `app-debug.apk`, run both instrumented classes, then capture Compose screenshots at 360/390/441 widths in EN/AR and compare against canonical references.
4. **Quality gate:** detekt/ktlint, dependency locking, CVE scan, R8 shrinking (BouncyCastle adds 3.18 MB), and a real CI workflow (the PR14 template remains uninstalled).

## Argon2id / KNP2 — 2026-10-31 (`a2ec4b7`)

- Argon2id v1.3 (Bouncy Castle, pure Java) matches the published reference vector; KNP2 authenticates memory/time/parallelism and re-validates bounds before allocation.
- KNP1/PBKDF2 remains readable; new text seals never downgrade. Text Cipher and Privacy copy updated truthfully.
- `KEY_DERIVATION` is now a real local workbench (route `key_derivation`) with explicit cost choices, real derivation, OOM/error states and no persistence.
- KNF1 file containers still use PBKDF2; TASK 31 and TASK 15 remain open. Device rendering/timing remain DEVICE_UNVERIFIED.

## Security P0 closure — 2026-10-31 (`c3f718f`)

- Capability minting now requires a verified auth-bound gate operation; UI state cannot unlock.
- Fresh enrollment is refused when a master key or any gate token exists; guest/locked reset was removed.
- Gate replacement is atomic across two frozen aliases; cancellation or crash keeps the old gate; master key and ciphertext are untouched.
- Repository flows, in-flight reads/writes and file chunk loops revalidate the capability; decrypted ViewModel state is cleared on lock.
- 21 new JVM tests cover guest reset/re-enrollment, stale and locked capabilities, in-flight revocation, invalidation, corrupt/substituted tokens, rotation atomicity and format compatibility. Biometric/Keystore behavior remains DEVICE_UNVERIFIED.

No merge to `main`, release, signing, Play upload, or production claim was performed.
