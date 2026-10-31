# EVIDENCE — TASK 02 — Secure Access Login

Date: 2026-10-31 (Asia/Dubai)
Branch: `android/native-implementation-20261031`
Implementation commit: `2975ec6` (PR14 reconciliation: `b4fe65c`)
Verified baseline: `integration/knoux-crypt-android-ready-20261030` @ `8f6f992`

Classification: **BUILD_VERIFIED / JVM-TESTED where stated — DEVICE_VERIFIED: NO**.
No emulator or device was available (`adb devices` empty, HypervisorPresent=False), so no
install, launch, screenshot, lifecycle, Back, biometric, Keystore or SAF evidence exists.

- BiometricPrompt(BIOMETRIC_STRONG) with a CryptoObject from an auth-per-use Keystore key.
- Setup encrypts a fixed check token; unlock decrypts and constant-time compares it. A UI callback without a successful key operation never unlocks.
- Guest mode keeps `VaultAccess` null; guest cannot open notes/passwords/file/vault records.
- Cancellation, lockout, lockout-permanent, no-biometrics and hardware-unavailable errors are mapped; key invalidation offers an explicit reset that deletes only the gate.
- Session auto-locks after 30 s in background; lock drops the capability and cached key handle.
- Tests: instrumentation `AccessFlowTest` and `KeystoreDeviceTest` compile, NOT RUN. No device test of the prompt.
- Known limit: the master data key is not auth-bound per use; see Privacy Center.

---

## Security P0 closure — authorization boundary (2026-10-31)

- Baseline SHA: `68da00924d9292af6187e9f4aab7e6c5280f8aae`
- Implementation SHA: `c3f718f7cee4b8f663b05e9d3aae858101554029` (branch `android/native-implementation-20261031`)
- Classification: **DOMAIN_IMPLEMENTED + INTEGRATED + TESTED_LOCAL + BUILD_VERIFIED**.
  **DEVICE_UNVERIFIED** for BiometricPrompt, Android Keystore invalidation and cipher-instance behavior.
  **NOT** independently security-reviewed or audited.

### What changed after 68da009

1. **Capabilities cannot be minted by UI code.** `VaultAccess` is a sealed interface; instances are private to `SessionManager`. `unlock()` was removed. `authorizeUnlock` verifies the stored token over the auth-bound gate cipher and only then mints access; `authorizeEnrollment` refuses when any master key exists. `internal` is no longer the only barrier.
2. **Guest/locked reset path removed.** `UnlockManager.reset()` and `AccessViewModel.resetUnlock()` no longer exist. The locked-state reset button is gone. Gate mutation is only `prepareGateRotationCipher` + `completeGateRotation`, both requiring a live unlocked session and a biometric-verified auth-bound cipher.
3. **Re-enrollment cannot claim an existing vault.** Fresh setup is refused when a master key or any gate token exists, including after the gate token is lost. The master key is the data-ownership anchor and is never regenerated.
4. **Atomic gate rotation.** Two frozen aliases (`knoux.unlock.v2`, `knoux.unlock.v2.b`) plus an active-slot preference. The new gate is written to the inactive slot and becomes active only after the new token is written; the old key/token are removed afterwards. Cancelling or crashing leaves the old gate usable. Vault ciphertext, master-key alias and record formats are untouched.
5. **Biometric invalidation is non-destructive.** No deletion or reset is offered from the locked state. A persisted recovery reason drives a truthful recovery-required panel; data, gate material and master key stay intact. Recovery restore is not implemented (TASK 15).
6. **Revocation is checked at execution time.** Repository `observe`, `count`, `find`, `save` and `delete` validate the capability before and after decryption/encryption and before/after in-flight DAO work. Locked Flow collection fails with `VaultLockedException`; stale capabilities from a previous generation fail. `VaultFileCipher` checks on entry, at every chunk progress checkpoint and after the envelope; the screen deletes its temporary output on failure.
7. **UI plaintext clearing.** Notes, Passwords and Authenticator ViewModels drop decrypted record lists when `session.unlocked` becomes false; root navigation clears the screens. Editor text lives in composition and is disposed by the lock navigation.
8. **Master-key access narrowed.** `KeystoreManager.masterKey()` is `internal`; the app module can only reach it through `SessionManager.key(liveAccess)`. It remains **not** per-use biometric-bound, and the UI says so. Alias `knoux.master.v2` and key spec were deliberately not changed.

