# Native Android — TASK 00 initial code slice

Status: **IMPLEMENTED_UNVERIFIED / PRESENT_UNMERGED**. Not a functional vault, not an APK delivery, not TASK 00 acceptance.

Isolated sibling to React/Electron. No React source, existing 46 missions, artwork, references or Windows worktree was replaced. Two initial modules with real code, not empty 44-feature shells:
- `:app`: Compose/Material3 dark foundation diagnostics, Navigation Compose, constructor DI, ViewModel/StateFlow, lifecycle lock, platform Arabic resources, RTL, safe/IME insets. Debug visual-preview route cannot read secrets, release has no preview action. Foundation diagnostics are **not** the approved Splash/Auth/Home port yet.
- `:core:security`: platform-JCA small-record AES-256-GCM envelope and fail-closed session policy. JVM source separate from Android adapters.

## Toolchain (not installed here)
Pinned development baseline: JDK 17, Gradle 8.11.1, AGP 8.10.1, Kotlin/Compose compiler 2.1.20, API 36, minSdk 26. This is not a Play-release policy claim. AGP compatibility: https://developer.android.com/build/releases/agp-8-10-0-release-notes

No Gradle wrapper JAR was fabricated or copied from unknown source. On an equipped machine, generate/review the official wrapper (including distribution SHA-256) before CI:
```
cd native-android
gradle wrapper --gradle-version 8.11.1 --distribution-type bin
# Set ANDROID_HOME or create untracked local.properties with sdk.dir.
./gradlew :core:security:test :app:assembleDebug :app:lintDebug
./gradlew :app:connectedDebugAndroidTest
```
Windows: `gradlew.bat` after wrapper generation. No SDK license acceptance, signing configuration or release authorized by these commands. Do not run release publication.

Current sandbox: java/javac/gradle/SDK absent, JDK lookup/download and Gradle distribution hosts fail DNS. SDK download host reachable, but SDK cannot function without JVM; no large unused SDK downloaded. This prevents native compilation, actual unit test execution, APK install, instrumentation and screenshots.

## Crypto scope and important limits
- AES/GCM/NoPadding from platform JCA, caller-provided AES-256 key, fresh random 96-bit nonce; authenticated fixed version/algorithm/length header plus required 1–4096-byte caller context. Max plaintext 1MiB, strict framing/no trailing bytes. No plaintext returned before `doFinal` authentication. Caller must bind AAD to record identity/type; this alone does not prevent replay of a valid old record.
- No streaming format, KDF, recovery, key rotation or portable backup. Do not use small-record envelope for large files. Random nonce collision risk/key usage limits and parser design need review before production. No security audit performed.
- DeviceWrappingKey prepares an auth-required Android Keystore encryption cipher. **Not wired to authentication or persistence**; no successful-key-use capability implemented. BiometricPrompt CryptoObject, invalidation/recovery, alias concurrency/lifecycle, hardware-capability probe and real-device tests are pending. No StrongBox guarantee. Never delete/regenerate a key automatically on an error.
- `canReadSecrets()` is always false, intentionally. No unlock stub can grant authorization; guest is not a credential. Release preview denied by policy and compiled UI guard. Protected repositories do not exist yet; do not store real user data.
- Platform FLAG_SECURE reduces screen capture on supporting devices; not a universal capture guarantee. Native activity backgrounding clears preview, no audio/analytics/network. No permissions claimed yet.

## Tests written (NOT executed as Kotlin here)
JUnit source includes zero-key NIST AES-256-GCM provider vector, envelope boundary sizes, random-nonce variation, each-byte tampering, wrong key/AAD, truncation/trailing data, oversize/non256-bit key/context rejection, debug/release guest gates. Instrumentation source exercises diagnostic entry/access/debug preview/back. Tests are source, **not PASS evidence** until Gradle runs.

Static only:
```
python3 scripts/check-source.py
sh scripts/check-prerequisites.sh
```
First checks manifest/XML/source invariants, not type/runtime correctness. Second returns nonzero when tools absent; no installs/removal.

## Pending TASK 00 acceptance
Gradle wrapper/verified dependency resolution and locks, native compilation/lint/detekt/format, Room encrypted-field repository with authenticated access capability, nonsecret DataStore, BiometricPrompt/Keystore key lifecycle, atomic encrypted writes/restore, chunked format/negative vectors, device/emulator install/lifecycle/Back/security tests, CI, capability/evidence registry and screenshots. WorkManager only when a real operation needs it. All 01–44 native features remain PLANNED; React is not embedded in WebView.

## CI publication limitation
The publisher cannot create GitHub Actions workflows (403 workflows permission). The proposed workflow is preserved at `ci/native-foundation.yml.example`, not executable and not run. Review/add it locally under `.github/workflows/native-foundation.yml` when authorized. No remote native build/test result exists yet.
