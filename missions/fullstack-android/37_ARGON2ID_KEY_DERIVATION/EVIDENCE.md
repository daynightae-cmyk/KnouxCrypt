# EVIDENCE — TASK 37 — Argon2id Key Derivation

Date: 2026-10-31 (Asia/Dubai)
Branch: `android/native-implementation-20261031`
Baseline SHA: `cc8f2c8755e9c9a290076df80ddee498deceb809`
Implementation SHA: `a2ec4b7d2122e40fa5182ade580245b9c26c7c30`

Classification: **DOMAIN_IMPLEMENTED + INTEGRATED + TESTED_LOCAL (KAT) + BUILD_VERIFIED**.
**DEVICE_UNVERIFIED** for on-device memory behavior, UI rendering/RTL/screenshots.
**NOT** independently audited.

## Implemented

- `core/security/Argon2id.kt` — Argon2id v1.3 via Bouncy Castle 1.78.1 (pure Java,
  no native ABI). Validated parameter ranges: memory 8–256 MiB, iterations 1–10,
  parallelism 1–4, 32-byte default output. Defaults: 64 MiB, t=3, p=2 (above the
  OWASP 2023 minimum of 19 MiB, t=2, p=1). No silent downgrade.
- `PassphraseEnvelope` now seals **KNP2**: magic/version/KDF/memory/time/parallelism/
  salt/nonce header as AAD + AES-256-GCM. The recorded parameters are authenticated
  and re-validated before derivation, so a crafted envelope cannot force unbounded
  memory. **KNP1/PBKDF2 remains readable** for existing ciphertext; new writes use
  KNP2 only. `sealLegacyPbkdf2` exists solely for compatibility vectors/data.
- Text Cipher (`KNP2`) now uses Argon2id by default; UI copy and Privacy Center were
  corrected. Error paths cover wrong passphrase, tampered/invalid envelope, and OOM.
- New `KEY_DERIVATION` destination: a real local workbench at route `key_derivation`
  (34-destination catalog preserved). Explicit memory/iteration/parallelism choices,
  fresh 16-byte salt, real derivation off the main thread, elapsed time, result hex,
  copy with a truthful clipboard caveat, clear-result action, OOM and failure states.
  No passphrase or key is persisted.

## Dependency / size

- `org.bouncycastle:bcprov-jdk18on:1.78.1` (core:security, runtime dependency).
- Packaging excludes the duplicate OSGi-only `META-INF/versions/9/OSGI-INF/MANIFEST.MF`
  shared with `jspecify` (worked around at packaging, not by modifying either jar).
- Debug APK grew from 14,383,574 to 17,562,730 bytes (+3,179,156). Release is not
  minified in this project yet; R8 shrinking is a remaining quality task.

## Verification actually executed (Windows, this session)

| Check | Command | Result |
|---|---|---|
| Fresh all-module JVM tests | `./gradlew :core:security:test :core:data:test :app:testDebugUnitTest --rerun-tasks` | **PASS, exit 0** — 70 tests, 0 skipped, 0 failures, 0 errors |
| Argon2id known-answer | included above | **PASS** — `Argon2idTest.matchesPublishedArgon2idVector`: `09316115d5cf24ed5a15a31a3ba326e5cf32edc24702987c02b6566f61913cf7` for password `password`, salt `somesalt`, m=65536, t=2, p=1 |
| Envelope compatibility | included above | **PASS** — `PassphraseEnvelopeTest` (8): KNP2 round-trip, recorded parameters, KNP1 legacy open, wrong pass/context, tamper, crafted-cost rejection, limits, KDF determinism |
| Debug APK | `./gradlew :app:assembleDebug` | **PASS, exit 0** — 17,562,730 bytes |
| APK SHA-256 | `sha256sum` | `8ff7768b705191d6722e8fd9c218ebf5a6f2db009cd5a8cb3edea2625697af73` |
| Lint | `./gradlew :core:data:lintDebug :app:lintDebug` | **PASS, exit 0** — 0 errors (10 app warnings, 7 core:data warnings) |

## Honest remaining gaps

- **Passphrase file containers remain KNF1/PBKDF2-HMAC-SHA256.** Argon2id covers KNP2 text
  and backup wrappers, not files. Device-key files now use KNF2 with a root-wrapped
  per-file DEK (not an Argon2id KDF). No Argon2id file-container format is claimed.
- No on-device run: rendering, RTL, keyboard, timing and low-memory behavior are
  DEVICE_UNVERIFIED. There is no screenshot against the canonical reference.
- Argon2id is a vetted third-party implementation (Bouncy Castle) but this build has
  not been independently audited; no CVE/dependency scan was run.
- The derived key is not yet used by the vault, rotation or backup flows. TASK 15 can
  consume KNP2; TASK 31 remains the blocking prerequisite for backup/recovery.
- The KDF workbench clipboard is not auto-cleared (TASK 44).

## Next safe action

TASK 31 (vault key rotation) remains the next P0 blocker; TASK 15 depends on 31 and
37. Do not mark TASK 15 or a full recovery flow complete until a tested rotation /
wrapping design exists.
