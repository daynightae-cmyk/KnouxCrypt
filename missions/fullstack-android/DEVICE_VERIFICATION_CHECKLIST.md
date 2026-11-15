# KNOUX CRYPT — DEVICE VERIFICATION CHECKLIST

This is an execution checklist, not a mission pack and not a completion claim.
Everything below remains **DEVICE_UNVERIFIED** until the commands/tests actually run on
hardware and the raw results are recorded in the mission evidence.

## Hardware status — first real run 2026-11-01

A device is now attached: **itel S686LN, Android 15 / API 35, arm64-v8a, TEE Keystore,
strong fingerprint available**. Full raw results are in
`DEVICE_VERIFICATION_2026-11-01_ITEL_S686LN.md` and
`device-evidence/knoux-crypt-android-2026-11-01-itel-s686ln/`.

Closed by that run (single handset, no audit): sections 1–2 partially — the 8 instrumented
tests (`:core:data` 7, `:app` 1) executed and passed on hardware; provider-generated IV with the
real root, KDK1 wrapped-DEK roundtrip, KNF2 device file, `gateKeyIsUserAuthenticationBound`,
Room v1→v2 migration and the TASK 36 audit over real Room rows are DEVICE_VERIFIED. The auth-bound
gate also behaved correctly end to end: the SystemUI biometric sheet stayed pending 20 s with the
vault locked and nothing was minted; only an owner fingerprint touch opened a session.
Section 4's screenshot policy is measured effective (app layer 0.36 % non-black, capture blocked
while the biometric sheet is up).

Still open on this device: canonical visual-parity PNGs (capture must be toggled off first),
key rotation end to end, SAF backup/restore, clipboard lease timing and vendor behaviour, package
inspector against a real file, screen-off auto-lock timing, TalkBack / 200 % font / 4 GB hashing.
Every unlock requires the owner's finger, so the authenticated items are owner-participation
gated, not automation-gated.

Current source baseline: branch `android/native-implementation-20261031` and `main` both at
`8320726` (TASK 36 consolidated). Earlier entries in this file that say "no device" describe the
pre-2026-11-01 state.

## 0. Preconditions

- Physical Android 8.0+ device (API 26+), strong biometrics enrolled, USB debugging.
- Debug build only; no production signing/Play upload.
- Back up any existing debug database (`adb backup` or in-app backup) before testing rotation
  or migrations. Do not test destructive paths on data you cannot lose.
- Run from `native-android/`; use the SDK adb path or add platform-tools to PATH.

```bash
D:/Android/sdk/platform-tools/adb.exe devices
D:/Android/sdk/platform-tools/adb.exe install -r app/build/outputs/apk/debug/app-debug.apk
```

Expected: one `device` entry, install `Success`.

## 1. Build and instrumented suites

```bash
./gradlew :app:assembleDebug
./gradlew :core:data:connectedDebugAndroidTest :app:connectedDebugAndroidTest
D:/Android/sdk/platform-tools/adb.exe logcat -c
```

Record:
- Device model, Android/API level, build fingerprint, security patch.
- Every test name and pass/fail; screenshots of failures.
- `adb logcat` filtered for `AndroidRuntime`, `Keystore`, `InvalidAlgorithmParameter`,
  `AEADBadTag`, `UserNotAuthenticated`, `KeyPermanentlyInvalidated`.
- Any timeout is **INCONCLUSIVE**, never PASS.

Instrumented classes include `AccessFlowTest`, `KeystoreDeviceTest` (real root record/KDK1/
KNF2), and `VaultDatabaseMigrationTest`.

## 2. Android Keystore and record encryption (critical)

1. Fresh install/first-run setup with biometrics.
2. Create a note and a password; close and reopen the app; unlock and read both.
3. Confirm no `InvalidAlgorithmParameterException`/caller-IV failure appears in logcat.
4. Lock and unlock repeatedly; save/read again.
5. Add or remove a device biometric enrollment; attempt unlock. Expected: truthful
   recovery-required state, no data deletion, no fake success.
6. Rotate the vault data key (Account → Vault data key rotation) with biometric reauth.
   Verify mixed-version reads, kill the app mid-rotation, unlock and resume, cancel after
   partial migration, and then complete. Repeat rotation twice.
7. Confirm the Keystore root alias is never offered for deletion/retirement and KNF1
   legacy device-key files still decrypt after rotation. Do not assume root deletion.
8. Back up/inspect the debug DB only for ciphertext presence; never paste plaintext into
   logs or screenshots.

Negative cases: wrong/expired/foreign rotation authorization; corrupt record; missing
wrapped DEK; App data cleared (expected unrecoverable without backup).

## 3. KNF2 file envelope recovery

- Encrypt a device-key file, then decrypt on the same device.
- Test a new file header is KNF2 (`DEVICE_WRAPPED`, wrapped file key present) and that a
  pre-existing KNF1 device-key file still opens.
- Tamper the wrapped DEK, first/last authentication tag, truncate the file, and change the
  first chunk. Expected: failure with no success status; the UI deletes its temporary/output
  document; no plaintext is reported as verified.
- Delete the file between selection and hashing/decryption; expected typed error, no crash.
- Record whether partial plaintext could be written to a temporary app cache before failure;
  confirm the temp file is deleted.
- No recovery claim: lost root/gate or lost wrapped DEK means the file is unrecoverable.

## 4. Key rotation and Room migration

