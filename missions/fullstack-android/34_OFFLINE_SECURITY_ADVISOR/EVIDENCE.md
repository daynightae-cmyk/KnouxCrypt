# TASK 34 - Offline Security Advisor / Evidence

State: **SOURCE_IMPLEMENTED, JVM_TESTED, DEVICE_TESTED=NO (BLOCKED_DEVICE), VISUAL_VERIFIED=NO**.

- Baseline commit: `2745fc2da03451c6cb25465e36e8be445d800744` (`origin/main`, tree verified clean and
  `gh pr list --state open` returned `[]` before branching)
- Implementation branch: `feature/android-task34-security-advisor-20261102`
- Implementation commit: `31ca1cca699731739c8d344d0a48919df2489427` (single commit)
- Merged into `main` as `f47644db0612f136691d3f2d2dd3a02893b9ae09` (merge commit, parents
  `2745fc2` + `31ca1cc`) via PR #43. No squash, no rebase, no force-push.
- CI: "Android Native CI" run `41482612535` on the PR head `31ca1cc` = **success**, 16/16 steps.
  Conclusion read back from `gh run view --json conclusion,headSha` and the step list, not from a
  watcher exit code.
- Post-merge: "Android Native CI" run `41484148473` on `main` at `f47644d` = **success**, 16/16
  steps (source boundary check, compile, JVM tests, lint, debug APK, SHA-256, evidence upload).
- Prerequisites already on `main` and reused, not re-implemented: TASK 14 Privacy
  (`privacy` route + enforced settings), TASK 39 Local Security Activity (`37b6fef` lineage),
  TASK 31 key rotation, TASK 05 vault.
- No Room schema change (database version stays **3**), no new Android permission, no new Gradle
  dependency, no envelope-format change.
- Canonical reference: `agent-handoff/KNOUX_CRYPT/03_HOME/07_PRIVACY_CENTER/SERVICES/34_OFFLINE_SECURITY_ADVISOR/REFERENCE.png`,
  SHA-256 `d48076917797e486196a841f43b47d7813e72c3f169aec4500c68a4274a0b731` — re-hashed on this
  checkout with `certutil -hashfile … SHA256`, identical to `34_OFFLINE_SECURITY_ADVISOR/SCREEN_QA.md`.

## TASK CLAIM (single writer)

| Field | Value |
|---|---|
| TASK_ID | 34 OFFLINE_SECURITY_ADVISOR (catalog id `OFFLINE_ADVISOR`) |
| OWNER | this session (Android lane) |
| BASE_SHA | `2745fc2` |
| ALLOWED FILES | `native-android/core/data/.../SecurityAdvisor.kt` (new), `AdvisorAdapters.kt` (new), `SecurityAdvisorServiceTest.kt` (new), `native-android/app/.../ui/SecurityAdvisorScreen.kt` (new), `AppContainer.kt`, `Catalog.kt`, `KnouxNavHost.kt`, `CatalogTest.kt`, `native-android/scripts/check-source.py`, `missions/fullstack-android/34_*`, `STATUS_LEDGER_CURRENT.md` |
| PROTECTED (untouched) | `MainActivity.kt`, `SecretsDatabase.kt`, Room schemas, Keystore/session contracts, Gradle files, `.github/workflows/*`, all `electron/`, `src/`, `docs/production-program/` |
| COMPETING WRITERS | none: no open PR, no stash, no other worktree on `native-android` |

## What the service actually reads

`core/data/src/main/kotlin/com/knoux/crypt/data/SecurityAdvisor.kt` — `SecurityAdvisorService`.
Thirteen deterministic rules, each declaring its own source and evidence tokens:

