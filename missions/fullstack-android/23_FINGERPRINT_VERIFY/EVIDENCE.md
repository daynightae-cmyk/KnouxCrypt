# EVIDENCE — TASK 23 — Fingerprint Verify (with TASK 28 public-key QR)

Date: 2026-11-01 · Branch `android/native-implementation-20261031` · Baseline `1281a39`
Classification: **SOURCE_IMPLEMENTED + JVM_TESTED + QR CODE DEVICE_VERIFIED — SCREEN DEVICE_UNVERIFIED / AUDIT_PENDING**

## What works

- `KeyFingerprint` (`:core:security`): the SSH-style `SHA256:<base64url>` fingerprint of a public
  key's SPKI encoding. Known-answer vectors, url-safe alphabet, case- and whitespace-tolerant
  comparison, and a `knouxkey:v1:<base64>#<label>` URI for sharing. A fingerprint identifies a
  *public* key only; nothing here can fingerprint a secret, and the app never shows one.
- `FingerprintVerifyScreen` (route `fingerprint_verify`, catalog implemented, unlock-required):
  shows this device's signing-key fingerprint, compares it against a pasted fingerprint **or** a
  pasted base64 public key (match / no match / unreadable input), keeps imported public keys as
  encrypted vault records with their fingerprints, and copies fingerprints under the managed
  clipboard lease.
- `PublicKeyQrScreen` (route `public_key_qr`, catalog implemented, unlock-required): renders the
  public key as a scannable QR code with the plain URI and the fingerprint next to it. The code
  carries a public key only — never a secret.
- Both screens reuse the signing engine from TASK 19; no second key management code exists.

## Verification

| Check | Result |
|---|---|
| JVM | **212 tests, 0 failures** (security 102, data 93, app 17); new `KeyFingerprintTest` 5 |
| Instrumented (itel S686LN) | `:core:data` **13/13 PASS**; `:app` QR round-trip test **PASS** — the generated code decodes back to exactly the encoded `knouxkey:v1:` URI |
| Lint | 0 errors |
| APK | clean build **19,782,143 bytes** (re-measured from the installed artifact), SHA-256 `e03a0baf4de7144b5dc3da09a4e2721b64616e31b4e8e53bb0f1065ca69437ef`; installed, cold start alive, crash buffer empty. An earlier size figure in this row was stale — see `../APK_ARTIFACT_RECONCILIATION_2026-11-01.md` |

## Not verified / limits

The two screens' layout, RTL, the QR rendering on a real display and the copy interactions are
**DEVICE_UNVERIFIED** — they need an unlocked session, and the owner's phone was in active use
during this pass. The app-module entry-flow UI test passes when the device is free (it passed in
the earlier 11/11, 12/13 and 13/13 device runs) but currently fails while another app holds the
foreground ("component is not displayed" on the splash Enter button) — an environment condition,
not an app crash. A comparison result means the keys differ; it is not a statement about trust.
