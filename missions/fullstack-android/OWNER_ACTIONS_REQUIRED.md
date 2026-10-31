# OWNER ACTIONS REQUIRED — KNOUX Crypt

This is an owner checklist for genuinely owner-exclusive last-mile actions. It is
not a mission pack and it does not shift unfinished engineering onto the owner.
Everything listed here is engineering-complete up to the stated boundary.

Updated: 2026-10-31 · Branch `android/native-implementation-20261031` · Security P0 `c3f718f` · Rotation `176d8c3` · Privacy `3091032` · Keystore IV fix `ca7a1bc`.

## 1. Run the device-only security checks (TASK 02 / TASK 45)

**Why owner-exclusive:** the Windows host reports no Android device and no
hypervisor (`HypervisorPresent=False`), so BiometricPrompt, real Keystore
invalidation, lifecycle and screenshot parity cannot be executed here.

**What is already done:** all source, JVM tests (120 passing; split runs due host memory), androidTest compilation and the debug APK. Nothing is waiting on code. The exact device sequence is in `DEVICE_VERIFICATION_CHECKLIST.md`.

**Exact owner input needed:** a physical Android 8.0+ device (API 26+) with
enrolled strong biometrics, USB debugging enabled, visible in `adb devices`.

**Procedure (from `native-android/`):**

```bash
adb devices
./gradlew :app:connectedDebugAndroidTest :core:data:connectedDebugAndroidTest
./gradlew :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Expected proof of activation: all instrumented classes pass on the device
(`AccessFlowTest`, `KeystoreDeviceTest`, `VaultDatabaseMigrationTest`), first-run enrollment succeeds, unlock
only after a real biometric prompt, gate rotation keeps the old gate on cancel,
biometric-invalidation shows the recovery-required state without deleting data,
and a 30 s background lock clears decrypted lists. Also open `Key Derivation`,
run the default Argon2id cost, confirm the elapsed time and that a very low-memory
device shows the OOM error instead of crashing. Create a backup to a real SAF
destination, restore it into a freshly set-up vault on a second device/profile,
and confirm conflicts are refused without partial writes. Open Account → Vault
data key rotation, perform the biometric reauth, migrate a vault with mixed
versions, kill the app mid-rotation and resume, cancel after migration, and
confirm an existing KNF1 device-key file still decrypts after rotation. Run the
Room 1→2 migration test on a database created by the previous build. Also verify
that saving/reading a note or password works with the real Keystore root (the
previous caller-IV path would fail), that a new device-key file is KNF2 with a
wrapped per-file DEK, and that legacy KNF1 files still open. In Privacy Center,
exercise every auto-lock timeout, screen-off lock, clipboard timeout and lock
clear, the FLAG_SECURE toggle, and the app-switch cover. In File Integrity, hash
a known file, compare correct/wrong references, cancel mid-hash, use a corrupt
URI, and stream a 4 GB file if available; verify the in-memory report copy. In HMAC Lab, test text/file generation, RFC-style known values if available, wrong/changed tags, empty inputs, cancellation and RTL/keyboard.

**Still unverified until this runs:** same `Cipher` instance returned by
`BiometricPrompt` (the boundary rejects substitution by identity), Keystore
invalidation mapping, real KDK1 wrapping and KNC encryption under the
non-exportable root, KNF2 file encryption/decryption, legacy KNF1 file
decryption, Room migration on a real database, rotation interruption/resume,
lifecycle/privacy timing, clipboard clearing after process death, screen/inset/
RTL parity.

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

## 4. Backup, key rotation and lost-gate recovery (TASK 15 / TASK 31)

- **Encrypted data backup/restore is implemented** for typed vault records
  (notes/passwords/TOTP) using KNP2/Argon2id and conflict-safe restore.
- **Device/SAF verification is still pending** (section 1): picker behavior,
  real file providers, process death and cross-device restore are unverified.
- **Lost-gate recovery is not implemented.** A biometric-invalidated or missing
  gate still shows a truthful recovery-required state; the backup cannot restore
  the old gate or Keystore root.
- **Key rotation is source-implemented/JVM-tested but not device-verified or
  audited.** It rotates wrapped record DEKs, not the Keystore root. New
  device-key files now use KNF2 with a root-wrapped per-file DEK; existing
  external KNF1 device-key files remain readable and are not automatically
  migrated. No root-retirement or complete key-loss recovery claim is made.
- The owner decision still needed for future work is the recovery-credential
  policy for re-authorizing an existing vault, and whether to build a KNF2
  migration tool for existing external KNF1 files so they can eventually move
  off the retained root key. Current retention is safe and non-destructive; do
  not force its removal.
- TASK 44 is **not dependency-ready**: it requires TASK 25 Clipboard Guard and
  TASK 08. TASK 25 remains unimplemented; do not infer TASK 44 from TASK 42.
