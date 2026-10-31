# EVIDENCE — TASK 15 — Backup / Recovery

Date: 2026-10-31 (Asia/Dubai)
Branch: `android/native-implementation-20261031`
Implementation commit: `2975ec6` (PR14 reconciliation: `b4fe65c`)
Verified baseline: `integration/knoux-crypt-android-ready-20261030` @ `8f6f992`

Classification: **BUILD_VERIFIED / JVM-TESTED where stated — DEVICE_VERIFIED: NO**.
No emulator or device was available (`adb devices` empty, HypervisorPresent=False), so no
install, launch, screenshot, lifecycle, Back, biometric, Keystore or SAF evidence exists.

- Status **BLOCKED**. No export is created and no fake backup success is shown.
- Missing: Argon2id (mission 37), independent recovery wrap, fresh-device restore and corruption tests, key rotation.
- Losing the device or clearing app data can make vault records unrecoverable; stated in-app.

---

## Encrypted data backup & restore slice — 2026-10-31 (`aedb4c3`)

- Baseline for this increment: `ed7fc7e` (KNP2/Argon2id available).
- Implementation SHA: `aedb4c3f88910af4962d2ed517a1df2f1e8736ea`.
- Classification: **DOMAIN_IMPLEMENTED + INTEGRATED + TESTED_LOCAL + BUILD_VERIFIED**.
  **DEVICE_UNVERIFIED** (SAF, storage pickers, lifecycle). **PARTIAL mission**: key rotation
  (TASK 31) is **not** implemented, and biometric-gate recovery is still **BLOCKED**.
  No independent audit; no 100% recovery claim.

### What really works

- New `core/data/VaultBackup.kt`: export selected typed records (notes, passwords, TOTP)
  as a strict JSON manifest sealed in a **KNP2/Argon2id** envelope with context
  `knoux.backup.v1`. The passphrase is user-held and never persisted. An unreadable row
  aborts the whole export instead of being silently omitted.
- Restore opens/validates the manifest, validates IDs/kinds/payload JSON, previews counts
  and conflicts **without returning plaintext**, then re-encrypts every record with the
  **current device master key** and inserts all rows in one Room transaction.
  Conflicting IDs are refused; existing records are never overwritten. Import into a
  fresh device works after a new gate/new master key is created.
- New real Recovery UI (`route = recovery`, catalog `BACKUP` implemented for this scope):
  Export/Restore modes, per-section selection, passphrase + confirmation, SAF
  CreateDocument/OpenDocument, preview counts/conflicts, busy/error/success states,
  AR/EN copy. DAOs: `all()`, `ids()`, atomic `insertAll(ABORT)`; no schema change.
- Session capability is checked before/after decrypt, preview and restore; a lock aborts
  operations. Backup bytes are ciphertext only; temp plaintext JSON/keys are zeroed where
  the JVM allows, and no backup plaintext is written to disk.
- The UI explicitly states scope: no files/media, no Keystore root-key export, no
  biometric-gate recovery, no escrow, format v1, imports never overwrite.

### Verification actually executed (Windows, this session)

| Check | Command | Result |
|---|---|---|
| Fresh all-module JVM tests | `./gradlew :core:security:test :core:data:test :app:testDebugUnitTest --rerun-tasks` | **PASS, exit 0** — 79 tests, 0 skipped, 0 failures, 0 errors |
| Backup suite | included above | **PASS** — `VaultBackupTest` 9: cross-vault round-trip with new keys, selected sections, wrong passphrase/tamper, context separation, conflicts-write-nothing, unreadable-row abort, locked capability, unsupported kind/version/duplicates, oversize cap |
| Debug APK | `./gradlew :app:assembleDebug` | **PASS, exit 0** — 17,600,138 bytes |
| APK SHA-256 | `sha256sum` | `c49f4831a4b8419e0c68f7f0f65bc1227463b14c62f3d8bb9f0e4cbf267bce5d` |
| Lint | `./gradlew :core:data:lintDebug :app:lintDebug` | **PASS, exit 0** — 0 errors (10 app warnings, 7 core:data warnings) |

### Honest limitations / remaining risks

- **Key rotation is now separate (TASK 31, `176d8c3`).** Backup restore re-encrypts under
  the vault's current active key version; the rotation implementation, journal and
  retirement guard live in TASK 31. The Keystore root is retained and this backup still is
  not full key-loss recovery.
- **Gate recovery is absent.** The biometric gate and Keystore master key are not backed up.
  A user who lost the gate cannot use the backup until a new gate is set up; the old gate
  is not restored. The recovery-required panel remains truthful.
- Backup plaintext is capped at 1 MiB (KNP2 limit) and the file at 2 MiB; large vaults are
  refused rather than truncated. Portable files/media are not included.
- The vault must be unlocked to export/restore. No background/WorkManager backup,
  no scheduled backups, no incremental/deduplicated backup.
- SAF pickers, process death, rotated/large-screen UI and real file-provider behavior are
  **DEVICE_UNVERIFIED**. No screenshot vs canonical reference. No independent audit.
- JVM Strings cannot be wiped deterministically; plaintext manifest and passphrase may
  remain in heap until GC. No plaintext is persisted by this implementation.

### Next safe action

TASK 31 rotation is now source-implemented and JVM-tested (`176d8c3`), but the Keystore
root is retained and external KNF1 files are not migrated. TASK 15 should not be marked
fully complete before SAF/device restore drills, the Room/Keystore device tests and an
independent review exist.
