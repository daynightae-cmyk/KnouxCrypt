# TASK 00 — initial native source slice (2026-10-30)

## Baseline / branch / preservation
Remote branch `integration/knoux-crypt-android-ready-20261030` confirmed at `3d986c8a9625e3e4c8fdf57c1a90c5ebd39983e0`. Separate Linux clone of that exact branch, NOT an assertion of access to `D:\KnouxCrypt-Android-Ready`. Original Windows project untouched.
Git status clean before work; current branches/worktree/stash/reflog checked. PR #4 still open, older docs preserved. Remote main/source was previously reconciled at handoff visual SHA dc22d15; live main must be reread before merge, no auto merge authorized. No React source/reference/package-lock changed. Existing 46-task pack retained, not duplicated.

## Status grammar
- Native foundation source: **IMPLEMENTED_UNVERIFIED / PRESENT_UNMERGED**, partial TASK 00.
- React checks: **TESTED (source/SSR/audio mock/build only)** in this Linux turn.
- Kotlin compilation, JVM crypto tests, Android lint/assemble/device: **NOT TESTED here**.
- Native APK installed / screenshot / biometric / security audit / recovery: **NOT VERIFIED**.
- Tasks 01–44 native feature ports: **PLANNED**, not completed by diagnostic entry.

## Applied code
- `native-android/`: isolated Gradle Kotlin DSL root, :app and :core:security; no WebView/React embedding.
- `MainActivity.kt`, `FoundationViewModel.kt`: Compose/Navigation, lifecycle-aware StateFlow, constructor DI, debug-only visual entry, closed secret access, background lock, RTL/native Arabic strings/safe insets. Diagnostic UI only, NOT final Splash/Auth/Home designs.
- `SessionPolicy.kt`: preview not authorization; release guest denied; secret access intentionally always false until cryptographic authentication/capability exists.
- `AuthenticatedEnvelope.kt`: JCA AES-256-GCM small-record framing, fresh random nonce, authenticated version/algorithm/length and required context, strict bounds/no trailing data. No unauthenticated plaintext returned; no fallback to legacy primitives. Not streaming/recovery/replay prevention.
- `DeviceWrappingKey.kt`: auth-required Android Keystore wrapping-cipher boundary; not yet used by a vault. No invalidation recovery/delete fallback or hardware claim. BiometricPrompt crypto authorization still pending.
- JVM/instrumentation test sources: negative envelope/session cases, known-answer provider vector and debug navigation. Written, not executed in sandbox.
- Read-only prerequisite and static boundary scripts. Native CI template at `native-android/ci/native-foundation.yml.example` describes JVM/build/lint with read-only token; no secrets/signing/release. Not installed or executed. No device job yet.

## Actual commands/results in this turn
Environment Linux, 64GiB disk (~58GiB free at initial audit); no JDK/Gradle/SDK/adb/kotlinc. No destructive cleanup or huge SDK/emulator download.
- `npm ci --ignore-scripts --no-audit --no-fund` from approved lock: exit 0 (Electron binary intentionally not downloaded; deprecation warnings retained).
- `npm run check`: exit **0**. Exact output in `evidence/react-check.txt`: 44 AR/EN components, 45 patterns, 166 links, eight Home cards, audio mocks and Vite build. Not native security evidence.
- `python3 native-android/scripts/check-source.py`: exit **0**, exact `evidence/source-check.txt`. XML/resource/source invariants only, NOT compiler/unit/security tests.
- `sh native-android/scripts/check-prerequisites.sh`: exit **1**, `evidence/prerequisites.txt` names missing tools.
- `gradle --no-daemon -p native-android :core:security:test :app:assembleDebug`: exit **127**, `evidence/native-build-attempt.txt`: gradle not found. No APK generated.
- `mise install java@temurin-17`: blocked by DNS/network. Oracle JDK and Gradle distribution HEAD requests also failed DNS; Android commandline-tools URL reachable but not installed without JVM. Additional Vercel scopes do not fix this network/toolchain limitation.
- `git diff --check`: exit 0 before commit.

## Native tests written — no PASS claim
JUnit: session locked/guest/release denial; 0/1/15/16/17/4096/1MiB envelope boundaries; nonce variation; every-byte tampering; wrong key/AAD; all truncation lengths/trailing bytes; oversize/key size/context rejection; NIST zero AES-256-GCM known-answer provider vector. Needs Gradle execution and independent vector provenance/review.
Instrumentation: diagnostic entry -> access -> explicitly debug guest -> Back. Needs actual Android API/device evidence; no emulator/screenshots produced. Device Keystore/BiometricPrompt tests not yet implemented.

## TASK 00 acceptance not met / next safe action
On hosted CI or owner machine with JDK17, Gradle8.11.1 and API36: run tests/compile/lint, fix real failures, generate official checksummed wrapper, then device install/negative auth/lifecycle/navigation evidence. Verify Gradle dependencies/lock/repository checksums, add detekt/ktlint. Implement authenticated capability + encrypted repository/Room fields/DataStore, real BiometricPrompt/Keystore lifecycle and capability probe, atomic writes/chunked file package and independently tested restore before handling real secrets. WorkManager only where real work requires it. Native visual port begins after foundation compiles and gate tests, not a screenshot of React.

GitHub publisher rejected the executable workflow: `workflow_file_not_allowed` (403, workflows permission unavailable). Nothing was published by that attempt. Template preserved outside `.github/workflows`; no automatic native CI is installed. Owner/local tooling must place the reviewed template in `.github/workflows/native-foundation.yml` and push with their own supported access; do not alter app installation permissions. Do not label TESTED/AUDITED/RELEASED from this source or green React build. No Play release/signing/provider credentials, billing changes or premature main merge.
