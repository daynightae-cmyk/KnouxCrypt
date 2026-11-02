# Ciphertext-at-rest sweep across every secret kind — 2026-11-02

Cross-cutting regression guard, not a mission. Added on
`test/android-ciphertext-at-rest-20261102` (`78bf91e`) from base `main` `9131ea8`, and merged to
`main` as `bc1e517` via PR #45. Android CI green on the PR head (run 41497811713, 17/17 steps) and
on merged main (run 41499350324, 17/17 steps), each verified through `gh run view --json` rather than
inferred from a watcher exit code.

## Why

The existing boundary tests (`SecurityBoundaryTest`, 26 cases) cover the session
capability, the biometric gate, rotation atomicity and a couple of record kinds.
Nothing swept the one property that matters most for at-rest confidentiality across
**all** record kinds: no plaintext, in any encoding, ever reaches the stored bytes.

That gap became live this session. `SecretKinds.CAPSULE` was added for TASK 41, and
if a kind can be added without the invariant being checked against it, coverage
shrinks silently and nobody notices.

## What was added

1. `SecretKinds.ALL` — one enumerable list of every kind the store may hold.
2. `CiphertextAtRestInvariantTest` — 6 JVM cases, swept over all 15 kinds:
   - `theDeclaredKindListIsTheSweepList` — reads `Secrets.kt` and fails if a
     `const val` exists that `SecretKinds.ALL` does not cover.
   - `noKindEverPersistsPlaintext` — a unique per-kind marker must not appear in the
     stored envelope as raw bytes, as ISO-8859-1, or as UTF-8.
   - `everyKindStillRoundTripsSoTheSweepIsNotVacuous` — each kind must decrypt back
     to its own payload, so the sweep cannot pass by writing unreadable data.
   - `aadRejectsIdentityAndKindSubstitutionForEveryKind` — the same ciphertext
     presented under another record id, or under another kind, fails authentication;
     the untouched original is then re-read to prove those were binding checks and not
     a broken harness.
   - `flippingAnyEnvelopeByteFailsAuthenticationForEveryKind` — a one-bit flip in the
     final tag byte yields no content for every kind.
   - `auditDetailsNeverCarryAStoredMarkerForAnyAuditableKind` — no marker reaches an
     audit detail, and the generic `DATA_WRITTEN` count proves exactly which kinds are
     suppressed by design (`note_draft`, `media`, `capsule`) rather than by accident.

## Positive controls, because a passing sweep proves nothing on its own

Both controls were run, observed to fail, and reverted; the tree was verified back to
its intended state afterwards.

| Control | Injection | Observed result |
|---|---|---|
| Coverage guard | Added `const val CONTROL_PROBE_KIND = "control-probe"` to `SecretKinds` without extending `ALL` | `theDeclaredKindListIsTheSweepList` **FAILED** with `SecretKinds declares a kind that SecretKinds.ALL does not cover, so the ciphertext-at-rest sweep silently lost coverage: control-probe` |
| Leak detection | Temporarily made the test DAO's `upsert` append plaintext bytes to the stored envelope | `noKindEverPersistsPlaintext` **FAILED** (as did the round-trip and AAD cases, since the appended bytes also broke decryption) |

The second control matters more than it looks: without it, `noKindEverPersistsPlaintext`
could have been passing because its byte-window comparison was wrong, not because the
store is clean.

## Verification

| COMMAND | EXIT | RESULT | TEST_COUNT |
|---|---|---|---|
| `./gradlew.bat :core:data:testDebugUnitTest --tests "com.knoux.crypt.data.CiphertextAtRestInvariantTest"` | 0 | PASS | 6/6, 0.337 s |
| same, with the coverage control injected | 1 | FAILED as intended | 1 failure |
| same, with the leak control injected | 1 | FAILED as intended | 3 failures |
| `./gradlew.bat :core:data:testDebugUnitTest` (after revert) | 0 | PASS | 212 tests, 0 failures, 24 classes |
| `./gradlew.bat :app:testDebugUnitTest` | 0 | PASS | 18 tests, 0 failures |
| `./gradlew.bat :core:security:test` | 0 | PASS | 161 tests, 0 failures |

Total JVM suite: **391 tests, 0 failures.**

## Limits

This is a JVM-level invariant over the real codecs and the real repository, against an
in-memory DAO standing in for Room. It does not prove that the on-device Room database
file contains no plaintext written by another code path, and it is not a substitute for
`:core:data:connectedDebugAndroidTest`, which still cannot run on this host.
