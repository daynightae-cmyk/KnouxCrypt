# EVIDENCE — TASK 31 — Vault Key Rotation

Date: 2026-10-31 (Asia/Dubai)
Branch: `android/native-implementation-20261031`
Baseline SHA: `ef4592c350b9b60aa23a5b23dca1bd123f5c2b2b`
Implementation SHA: `176d8c38557893b773e598f596dd81c8aea90240`

Classification: **SOURCE_IMPLEMENTED / JVM_TESTED / DEVICE_UNVERIFIED / AUDIT_PENDING**.
This is **not** a complete security closure. No physical device/emulator was available
(`D:/Android/sdk/platform-tools/adb.exe devices` is empty, `HypervisorPresent=False`).
No independent audit was performed. Do not describe rotation as fully production-verified.

## 1. In-flight revocation / TOCTOU repair (same commit)

The prior boundary revalidated before and after a DAO call, leaving a window where a
write could commit after `lock()` returned. `SessionManager` now has a coroutine-safe
`withAuthorizedMutation(access) { ... }` gate:

- A repository/backup/rotation mutation holds the gate across the logical Room commit.
- `lock()` is now `suspend` and takes the same gate before revoking. It waits for an
  already-authorized mutation to finish; **no mutation can start after revocation, and
  no mutation can silently commit after `lock()` returns.**
- All callers were updated (UI lock actions use a composition/activity coroutine;
  MainActivity background lock already runs in `lifecycleScope`).
- `save`, `delete`, KNP2 backup `restore` and every rotation batch use this boundary.
  Reads keep post-decrypt/post-emission validation; file streams keep chunk checkpoints
  with temporary-output deletion on lock.
- Deterministic tests pause the DAO, revoke, and assert the lock waits, the authorized
  commit lands before revocation, later writes fail, and cancellation/database errors
  write nothing.

## 2. Versioned key hierarchy

- **Root:** the existing non-exportable Android Keystore alias `knoux.master.v2` remains
  the root KEK. It is never deleted, renamed, replaced or regenerated.
- **DEKs:** random AES-256 data-encryption keys per version. Each is wrapped with the
  root through **KDK1** (AES-256-GCM, header + `knoux:dek-wrap:v1` AAD, version bound).
  Only wrapped DEK material is persisted (DataStore `knoux_vault_keys`); raw DEKs are
  never stored or logged.
- **Records:** Room schema v2 adds `keyVersion`. `0` means legacy KNC1 root-key records;
  positive versions use **KNC2**, whose authenticated header includes the key version.
  Decryption always enforces the expected version, including 0 -> KNC1, so tampering
  `keyVersion` cannot select a more permissive format.
- **Migration:** `MIGRATION_1_2` adds the column with default 0 and does not re-encrypt
  existing rows. Existing aliases, KNF1 files and KNP1/KNP2 envelopes are untouched.

## 3. Rotation workflow

- **Owner reauthentication:** `UnlockManager.prepareRotationReauthCipher()` +
  `completeRotationReauth(cipher)` verify the unlock token again over a real auth-bound
  gate cipher and mint a single-use, 5-minute `RotationAuthorization` bound to the live
  capability. A locked session or reused/expired/foreign token is rejected.
- **Preflight/inventory:** active version, per-version record counts, stored wrapped key
  versions, and journal state. Missing active keys, undeclared mixed versions, or a
  journal/active mismatch abort before any record change.
- **Journal:** DataStore journal records source/target versions, phase
  (`PREPARED`/`MIGRATING`/`VERIFYING`/`CUTOVER`) and initial total. Row-level
  `keyVersion` is the authoritative checkpoint.
- **Batches:** source rows migrate in Room transactions. Each row is decrypted with the
  source key, re-encrypted with the target key (KNC2), re-decrypted and compared, then
  updated. Any error rolls back the whole batch; no row is discarded.
- **Cutover:** every target row is authenticated; source rows must be zero (including
  concurrent new writes). Active version switches under the revocation gate. The target
  key is verified; source DEK is removed only after zero dependencies and active==target.
  The root key is retained.
- **Interruption:** crash before cutover resumes from rows (new manager instance tested);
  crash after cutover before cleanup finalizes idempotently. Cancellation before any
  target row removes the unused target key/journal; cancellation after migration keeps a
  resumable journal and both keys. This is recoverable interruption, **not rollback**.
- **UI:** real Compose wizard at internal route `key_rotation`, opened from Account when
  unlocked: inventory, active/source/target versions, interrupted-journal resume,
  biometric reauth request, determinate progress text, cancel/resume, success/error,
  AR/EN, explicit acknowledgment that the root is retained for external KNF1 files.
  34 Tools destinations and 8 Home cards are unchanged.

## 4. Mandatory negative-test coverage (JVM, deterministic)

