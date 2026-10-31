# EVIDENCE — TASK 18 — Text Cipher

Date: 2026-10-31 (Asia/Dubai)
Branch: `android/native-implementation-20261031`
Implementation commit: `2975ec6` (PR14 reconciliation: `b4fe65c`)
Verified baseline: `integration/knoux-crypt-android-ready-20261030` @ `8f6f992`

Classification: **BUILD_VERIFIED / JVM-TESTED where stated — DEVICE_VERIFIED: NO**.
No emulator or device was available (`adb devices` empty, HypervisorPresent=False), so no
install, launch, screenshot, lifecycle, Back, biometric, Keystore or SAF evidence exists.

- KNP1 envelope: magic/version/algorithm/iterations/salt/nonce header as AAD + AES-256-GCM; Base64 packaging.
- PBKDF2-HMAC-SHA256 310,000 iterations; Argon2id remains mission 37 and is not claimed.
- Tests: `PassphraseEnvelopeTest` (6) round-trip incl. Arabic text, wrong passphrase/context, tamper, limits, KDF determinism; PASS.
- NOT RUN: device UI, clipboard behavior.

---

## Argon2id upgrade — 2026-10-31 (`a2ec4b7`)

- Baseline for this increment: `cc8f2c8`; implementation: `a2ec4b7d2122e40fa5182ade580245b9c26c7c30`.
- New seals are **KNP2**: Argon2id v1.3 + AES-256-GCM, with memory/iterations/parallelism authenticated in the header. Defaults 64 MiB, t=3, p=2. Existing **KNP1/PBKDF2** ciphertext still opens; new writes never downgrade.
- UI: wrong passphrase/tamper errors retained; added an OOM path that leaves the ciphertext untouched and tells the user no silent downgrade occurred. Footer now states KNP2/Argon2id and that KNP1 remains readable.
- Tests (actual): `./gradlew :core:security:test --rerun-tasks` PASS — `PassphraseEnvelopeTest` 8 tests, 0 failures; `Argon2idTest` 3 tests incl. the published reference vector, 0 failures. Full suite 70 tests, 0 failures.
- Build/lint: `:app:assembleDebug` PASS, APK 17,562,730 bytes; `:app:lintDebug` 0 errors.
- Device UI, clipboard behavior and low-memory timing remain **DEVICE_UNVERIFIED**. KNP1 generation still exists only as a compatibility helper. Passphrase file containers remain KNF1/PBKDF2; new device-key files use KNF2 with a root-wrapped per-file DEK.