| Check | Real signal | Tiering rule |
|---|---|---|
| Device lock screen | `KeyguardManager.isDeviceSecure` | true → PASS, false → WARN, unreadable → UNAVAILABLE |
| Android patch level | `Build.VERSION.SECURITY_PATCH` | shown as INFO, **never judged** |
| App permissions | `PackageManager.getPackageInfo(this package, GET_PERMISSIONS)` | INFO; empty → UNAVAILABLE |
| Encrypted recovery | `UnlockManager.isConfigured()` + `recoveryReason()` | not enrolled → ADVISORY, enrolled → PASS, invalidation reason → WARN |
| Vault auto-lock | `AppSettings.autoLockSeconds` vs `SessionPrivacyPolicy.AUTO_LOCK_CHOICES_SECONDS` | ≤30 PASS, mid INFO, loosest choice ADVISORY |
| Screenshot restriction | `AppSettings.blockScreenshots` | on → PASS, off → ADVISORY |
| App-switch masking | `AppSettings.maskOnAppSwitch` | on → PASS, off → ADVISORY |
| Clipboard clearing | `AppSettings.clipboardClearSeconds` | `0` (never clears) → **WARN**, ≤60 PASS, slower ADVISORY |
| Lock on screen off | `AppSettings.lockOnScreenOff` | on → PASS, off → ADVISORY |
| Vault key version | `VaultKeyRotationManager.inventory()` version-0 row count + journal | root-key records → ADVISORY, open journal → WARN, none → PASS |
| Undecryptable records | `SecretRepository.list()` `decryptionFailed` flags across five kinds | any → WARN |
| Recent alerts | `SecurityEventRepository.observe()` ALERT rows in a 7-day window | INFO with action codes only |
| Offline by design | static build fact | INFO, always present |

Deliberate limits, enforced rather than promised:

- **The patch level is reported, not judged.** Deciding whether a patch string is current needs a
  reference list the app neither ships nor fetches. The evidence carries
  `judgedByApp=false` and `needsExternalReference=true` so the UI cannot imply a verdict it did not
  make.
- **No other app is ever enumerated.** `getPackageInfo` is called with *this* package's name only;
  `getInstalledPackages`, `getInstalledApplications` and `queryIntentActivities` are absent and
  asserted absent by `scripts/check-source.py`. The evidence states `otherAppsEnumerated=false`.
- **No network.** `java.net`, `HttpURL`, `OkHttp`, `Socket` and `WorkManager` are asserted absent
  from both the rules and the adapters, so "offline" is a checked property, not a label.
- **A signal that cannot be read is never a pass.** `UNAVAILABLE` is its own status with its own
  colour and its own count in the summary, and a locked vault yields `reason=vaultLocked` on the two
  vault-dependent rules while every device and settings rule still runs.
- **Evidence tokens are bounded and content-free.** `AdvisorFinding.init` rejects any token over 96
  characters or containing `://`, and a dedicated test saves a real encrypted password record and
  asserts that neither its title, username, password value, URL nor any path separator appears in
  the report.

## Adapters

`core/data/src/main/kotlin/com/knoux/crypt/data/AdvisorAdapters.kt`:

- `AndroidDeviceSignals` is the single framework seam. Every read is wrapped in `runCatching` and
  returns `null` on failure, which the rules must then report as UNAVAILABLE rather than assume.
- `DataStoreAdvisorDismissalStore` persists dismissals as `code@epochMillis` strings in a
  non-secret preferences store. No vault capability is needed to read or clear them, which is
  correct because they contain no user content. `dismissedAt()` exposes the real timestamp.

## Real UI behaviour

`app/src/main/kotlin/com/knoux/crypt/ui/SecurityAdvisorScreen.kt`, reproducing the reference order:
brand line with a working privacy-center action, back affordance, two-tone "Offline / Security
Advisor" title, the reference's subtitle, the Local Readiness Review card with three tiles, the
Recommended Checks list, the intrusion-detection disclaimer card, and the
"Run supported local checks" primary button.

- Before a run the tiles show the reference's `—` and **Pending**, and the list shows an explicit
  "nothing has been reviewed yet" card. No spinner stands in for work; `running` is driven by the
  actual coroutine.
- Each finding row shows its status pill, its **raw evidence tokens**, and its **source name**, so a
  user can verify the claim instead of trusting it.
- Every row with an action really navigates: system security settings, device info settings, this
  app's permission screen (all via explicit intents with `FLAG_ACTIVITY_NEW_TASK`), or the app's own
  privacy / recovery / key-rotation / security-timeline routes. A row with no action renders no
  chevron, so there is no dead affordance. Each system intent falls back to the privacy screen if
  the target is absent rather than silently doing nothing.
- Dismissal is a confirmed action, not a delete: the dialog states that the finding's status is
  unchanged and only its visibility is, and "Show all" restores everything.
- The locked-vault note is shown when the session is locked, explaining exactly which rules are
  reporting "cannot read" and why.