`core/data/src/test/.../VaultKeyRotationTest.kt` — **14 tests, PASS**:

1. Lock during a pending DB write: lock waits for the authorized batch commit; later
   rotation calls fail on the revoked capability; journal survives and resumes.
2. Revoked capability during rotation (same test, plus stale capability tests).
3. Interruption before cutover by a new manager instance; interruption after cutover
   before cleanup with injected retirement failure, then successful resume.
4. Mixed old/new record versions readable through the repository; mixed-version backup
   export works.
5. Corrupted ciphertext aborts the batch with rows unchanged.
6. Missing wrapped DEK reports `MissingVaultKeyException` and leaves data intact; real
   Keystore wrapping/tamper tests are compiled in androidTest (not run).
7. Partial update failure rolls back the entire fake Room transaction.
8. Wrong, expired, foreign and reused authorization tokens rejected.
9. KNF1 device-key file encrypted before rotation still decrypts after rotation; the
   root key is explicitly retained (no external file enumeration/claim).
10. Restart/recovery from journal without data loss.
11. Repeated prepare is idempotent; clean cancel removes only an unused target key;
    partial cancel is resumable.
12. Cutover refuses while source rows remain; source DEK is retained; retirement only
    after zero dependencies.

Other new tests: `SecurityBoundaryTest` 25 (includes pending write wait, cancellation,
DB failure, backup restore revocation, reauth cipher/substitution), `VaultBackupTest` 10,
`SecretCodecTest` 5 (incl. KNC2 key-version binding/tamper).

## 5. Verification actually executed (Windows, this session)

| Check | Command | Result |
|---|---|---|
| Fresh all-module JVM tests | `./gradlew :core:security:test :core:data:test :app:testDebugUnitTest --rerun-tasks` | **PASS, exit 0 — 99 tests, 0 skipped, 0 failures, 0 errors** |
| Debug APK | `./gradlew :app:assembleDebug` | **PASS, exit 0 — 17,628,199 bytes** |
| APK SHA-256 | `sha256sum app/build/outputs/apk/debug/app-debug.apk` | `81b793f7226eee10f2f120982c4b41b82a825c30434b0fd9f8a74bb0bfdae959` |
| Lint | `./gradlew :core:data:lintDebug :app:lintDebug` | **PASS, 0 errors** (10 app warnings, 8 core:data warnings) |
| androidTest compile | `./gradlew :app:compileDebugAndroidTestKotlin :core:data:compileDebugAndroidTestKotlin` | **PASS (compiled, NOT RUN)** |
| Device | `D:/Android/sdk/platform-tools/adb.exe devices`; Hypervisor | Empty device list; `HypervisorPresent=False` |

New instrumented sources (compiled only): real-Keystore KDK1 wrap/unwrap + tamper and
wrong-version rejection in `KeystoreDeviceTest`; Room `MIGRATION_1_2` row-preservation
test in `VaultDatabaseMigrationTest`.

## 6. Honest limitations and remaining work

- **DEVICE_UNVERIFIED:** real Keystore GCM wrapping/unwrap, BiometricPrompt reauth cipher
  identity, Android lifecycle/rotation, Room migration on a real database, RTL/layout and
  process-death behavior. Instrumented tests exist but were not executed.
- **AUDIT_PENDING:** no independent security review, fuzzing, dependency CVE scan or
  formal proof.
- **Root retirement:** the Keystore root is retained permanently in this design; the UI
  makes no root-retirement claim. Rotation retires only positive DEK versions after zero
  rows.
- **External KNF1 files:** cannot be enumerated. They keep using the root key and remain
  readable; no automatic migration or root retirement is offered. This is an explicit
  retention policy, not a file-migration implementation.
- **No rollback after migration:** cancellation is resumable; reverting migrated rows to
  the old key is not implemented.
- **No background/WorkManager rotation:** the wizard requires the app foreground and a
  live session; leaving the screen cancels the job and leaves a resume journal.
- **KNF1 file rotation pending:** KNF1 format has no key-version field; a future KNF2 is
  required for device-key file re-encryption.
- Data-key unwrapping currently performs a root Keystore operation per record read; no
  per-session DEK cache is kept (security-first, performance not optimized).
- No screenshot comparison: no canonical `31_VAULT_KEY_ROTATION` PNG was present in this
  checkout (only the Anima text prompt). Visual parity is not claimed.
- The owner decision that remains is whether external device-key files should ever be
  migrated to a KNF2 versioned format; until then the root key cannot be retired.

## 7. Next safe action

Run the instrumented Keystore/Room migration and biometric reauth/rotation flows on a
real device, capture EN/AR screenshots at 360/390/441 widths, and commission an
independent review. Do not mark TASK 31 RELEASE_READY before those gates.
