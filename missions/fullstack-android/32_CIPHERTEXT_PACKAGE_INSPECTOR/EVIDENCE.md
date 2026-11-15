# EVIDENCE — TASK 32 — Ciphertext Package Inspector

Date: 2026-10-31 (Asia/Dubai)
Branch: `android/native-implementation-20261031`
Baseline main: `7f83259a3ccb805a53f1457a321e41323c7962fe`
Implementation SHA: `fdbcb81d6974e0efaf6ed3165fc23b4d99397f53`

Classification: **DOMAIN_IMPLEMENTED + INTEGRATED + TESTED_LOCAL + BUILD_VERIFIED**.
**DEVICE_UNVERIFIED** for SAF/UI. **AUDIT_PENDING**.

## What really works

- New bounded `PackageInspector` parses KNF1/KNF2 and KNP1/KNP2 headers without keys,
  passphrases, derivation or decryption.
- Reports format/version, key source, KDF (PBKDF2/Argon2id/none), iterations/memory/
  parallelism, salt/nonce, wrapped-file-key length, chunk size, declared plaintext length,
  header/payload byte counts and structural notes.
- **Structural state is distinct from authenticity:** `authenticated` is always false and
  the UI states that AEAD tags cannot be verified without the matching key/passphrase.
  A valid header is not described as safe, trusted, compatible or decrypted.
- Malformed, truncated, unknown-magic, absurd wrapped-length and invalid Argon2 parameters
  are reported without crashing or exposing payload bytes.
- Real SAF Compose screen with file picker, bounded 8 KiB header read, loading/error/empty/
  valid/malformed states, AR/EN strings and existing KNOUX visual components. No content
  preview or key input.
- Route `package_inspector`; catalog `PACKAGE_INSPECTOR` implemented. Catalog remains
  34 destinations, 0 blocked; now 16 implemented / 18 design-only, with 8 Home cards.

## Verification actually executed (Windows, this session)

| Check | Command | Result |
|---|---|---|
| Security tests | `./gradlew :core:security:test --rerun-tasks --console=plain --no-daemon -Dorg.gradle.jvmargs=-Xmx1024m...` | **PASS, exit 0 — 58 tests**; `PackageInspectorTest` 4 |
| Data tests | `./gradlew :core:data:testDebugUnitTest --rerun-tasks ...` | **PASS, exit 0 — 63 tests** |
| App tests | `./gradlew :app:testDebugUnitTest --rerun-tasks ...` | **PASS, exit 0 — 11 tests** |
| Aggregate JVM | result XML count | **132 tests, 0 skipped, 0 failures, 0 errors** |
| Lint | `:core:data:lintDebug :app:lintDebug` | **PASS, 0 errors** (12 app/10 core warnings) |
| androidTest compile | `:app:compileDebugAndroidTestKotlin :core:data:compileDebugAndroidTestKotlin` | **PASS (compiled, NOT RUN)** |
| Debug APK | `:app:assembleDebug --no-daemon` | **PASS, exit 0 — 17,728,991 bytes** |
| APK SHA-256 | `sha256sum` | `1dc5d6fca021d4b7fd399284c1e5302daf77ce40856d88ad3328ad4febd03e3e` |
| Device | `D:/Android/sdk/platform-tools/adb.exe devices`; Hypervisor | Empty; `HypervisorPresent=False` |

Tests cover KNF1 passphrase headers, KNF2 wrapped per-file DEK metadata, KNP1 PBKDF2,
KNP2 Argon2id parameters, unknown/truncated containers, forged wrapped lengths and absurd
Argon2 costs. No key/tag verification is claimed.

## Honest limitations

- Header-only: payload authenticity, integrity, decryptability and compatibility are
  **not verified**; only structural framing is checked. No key input is offered.
- The UI inspects only the first 8 KiB, so payload-byte counts can be partial for larger
  files; KNF headers remain fully parsed, KNP requires header+tag within that bound.
- KNC record formats are not file-inspected by this tool; the scope is KNF/KNP as in the
  task.
- SAF behavior, display, RTL/keyboard, huge or hostile files and process death are
  DEVICE_UNVERIFIED. No canonical screenshot existed for pixel comparison.
- No independent audit, fuzzing or CVE scan.

## Next safe action

Run the package-inspector device checks with valid/corrupt/truncated KNF/KNP files,
including a real KNF2 and a legacy KNF1, then proceed to the remaining design-only vertical
slices. Do not mark DEVICE_VERIFIED or RELEASE_READY from this evidence.