### Verification actually executed (Windows, this session)

| Check | Command | Result |
|---|---|---|
| Fresh JVM tests, all modules | `./gradlew :core:security:test :core:data:test :app:testDebugUnitTest --rerun-tasks` | **PASS, exit 0** — 65 tests, 0 skipped, 0 failures, 0 errors (security 36, core:data 25, app 4) |
| New boundary suite | included above | **PASS** — `SecurityBoundaryTest`, 21 tests |
| Debug APK | `./gradlew :app:assembleDebug` | **PASS, exit 0** — 14,383,574 bytes |
| APK SHA-256 | `sha256sum app/build/outputs/apk/debug/app-debug.apk` | `e07cb48e8976268c3b725f19273aee551a569e32c08cff30505104e8ad8c4eec` |
| Lint | `./gradlew :core:data:lintDebug :app:lintDebug` | **PASS, exit 0** — 0 errors; 10 app warnings, 7 core:data warnings |
| Instrumented sources | `./gradlew :app:compileDebugAndroidTestKotlin :core:data:compileDebugAndroidTestKotlin` | **PASS (compiled, NOT RUN)** |

New negative/positive tests in `core/data/src/test/.../SecurityBoundaryTest.kt`:
fresh enrollment requires the prepared cipher; setup blocked by master key, by a lost gate token with an existing vault, and by a concurrent vault appearing after preparation; locked guest cannot start/complete rotation; deep `authorizeEnrollment` blocked by an existing master key; stale capability after lock and after re-unlock; locked Flow observation; emission after revocation; in-flight read after lock; in-flight file encryption after lock; biometric invalidation is non-destructive + recovery reason + re-unlock works; corrupt and wrong token rejected; substituted/stale cipher rejected and retry works; cancelled prompt mints nothing; atomic rotation preserves records/master key and keeps the old gate on cancel; cipher-purpose confusion rejected; alias/format compatibility and legacy ciphertext readability; identity binding for stored rows.

### Honest limitations / remaining risks

- No device/emulator: BiometricPrompt CryptoObject behavior, real Keystore invalidation semantics, same-cipher-instance return (`===` check), lifecycle and screenshot parity remain **DEVICE_UNVERIFIED**. The instrumented `AccessFlowTest` and `KeystoreDeviceTest` were only compiled.
- The master data key is session-gated, not per-use auth-bound. A JCA key handle already obtained cannot be revoked mid-operation; the boundary revalidates at operation boundaries and discards output, but does not provide hardware per-use binding.
- Gate rotation deliberately depends on one more biometric operation; if that prompt is cancelled the old gate remains, which is the safe direction.
- Recovery from an invalidated gate is a truthful **recovery-required** state; restore is **BLOCKED** on TASK 15, not simulated.
- No independent security audit, fuzzing or dependency CVE scan occurred.
- `OWNER_ACTIONS_REQUIRED.md` records the device-only checks the owner must still supply.


## In-flight revocation boundary — 2026-10-31 (`176d8c3`)

- `SessionManager.lock()` now takes a coroutine mutation gate before revoking; repository
  `save`/`delete`, backup `restore` and key-rotation batches hold the same gate across the
  logical Room commit. A lock waits for an already-authorized mutation, and no mutation
  can start or silently commit after revocation.
- Deterministic tests pause a DAO write, revoke, and assert the lock waits, the authorized
  commit lands before revocation, later writes fail, and cancellation/database errors
  write nothing. Full suite: 99 tests, 0 failures; APK 17,628,199 bytes; lint 0 errors.
- Device lifecycle/Keystore behavior remains DEVICE_UNVERIFIED; no audit.
