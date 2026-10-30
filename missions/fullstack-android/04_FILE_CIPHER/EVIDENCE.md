# EVIDENCE — TASK 04 — File Cipher

Date: 2026-10-31 (Asia/Dubai)
Branch: `android/native-implementation-20261031`
Implementation commit: `2975ec6` (PR14 reconciliation: `b4fe65c`)
Verified baseline: `integration/knoux-crypt-android-ready-20261030` @ `8f6f992`

Classification: **BUILD_VERIFIED / JVM-TESTED where stated — DEVICE_VERIFIED: NO**.
No emulator or device was available (`adb devices` empty, HypervisorPresent=False), so no
install, launch, screenshot, lifecycle, Back, biometric, Keystore or SAF evidence exists.

- KNF1 chunked container: AES-256-GCM per 64 KiB chunk, random 96-bit base nonce with counter XOR, authenticated header/chunk index/final flag, exact-length and trailing-byte rejection.
- Device-key mode uses the non-exportable Keystore key through `VaultFileCipher`; passphrase mode derives with PBKDF2-HMAC-SHA256 (310k) and records KDF parameters.
- SAF input/output; input copied to cache, output written to temp then copied; original source never modified; partial output document deleted on failure; cancellation supported.
- Tests: 13 JVM `FileEnvelopeTest` cases (round-trip boundaries, empty file, tamper, truncation, reordering, wrong key/context/key source, progress, declared-length mismatch, garbage header) PASS.
- NOT verified: real SAF document flows, 1 GB+ files, process death, device performance, UI screenshot.
