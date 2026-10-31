# EVIDENCE — TASK 36 — Password Strength Audit

Date: 2026-11-01 (Asia/Dubai)
Branch: `android/native-implementation-20261031`
Baseline: `607e9c3` (branch fast-forwarded to `main` first, so this work builds on the consolidated Desktop + Android history)
Implementation SHA: `6db826329ba2131196d3b232b350ff19f9350258`

Classification: **SOURCE_IMPLEMENTED + JVM_TESTED + BUILD_VERIFIED**.
**DEVICE_UNVERIFIED** for UI, Room and lifecycle behaviour. **AUDIT_PENDING**. Not release-ready.

## What really works

- New `PasswordStrength` model (`core:security`, model v1) — a pure, offline, deterministic
  evaluator: observed character-class pool (26/26/10/32 + 1 space + bounded 64 for non-ASCII),
  raw entropy `length · log2(pool)`, documented multiplicative penalties (repeated run 0.55,
  sequential run 0.70, keyboard row 0.60, year-like 0.85, repeated unit 0.50, known weak word
  0.10, wrapped weak word 0.30) and threshold bands 28/40/56/72 bits capped by structure
  (≤4 chars → VERY_WEAK, ≤7 → WEAK, known weak word → VERY_WEAK).
  `StrengthMetric` exposes pool, raw and effective bits, level, score and the flag set, so the
  UI can explain every judgement instead of showing a bare colour bar.
- New `PasswordAuditService` (`core:data`) scans the live vault through the existing authorized
  repository path: `session.requireValid` before the id list, before every record, and again
  before the report is returned; `ensureActive()` plus `yield()` per record keeps it cancellable.
  Notes and TOTP rows are skipped by kind, so a note title can never be scored as a secret.
- Reuse detection groups by a transient SHA-256 digest over
  `"knoux.password-audit.v1:" + value`; the digest map is cleared before returning and is never
  written to Room, DataStore, logs or the report. The report carries record ids, decrypted
  titles, levels, flags, ages — never the secret value.
- Findings cover weak/below-threshold, reused, blank, stale (>365 days by default) and
  unreadable rows; the list is capped (50 by default) with `findingsTruncated` set when cut.
- Honest failure semantics: `AuditOutcome.COMPLETED_WITH_GAPS` whenever a row cannot be
  decrypted or parsed, `isClean` false in that case and whenever anything needs attention. A
  lock or cancellation during the scan throws and publishes **no report at all**, so a partial
  scan can never read as "all clear".
- Real Compose screen `PasswordAuditScreen` (route `password_audit`, catalog `PASSWORD_AUDIT`
  implemented, unlock-required): idle / running / completed / completed-with-gaps /
  stopped-locked / cancelled / failed states, per-record progress, cancel, coverage card,
  level distribution, reuse clusters, findings with reason labels, stale explanation,
  re-run and a link into Passwords. EN/AR strings, existing KNOUX glass components, RTL-safe
  wrapping, no new dependency. The ViewModel drops the report (which holds decrypted titles)
  as soon as `session.unlocked` goes false.
- Passwords screen gained an `Audit stored passwords` link, and two stale claims were corrected:
  the record-envelope note now states KNC2 with readable legacy KNC1 rows, and the Key Forge /
  Key Derivation clipboard notes now describe the implemented managed clearing instead of
  "not auto-cleared yet".

## Verification actually executed (Windows, this session)

| Check | Command | Result |
|---|---|---|
| Pre-change baseline | `:core:security:test :core:data:testDebugUnitTest` | PASS, exit 0 — 132 aggregate tests, 0 failures |
| Security tests | `./gradlew :core:security:test :core:data:testDebugUnitTest :app:testDebugUnitTest --rerun-tasks --no-daemon -Dorg.gradle.jvmargs=-Xmx1024m` | PASS, exit 0 — **70 tests** (was 58; `PasswordStrengthTest` 12) |
| Data tests | same invocation | PASS, exit 0 — **75 tests** (was 63; `PasswordAuditTest` 12) |
| App tests | same invocation | PASS, exit 0 — **11 tests** |
| Aggregate JVM | result XML count | **156 tests, 0 skipped, 0 failures, 0 errors** |
| Lint | `:app:lintDebug :core:data:lintDebug` | PASS, exit 0 — **0 errors**, 12 app + 10 core:data warnings (unchanged from baseline) |
| androidTest compile | `:app:compileDebugAndroidTestKotlin :core:data:compileDebugAndroidTestKotlin` | PASS (**compiled, NOT RUN**); adds `PasswordAuditRoomTest` |
| Debug APK | `:app:assembleDebug --no-daemon` | PASS, exit 0 — **17,759,009 bytes** |
| APK SHA-256 | `sha256sum` | `49182316b7703db2ff19b47873b8b36fa78a6b2140ac048ecd04ff9b71a68fb3` |
| Device | `adb devices` | **No device attached** → nothing installed or launched |

New test coverage: 12 strength known-answer vectors (blank, common word, wrapped common word,
keyboard row, repeated run, year-like, sequential, repeated unit, FAIR/EXCELLENT entropy
values, caps, monotonicity, pool sizes, non-ASCII bound, pattern-scan bound, no-secret-in-metric,
determinism) and 12 audit tests (weak/reused/blank classification, clean vault, unreadable gaps
and coverage fraction, rows vanishing mid-scan, no secret material anywhere in the report
including a 64-hex digest scan, staleness with an injected clock, finding cap + truncation,
200-record progress coverage, lock-during-scan publishes nothing, cancellation publishes nothing,
stale capability refused before any read, and other secret kinds never scored).

## Honest limitations

- Strength is a heuristic, not a breach check. `COMMON_WORDS` is 48 published weak secrets;
  there is no leak-corpus coverage and no network access (`INTERNET` permission is absent), so
  a credential exposed elsewhere is invisible here. A high score never means an account is safe.
- Entropy is computed from observed classes only: single-class dictionary text (including
  non-ASCII) is over-scored, which the UI states rather than hides. The periodicity scan is
  bounded to 256 characters by design.
- The audit covers only records stored in this vault. Files, notes, TOTP seeds and anything
  outside the vault are out of scope, and rows that cannot be decrypted reduce coverage
  instead of being silently skipped.
- Age-based staleness is a prompt, not a verdict; `updatedAt` is the record write time, not the
  date the credential was issued.
- Findings are capped at 50, so long lists are truncated (flagged in the report and UI).
- Compose rendering, RTL, TalkBack, large-font layout, screen-off lock during a scan, real Room
  query timing, screenshot/recents leakage and 1,000-record performance are
  **DEVICE_UNVERIFIED**; `PasswordAuditRoomTest` compiled but was never executed.
- No independent security review, no fuzzing, no dependency CVE scan, no signing, no Play
  upload, no release claim.

## Next safe action

Run section 10 of `DEVICE_VERIFICATION_CHECKLIST.md` on a real device (mixed vault with weak,
reused, blank, strong and one corrupted row; lock and cancel mid-scan; 360 dp + 200 % font in
AR and EN; logcat and screenshot inspection). Then continue with the dependency-ready
design-only slices; `09_PASSWORD_DETAIL` is now unblocked by this task. Do not mark
`DEVICE_VERIFIED`, `SECURITY_REVIEWED` or `RELEASE_READY` from this evidence.
