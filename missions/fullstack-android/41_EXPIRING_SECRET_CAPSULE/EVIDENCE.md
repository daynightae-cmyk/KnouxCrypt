# TASK 41 - Expiring Secret Capsule / Evidence

State: **SOURCE_IMPLEMENTED, JVM_TESTED, DEVICE_TESTED=NO (BLOCKED_DEVICE), VISUAL_VERIFIED=NO**.

- Baseline commit: `3bf27e8d6db099b1b7034abc406ecf4d6e47e4ce` (`origin/main`, tree verified clean,
  `gh pr list --state open` returned `[]` before branching)
- Implementation branch: `feature/android-task41-secret-capsule-20261102`
- Implementation commits: `2ada8b4` (feature) + `bf43718` (verification tooling, CI step, docs)
- Merged into `main` as `07371a61abe858df66f2285617dca385f61b34b7` (merge commit, parents
  `3bf27e8` + `bf43718`) via PR #44. No squash, no rebase, no force-push.
- CI: "Android Native CI" run `41492118419` on the PR head `bf43718` = **success**, **17/17 steps**,
  including the new "Packaged Arabic check" step running for the first time in CI. Conclusion and
  step list read back from `gh run view --json`, not from a watcher exit code.
- Post-merge run on `main` at `07371a6`: `41493808817` = **success**, 17/17 steps.
- Prerequisite reused, not re-implemented: TASK 16 Secure Share (`secure_share` route, already on
  `main`). Prerequisite TASK 40 Transfer Wizard is still design-only and is **not** required for the
  local capsule lifecycle; the share handoff goes through the existing SAF document picker instead.
- No Room schema change (database version stays **3**), no new Android permission, no new Gradle
  dependency, no new envelope magic. The capsule is an ordinary KNC2 vault record and the share
  package is an ordinary KNP2 envelope.
- Canonical reference: `agent-handoff/KNOUX_CRYPT/03_HOME/09_TOOLS_NAV/01_SECURE_SHARE/SERVICES/41_EXPIRING_SECRET_CAPSULE/REFERENCE.png`,
  SHA-256 `57600a43793b921b33451db2179a188412f44c9cfe5d4763ba36e3824a400362` — re-hashed on this
  checkout with `certutil -hashfile … SHA256`, identical to `41_EXPIRING_SECRET_CAPSULE/SCREEN_QA.md`.

## TASK CLAIM (single writer)

| Field | Value |
|---|---|
| TASK_ID | 41 EXPIRING_SECRET_CAPSULE (catalog id `SECRET_CAPSULE`) |
| OWNER | this session (Android lane) |
| BASE_SHA | `3bf27e8` |
| ALLOWED FILES | `native-android/core/data/.../SecretCapsule.kt` (new), `Secrets.kt`, `SecurityAudit.kt`, `SecretsDatabase.kt`, `SecurityEventRepository`-adjacent tests unchanged, `SecretCapsuleServiceTest.kt` (new), `native-android/app/.../ui/SecretCapsuleScreen.kt` (new), `AppContainer.kt`, `Catalog.kt`, `KnouxNavHost.kt`, `CatalogTest.kt`, `native-android/scripts/check-source.py`, `native-android/scripts/check-dex-arabic.py` (new), `.github/workflows/android.yml`, `missions/fullstack-android/41_*`, `STATUS_LEDGER_CURRENT.md` |
| PROTECTED (untouched) | `MainActivity.kt`, `SecretsDatabase.kt` schema/migrations (only the audit-kind suppression list changed), Room schemas, Keystore/session contracts, Gradle files, all `electron/`, `src/`, `docs/production-program/` |
| COMPETING WRITERS | none: no open PR, no stash, no other worktree on `native-android` |

## What is actually enforced

`core/data/src/main/kotlin/com/knoux/crypt/data/SecretCapsule.kt` — `CapsuleService`:

- A capsule is one authenticated vault record (`SecretKinds.CAPSULE`). The secret, the label, the
  expiry, the open limit, the consumed count and the revocation timestamp all live **inside the same
  KNC2 ciphertext**, whose AAD binds kind + record id. Editing the expiry without the vault key
  breaks authentication instead of extending the secret's life.
