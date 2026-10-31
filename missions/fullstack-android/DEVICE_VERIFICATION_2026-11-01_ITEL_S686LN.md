# DEVICE VERIFICATION — 2026-11-01 — itel S686LN (first real hardware run)

Operator: Qoder agent over `adb`, with the owner present and performing the fingerprint touches.
Nothing in this file is inferred from a build or a JVM test; every row states what was actually
observed on the phone.

## Device and artifact under test

| Item | Value |
|---|---|
| Model / manufacturer | itel S686LN (model `itel_S686LN`, product `S662LN-OP`), ITEL |
| Android / API | 15 / API 35 |
| Security patch | 2026-09-05 |
| ABI / SoC family | arm64-v8a / `ums9230` |
| Display | 1080x2436, 480 dpi |
| Relevant features | `android.hardware.fingerprint`, `android.hardware.hardware_keystore=200`, `keystore.app_attest_key`, camera present |
| App package | `com.knoux.crypt.debug`, `0.2.0-foundation-debug` |
| APK under test | 17,191,392 bytes, SHA-256 `a39077d7f4707aca269725020add894f484061ef922b57d4fda2fe40cc9d06ea` (clean `:app:assembleDebug`) |
| Install | `./gradlew :app:installDebug` → "Installed on 1 device." |
| Keystore level reported by the app | **TEE** |
| Artifacts | `device-evidence/knoux-crypt-android-2026-11-01-itel-s686ln/` (instrumented result XMLs, UI hierarchy dumps, secure-window captures) |

## 1. Instrumented suites on hardware (were compile-only before today)

`:core:data:connectedDebugAndroidTest` → **7 tests, 0 failures** (`instrumented-core-data.xml`):

| Test | Result | Time |
|---|---|---|
| `KeystoreDeviceTest.masterKeyRoundTripsAnAuthenticatedRecord` | PASS | 0.028 s |
| `KeystoreDeviceTest.dataKeyWrappingRoundTripsUnderTheRealKeystoreRoot` (KDK1) | PASS | 0.030 s |
| `KeystoreDeviceTest.recordEncryptionUsesAProviderChosenIvWithTheRealRoot` | PASS | 0.014 s |
| `KeystoreDeviceTest.knf2DeviceFileUsesWrappedPerFileDekWithTheRealRoot` | PASS | 0.001 s |
| `KeystoreDeviceTest.gateKeyIsUserAuthenticationBound` | PASS | 0.001 s |
| `VaultDatabaseMigrationTest.migration1To2PreservesRowsAndDefaultsKeyVersionZero` | PASS | 0.058 s |
| `PasswordAuditRoomTest.auditScansRealRoomRowsAndDetectsReuseWeaknessAndGaps` (TASK 36) | PASS | 0.242 s |

`:app:connectedDebugAndroidTest` → **1 test, 0 failures** (`instrumented-app.xml`):
`AccessFlowTest.splashToGuestHomeIsHonestAndNavigable` PASS in 3.3 s.

Consequence: the provider-generated-IV correction, the KDK1 wrapped-DEK hierarchy, KNF2
device files, the auth-bound property of the gate key, the Room v1→v2 migration and the TASK 36
audit-over-Room path are now **DEVICE_VERIFIED on this handset**. They are still not
independently audited.

## 2. Real bug that only hardware exposed

`:core:data:mergeDebugAndroidTestJavaResource` failed on the first device attempt:

```
2 files found with path 'META-INF/versions/9/OSGI-INF/MANIFEST.MF' from inputs:
  - org.bouncycastle:bcprov-jdk18on:1.78.1/…
  - org.jspecify:jspecify:1.0.0/…
```

The `:app` module already carried a `packaging` exclude; `:core:data` did not, so its
instrumentation APK could never be built. Adding the same exclude to `core/data/build.gradle.kts`
fixed it and the suite then ran. This is exactly the class of defect that green JVM tests and
`compileDebugAndroidTestKotlin` could not surface.

## 3. Auth-bound unlock gate (behavioural, not just key metadata)

- Guest/locked cold start rendered honestly: `GUEST PREVIEW`, `Your Vault is Locked`,
  `No stored secrets are readable in guest mode`, 8 Home cards, bottom bar (English first frame,
  then Arabic after the async settings read — see §6).
- `Lock session now` / `اقفل الآن` from Account returned the app to the Access screen showing
  `Vault state: Locked`, `Session: No access`, `Strong biometric: Ready` (the phone does report
  `BIOMETRIC_STRONG` availability).
