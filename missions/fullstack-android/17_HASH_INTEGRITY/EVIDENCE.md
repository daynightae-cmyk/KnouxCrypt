# EVIDENCE — TASK 17 — Hash & Integrity

Date: 2026-10-31 (Asia/Dubai)
Branch: `android/native-implementation-20261031`
Implementation commit: `2975ec6` (PR14 reconciliation: `b4fe65c`)
Verified baseline: `integration/knoux-crypt-android-ready-20261030` @ `8f6f992`

Classification: **BUILD_VERIFIED / JVM-TESTED where stated — DEVICE_VERIFIED: NO**.
No emulator or device was available (`adb devices` empty, HypervisorPresent=False), so no
install, launch, screenshot, lifecycle, Back, biometric, Keystore or SAF evidence exists.

- SHA-256 over SAF documents with streamed progress and expected-digest comparison; hashing is not presented as encryption.
- Tests: SHA-256 known answer for `abc`, streamed/provider comparison, HMAC-SHA256 vector, constant-time compare; PASS.
- NOT RUN: device SAF read, large file, UI test.
