# EVIDENCE — TASK 09 — Password Detail

Date: 2026-11-01 (Asia/Dubai)
Branch: `android/native-implementation-20261031`
Baseline: `d1aaeb2` (branch fast-forwarded onto `main` after integrating Desktop PR #24 — zero overlap with `native-android/`)
Previous verified device baseline: `337feb9`
Implementation SHA: this file is committed with the code in `feat(password-detail): …`

Classification: **SOURCE_IMPLEMENTED + JVM_TESTED + BUILD_VERIFIED + PARTIALLY DEVICE_VERIFIED**.
The screen itself is **DEVICE_UNVERIFIED**. **AUDIT_PENDING**. Not release-ready.

## What really works

- New route `password_detail/{recordId}` (Navigation Compose, `NavType.StringType`). The only
  navigation argument is the record UUID — no plaintext, no deep link that could carry a secret,
  and the route renders `LockedScreen` before any repository call when there is no live capability.
- `CredentialDetailViewModel` loads one record through `SecretRepository.find`, which revalidates
  the session capability before and after decrypt. States are distinct and real:
  `LOADING / READY / MISSING / UNREADABLE / LOCKED`. A `VaultLockedException` during load shows the
  locked state with an Unlock action; an undecryptable row shows an unreadable card and never
  placeholder data.
- Secret is masked by default. Reveal requires `CredentialRevealPolicy`: the session must be
  authenticated within the last 60 s (`SessionManager.sessionAgeMillis`, new in this change) and the
  value hides itself again after 15 s through a ticking `LaunchedEffect`. A stale session produces a
  specific localized message, not a silent denial.
- Copy of the secret, the user name and the origin all go through the existing managed clipboard
  lease (`ClipboardPrivacy.copySensitive`), so the Privacy Center timeout and lock-clearing apply;
  the screen states that Android may retain clipboard data after process death.
- Editing is validated before it can persist: the origin must be a plain `http`/`https` host, and
  URLs that embed a user name or password are rejected outright because they would stash a second
  secret in a plain field. Title must be non-blank. Save writes through `SecretRepository.save`,
  which runs inside the revocation mutation gate, so a lock cannot leave a half-written record.
- Cancel restores the stored values into the edit buffer; nothing is written.
- History: `PasswordPayload` gained an optional `revisions` list (kotlinx default, so every legacy
  row still decodes — asserted in tests). Each entry stores timestamp, strength level and the names
  of the changed fields only. **Previous plaintext values are never stored**, and the UI says so
  instead of pretending a past password could be recovered. The list is bounded to 20, newest first.
- Access log ("this session") keeps reveal/copy/save events in memory only, is cleared when the
  vault locks, and is never persisted.
- Local generator panel matches the reference controls (length slider 8–64 plus UPPER / lower /
  digits / symbols in that order) and is backed by real code: `PasswordGenerator` in
  `:core:security` draws uniformly from the selected classes with bounded rejection, guarantees one
  character per selected class, refuses an empty selection instead of silently substituting, and
  clamps length to the documented range. No hardware RNG claim.
- The Passwords list now opens this screen (card and "Open"); the old inline edit dialog was removed
  rather than kept as a second editing UI. Creation still uses the list dialog.
- Bilingual, RTL-safe, keyboard-aware (`imePadding`, `KeyboardType.Uri` for the origin), and built
  from the existing design system. No new dependency, no new database, no new crypto engine.
- Related defect fixed in the same phase (`f20937b`): every secure-access and rotation failure is
  now a typed `AccessError` category with Arabic and English text, keeping the raw platform/domain
  text as detail. `SessionManager` also caches the master-key protection class and throttles the
  probe while unprovisioned, which stops recomposition-driven Keystore binder traffic.

## Verification actually executed (Windows host + itel S686LN)

| Check | Command | Result |
|---|---|---|
| Localization fix gate | `:app:testDebugUnitTest :core:data:testDebugUnitTest` | PASS, exit 0 — 162 tests at that point, 0 failures |
| JVM suite (final) | `./gradlew :core:security:test :core:data:testDebugUnitTest :app:testDebugUnitTest --no-daemon -Dorg.gradle.jvmargs=-Xmx1280m` | PASS, exit 0 — **179 tests, 0 failures** (security 77, data 85, app 17) |
| New tests | `PasswordGeneratorTest` 7, `PasswordCredentialTest` 10, `AccessErrorTest` 6 | all PASS |
| Instrumented compile | `:core:data:compileDebugAndroidTestKotlin :app:compileDebugAndroidTestKotlin` | PASS |
| Instrumented run on hardware | `./gradlew :core:data:connectedDebugAndroidTest` | PASS, exit 0 — **10 tests, 0 failures** on `itel S686LN - 15` |
| Lint | `:app:lintDebug :core:data:lintDebug` | PASS, exit 0 — 0 errors |
| Debug APK (authoritative) | `./gradlew :app:clean :app:assembleDebug` | PASS, exit 0 — **17,273,312 bytes** |
| APK SHA-256 | `sha256sum` | `9d0eeb9eea62d5f3e8c624acdfc5e4e1b8871ef23a9fc0aba4d3c43b6215f242` |
| Install + cold start | `:app:installDebug`, `monkey -p com.knoux.crypt.debug …` | PASS — "Installed on 1 device", process alive, no entries in the crash buffer |
| Device | `adb devices` | itel S686LN, Android 15 / API 35 |

What the device run proved for this task (`instrumented-core-data-task09.xml`):
`PasswordDetailRoomTest.detailRoundTripKeepsHistoryAndNeverStoresPlaintext`,
`PasswordDetailRoomTest.lockedExistingVaultRefusesANewEnrollmentGate` and
`PasswordDetailRoomTest.generatorOutputIsStorableAndScoresStrong` all PASS against a real Room
database, alongside the previously recorded Keystore, KDK1, KNF2, Room-migration and TASK 36 audit
tests. The stored envelope bytes were asserted not to contain either test password or the user name.
The re-enrollment test first **failed** with `UnlockReenrollmentBlockedException` on hardware — the
app's own P0 rule rejecting a new gate against an existing vault — so the test was corrected to
assert that rule instead of working around it.

## Honest limitations

- The Compose screen itself has not been rendered on the device: reaching it needs an authenticated
  session, i.e. the owner's fingerprint. Layout, RTL wrapping, TalkBack, keyboard behaviour, the
  reveal countdown and the 60 s window are **DEVICE_UNVERIFIED**, and no canonical screenshot
  comparison exists yet (capture is blocked by the default `FLAG_SECURE` policy, which must not be
  disabled without the owner's approval).
- History is metadata only and starts from the first save made by this screen; records created
  before TASK 09 have no revisions, which the UI shows as an absent history rather than a claim.
- No old version of a secret can be restored — by design, and stated in the UI.
- The session-freshness reveal window is an application policy enforced by the capability's mint
  time. It is not a platform per-use authorization: the master data key remains session-gated, not
  biometric-bound per use, exactly as documented elsewhere.
- The generator uses `java.security.SecureRandom`; no hardware RNG or StrongBox claim is made, and
  the value is only as strong as the classes the user selects.
- Deleting a record is not provable physical erasure; the confirmation dialog says so.
- No independent audit, no fuzzing, no CVE scan, no signing, no Play upload.

## Next safe action

With the owner present: unlock once, open a credential, and verify reveal/auto-hide, the 60 s
window, copy under the managed lease (then lock → clipboard clears), edit with an invalid origin,
cancel without loss, history rendering, generator use, RTL at 360 dp and 200 % font, and TalkBack
reading of the masked field. Capture screenshots only with the owner's explicit, temporary approval
to disable capture blocking, and restore it immediately. Then continue with the next unblocked
mission (TASK 11 Auth import is dependency-ready after TASK 10).
