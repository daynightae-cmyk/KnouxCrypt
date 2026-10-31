# EVIDENCE — TASK 25 — Clipboard Guard

Date: 2026-10-31 (Asia/Dubai)
Branch: `android/native-implementation-20261031`
Baseline SHA: `a0aaab32b66a943560267b0b1dc0ad2b3c7cb830`
Implementation SHA: `25b5acb6cffea6e4cc6423b07370ec5eae726c93`

Classification: **DOMAIN_IMPLEMENTED + INTEGRATED + TESTED_LOCAL (policy) + BUILD_VERIFIED**.
**DEVICE_UNVERIFIED** for real ClipboardManager/vendor behavior. **AUDIT_PENDING**.

## What really works

- Reuses the existing TASK 42 `ClipboardPrivacy` managed-lease service; no duplicate
  clipboard engine.
- Metadata-only exposure states: UNAVAILABLE, EMPTY, MANAGED, EXPIRED, FOREIGN. The screen
  never displays the clipboard value; only label/character count/timestamps.
- Ownership is a same-process exact value match. A foreign or post-process-death value is
  classified FOREIGN and is **never cleared silently**. The explicit clear action requires
  a destructive confirmation.
- Real actions: refresh exposure; clear the KNOUX-managed value only when owned; explicit
  clear of current clipboard with a warning; links to managed copy and clipboard policy.
- Expiry countdown from the managed lease; the service's timeout and lock listener still
  clear managed values. Lock clears only a matching value.
- Route `clipboard_guard`; catalog `CLIPBOARD_GUARD` now implemented. No Tools destination
  count or Home-card change.
- Pure ownership/expiry policy extracted for deterministic tests:
  - Unavailable/empty/foreign/managed/expired classification.
  - Auto-clear only for managed/expired; explicit clear allowed for foreign; both refused
    for empty/unavailable.

## Verification actually executed (Windows, this session)

| Check | Command | Result |
|---|---|---|
| App policy tests | `./gradlew :app:testDebugUnitTest --rerun-tasks --no-daemon -Dorg.gradle.jvmargs=-Xmx1024m...` | **PASS, exit 0 — 11 app tests**; `ClipboardLeasePolicyTest` 2 |
| Security/data suites | `:core:security:test`, `:core:data:testDebugUnitTest` | **PASS** — 54 + 63 |
| Aggregate JVM | result XML count | **128 tests, 0 skipped, 0 failures, 0 errors** |
| Lint | `:core:data:lintDebug :app:lintDebug` | **PASS, 0 errors** (12 app warnings, 8 core warnings) |
| androidTest compile | `:app:compileDebugAndroidTestKotlin :core:data:compileDebugAndroidTestKotlin` | **PASS (compiled, NOT RUN)** |
| Debug APK | `:app:assembleDebug --no-daemon` | **PASS, exit 0 — 17,714,701 bytes** |
| APK SHA-256 | `sha256sum` | `40259ea5ee7aac869c30fba1687eaed0dca823ac9ba9f4622f3b001ae0526dd2` |
| Device | `D:/Android/sdk/platform-tools/adb.exe devices`; Hypervisor | Empty; `HypervisorPresent=False` |

## Honest limitations

- DEVICE_UNVERIFIED: Android clipboard read restrictions (foreground/Android 10+/13+),
  vendor clipboard managers, toast behavior, process death, rotation and TalkBack.
- There is **no guaranteed global clipboard erasure**. Auto-clear is best effort and only
  for a same-process exact match; values may survive process death or be read by other apps.
- The guard reads clipboard content internally only to test ownership; it never renders it.
  Reading may be restricted by the OS and is reported as UNAVAILABLE.
- Explicit clear can remove foreign clipboard text after user confirmation; this is
  intentional but destructive and warned.
- No independent audit.

## Next safe action

Run the device checks for each state, external modification, expiry, lock, explicit clear
and process death. TASK 44 depends on TASK 25 + TASK 08; both are now implemented at source
level, so TASK 44 may proceed, with its own device/audit gaps.
