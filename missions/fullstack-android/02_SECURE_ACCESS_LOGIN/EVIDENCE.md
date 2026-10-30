# EVIDENCE — TASK 02 — Secure Access Login

Date: 2026-10-31 (Asia/Dubai)
Branch: `android/native-implementation-20261031`
Implementation commit: `2975ec6` (PR14 reconciliation: `b4fe65c`)
Verified baseline: `integration/knoux-crypt-android-ready-20261030` @ `8f6f992`

Classification: **BUILD_VERIFIED / JVM-TESTED where stated — DEVICE_VERIFIED: NO**.
No emulator or device was available (`adb devices` empty, HypervisorPresent=False), so no
install, launch, screenshot, lifecycle, Back, biometric, Keystore or SAF evidence exists.

- BiometricPrompt(BIOMETRIC_STRONG) with a CryptoObject from an auth-per-use Keystore key.
- Setup encrypts a fixed check token; unlock decrypts and constant-time compares it. A UI callback without a successful key operation never unlocks.
- Guest mode keeps `VaultAccess` null; guest cannot open notes/passwords/file/vault records.
- Cancellation, lockout, lockout-permanent, no-biometrics and hardware-unavailable errors are mapped; key invalidation offers an explicit reset that deletes only the gate.
- Session auto-locks after 30 s in background; lock drops the capability and cached key handle.
- Tests: instrumentation `AccessFlowTest` and `KeystoreDeviceTest` compile, NOT RUN. No device test of the prompt.
- Known limit: the master data key is not auth-bound per use; see Privacy Center.
