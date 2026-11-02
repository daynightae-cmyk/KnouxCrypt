# TASK 39 - Local Security Activity / Evidence

State: **SOURCE_IMPLEMENTED, JVM_TESTED, MIGRATION_INSTRUMENTED_TESTS_COMPILED_NOT_RUN (no target), VISUAL_RUNTIME_NOT_TESTED**.

- Baseline commit: `038c7341bdcef009d231edcd0b42a6de12249250`
- Implementation commit: `7c0c8c07861dd7ccde52105136e5db6f3624a8cb`
- Branch: `production/android-hardening-20261102`
- Worktree at verification: clean before this evidence file; generated schema `3.json` unchanged.
- No automatic merge to `main` was performed.

## What was wrong in the previous pass

1. `SecurityEventRepository` had record/list/filter/clear but no production producer. Its
   `observe()` was a cold `flow { emit(list()) }`, not Room observation.
2. Security Activity and Catalog contained literal `???? ??????` sequences where Arabic
   text belonged. The bytes were valid UTF-8 but no longer Arabic.
3. `MIGRATION_2_3` created two indexes (`idx_security_events_createdAt`,
   `idx_security_events_category`) that were not declared on `SecurityEventEntity` or in
   the exported version-3 schema. Room validates indexes on open, so a real 2 -> 3
   migration would fail with "Migration didn't properly handle security_events".
4. The screen accepted `onNeedUnlock` but never used it; clear-all had no unlock gate;
   a production button inserted a fake "test event".
5. TASK 39 had no evidence file; the ledger called it implemented.

## Source changes (commit 7c0c8c0)

| Area | File | Change |
|---|---|---|
| Typed contract | `core/data/.../SecurityAudit.kt` | New action/category/severity enums, bounded event details, `SecurityAuditSink`, safe no-op, `recordSafely`, retention policy |
| Storage | `SecurityEventDao.kt` | Room Flow queries, deterministic ordering, retention trim, no undeclared indexes |
| Repository | `SecurityEventRepository.kt` | Real `observe()` mapping of DAO Flow; typed producer entry; 500-event/90-day trim on append |
| Auth producer | `UnlockManager.kt` | Emits enrollment, unlock success/rejection/failure/invalidated gate, owner re-verification, gate rotation |
| Prompt producer | `MainActivity.kt` | Records biometric-prompt cancellation/error at the platform boundary (never reached by UnlockManager) |
| Lock producer | `AppContainer.kt` | Session lock listener records `SESSION_LOCKED` |
| Vault producer | `SecretsDatabase.kt` | `SecretRepository` emits write/delete success, failure and cancellation with record *kind only*; added `saveIfUnchanged` optimistic revision check |
| Rotation producer | `VaultKeyRotation.kt` | Emits rotation started/resumed/completed/cancelled/failed with versions and counts only |
| Privacy producer | `SettingsRepository.kt` | Emits validated privacy setting name/value (no user data) |
| Transfer producer | `ShareService.kt` | Emits share sealed/opened/rejected with counts/bytes only |
| Migration | `SecretsDatabase.kt` | Removed the two undeclared indexes; table DDL now matches the entity and schema 3 |
| UI | `SecurityActivityScreen.kt` | Genuine Flow collection, lock-aware policy, unlock CTA, clear confirmation, no test-event button, repaired Arabic |
| Catalog | `Catalog.kt` | Repaired Arabic titles/descriptions for Security Activity and Session Privacy |
| Tests | see below | Typed event, live Flow, retention, privacy-bound, audit producer, conflict, migration and Arabic-source tests |

No event is recorded for actions that happened before this integration existed. There is no
backfill and the timeline does not imply historical coverage.

## Event producers (authoritative boundaries)

| Boundary | Events | Detail stored |
|---|---|---|
| First-run enrollment | `UNLOCK_ENROLLED` | none |
| Unlock verification | `UNLOCK_SUCCEEDED`, `UNLOCK_REJECTED`, `UNLOCK_FAILED`, `UNLOCK_GATE_INVALIDATED` | fixed reason token |
| Biometric prompt | `UNLOCK_CANCELLED`, `UNLOCK_FAILED`, gate-rotation equivalents | "prompt cancelled/error" only |
| Session revocation | `SESSION_LOCKED` | none |
| Gate lifecycle | `GATE_ROTATED`, `GATE_ROTATION_FAILED/CANCELLED`, `OWNER_REVERIFIED` | none |
| Data-key rotation | `KEY_ROTATION_STARTED/RESUMED/COMPLETED/CANCELLED/FAILED` | source/target version, row count |
| Vault writes | `DATA_WRITTEN`, `DATA_WRITE_FAILED/CANCELLED`, `DATA_DELETED`, `DATA_DELETE_FAILED/CANCELLED`, `DATA_UNREADABLE` | record kind, create/update/batch, count |
| Privacy settings | `PRIVACY_SETTING_CHANGED` | setting name and validated value |
| Secure Share | `SHARE_SEALED`, `SHARE_OPENED`, `SHARE_FAILED` | recipient count, byte count |

No producer passes titles, bodies, file names, paths, identifiers, keys, OTP seeds,
ciphertext or credentials into `detail`. The repository also caps detail at 240 chars.

## Privacy and retention policy (enforced)