- Tapping `Unlock with biometrics` raised the real SystemUI sheet: app label `نوكس كريبت / KNOUX
  Crypt`, `Unlock your vault`, `المس مستشعر بصمة الإصبع على الشاشة`, `Cancel`. It was still
  pending at t+1 s, t+4 s and **t+20 s with the vault remaining locked** — the platform did not
  auto-succeed and the app did not mint any capability.
- Only after the **owner touched the sensor** did the session open (within ~5 s), Account then
  reported `Mode: Unlocked`, `Data key: TEE`, `Key storage: Android Keystore`, `Gate: Configured`
  and the honest binding line `Session gate · not per-use` / `بوابة جلسة · ليست لكل استخدام`.
- `Authentication cancelled.` is surfaced as a typed, recoverable state; nothing is faked.
- While the biometric sheet was up, `uiautomator dump` returned an empty tree, so the prompt
  content is not exposed to UI automation.

Verdict for the P0 claim "capability minting requires a cryptographic gate operation":
**behaviourally confirmed on this device**. Note this is one handset (software-ish TEE, no
StrongBox claim made); it does not generalise to every vendor.

## 4. Screen-capture policy (FLAG_SECURE)

With the default policy (`blockScreenshots = true`), `adb exec-out screencap -p` of the
foreground app produced 1080x2436 images in which the app layer is entirely black:

| Capture | Non-black pixels | Distinct colours |
|---|---|---|
| `01-launch-secure.png` (guest Home) | 9,432 / 2,630,880 = **0.36 %** | 350 |
| `04-access.png` (Access) | 9,455 / 2,630,880 = **0.36 %** | 350 |

Both are ~27 KB files and the residual non-black area is the system bar, not app content:
no card, title or field is recoverable. So the screenshot/recents protection is
**DEVICE_VERIFIED as effective on this handset** for external capture.

## 5. Storage boundaries observed on device

`run-as com.knoux.crypt.debug` showed only app-private paths: `databases/knoux.db` (+ `-wal`,
`-shm`) and `files/datastore/…`; no world-readable secret file. The device also still shows
`profileInstalled` (Benchmark) — harmless. `keyguard` and `dualapp` (user 999) exist on this ROM;
the app ran in the owner's user 0 only.

## 6. Findings and gaps this run opened

1. **Latin-only failure text inside the Arabic UI.** `Authentication cancelled.` and other
   `AccessViewModel.onError(...)` strings are raw English (`tr()` is not applied to them), which
   contradicts the bilingual promise for error states. Fix: bilingual typed messages.
2. **No canonical visual parity capture yet.** Because capture is blocked by default, and the
   A/B requires toggling `Block screenshots` off in Privacy Center, all PNGs taken today are the
   blacked-out pair above. The owner-approved reference comparison remains **open**, not passed.
3. **Keystore binder traffic from composition.** `keystore2 get_key_entry … KEY_NOT_FOUND` lines
   repeat while the Account screen is displayed, consistent with `hasMasterKey()` / inactive
   alias probing happening during recomposition. Worth hoisting into a cached state.
4. **Owner-participation is mandatory** for anything behind the gate: every unlock costs a real
   fingerprint touch, and the device keyguard had to be opened by the owner mid-session.
5. Not exercised today (still DEVICE_UNVERIFIED): key rotation end-to-end with the real root,
   backup/restore through SAF, clipboard managed-lease timing and vendor behaviour, package
   inspector against a real file on the handset, HMAC/audit large-file behaviour, screen-off
   auto-lock timing, TalkBack, 200 % font and 4 GB hashing.

## 7. Status changes justified by this run

- TASK 02 gate/Keystore record path, TASK 04 KNF2 device files, TASK 31 KDK1 wrapping and Room v2
  migration, TASK 36 audit-over-Room: **DEVICE_VERIFIED (single handset)** in addition to their
  existing JVM-test status. No audit, no release, no signing claim.
- TASK 36 remains DEVICE_UNVERIFIED for its *screen* (layout, RTL, TalkBack, run from UI).
- Everything else keeps its previous status.

Commands (for reproducibility): `./gradlew :core:data:connectedDebugAndroidTest`,
`./gradlew :app:connectedDebugAndroidTest`, `./gradlew :app:installDebug`,
`adb exec-out screencap -p`, `adb shell uiautomator dump`, `adb shell input tap|keyevent`,
`adb shell run-as com.knoux.crypt.debug ls -l databases files`, `adb logcat -d`.
