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
