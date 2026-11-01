# EVIDENCE — TASK 13 — Key Details

Date: 2026-11-01 · Branch `android/native-implementation-20261031` · Baseline `3d85226`
Classification: **SOURCE_IMPLEMENTED + JVM_TESTED + METADATA DEVICE_VERIFIED — SCREEN DEVICE_UNVERIFIED / AUDIT_PENDING**

## What works

- `KeystoreManager.masterKeyDetails()` reports only what the platform states about the real
  master key: alias `knoux.master.v2`, algorithm and key size from `KeyInfo`, the purpose flags
  the platform returns, the protection class (`StrongBox` / trusted environment / software, from
  `KeyInfo.getSecurityLevel()` on API 31+ and `isInsideSecureHardware()` below it), whether the
  platform requires user authentication, and the unlocked-device requirement **as it was requested
  at creation** — `KeyInfo` does not report that flag back, so the UI says "requested", not
  "verified". The platform exposes no creation date for Keystore entries, so the screen does not
  show one.
- `KeystoreKeyDetails.hasExportablePublicKey` is permanently `false`: the vault key is a symmetric
  non-exportable secret, so there is no public key and no shareable fingerprint. The screen states
  this and keeps "View public key" and "Verify a signature" disabled with the reason visible;
  signature verification stays unavailable until a real signing-key workflow exists (TASK 19).
- `KeyRingFingerprint` is a SHA-256 over the alias and the wrapped record-data-key blobs as stored:
  an integrity signal that detects local tampering or an unexpected re-wrap, explicitly not a
  shareable identity, never transmitted.
- `KeyDetailsScreen` (`key_details`, unlock-gated) shows the Key Forge hero, the key-details card
  (alias, purpose, provider, algorithm, hardware support, user-authentication, unlocked-device
  request), the record-data-key inventory (active version, stored versions, rows per version) and
  the keyring fingerprint, with honest states: loading, ready, not provisioned, locked, keystore
  error with retry.
- Rotation reuses the existing authorized wizard (`key_rotation` → `VaultKeyRotationManager` with
  fresh biometric re-authentication); no second rotation engine was created. Key Forge gained a
  "Key details of the vault key" entry so the approved Key Forge page can reach it.

## Verification

| Check | Result |
|---|---|
| JVM | **200 tests, 0 failures** (data 93, security 90, app 17); new `KeyDetailsTest` 4 |
| Instrumented (itel S686LN, Android 15) | **12/12 PASS**, including `KeyDetailsDeviceTest.masterKeyMetadataComesFromTheRealKeystore` — the platform answers with the alias, AES, 256 bits, encrypt+decrypt purposes, a concrete protection class and no public key |
| Lint / build | lint 0 errors; APK built and installed, cold start alive, crash buffer empty |
| APK | clean build **19,712,121 bytes**, SHA-256 `99fd9daa219d2f1bd4ab7c52dc84a8f9c7b118f1538db6674f9e769f03bfb6de`; lint 0 errors |

## Not verified / limits

The screen's layout, RTL wrapping, the disabled action states and the rotation hand-off are
**DEVICE_UNVERIFIED** (they need an unlocked session, i.e. the owner's finger). The protection
class is reported by the platform for one handset only and is not an attestation. No audit, no
release claim.
