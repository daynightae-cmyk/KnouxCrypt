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


---

# EVIDENCE — TASK 00 real Windows implementation (2026-10-31)

Branch: `android/native-implementation-20261031`; implementation commit `2975ec6`; PR14 reconciliation merge `b4fe65c`; baseline `integration/knoux-crypt-android-ready-20261030` @ `8f6f992`.

## Toolchain established
- Android cmdline-tools installed to `D:\Android\sdk`; licenses accepted; platform-tools, platform 36, build-tools 36.
- Gradle 8.14.6 wrapper generated from the verified local distribution and pinned with the official SHA-256 (`7988ed…7bd24`).
- JDK 21 used; Kotlin/Java target 17. No JDK 17 toolchain download.
- Gradle heap reduced to 1.5 GB after one native JVM OOM caused by unrelated machine memory pressure; subsequent builds stable.

## Actual commands and results
- `./gradlew :core:security:test :core:data:test` → **BUILD SUCCESSFUL**, 40 tests, 0 failures.
- `./gradlew :app:testDebugUnitTest` → **BUILD SUCCESSFUL**, 4 tests, 0 failures.
- `./gradlew :app:assembleDebug` → **BUILD SUCCESSFUL**, `app-debug.apk` 14.4 MB.
- `./gradlew :app:lintDebug` → **BUILD SUCCESSFUL**, 0 errors, 12 warnings (dependency-update notices and API-33 attribute note).
- `./gradlew :app:compileDebugAndroidTestKotlin` → **BUILD SUCCESSFUL**; instrumented tests compile.
- `adb devices` → empty; `HypervisorPresent` → False. **No install/launch/device tests were possible.**

## What exists now
- Modules `:app`, `:core:designsystem`, `:core:security`, `:core:data`.
- Splash → Access → Home → Tools/Account; 8 cards, 34 destinations, AR/EN search + RTL, reduced motion, lock/reset.
- KNC1 (PR14 envelope), KNF1 chunked files, KNP1 passphrase text, RFC 6238 TOTP, SHA-256/HMAC, SecureRandom.
- Android Keystore master key + auth-per-use unlock key + check token; session capability; Room ciphertext rows; DataStore nonsecret settings; SAF streaming file cipher.
- Honest BLOCKED recovery; 24 design-only destinations with explicit placeholders.

## Still not met for TASK 00 acceptance
- Device/emulator install, launch, lifecycle, predictive Back, rotation, permission/SAF and biometric runtime tests.
- Detekt/ktlint, dependency locking/vulnerability scan, CI workflow installation (PR14 template remains unrun).
- Security review/audit; per-use auth binding of the data key; recovery/rotation; large-file soak tests.
- Visual parity screenshots at target sizes and both locales.

---

## Android Keystore randomized-IV compatibility correction — 2026-10-31 (`ca7a1bc`)

Review finding: `KeystoreManager` provisions `knoux.master.v2` with
`setRandomizedEncryptionRequired(true)`, but three production paths supplied a caller IV
during encryption: KDK1 DEK wrapping (`VaultKeys.kt`), KNC1/KNC2 records via the root
(`AuthenticatedEnvelope`), and KNF1 device-key file chunks (`FileEnvelope`). Android
Keystore rejects caller encryption IVs for such keys.

Corrections (no alias/key regeneration, no randomized-encryption downgrade):

- KDK1 and KNC encryption initialize the cipher without an IV and persist `Cipher.iv`.
  Header/AAD and on-disk layouts are unchanged; historical caller-IV KDK1/KNC1/KNC2 blobs
  remain decryptable (JVM compatibility tests).
- New device-key files are **KNF2**: a random per-file DEK is wrapped by the root with KDK1
  (provider IV); chunk nonces derive from the exportable file DEK. Legacy KNF1 device files
  remain decryptable with the root. The legacy KNF1 device-encrypt path rejects a
  non-exportable key instead of attempting a caller-IV operation.
- Passphrase KNP/KNF paths use derived software keys and are unaffected. Gate ciphers and
  `DeviceWrappingKey` already used provider-generated IVs on encryption; audit confirmed no
  other production caller-IV encryption path.
- Instrumented tests were added for real-root record encryption, real KDK1 wrap/unwrap and
  KNF2 wrapped-file-DEK round-trip. They were **compiled, not run** (no device).

Actual verification is recorded in `NATIVE_STATUS_2026-10-31.md`; the aggregate JVM suite
is 111 tests passing. Real Keystore/KNF2/record behavior remains **DEVICE_UNVERIFIED**; no
independent audit. Do not claim on-device success until the instrumented tests execute.
