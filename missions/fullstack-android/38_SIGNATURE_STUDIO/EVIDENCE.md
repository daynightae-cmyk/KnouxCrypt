# EVIDENCE — TASK 38 — Signature Studio

Date: 2026-11-01 · Branch `android/native-implementation-20261031` · Baseline `db66e95`
Classification: **SOURCE_IMPLEMENTED + JVM_TESTED — DEVICE_UNVERIFIED / AUDIT_PENDING**

## What works

**No second engine.** The studio is a new service (`SignatureStudio`, `:core:data`) built on the
TASK 19 pieces: `SigningService` decides Keystore versus encrypted software key and reports the
origin, and `DigitalSignatureService` performs the signing and verification. A file signed here
verifies under exactly the same rules as a text signed on the TASK 19 screen.

**Versioned packages** (`SignaturePackage`, `:core:security`): `KSG1` detached and `KSA1` attached
share one framing — magic, version, algorithm id, **digest mode**, content kind, then the SPKI, the
signature, a metadata block and, for attached packages, the document itself. Every length is
validated against the bytes actually present before anything is allocated, the kind byte must agree
with the magic, and a detached package with trailing bytes is refused.

**Digest mode is explicit, and it was chosen because a test caught a real weakness.** The first
draft signed only `SHA-256(content)`, and the JVM test that flipped a byte inside the *metadata*
block still reported `VALID`: the file name, recorded size and recorded digest could be rewritten
without touching the signature. Mode 2 fixes that — the signature covers
`SHA-256(content) ‖ SHA-256(metadata)` — while mode 1 stays readable so bytes written under the
weaker rule are never silently reinterpreted. The regression test now asserts that editing the
metadata breaks the signature, and that a mode-1 package is not accepted as proof for a mode-2
binding.

**Validity and identity stay separate.** A report answers two questions and never merges them:
`signatureValid` (the bytes authenticate under the embedded key) and `signerRecognised` (that key is
one this vault stores under a name). A valid signature from a stranger is shown as *valid, not
stored here*, with a "Remember this signer key" action that stores it as a TASK 28 public-key record
and re-runs the check. The screen repeats the boundary in both languages: a signature confirms
possession of a key, not the real-world identity of its owner.

**UI** (`SignatureStudioScreen`, route `signature_studio`) follows the reference panel order:
Signature operation with a live status pill (awaiting / working / signed / checked / rejected /
cancelled / unsupported / locked), Document card with the Android document picker, Signing
configuration showing the **real** algorithm and the key origin, Signature output toggle
(detached `.ksig` / attached `.ksa`), Operation receipt with the SHA-256, signer fingerprint,
package size and key origin, and the primary action. The attached mode states plainly that the
document travels beside the signature unencrypted.

**Persistence and platform.** Each signing run writes a `SecretKinds.SIGNATURE` vault record —
label, algorithm, public key, signature, file digest — and never the document. Files are read
through SAF with a streaming size guard (over 32 MiB is refused, not truncated), written back
through `CreateDocument`, and every in-memory copy of a document is zeroed and dropped when the
session locks.

**TASK 19 wording corrected.** Its "Verify an external signature" panel implied third-party
interop. KNOUX signs the SHA-256 *digest* of the content, so a standard signature over the raw text
will not verify there. The panel is now "Verify a signature made here" and says why.

## Deliberate deviations from the reference

- The mock shows `Ed25519`. This build signs with ECDSA P-256 (RSA when the platform offers no EC),
  and the screen shows the algorithm actually in use rather than the mocked one.
- The mock's primary button reads "Configure Signing"; here the primary action performs the signing,
  because a button that opens nothing would be a dead control.

## Verification

| Check | Result |
|---|---|
| JVM | **265 tests, 0 failures** (security 139, data 109, app 17); new `SignaturePackageTest` 10, `SignatureStudioTest` 8 |
| Negative paths (JVM) | rewritten metadata block · content substitution · mode-1 package presented as mode-2 · truncated at each field · exaggerated field length (4000 and 65535) · kind/magic contradiction · trailing bytes · unsupported version, algorithm id and digest mode · MD5 refused · attached without content · oversized metadata · detached package with no document · oversized file · locked vault writes nothing |
| Instrumented | `SignatureStudioDeviceTest` **written, NOT RUN** — no handset was attached during this pass |
| Lint | 0 errors |
| APK | clean build **19,995,615 bytes**, SHA-256 `687ed540d878146d48eef3fae38fc51c1d4a2fe64c124a39e0c1fd7183d3fca9`; a second `:app:clean :app:assembleDebug` of the same tree reproduced the identical size and hash |
| Build note | the first `:app:clean` after `:app:lintDebug` failed to delete `lint-cache/migrated-jars` while the daemon held them; the daemon was stopped and the clean build re-run. No source or evidence file was affected |

## Not verified / limits

- **The studio has never run on a device.** The signing path on the itel S686LN is proven for TASK 19
  (software-key fallback, `VAULT_SOFTWARE` origin), but the package framing, SAF round-trip, file
  picker behaviour and the two-line verdict rendering are DEVICE_UNVERIFIED.
- The itel handset still has no asymmetric AndroidKeystore support, so on that device signatures are
  made with the encrypted **software** key and the UI labels them as such. A Keystore-backed origin
  is only reported when `SigningService` actually obtained one.
- Interoperability with external signature tools is **not** claimed: the digest convention is
  KNOUX's own, recorded as digest mode 2 in the package, and the TASK 19 screen now says so.
- A 32 MiB ceiling applies to signing and verifying in memory; larger files are refused with a typed
  message. Streaming signatures are not implemented.
- Recognition means "this vault holds a key with this fingerprint". It is not a trust model, there is
  no certificate chain, no revocation and no Web of Trust, and no independent audit has been done.
