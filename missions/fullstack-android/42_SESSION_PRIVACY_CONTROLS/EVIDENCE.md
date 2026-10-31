# EVIDENCE — TASK 42 — Session Privacy Controls

Date: 2026-10-31 (Asia/Dubai)
Branch: `android/native-implementation-20261031`
Baseline SHA: `367c707729ca84214cde0fcdbe19b157d9efb6a6`
Implementation SHA: `3091032a7059e1ab3a52166436558350d6346030`
Post-implementation crypto correction: `ca7a1bce8ec6108318f6d60907218777d236ca56`

Classification: **DOMAIN_IMPLEMENTED + INTEGRATED + TESTED_LOCAL (policy) + BUILD_VERIFIED**.
**DEVICE_UNVERIFIED** for lifecycle timing, notification/recents snapshots, real clipboard
managers and screen capture. **AUDIT_PENDING**.

## Implemented controls

- **Persisted, non-secret preferences** in DataStore: auto-lock timeout (15/30/60/300 s),
  lock on screen off, clipboard clear timeout (off/30/60/120 s), block screenshots
  (default on), and cover content on app switch (default on). Invalid values are rejected
  by `SessionPrivacyPolicy` before persistence and filtered on read.
- **Auto-lock**: `MainActivity.onStop` uses the configured timeout instead of a hard-coded
  30 s. The screen-off receiver (`ACTION_SCREEN_OFF`) locks immediately when enabled.
- **Clipboard**: `ClipboardPrivacy` marks API 33+ clips sensitive, clears a copied value
  after the configured timeout only if the clipboard still contains that exact value, and
  clears it on every session lock via a `SessionManager` lock listener. Wired to the
  Password copy action, the Key Forge ephemeral key, and the Key Derivation result.
- **Screenshot policy**: live add/clear of `FLAG_SECURE` from the persisted setting; the UI
  warns that disabling it removes the platform guarantee. FLAG_SECURE is applied by
  default before settings are loaded.
- **App-switch masking**: a best-effort full-screen Compose cover on `ON_PAUSE`, removed on
  `ON_RESUME`; FLAG_SECURE remains the stronger platform guarantee. The cover can be
  disabled explicitly.
- **Privacy Center UI** now exposes all controls, the effective screenshot policy, and
  truthful constraints; sensitive copies link to the configured policy. The lock button
  revokes the session and therefore clears the managed clipboard value.
- No new Tools destination, no visual identity change, 8 Home cards and 34 catalog
  destinations preserved.

## Verification actually executed (Windows, this session)

Host memory was exhausted by a combined 1.5 GiB Gradle run (JVM `hs_err`), so the suite was
rerun in separate fresh Gradle invocations at `-Xmx1024m`; all modules passed.

| Check | Command | Result |
|---|---|---|
| Policy unit tests | `./gradlew :core:data:testDebugUnitTest --rerun-tasks --no-daemon` | **PASS, exit 0** — `SessionPrivacyPolicyTest` 2 |
| Security tests | `./gradlew :core:security:test --rerun-tasks --no-daemon` | **PASS, exit 0** — 46 |
| Data tests | same data command | **PASS** — 61 |
| App tests | `./gradlew :app:testDebugUnitTest --rerun-tasks --no-daemon` | **PASS, exit 0** — 4 |
| Aggregate JVM | results count | **111 tests, 0 skipped, 0 failures, 0 errors** |
| Lint | `:core:data:lintDebug :app:lintDebug` | **PASS, exit 0** — 0 errors (10 app warnings, 8 core:data warnings) |
| androidTest compile | `:app:compileDebugAndroidTestKotlin :core:data:compileDebugAndroidTestKotlin` | **PASS (compiled, NOT RUN)** |
| Debug APK | `:app:assembleDebug` | **PASS, exit 0** — 17,642,827 bytes; SHA-256 `7a40f487c6ca3a3ba177dc880e215484ff1a62d26d15be06e0305fb2fe78a7a1` |
| Device | `D:/Android/sdk/platform-tools/adb.exe devices`; Hypervisor | Empty list; `HypervisorPresent=False` |

## Honest limitations / remaining risks

- **DEVICE_UNVERIFIED**: background timer, screen-off broadcast delivery, recents/app-switch
  snapshot timing, real clipboard managers (including API 26–32 behavior), FLAG_SECURE
  clearing, and process-death clipboard persistence were not executed on hardware.
- The Compose app-switch cover is best-effort and may not render before the system snapshot;
  FLAG_SECURE is the only platform guarantee and can be disabled by the user with warning.
- Only values copied through the wired sensitive-copy controls are managed. Hashes,
  ciphertext, and random values use the normal clipboard. Android may retain managed values
  after process death or if another app replaces the clipboard.
- Clipboard timeout changes apply to subsequent copies, not an already scheduled clear.
- No independent audit; no screenshot comparison; no clipboard/logcat leakage run.
- Persistent settings are non-secret and intentionally not encrypted.

## Next safe action

Run the device checklist: background timeout at each choice, screen off with lock enabled,
toggle FLAG_SECURE and inspect recents/screenshots, copy a password and wait for timeout,
lock and confirm immediate clearing, and verify process-death behavior. Then commission the
independent review. Do not mark DEVICE_VERIFIED without that evidence.
