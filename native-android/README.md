# KNOUX Crypt — Native Android

Status: **BUILD_VERIFIED / UNIT_TESTED (local Windows machine, 2026-10-31)**.
**NOT device-verified, NOT security-audited, NOT released, NOT pixel-certified.**
The PR #15 Chromium visuals are the accepted design baseline; they are not native runtime evidence.

## Toolchain actually used

| Item | Value |
|---|---|
| JDK | Microsoft OpenJDK 21.0.12 (bytecode target 17) |
| Gradle | 8.14.6 wrapper with official SHA-256 pin |
| AGP / Kotlin | 8.10.1 / 2.1.20 |
| compileSdk / targetSdk / minSdk | 36 / 36 / 26 |
| Compose BOM | 2025.04.01, Material 3 |
| Storage | Room 2.7.1 (KSP) + Preferences DataStore 1.1.4 |
| Auth | androidx.biometric 1.1.0 (BIOMETRIC_STRONG + CryptoObject) |
| Android SDK | `D:\Android\sdk` (cmdline-tools, platform-tools, platform 36, build-tools 36) |

## Modules

- `:app` — Compose UI, navigation, ViewModels, BiometricPrompt activity wiring.
- `:core:designsystem` — KNOUX colors/typography, ambience, glass cards, bottom bar, logo + service art.
- `:core:security` — JVM-only crypto and TOTP/hash primitives with unit tests.
- `:core:data` — Keystore boundary, session capability, Room ciphertext storage, DataStore settings, device-key file cipher.

## Implemented in this branch

- Entry flow `SPLASH_ENTRY → SECURE_ACCESS_LOGIN → HOME` (real Compose screens).
- Home with the eight accepted cards; Tools with all **34** destinations, categories, AR/EN search, empty state.
- Account: language (EN/AR + RTL), reduced motion (persisted), session lock, unlock-gate reset, actual key-protection class.
- File Cipher: SAF input/output, KNF1 chunked AES-256-GCM, device-key or passphrase mode, progress, cancellation, temp-file atomic output, original preserved.
- Text Cipher: KNP1 (PBKDF2-HMAC-SHA256 310k + AES-256-GCM), Base64 envelope.
- Hash & Integrity: SHA-256 over SAF with live progress and comparison.
- Secure Random Studio: SecureRandom hex/Base64/word values.
- Secure Notes and Passwords: Room rows whose payloads are KNC1 envelopes with identity-bound AAD.
- Authenticator: RFC 6238 TOTP (SHA1/256/512 supported) with encrypted Base32 seeds and one-second refresh.
- Key Forge: ephemeral 256-bit key + SHA-256 fingerprint.
- Privacy Center: truthful session/key/backup limits.
- Recovery: **BLOCKED** honest screen; no fake export, no backup file.

Design-only (no route, explicit placeholder): Vault, Signature, Secure Share, Certificate Inspector, Archive, Local Transfer, Fingerprint Verify, Metadata Cleaner, Clipboard Guard, HMAC, Public Key QR, Collections, Document Viewer, Package Inspector, Autofill, Offline Advisor, Key Derivation, Security Activity, Secret Capsule, Session Privacy, File Integrity, Secure Clipboard, Device Pairing, Password Audit.

## Verified commands and results

```
./gradlew :core:security:test :core:data:test      # 40 tests, 0 failures
./gradlew :app:testDebugUnitTest                   # 4 tests, 0 failures
./gradlew :app:assembleDebug                       # app-debug.apk (14.4 MB)
./gradlew :app:lintDebug                           # 0 errors, 12 warnings
./gradlew :app:compileDebugAndroidTestKotlin        # instrumented sources compile
```

Test breakdown: FileEnvelope 13, PassphraseEnvelope 6, TOTP/hash/random 7, PR14 Foundation 10, SecretCodec 4, Catalog/search 4.

## Not verified — hard boundaries

- `adb devices` was empty and `HypervisorPresent` is **False**: no emulator/device. APK was not installed or launched. No Compose screenshot, lifecycle, Back, biometric, Keystore, SAF or rotation evidence exists.
- The two instrumented test classes compile but were **NOT RUN**.
- Security review/audit, fuzzing, dependency-vulnerability review: **NOT DONE**.
- PBKDF2 is used instead of Argon2id (mission 37 open). Recovery export, key rotation, cross-device restore, secure clipboard, autofill and pairing are not implemented.
- The master data key is Keystore-protected but **not auth-bound per use**; the in-app session capability gates use. If the device is compromised while unlocked, this boundary is not hardware-proof. Documentation says so in-app.
- Visual parity is not certified; PR #15 is the accepted implementation baseline. The Preview artifact is a design preview, not the APK.

## Build

```
cd native-android
# local.properties: sdk.dir=D\:/Android/sdk
./gradlew :app:assembleDebug
```

## Preserved PR #14 work

- Reused: `AuthenticatedEnvelope.kt` (KNC1), `SessionPolicy.kt` and its 10 JVM tests, `DeviceWrappingKey.kt` (kept as reference; superseded by `KeystoreManager`), the original evidence record.
- Superseded/removed: PR14 diagnostic `MainActivity` and `FoundationViewModel` (replaced by the real navigation/entry flow); its debug-only navigation test (replaced by `AccessFlowTest` + `KeystoreDeviceTest`, not run).
- PR #14 remains unmerged and its review branch untouched. This branch is `android/native-implementation-20261031`, derived from `integration/knoux-crypt-android-ready-20261030`.
