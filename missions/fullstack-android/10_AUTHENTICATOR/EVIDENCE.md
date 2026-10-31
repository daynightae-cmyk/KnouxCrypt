# EVIDENCE — TASK 10 — Authenticator

Date: 2026-10-31 (Asia/Dubai)
Branch: `android/native-implementation-20261031`
Implementation commit: `2975ec6` (PR14 reconciliation: `b4fe65c`)
Verified baseline: `integration/knoux-crypt-android-ready-20261030` @ `8f6f992`

Classification: **BUILD_VERIFIED / JVM-TESTED where stated — DEVICE_VERIFIED: NO**.
No emulator or device was available (`adb devices` empty, HypervisorPresent=False), so no
install, launch, screenshot, lifecycle, Back, biometric, Keystore or SAF evidence exists.

- RFC 6238 TOTP with SHA1/SHA256/SHA512, Base32 seed import, 6/8 digits, 15–120 s period; local-only.
- Seeds are validated, re-encoded, encrypted as KNC1 in Room; codes refresh each second; no network permission exists.
- Tests: `TotpTest` (7) includes all six RFC 6238 SHA-1 vectors, Base32 round-trip, invalid input, hashing/HMAC vectors; PASS.
- NOT RUN: device clock/timezone behavior, UI test.