- Bilingual AR/EN throughout; ViewModel errors use the existing `BilingualText` pair because `tr()`
  is a composable function.
- No bitmap hero: the reference's glowing shield orb is represented by a native shield glyph,
  because the brief forbids turning a mockup into an inoperable image-based screen.

## Wiring

- `AppContainer.securityAdvisor` constructed from the real `SettingsRepository` (as a suspend
  provider so the rules stay JVM-testable without a Context), the real `UnlockManager`,
  `VaultKeyRotationManager`, `SecurityEventRepository` and `SecretRepository`.
- `KnouxNavHost`: route `security_advisor`.
- `Catalog`: `OFFLINE_ADVISOR` moved `DESIGN_ONLY` → `IMPLEMENTED`, route `security_advisor`,
  `requiresUnlock = false` — asserted in `CatalogTest`, because the advisor must work while the
  vault is locked and report honestly instead of being gated away.
- `scripts/check-source.py`: new advisor invariants (no network classes, no package enumeration,
  own-package-only permission query, UNAVAILABLE status present, patch-not-judged and
  other-apps-not-enumerated evidence, disclaimer text on screen).

## Commands, results and exit codes

All from `native-android/` on Windows, `--no-daemon`.

| # | COMMAND | EXIT | RESULT | TEST_COUNT | LOG_OR_ARTIFACT |
|---|---|---|---|---|---|
| 1 | `./gradlew.bat :core:data:compileDebugKotlin` | 0 | PASS | n/a | gradle console |
| 2 | `./gradlew.bat :core:data:testDebugUnitTest --tests "com.knoux.crypt.data.SecurityAdvisorServiceTest"` | 0 | PASS | 16/16, 0 fail, 0.271 s | `core/data/build/test-results/testDebugUnitTest/TEST-…SecurityAdvisorServiceTest.xml` |
| 3 | `./gradlew.bat :core:security:test` | 0 | PASS (after 1 transient retry) | 161 tests, 0 failures | `core/security/build/test-results/` |
| 4 | `./gradlew.bat :core:data:testDebugUnitTest` | 0 | PASS | 192 tests, 0 failures, 22 classes | `core/data/build/test-results/testDebugUnitTest/` |
| 5 | `./gradlew.bat :app:testDebugUnitTest` | 0 | PASS | 18 tests, 0 failures, 6 classes | `app/build/test-results/testDebugUnitTest/` |
| 6 | `./gradlew.bat :app:lintDebug` | 0 | PASS (after 1 transient retry) | 0 errors | `app/build/reports/lint-results-debug.html` |
| 7 | `./gradlew.bat :app:assembleDebug` | 0 | PASS | n/a | `app/build/outputs/apk/debug/app-debug.apk` |
| 8 | `python scripts/check-source.py` | 0 | PASS | 177 Kotlin files | stdout |
| 9 | dex literal check (12 advisor Arabic strings inside `classes*.dex`) | 0 | PASS 12/12 | n/a | inline python over `app-debug.apk` |
| 10 | `aapt2 dump permissions app-debug.apk` | 0 | PASS | 3 permissions | CAMERA, USE_BIOMETRIC, USE_FINGERPRINT only |

Two Gradle invocations initially failed with `java.net.BindException: Address already in use` while
creating Gradle's `FileLockContentionHandler` — a local loopback-port conflict, not a build error.
They were retried with a delay and passed; the retry count is recorded rather than hidden.

## Targeted test coverage (`SecurityAdvisorServiceTest`, 16 JVM cases)

Rules are exercised against the real `SessionManager`, `SecretRepository`, `UnlockManager`,
`VaultKeyRotationManager` and `SecurityEventRepository` over the shared in-memory harness. Only the
framework seam is faked, because `KeyguardManager`/`Build` cannot exist on the JVM.

1. `deviceLockScreenNeverReportsUnavailableAsAPass` — all three states; UNAVAILABLE contributes to
   the unavailable count and never to a pass.
2. `patchLevelIsReportedNotJudged` — INFO with `judgedByApp=false`; a blank patch string is
   UNAVAILABLE, not a zero.
3. `permissionsCoverOnlyThisAppAndSaySo` — count, `otherAppsEnumerated=false`, no URL in evidence,
   and UNAVAILABLE when the list is empty.