- Use a database created by the previous build (Room v1); install the new build and verify
  migration 1→2 preserves rows with `keyVersion=0` and reads them.
- Perform v0→v1 and v1→v2 rotations; verify per-row versions during migration and
  authenticated target rows after cutover.
- Interrupt at prepared, mid-batch, verification, post-cutover/pre-cleanup, and cleanup;
  resume each time. No row may be lost; a source DEK must not be retired until zero rows
  depend on it.
- Force a corrupt row and a partial Room failure; expected batch rollback and resumable
  journal.
- Rotate while a background/save operation is attempted; lock must serialize/deny writes
  according to the mutation boundary. No write may commit after lock returns.

## 5. Session privacy

- For each auto-lock setting (15/30/60/300 s): background the app, wait, return. Session
  must be locked exactly at policy; no decrypted lists remain visible.
- Enable/disable lock on screen off; press power and return; verify lock/no-lock.
- Copy a password/Key Forge/KDF result; wait for each clipboard timeout; verify clearing.
  Change the clipboard from another app; verify KNOUX does not clear the foreign value.
  Lock the vault; verify the managed value clears immediately.
- Toggle FLAG_SECURE; try screenshot and recents. When enabled, capture must be blocked;
  when disabled, the warning must be visible. App-switch cover is best-effort, not a
  guarantee.
- Kill the process with a copied value; verify truthfully that the OS may retain it.
- Rotate the screen, use large text, keyboard, Back, and RTL/LTR; no clipping or state leak.

## 6. SAF: backup, file cipher, integrity

- Backup export to Downloads and a cloud provider if available; restore into a fresh
  setup/profile. Verify counts, wrong passphrase, tamper, conflicts, cancelled/partial
  writes, and process death.
- File cipher: encrypt/decrypt a multi-MB file through SAF; same input/output rejection;
  cancel; corrupt/truncated container; output document cleanup. Test both device-key and
  passphrase modes.
- File integrity: known file/correct digest; wrong digest; invalid 64-hex input; cancel
  mid-hash; corrupt URI; 4 GB file if storage allows; copy evidence report.
- Package Inspector: a real KNF1 legacy, KNF2 device file, KNP1/KNP2 text envelope, unknown
  magic, truncated header, forged wrapped length and absurd Argon2 cost. Confirm the screen
  never claims authenticity without a key.
- Revoke SAF URI permission if possible; expected typed error, no crash or fake result.

## 7. Visual and accessibility acceptance

At 360×800, 390×844, and 412×915 in EN and AR:
- Splash/Access/Home/Tools/Account and every implemented route.
- Safe insets, keyboard, small screens, Back/predictive Back, RTL, large font, reduced
  motion, TalkBack labels and selected/live-region states.
- Compare against canonical references where present; record differences. A successful
  build is not visual parity.

## 8. Evidence format

For each check record:
`date · device/API/build · command · exit code · raw result · screenshot path · logcat
filter/result · PASS/FAIL/INCONCLUSIVE/UNSUPPORTED · limitation`.

Update the owning mission `EVIDENCE.md` and `NATIVE_STATUS_2026-10-31.md`. Do not mark
`DEVICE_VERIFIED`, `SECURITY_REVIEWED`, or `RELEASE_READY` until the corresponding rows
pass and an independent review exists.

## 9. TASK 25 / TASK 44 clipboard checks

TASK 25 (Clipboard Guard) and TASK 44 (Secure Clipboard) are now source-implemented on the
TASK 42 managed-lease service; both remain DEVICE_UNVERIFIED. On device verify:

- Managed copy from Passwords/Key Forge/Key Derivation and Secure Clipboard; timeout and
  lock clear; external modification turns the state FOREIGN without silent clearing;
  explicit clear warns and removes current text; process death leaves FOREIGN/unowned.
- Clipboard Guard metadata only (no content preview), expiry countdown, restricted reads,
  and Android/vendor clipboard restrictions.
- Secure Clipboard stages a value hidden, clears the field after copy, and never claims
  guaranteed erasure.

## 10. TASK 36 password audit

TASK 36 is source-implemented and JVM-tested; every runtime claim below is
DEVICE_UNVERIFIED. On device verify:

- Unlock, open Tools → Password Audit and run the scan against a vault holding: one
  known-weak secret, one repeated secret in two records, one blank password, one strong
  unique value and one deliberately corrupted row. Confirm the counts, the reuse cluster,
  the `Completed with gaps` pill and that no "all clear" text appears while a row is
  unreadable.
- Lock the vault (screen off, timeout and manual Lock) mid-scan on a large vault: no
  report may be published, no partial result may remain on screen, and re-entering the
  screen must start from `Not run`.
- Cancel a running scan; verify the pill shows `Cancelled`, nothing is published and the
  button becomes usable again.
- Confirm logcat contains no password value, no 64-hex grouping digest and no decrypted
  label; `adb shell dumpsys` screenshots and recents must not carry a value (FLAG_SECURE
  on).
- Verify RTL/Arabic label wrapping for strength levels and reasons at 360 dp width and
  200% font scaling; verify TalkBack reads level and reasons without reading the secret.
- Confirm the screen works with an empty vault (`not run`, no findings) and that opening
  it while locked routes to the unlock flow instead of auditing.
- Performance on a 1,000-record vault: progress must advance per record and the UI must
  stay responsive; record elapsed time and any dropped frames.