- Timeline is **non-secret and remains visible while the vault is locked**, so a user can
  see a lock or rejected unlock. The UI shows a locked banner and an "Unlock to manage"
  action (`onNeedUnlock` is now used visibly).
- **Clearing requires a live unlocked capability.** It is checked in the ViewModel, not only
  by hiding a button, and is behind a confirmation that states it is irreversible and that
  the deletion itself is not recorded.
- Retention is bounded on every append: newest **500** events and **90 days**. The UI states
  this policy. No retention setting is exposed yet, so no fake "configure" control exists.
- A test/seed button no longer exists in production; users cannot create system-looking
  events.

## Room migration

- Entity: `security_events(id TEXT PK, category TEXT, action TEXT, detail TEXT, severity TEXT,
  createdAt INTEGER)`. No indexes are declared.
- `MIGRATION_2_3` now creates only that table. The exported schema
  `core/data/schemas/com.knoux.crypt.data.KnouxDatabase/3.json` has no `indices` block and
  was not modified by this commit.
- Instrumented tests in `VaultDatabaseMigrationTest.kt`:
  - `migration1To2PreservesRowsAndDefaultsKeyVersionZero`
  - `migration2To3CreatesTimelineWithoutIndexesAndPreservesCiphertextBytes`
  - `migration1To3RunsBothStepsAndPreservesCiphertextBytes`
  Each calls `runMigrationsAndValidate`, which would fail on any table/column/index mismatch,
  and compares the encrypted `envelope` BLOB byte-for-byte before/after.
- These tests **compiled** (`:core:data:compileDebugAndroidTestKotlin`), but **were not run**:
  `adb devices` is empty, no AVD/system image or emulator package is installed in
  `D:\Android\sdk`, and installing one was not attempted under the current storage budget.

## Tests actually run on this host (2026-11-02)

| Command | Result |
|---|---|
| `./gradlew :core:data:testDebugUnitTest --no-daemon` | **BUILD SUCCESSFUL**; 144 tests, 0 failures, 0 errors |
| `./gradlew :app:testDebugUnitTest --no-daemon` | **BUILD SUCCESSFUL**; 18 tests, 0 failures, 0 errors |
| `./gradlew :core:data:compileDebugAndroidTestKotlin` | **BUILD SUCCESSFUL** |
| `./gradlew :app:lintDebug` | **BUILD SUCCESSFUL** (report at `app/build/reports/lint-results-debug.html`) |

New JVM coverage includes: typed stable codes, live Room-style Flow emission, 500-event
trim, detail bound, policy constants, kind-only audit detail (no title/body), failure
outcome propagation, delete detail without record id, optimistic conflict detection and
missing-record handling. `ArabicSourceIntegrityTest` scans every Kotlin source for
`??` runs, U+FFFD and `tr()` Arabic arguments without Arabic script; `CatalogTest` now
requires Arabic script in every catalog Arabic field.

## Build/device/visual status

- APK build: not produced in this pass; lint + compile + JVM tests only.
- Device: none attached (`adb devices` empty). No runtime, lifecycle, process-death,
  rotation, RTL, font-scale or screenshot verification.
- Visual reference: `agent-handoff/KNOUX_CRYPT/03_HOME/07_PRIVACY_CENTER/SERVICES/39_LOCAL_SECURITY_ACTIVITY/REFERENCE.png`.
  Current screen uses the shared `BackHeader` + `GlassCard` language and does not reproduce
  the reference hero padlock, audit-preference rows or encrypted export action. These are
  recorded deviations, not accepted visual parity.
- CI: `.github/workflows/android.yml` exists. It had not run for commit `7c0c8c0` at the time
  of writing; no pass is claimed. The branch push attempt is recorded separately.

## TASK 42 / Session Privacy verification

`session_privacy` still routes to the shared `PrivacyScreen`, but the contract is not merely
an alias:

- `SessionPrivacyPolicy` validates auto-lock and clipboard choices.
- `SettingsRepository` (DataStore, non-secret) persists auto-lock seconds, lock-on-screen-off,
  clipboard timeout, screenshot blocking and app-switch masking.
- `MainActivity` enforces `FLAG_SECURE` live, locks on `ACTION_SCREEN_OFF`, and locks after
  the persisted background timeout.
- `ClipboardPrivacy` clears managed clipboard leases on lock; `PrivacyScreen` exposes all
  controls and reports the actual platform key protection level.
- JVM `SessionPrivacyPolicyTest` covers defaults and rejection of unsupported values.

This is an intentionally shared screen, not a duplicate session-privacy service. Visual
runtime status remains untested.

## Known limitations / remaining blockers

- No device/emulator: migration, lock-time behavior, biometric cancellation, RTL and visual
  runtime evidence remain unverified.
- Lock events are best-effort: if the process is killed in the same instant as the lock, the
  event write may not complete. The timeline does not claim otherwise.
- Retention is fixed, not user-configurable; no audit export (the reference's export action is
  not implemented and is not simulated).
- Audit rows are non-secret plaintext metadata in Room by design; they are not encrypted. They
  contain no secrets, but they are readable on a rooted/backup-capable device like any app DB.
  Android backup remains disabled by the app configuration.
- Historical actions before commit `7c0c8c0` were never recorded.

## Next safe task

TASK 05 Shadow Vault, reusing this audit pipeline for media import/export/open outcomes.