4. `recoverySeparatesNotEnrolledEnrolledAndInvalidated` — three genuinely different
   `UnlockManager` instances, including a real `KEY_INVALIDATED` reason producing WARN.
5. `autoLockTiersFollowTheRealChoiceSet` — 15/30/60/300 across PASS/INFO/ADVISORY, with the actual
   `SessionPrivacyPolicy` choices in the evidence.
6. `clipboardThatNeverClearsIsAWarnNotAPass` — `0` is a warning, not a silent default.
7. `screenshotBlockStatesItsOwnLimitation` — `mechanism=FLAG_SECURE` and
   `defeatsRootedOrScreenRecorder=false`; masking and screen-off are separate real settings.
8. `vaultDependentRulesRefuseToGuessWhileLocked` — locked session yields two UNAVAILABLE rules with
   `reason=vaultLocked` while device and settings rules still produce passes.
9. `keyVersionReportsRootKeyRecordsAndNeverCallsThemRotated` — a fresh vault genuinely has root-key
   records and is ADVISORY (not a pass); after rows move to a wrapped key it is PASS; an open
   rotation journal is WARN with `rotationInProgress=true`.
10. `unreadableRecordsWarnOnlyWhenARecordActuallyFailsToDecrypt` — clean vault PASS; after an
    identity-mismatched row makes decryption genuinely fail, WARN with the count.
11. `recentAlertsCountOnlyAlertsInsideTheWindowAndCarryCodesOnly` — a 40-day-old alert and a
    non-alert are both excluded, and the detail string never reaches the evidence.
12. `everyReportStatesWhatItDoesNotDo` — one finding per declared check, unique checks, every source
    named, and the four negative claims present.
13. `readinessTilesMirrorTheirUnderlyingFindings` — tiles cannot disagree with their findings.
14. `dismissalIsPersistentStateAndCanBeReversed` — dismissal hides a row without rewriting its
    status, and restore brings it back.
15. `evidenceTokensAreBoundedAndRejectUrls` — a 200-character token and a URL-bearing token are both
    rejected at construction.
16. `noFindingEverCarriesSecretBearingText` — a real encrypted password record is stored, and neither
    its title, username, password, URL nor any `/` appears anywhere in the report.

## Remaining production blockers

1. **BLOCKED_DEVICE** — `adb devices` is empty and `D:\Android\sdk` has no `emulator` package and no
   `system-images`. Owner action: install `emulator` plus
   `system-images;android-36;google_apis;x86_64`, or attach a device on an isolated test profile.
   Until then the following are **unverified at runtime**, not assumed working:
   - `KeyguardManager.isDeviceSecure` actually returning false on an insecure device (the rule is
     JVM-proved; the platform call is compiled-only).
   - `Build.VERSION.SECURITY_PATCH` on real OEM builds.
   - `PackageManager.GET_PERMISSIONS` returning the shipped manifest list.
   - The three system settings intents resolving on OEM builds, and the privacy-screen fallback.
   - DataStore persistence of a dismissal across process death.
   - No runtime screenshot exists, so `VISUAL_VERIFIED` stays NO and this screen is not
     pixel-approved.
2. **Visual deviations recorded, not hidden.** The reference's top row carries a search button; this
   app has no standalone search destination (search lives inside Tools), so it was omitted rather
   than wired to a dead control, and a back affordance was added on the title line because Android
   navigation needs one. The reference's glowing shield orb is rendered as a native shield glyph.
   The reference's fixed "Pending" tiles become real statuses after a run, by design.
3. **No remediation is performed from this screen.** It reports and navigates; it never writes a
   setting, because changing security settings silently from a review surface would be its own risk.
4. **`requiresUnlock = false` is a deliberate choice**, not an oversight: the advisor's value is
   highest exactly when the vault is locked, and the vault-dependent rules say so instead of
   disappearing.
5. `SECURITY_REVIEWED` — not independently performed.

## Definition-of-done position

UI + ViewModel + domain rules + real repository/OS reads + persisted non-secret dismissal state +
observable real outcome all exist, and the negative claims (offline, no app scan, no intrusion
detection) are enforced by tests and by the source-boundary script rather than asserted in prose.
Runtime behaviour on a device is unverified. TASK 34 is therefore recorded as
**SOURCE_IMPLEMENTED / JVM_TESTED / BLOCKED_DEVICE**, not as VERIFIED or COMPLETE.