- `reveal()` checks revocation → expiry → remaining opens, and only then consumes an allowance.
  Every refusal happens **before** the record is written, so a refused reveal never silently burns an
  open. This is asserted, not assumed: a test moves the clock past expiry and then proves
  `opensUsed` is still 0.
- Consuming an open is a compare-and-set on the record revision inside the revocation gate
  (`SecretRepository.saveIfUnchanged`), so two concurrent reveals cannot both spend the last
  allowance. A test fires two reveals at once against `maxOpens = 1` and asserts exactly one returned
  the secret and the stored count is exactly 1.
- State is **derived, never stored**. Advancing the injected clock changes ACTIVE to EXPIRED without
  a single byte changing on disk; a test compares the stored ciphertext before and after and requires
  it to be identical.
- Revocation keeps the record and stops future reveals. It does not delete anything, and the UI says
  plainly that a package already handed out is unaffected.
- `sharePackage()` seals the secret plus its policy into a KNP2 (Argon2id + AES-256-GCM) envelope via
  the existing `PassphraseEnvelope`, with a fixed context `knoux.capsule.share.v1`. The plaintext
  manifest is zeroed in a `finally`. `readPackage()` refuses to return the secret once the carried
  expiry has passed, and a wrong passphrase or a one-bit tamper both fail to `UNREADABLE` rather than
  yielding partial content.
- Bounds are validated before any write: label ≤ 120, secret ≤ 8 KiB, TTL 60 s … 30 d, opens 1 … 100.
  A test drives all seven invalid combinations and then asserts the record count is still 1, proving
  rejection happened before persistence.
- A locked session fails closed on create, reveal, revoke **and** share, each surfacing
  `VaultLockedException` rather than a generic error.

## Honest limits, in the product rather than only in this file

The brief's threat model says an offline copied ciphertext cannot be revoked and remote deletion
must never be claimed. That is implemented, not just documented:

- The screen carries a permanent warning card: expiry cannot revoke screenshots or copies already
  made, local expiry and open counts are enforced against **this device's clock and this device's
  record**, and a recipient who sets their clock back can reopen a copy they hold.
- The reference's "Time measured by supported service" is replaced with "Measured against this
  device's clock", because there is no service.
- The reference's "Recipient protection → Not configured" and "Delivery method → Choose recipient"
  imply a recipient directory and a verification service. Neither exists and none is built: the rows
  state that there is no recipient directory or verification service, and the real mechanism is a
  passphrase-sealed KNP2 package the user carries themselves.
- The reference's "No share link yet / Requires configured encryption and recipient verification"
  becomes "No package written yet" plus "This app does not host links, run a server, or verify
  recipients."
- Sharing an already-expired or revoked capsule is refused **before any bytes are produced**, and the
  share dialog repeats the irreversibility warning before the user picks a destination.
- The revealed secret is held in memory on one screen. It is not written to disk, not copied to the
  clipboard, not logged, and the row states that.

## Audit integration

Six typed actions added to the existing catalog: `CAPSULE_CREATED`, `CAPSULE_REVEALED`,
`CAPSULE_REFUSED` (ALERT), `CAPSULE_REVOKED`, `CAPSULE_DELETED`, `CAPSULE_SHARED`. Details carry
counts and reason codes only — `ttlMillis=…`, `maxOpens=…`, `opensUsed=2 of 2`, `reason=EXPIRED`.

`SecretRepository.auditable()` now also suppresses the generic `DATA_WRITTEN` / `DATA_DELETED` lines
for the `capsule` kind, because capsules have their own events. Without that, every reveal would
write two timeline rows and a burst of opens could evict real alerts from the bounded 500-row window.
A test asserts exactly one `CAPSULE_CREATED`, one `CAPSULE_REVEALED` and **zero** generic `DATA_*`
rows.

## Real UI behaviour

`app/src/main/kotlin/com/knoux/crypt/ui/SecretCapsuleScreen.kt` reproduces the reference order: back
header, `SHARE / EXPIRY` eyebrow, title and subtitle, hero band with the "Expire by policy" pill, the
SECRET CAPSULE card with its status pill, the Access policy card with four rows, the Secret delivery
card, the primary "Configure secret capsule" CTA, and the limitation warning.

