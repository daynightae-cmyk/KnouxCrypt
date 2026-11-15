# EVIDENCE — TASK 43 — File Integrity Tool

Date: 2026-10-31 (Asia/Dubai)
Branch: `android/native-implementation-20261031`
Baseline SHA: `ca7a1bce8ec6108318f6d60907218777d236ca56`
Implementation SHA: `1d26033d1cc89b4d0d68e1bb6da4ff6b1a8c5a90`

Classification: **DOMAIN_IMPLEMENTED + INTEGRATED + TESTED_LOCAL (hash) + BUILD_VERIFIED**.
**DEVICE_UNVERIFIED** for SAF, cancellation under real providers and large-file behavior.
**AUDIT_PENDING**; no independent review.

## What really works

- The existing Hash & Integrity screen was reused rather than duplicated. A dedicated
  `FILE_INTEGRITY` route (`file_integrity`) opens the same tool with a file-integrity title;
  `hash` remains for the catalog's Hash service. 34 Tools destinations remain, now
  **12 implemented / 22 design-only**.
- Streaming SHA-256 through `ContentResolver.openInputStream` and `Hashing.sha256`, with
  SAF display name/size query, progress, declared-size mismatch rejection, corrupt-URI
  errors, and a real **Cancel hashing** action that discards the digest/partial progress.
- Expected checksum validation: exactly 64 hexadecimal characters, case-normalized;
  invalid input is rejected visibly. Match/mismatch is explicit and uses the trusted
  reference supplied by the user.
- Verification evidence: a match/mismatch report records file name, optional byte size,
  digest, expected value, result and timestamp in an **in-memory, last-five list**; each
  report can be copied. A clear-evidence action exists. Reports are never persisted.
- Truthful caveat: a digest match proves equality to the supplied reference, not the
  authenticity/safety of the source; hashing proves integrity, not confidentiality.
- SHA-256 and SHA-512 streaming share the already-tested `Hashing` helper; no new crypto
  primitive was added. Existing catalog search/groups and visual identity are preserved.

## Verification actually executed (Windows, this session)

Host memory limits required split fresh Gradle invocations with `-Xmx1024m` (a combined
1.5 GiB run had crashed the JVM during an earlier increment; not a test failure).

| Check | Command | Result |
|---|---|---|
| Security + hash tests | `./gradlew :core:security:test --rerun-tasks --console=plain --no-daemon -Dorg.gradle.jvmargs=-Xmx1024m...` | **PASS, exit 0** — 49 tests; `HashingTest` 3 |
| Data tests | `./gradlew :core:data:testDebugUnitTest --rerun-tasks ...` | **PASS** — 61 |
| App tests | `./gradlew :app:testDebugUnitTest --rerun-tasks ...` | **PASS** — 4 |
| Aggregate JVM | result XML count | **114 tests, 0 skipped, 0 failures, 0 errors** |
| Lint | `./gradlew :core:data:lintDebug :app:lintDebug --no-daemon` | **PASS, exit 0** — 0 errors (10 app/8 core warnings) |
| androidTest compile | `./gradlew :app:compileDebugAndroidTestKotlin :core:data:compileDebugAndroidTestKotlin --no-daemon` | **PASS (compiled, NOT RUN)** |
| Debug APK | `./gradlew :app:assembleDebug --no-daemon` | **PASS, exit 0** — 17,651,518 bytes |
| APK SHA-256 | `sha256sum` | `e69ba386821674804842e21e4f12a6e67906a6636e888f6679d70686b5baf815` |
| Device | `D:/Android/sdk/platform-tools/adb.exe devices`; Hypervisor | Empty; `HypervisorPresent=False` |

New JVM tests: known SHA-256/SHA-512 vectors, streaming progress/size mismatch, constant-time
equality. UI/SAF behavior is compiled only.

## Honest limitations / remaining risks

- **DEVICE_UNVERIFIED**: SAF pickers, content-provider metadata quirks, cancellation under a
  real provider, rotation/process death, 4 GB+ files, and screen/layout parity were not run.
  No canonical TASK 43 screenshot was used for pixel comparison.
- The screen has no explicit hashing timeout; WorkManager/background hashing is not used.
  Very large files are streamed but not soak-tested. Hashing reads the selected file once;
  it does not upload or encrypt it.
- Verification history is in-memory and disappears on screen/process destruction. It is
  evidence for the user, not an audited log.
- The digest/report copy uses the normal clipboard, not the managed sensitive-copy path;
  filenames/digests may be sensitive in context.
- No independent audit; no CVE/dependency scan.

## Next safe action

Run the device checklist (normal/wrong checksum, corrupt URI, cancel mid-hash, 4 GB stream,
rotation/process death, EN/AR and large text) and capture screenshots; then proceed to
TASK 44. Do not mark DEVICE_VERIFIED or COMPLETE before those checks.
