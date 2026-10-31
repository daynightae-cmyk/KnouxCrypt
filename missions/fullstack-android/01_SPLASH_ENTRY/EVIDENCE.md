# EVIDENCE — TASK 01 — Splash Entry

Date: 2026-10-31 (Asia/Dubai)
Branch: `android/native-implementation-20261031`
Implementation commit: `2975ec6` (PR14 reconciliation: `b4fe65c`)
Verified baseline: `integration/knoux-crypt-android-ready-20261030` @ `8f6f992`

Classification: **BUILD_VERIFIED / JVM-TESTED where stated — DEVICE_VERIFIED: NO**.
No emulator or device was available (`adb devices` empty, HypervisorPresent=False), so no
install, launch, screenshot, lifecycle, Back, biometric, Keystore or SAF evidence exists.

- Compose splash with the original transparent stag-K asset (`knoux_stag.png`), wordmark, divider, seal line, explicit Enter action. No automatic blocking delay, no fake progress.
- Enter navigates to Secure Access only; splash performs no crypto and stores nothing.
- Reduced motion is honored by the shared ambience layer (persisted setting in Account).
- Verified: `:app:assembleDebug` and `:app:lintDebug` (0 errors) include this screen.
- NOT verified: device screenshot against PR15 reference, Back behavior, font scaling, cold-start timing.