- Locked vault shows an explicit authenticate card instead of an empty list; the catalog also gates
  the destination with `requiresUnlock = true`, so both layers are honest.
- The list shows derived state per capsule (Active / Expired / Opens used / Revoked / Unreadable)
  with the real expiry timestamp and the real remaining-open count.
- Reveal, Seal package and Revoke are enabled **only** when the state is ACTIVE, so a spent or
  expired capsule has no live path to its secret. Delete stays available because removing a record is
  always legitimate.
- Reveal, revoke and delete each require a confirmation or produce an explicit notice; nothing is
  silently destructive.
- Creating a capsule collects label, secret (password-masked field), TTL and open limit from the
  **real** `CapsulePolicy` choice lists, not free text.
- Sharing writes only to a destination chosen through `ActivityResultContracts.CreateDocument`, after
  a passphrase and an explicit irreversibility warning.
- Bilingual AR/EN; ViewModel messages use `BilingualText` because `tr()` is a composable function.

## New verification tool: `scripts/check-dex-arabic.py`

The earlier Arabic checks proved the **source** was intact. That was not enough: the TASK 39 incident
shipped as valid UTF-8 with `????` where Arabic belonged, so corruption can equally be introduced by
compilation or packaging. This script opens the built APK, concatenates every `classes*.dex`, and
confirms that each maximal Arabic word-run from the Kotlin sources is present in those bytes.

It checks runs rather than whole literals on purpose: a literal with an interpolation is compiled
into runtime concatenation, so the full string never exists as one contiguous byte sequence, and
splitting on interpolations breaks on nested braces and escape sequences. A word-run is stable under
both and is exactly the unit corruption destroys. Its limitation is stated in the file: it proves the
text survived to the artifact, not that it renders well — that needs a device.

Result on this build: **5,119 Arabic runs across 117 source files, 0 missing.**

The same check now runs in CI as the "Packaged Arabic check" step after `:app:assembleDebug`, and the
exact heredoc invocation was executed locally first so a broken step would not be discovered in CI.

## Commands, results and exit codes

All from `native-android/` on Windows, `--no-daemon`.

| # | COMMAND | EXIT | RESULT | TEST_COUNT | LOG_OR_ARTIFACT |
|---|---|---|---|---|---|
| 1 | `./gradlew.bat :core:data:compileDebugKotlin` | 0 | PASS | n/a | gradle console |
| 2 | `./gradlew.bat :core:data:testDebugUnitTest --tests "com.knoux.crypt.data.SecretCapsuleServiceTest"` | 0 | PASS | 14/14, 0 fail, 3.251 s | `core/data/build/test-results/testDebugUnitTest/TEST-…SecretCapsuleServiceTest.xml` |
| 3 | `./gradlew.bat :core:security:test` | 0 | PASS (after env retries) | 161 tests, 0 failures | `core/security/build/test-results/` |
| 4 | `./gradlew.bat :core:data:testDebugUnitTest` | 0 | PASS | 206 tests, 0 failures, 23 classes | `core/data/build/test-results/testDebugUnitTest/` |
| 5 | `./gradlew.bat :app:testDebugUnitTest` | 0 | PASS | 18 tests, 0 failures, 6 classes | `app/build/test-results/testDebugUnitTest/` |
| 6 | `./gradlew.bat :core:data:compileDebugAndroidTestKotlin` | 0 | PASS (compile only) | n/a | gradle console |
| 7 | `./gradlew.bat :app:lintDebug` | 0 | PASS (after env retries) | 0 errors | `app/build/reports/lint-results-debug.html` |
| 8 | `./gradlew.bat :app:assembleDebug` | 0 | PASS | n/a | `app/build/outputs/apk/debug/app-debug.apk` |
| 9 | `python scripts/check-source.py` | 0 | PASS | 180 Kotlin files | stdout |
| 10 | `python scripts/check-dex-arabic.py <117 sources>` | 0 | PASS | 5,119 Arabic runs, 0 missing | stdout |
| 11 | `aapt2 dump permissions app-debug.apk` (build-tools 36.0.0) | 0 | PASS | 3 permissions | CAMERA, USE_BIOMETRIC, USE_FINGERPRINT only |

