# EVIDENCE — TASK 27 — HMAC Authenticity

Date: 2026-10-31 (Asia/Dubai)
Branch: `android/native-implementation-20261031`
Baseline SHA: `800ce31dcfc78b00d7a7430ce290fbc387256e0a`
Implementation SHA: `f82010e1761326fe7262c57f887d16288f320abb`

Classification: **DOMAIN_IMPLEMENTED + INTEGRATED + TESTED_LOCAL (RFC vectors) + BUILD_VERIFIED**.
**DEVICE_UNVERIFIED** for UI/keyboard/RTL/clipboard behavior. **AUDIT_PENDING**.

## What really works

- New `Hashing.hmacSha256(key, InputStream, totalBytes, onProgress)` streams a file
  through JCA `HmacSHA256` without buffering; a declared-size mismatch aborts.
- HMAC Authenticity Lab at route `hmac` (catalog `HMAC_AUTHENTICITY` now implemented):
  - Text or SAF file mode; the key is entered locally as UTF-8 bytes, hidden by default,
    never persisted/logged, zeroed after computation where the JVM allows.
  - Real HMAC-SHA-256 generation, progress/cancel for files, 1 MiB text cap with file-mode
    guidance, corrupt/unreadable file errors.
  - 64-hex expected-tag validation, **constant-time** verification, explicit match/mismatch.
  - Copyable tag, clear-key/results action, text/key change invalidates stale tags.
  - Explicit boundary: HMAC proves knowledge of the key and message integrity; it is not a
    digital signature, certificate identity, or proof of who created the message.
- No new crypto primitive; the existing vetted JCA provider is reused. No network, no
  persistence, no Keystore key import in this build.

## Verification actually executed (Windows, this session)

| Check | Command | Result |
|---|---|---|
| Security tests (fresh) | `./gradlew :core:security:test --rerun-tasks --no-daemon -Dorg.gradle.jvmargs=-Xmx1024m...` | **PASS, exit 0 — 54 tests**; `HmacTest` 2 |
| Data tests (fresh) | `./gradlew :core:data:testDebugUnitTest --rerun-tasks ...` | **PASS, exit 0 — 63 tests** |
| App tests (fresh) | `./gradlew :app:testDebugUnitTest --rerun-tasks ...` | **PASS, exit 0 — 11 tests**; job gate/stream cancellation/policy |
| Aggregate JVM | result XML count | **128 tests, 0 skipped, 0 failures, 0 errors** |
| Lint | `:core:data:lintDebug :app:lintDebug --no-daemon` | **PASS, 0 errors** (10 app/8 core warnings) |
| androidTest compile | `:app:compileDebugAndroidTestKotlin :core:data:compileDebugAndroidTestKotlin --no-daemon` | **PASS (compiled, NOT RUN)** |
| Debug APK | `:app:assembleDebug --no-daemon` | **PASS, exit 0 — 17,714,701 bytes** |
| APK SHA-256 | `sha256sum` | `40259ea5ee7aac869c30fba1687eaed0dca823ac9ba9f4622f3b001ae0526dd2` |
| Device | `D:/Android/sdk/platform-tools/adb.exe devices`; Hypervisor | Empty; `HypervisorPresent=False` |

HMAC tests include RFC 4231 cases 1 and 2, streaming vs in-memory equality, size mismatch,
changed message/wrong key, and constant-time comparison. A combined larger Gradle run had
previously exhausted host memory; split runs above are the authoritative results.

## HMAC reliability hardening (`0124560`)

- Results are generation-gated; key/message/mode/file changes, Clear Key, Cancel and
  overlapping computations invalidate older tokens. A late job cannot repopulate results.
- `HmacStreamer` closes the input from a cancellation watcher for best-effort unblocking;
  file jobs check the job before/after streaming and at each chunk. The UI uses throw-away
  state and clears staged values; tests cover blocking-stream cancellation, gate/token
  behavior and late-chunk KNF2 failure.

## Review hardening included in the same commit

- **KNF1/root retention:** test creates a legacy KNF1 device file, performs two record-key
  rotations, decrypts it, verifies the root key bytes are unchanged, and confirms
  `retireDataKey(access, 0)` is rejected.
- **KNF2 recovery:** first-chunk tag tamper emits no plaintext; truncated wrapped-key/header
  cuts and absurd wrapped-length values fail closed; earlier wrong-key/tamper tests remain.
- **Session revocation:** in-flight KNF2 **file decryption** aborts after lock (in addition
  to existing save/delete/restore/rotation batch and file-encryption tests).
- **File Integrity boundary:** the comparison UI now states that a match does not prove
  origin, authenticity or safety, alongside the existing bottom caveat.

## Honest limitations

- No device run: keyboard behavior, SAF file mode, cancellation, clipboard tag copy, RTL,
  large text and 4 GB streaming are DEVICE_UNVERIFIED. No screenshots/reference PNG was
  present for pixel comparison.
- The key is a locally typed UTF-8 secret; there is no Key Forge/Keystore key import or
  persistent key selector. This is stated in the UI.
- Tag copy uses the normal clipboard (tags are not secret); keys are never copied.
- No independent audit or dependency CVE scan.
- TASK 44 was **not started**: its actual prerequisites are TASK 25 (Clipboard Guard) and
  TASK 08. TASK 25 remains unimplemented, so TASK 44 is not dependency-ready.

## Next safe action

Run the HMAC device checklist (text/file, wrong/changed tag, empty inputs, cancel, RTL and
keyboard) and then implement TASK 25 before attempting TASK 44. Device verification remains
the release blocker; JVM work can continue independently.
