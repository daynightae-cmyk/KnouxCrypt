# EVIDENCE — TASK 44 — Secure Clipboard

Date: 2026-10-31 (Asia/Dubai)
Branch: `android/native-implementation-20261031`
Baseline SHA: `a0aaab32b66a943560267b0b1dc0ad2b3c7cb830`
Implementation SHA: `25b5acb6cffea6e4cc6423b07370ec5eae726c93`

Classification: **DOMAIN_IMPLEMENTED + INTEGRATED + TESTED_LOCAL (policy) + BUILD_VERIFIED**.
**DEVICE_UNVERIFIED** for ClipboardManager/OS restrictions and UI behavior. **AUDIT_PENDING**.

## Dependency verification before starting

The actual TASK 44 file requires **TASK 25 (Clipboard Guard)** and **TASK 08 (Passwords)**.
TASK 25 was implemented in this branch (`25b5acb`) on the existing TASK 42 managed-clipboard
service; TASK 08 is implemented. TASK 44 was therefore started only after those source-level
contracts existed. It is a distinct managed-copy action screen, not a duplicate guard.

## What really works

- New route `secure_clipboard` and catalog `SECURE_CLIPBOARD` implementation.
- The user stages a value in screen memory (hidden by default, never persisted/logged),
  then **Copy under managed lease** calls the existing `ClipboardPrivacy.copySensitive`
  with the configured timeout and sensitive API-33 marking.
- On success the staged field is cleared only if it still contains the copied value; the
  screen shows an Active managed lease card with label/character count/remaining seconds.
- Exact ownership is still a same-process exact value match; no content is read from the
  clipboard or displayed by this screen. Clear/expiry is handled by Clipboard Guard and the
  service; the screen links to both.
- Truthful warnings: OS/other apps may read the clipboard, auto-clear is best effort, and
  data may survive process death. No global-erasure claim.
- Pure lease policy tests cover managed/expired/foreign/unavailable states and
  auto/explicit clear eligibility; the TASK 25 guard provides explicit clearing.

## Verification actually executed (Windows, this session)

| Check | Command | Result |
|---|---|---|
| App tests | `./gradlew :app:testDebugUnitTest --rerun-tasks --no-daemon ...` | **PASS, exit 0 — 11 tests** (includes ClipboardLeasePolicy 2) |
| Security/data tests | split fresh runs | **PASS — 54 + 63** |
| Aggregate JVM | result XML count | **128 tests, 0 skipped, 0 failures, 0 errors** |
| Lint | `:core:data:lintDebug :app:lintDebug` | **PASS, 0 errors** |
| androidTest compile | `:app:compileDebugAndroidTestKotlin :core:data:compileDebugAndroidTestKotlin` | **PASS (compiled, NOT RUN)** |
| Debug APK | `:app:assembleDebug --no-daemon` | **PASS — 17,714,701 bytes** |
| APK SHA-256 | `sha256sum` | `40259ea5ee7aac869c30fba1687eaed0dca823ac9ba9f4622f3b001ae0526dd2` |
| Device | adb; Hypervisor | Empty; `HypervisorPresent=False` |

## Honest limitations

- DEVICE_UNVERIFIED: real clipboard access restrictions, vendor managers, toast behavior,
  process death, screen rotation, keyboard, RTL and TalkBack.
- No guaranteed erasure and no protection from other apps reading the clipboard while it is
  populated. The copy is a managed lease, not a secure channel.
- The staged value is a normal Compose string in screen memory until cleared; it is not
  persisted, but JVM/Compose memory cannot be deterministically wiped.
- No clipboard paste action is implemented; the screen copies a user-staged value and links
  to the guard for exposure/clear. This matches the actual task scope without inferring more.
- No independent audit.
- TASK 44's device/runtime security remains unproven; do not mark DEVICE_VERIFIED.
