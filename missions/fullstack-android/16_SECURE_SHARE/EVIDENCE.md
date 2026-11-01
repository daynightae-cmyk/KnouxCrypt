# EVIDENCE — TASK 16 — Secure Share

Date: 2026-11-01 · Branch `android/native-implementation-20261031` · Baseline `fc4ae7e`
Classification: **SOURCE_IMPLEMENTED + JVM_TESTED — DEVICE_UNVERIFIED / AUDIT_PENDING**

## What works

**Key layer — `RecipientKeys.kt` (`:core:security`).** Recipients are X25519 (RFC 7748) keys,
agreed with the Bouncy Castle implementation already shipped for Argon2id and stretched with
HKDF-SHA-256 (RFC 5869). Public keys are standard RFC 8410 SPKI, private identities are standard
PKCS#8, and a test parses our SPKI with the *JDK's own* XDH `KeyFactory` so the encoding is
checked against an independent implementation rather than only against ourselves. A signing key is
**refused by name**: `RecipientKey.fromSpki` rejects an EC or RSA SPKI with
`KeyKindRejectedException`, and a `knouxkey:v1:` (signing) QR is refused at import, so an ECDSA
key is never assumed to be usable for encryption. New share keys carry an explicit
`knouxkey:v2:x25519:<spki>#<label>` URI.

**Container — `SecureSharePackage.kt` (`:core:security`).** KSR1: versioned magic + kem/cipher ids,
a 16-byte random package id, a per-package HKDF salt, one encapsulation per recipient (fresh
ephemeral key pair, 32-byte wrapped content key, own GCM nonce), a clear authenticated header
(creation time, expiry label, declared length, chunk size) and an **encrypted metadata block**
(file name, type, sender label, note) so nothing identifying travels in the clear. One random CEK
encrypts payload and metadata in AES-256-GCM chunks; the header prefix is AAD on every wrap, the
header-so-far on the metadata, and the complete header plus chunk index and final flag on every
chunk. Nothing is returned before a tag verifies.

**Service — `ShareService.kt` (`:core:data`).** One X25519 sharing identity per installation,
created on first use and stored as a vault record encrypted by the device key; the record states
`origin = vault-software` because the tested handset's Keystore offers no asymmetric algorithm.
Recipients are stored encrypted and are **unusable for sealing until the full fingerprint has been
typed back and matched**. Sealing requires a live `VaultAccess`, adds the sender as an ordinary
extra recipient (so the sender can reopen their own package), and writes a receipt holding only
package id, sizes, timestamps, digest and recipient fingerprints. The cached private scalar is
dropped by the session's lock listener.

**UI — `SecureShareScreen.kt` (route `secure_share`, catalog IMPLEMENTED, unlock-required).**
Three panels over one ViewModel/StateFlow: **Send** (SAF file picker with real size/name, recipient
list with per-row verification state, expiry choice, Share Review card, Verify & Encrypt, then
Sharesheet or SAF export), **Receive** (SAF package picker → keyless header view → decrypt to a
user-chosen document → verdict), **Keys** (own fingerprint + QR of the v2 URI, add recipient by
text/QR image/camera, type-to-confirm verification dialog, delete, recent shares). Every outcome is
a typed bilingual `ShareError`/`ShareNotice`; nothing renders a raw platform string.

**Platform handoff.** A `FileProvider` scoped to `cache/shares/` only, non-exported, grants
read-once for the sealed file. Before the Sharesheet is opened the code re-reads the file's first
four bytes and **refuses to share anything that is not `KSR1`**, so plaintext can never leave
through an Intent. Sealing writes to a temp file that is deleted on cancel, on lock, on failure and
when the screen is destroyed; decryption likewise writes to a temp file and only copies to the
user's chosen destination after the whole package authenticated.

## Verification

| Check | Result |
|---|---|
| JVM | **247 tests, 0 failures** (security 129, data 101, app 17); new `RecipientKeysTest` 12, `SecureSharePackageTest` 15, `ShareServiceTest` 8 |
| Known answers | RFC 7748 §6.1 Alice/Bob scalars, public keys and shared secret; RFC 5869 A.1 HKDF-SHA-256 PRK and 42-byte OKM, cross-checked against a hand-written extract-then-expand using only `javax.crypto.Mac` |
| Negative paths (JVM) | wrong recipient · tampered payload chunk · tampered encapsulation · tampered metadata · **edited clear expiry field breaks authentication** · truncated header/payload · foreign container · expired label (metadata readable, payload not decrypted) · duplicate recipient · >8 recipients · oversized metadata · expiry before creation · EC/RSA key refused · `knouxkey:v1` refused · locked session cannot seal and leaves no cached scalar |
| Instrumented | `ShareDeviceTest` **written, NOT RUN** — no device was attached during this pass (`adb devices` empty). The X25519/HKDF/AES-GCM path is therefore proven on the host JVM only |
| Lint | 0 errors (`:app`, `:core:data`) |
| APK | clean build **19,930,079 bytes**, SHA-256 `c3d05d8863df3222c103a2de6bc72979814fa161a368977da9139604bae7a84d`; two independent `:app:clean :app:assembleDebug` runs produced **identical size and identical hash**, so the recorded artifact identity is reproducible on this machine |

## Not verified / limits

- **End-to-end with a real second device has not been performed.** No package has yet been sealed
  on one handset and opened on another, and the recipient-side QR has never been scanned by
  hardware. The claim is "recipient encryption and authentication verified in JVM tests", not
  "end-to-end sharing verified in use".
- Layout, Arabic RTL, tab switching, the verification dialog, camera scan, permission denial, the
  Sharesheet chooser and SAF round-trips are **DEVICE_UNVERIFIED**; the screen requires an unlocked
  session, which needs the owner's fingerprint.
- The identity key is a **software** key protected by the vault key, not hardware-backed, and the UI
  says so on the Keys panel. On a handset whose Keystore does offer asymmetric keys this build still
  uses the software path; that is a deliberate, stated limitation rather than a silent fallback.
- Expiry is a label enforced by this app when opening. It cannot revoke a copy already delivered,
  and the Send panel states that in both languages.
- The sender label inside a received package is what the other side typed; it is not proof of
  identity. The Receive panel says so.
- No independent security review has been done. KSR1 is a new container of this project's own
  design built from vetted primitives; **AUDIT_PENDING**.