Several Gradle invocations first failed with `java.net.BindException` while Gradle created its
`FileLockContentionHandler`. That is a Windows loopback-port conflict on this host, not a build
result; they were retried after a delay and the retry count is recorded rather than hidden. A wrapper
was added that distinguishes that environmental failure from a real compile error, because the first
time it happened I briefly mistook it for one.

## Targeted test coverage (`SecretCapsuleServiceTest`, 14 JVM cases)

1. `createValidatesEveryBoundBeforeWritingAnything` — seven invalid combinations all raise
   `IllegalArgumentException`, and the record count proves nothing was persisted.
2. `revealReturnsTheSecretAndConsumesExactlyOneOpen` — two reveals on `maxOpens = 2`, then SPENT.
3. `expiryIsMeasuredAgainstTheStatedClockAndRefusalCostsNoOpen` — ACTIVE mid-TTL, EXPIRED past it,
   and `opensUsed` still 0 after the refusal.
4. `revokedCapsuleNeverRevealsAgainButItsRecordSurvives` — REVOKED refusal, record still present.
5. `twoRacingRevealsCannotBothSpendTheLastAllowance` — concurrent reveals against one allowance;
   exactly one succeeds, stored count is 1, loser gets SPENT or CONCURRENT_UPDATE.
6. `sharedPackageRoundTripsAndAnyTamperingFailsAuthentication` — KNP2 round trip, wrong passphrase
   and a flipped tag byte both yield UNREADABLE.
7. `readerHonoursTheExpiryCarriedInsideThePackage` — same package returns the secret before expiry
   and an empty secret after.
8. `sharingAnExpiredOrRevokedCapsuleIsRefusedBeforeAnyBytesAreProduced`.
9. `stateIsDerivedFromTheClockAndNeverStored` — ciphertext byte-identical across the clock change.
10. `deleteRemovesTheRecordAndALaterRevealReportsNotFound`.
11. `auditNeverCarriesTheLabelOrTheSecret` — after create/reveal/share/refuse/revoke/delete, no
    detail contains the label, the secret, the record id or a path separator.
12. `capsuleWritesUseTheirOwnEventsAndDoNotDoubleLogTheTimeline`.
13. `lockedSessionCannotCreateRevealOrRevoke` — all four operations fail closed.
14. `policyChoicesAreTheOnesTheUiOffers` — the UI chips are the same values the service accepts.

## Remaining production blockers

1. **BLOCKED_DEVICE** — `adb devices` is empty and `D:\Android\sdk` has no `emulator` package and no
   `system-images`. Owner action: install `emulator` plus
   `system-images;android-36;google_apis;x86_64`, or attach a device on an isolated test profile.
   Until then unverified at runtime: the SAF document picker round trip, `PdfRenderer`-style
   platform behaviour does not apply here but the DataStore/Room write path across process death,
   the real `System.currentTimeMillis()` clock behaviour across time-zone and user clock changes, and
   the whole visual comparison against the canonical reference. `VISUAL_VERIFIED` stays NO.
2. **No remote expiry enforcement, by design.** The brief allows an optional backend only with an
   explicit architecture; none exists, so none was invented. A shared package's policy is advisory to
   the recipient, and the UI says so rather than implying control.
3. **Open-count on a shared copy is unenforceable.** The count lives in the sender's record. A
   recipient holding a decrypted copy can reopen it until the carried expiry passes on their clock.
   Stated on the share dialog, the limitation card and in this file.
4. **Clock trust.** Local expiry depends on the device clock. A user who rolls their clock back can
   reopen a local capsule that has only expired by time (not by count) — the open limit and
   revocation remain effective. Not claimed to be tamper-proof.
5. `SECURITY_REVIEWED` — not independently performed.

## Definition-of-done position

UI + ViewModel + domain rules + vetted core services (existing KNC2 record store, existing KNP2
passphrase envelope) + encrypted local persistence + typed audit + observable real outcome all exist,
and the policy engine is proven by 14 JVM tests including a genuine concurrency test. Runtime
behaviour on a device is unverified. TASK 41 is therefore recorded as
**SOURCE_IMPLEMENTED / JVM_TESTED / BLOCKED_DEVICE**, not as VERIFIED or COMPLETE.
