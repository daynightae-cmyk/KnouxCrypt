# OWNER ACTIONS REQUIRED — KNOUX Crypt

This is an owner checklist for genuinely owner-exclusive last-mile actions. It is
not a mission pack and it does not shift unfinished engineering onto the owner.
Everything listed here is engineering-complete up to the stated boundary.

Updated: 2026-10-31 · Branch `android/native-implementation-20261031` · Security P0 `c3f718f`.

## 1. Run the device-only security checks (TASK 02 / TASK 45)

**Why owner-exclusive:** the Windows host reports no Android device and no
hypervisor (`HypervisorPresent=False`), so BiometricPrompt, real Keystore
invalidation, lifecycle and screenshot parity cannot be executed here.

**What is already done:** all source, JVM tests, androidTest compilation and the
debug APK. Nothing is waiting on code.

**Exact owner input needed:** a physical Android 8.0+ device (API 26+) with
enrolled strong biometrics, USB debugging enabled, visible in `adb devices`.

**Procedure (from `native-android/`):**

```bash
adb devices
./gradlew :app:connectedDebugAndroidTest :core:data:connectedDebugAndroidTest
./gradlew :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Expected proof of activation: both instrumented classes pass on the device
(`AccessFlowTest`, `KeystoreDeviceTest`), first-run enrollment succeeds, unlock
only after a real biometric prompt, gate rotation keeps the old gate on cancel,
biometric-invalidation shows the recovery-required state without deleting data,
and a 30 s background lock clears decrypted lists. Also open `Key Derivation`,
run the default Argon2id cost, confirm the elapsed time and that a very low-memory
device shows the OOM error instead of crashing. Create a backup to a real SAF
destination, restore it into a freshly set-up vault on a second device/profile,
and confirm conflicts are refused without partial writes.

**Still unverified until this runs:** same `Cipher` instance returned by
`BiometricPrompt` (the boundary rejects substitution by identity), Keystore
invalidation mapping, screen/inset/RTL parity, process-death behavior.

## 2. Commission an independent security review (TASK 02 / TASK 30)

**Why owner-exclusive:** an external reviewer must actually be engaged. This
project must not claim an audit before one occurs.

**Inputs they need:** this branch SHA, `android-spec/CRYPTO_SECURITY_CONTRACT.md`,
`missions/fullstack-android/02_SECURE_ACCESS_LOGIN/EVIDENCE.md`, the test suite.
**Proof:** a signed review report with findings and disposition. No audit is
claimed today.

## 3. Provider credentials

No currently implemented service requires a provider credential, OAuth account
or paid plan, and the app requests no INTERNET permission. If a later mission
adds one, this file will name its TASK ID, scopes, secure credential path and
activation test. Do not place secrets in the APK or repository.

## 4. Recovery restore (TASK 15)

Recovery is **not implemented**, so there is no owner action yet. The app shows
a truthful recovery-required state for an invalidated/missing gate and keeps
data intact. The owner decision needed before engineering continues is the
recovery-credential policy (what independently verified credential may
re-authorize an existing vault). Do not treat the current recovery panel as a
restore feature.
