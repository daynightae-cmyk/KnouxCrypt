# EVIDENCE — TASK 20 — Certificate Inspector

Date: 2026-11-01 · Branch `android/native-implementation-20261031` · Baseline `7c705be`
Classification: **SOURCE_IMPLEMENTED + JVM_TESTED — DEVICE_UNVERIFIED / AUDIT_PENDING**

## What works

**Real platform APIs, no new crypto.** `CertificateInspector` (`:core:security`) uses
`CertificateFactory("X.509")`, `X509Certificate`, `PKIXParameters` and `CertPathValidator("PKIX")` —
the established Java/Android security APIs named in the mission. Nothing here implements a parser or
a verifier of its own.

**Five answers, kept apart.** The inspector reports separately:

| Question | Answered by | Never implied by |
|---|---|---|
| Is this a certificate? | `ParseOutcome` (EMPTY / TOO_LARGE / NOT_A_CERTIFICATE / MALFORMED_ASN1 / UNSUPPORTED_TYPE) | anything else |
| Did the issuer really sign it? | `verifySignature(cert, issuerKey)` | trust |
| Is it inside its validity window? | `validityAt(nowMillis)` with an injected clock | chain result |
| Does a path reach a named anchor? | `ChainOutcome.Trusted(anchorSubject, depth, subjects)` / `Failed(reason)` | identity |
| Does it name the host you asked about? | `matchesHostname()` over the SANs, RFC 6125 leftmost-wildcard rule | chain result |

A self-signed, a parsed, or a CA certificate is never reported as trusted. Trust only exists
relative to an explicitly chosen anchor set, and the policy used is part of the answer:
`None`, `StoredAnchors` (certificates this person marked) or `PlatformStore` (the handset's own
roots, named as such). **Revocation is never checked** — this build holds no network permission —
and `revocationChecked = false` is surfaced in the UI text in both languages rather than being left
for the user to assume.

**Import is bounded and unforgiving.** 256 KiB ceiling, PEM *or* DER, and a PEM containing more than
one certificate block is refused as a bundle instead of silently taking the first. Every failure is
typed, and the UI maps each one to its own message.

**Stored as real encrypted records.** `CertificateVaultService` (`:core:data`) persists the original
DER inside an encrypted vault record (`SecretKinds.CERTIFICATE`) with the label, subject, issuer,
fingerprint, validity window, CA flag and an `isAnchor` bit that starts false and is only ever set by
an explicit user action. Re-inspection always re-reads the stored bytes, so a later assessment sees
the certificate exactly as imported. Duplicate imports are matched by fingerprint, not by label.

**Chain building walks the stored pool** through issuer links, bounded by `MAX_CHAIN_CERTS = 8`; a
missing link is reported as `UNKNOWN_ISSUER` rather than patched with a guess.

## Findings that changed the design

- **The anchor cap had to move from 32 to 256.** A test that asked "does the device trust store
  accept my test root?" came back `TOO_MANY_INPUTS` instead of `UNKNOWN_ISSUER`, because a real
  platform store ships roughly 140 roots. Capping below that would have made the honest answer
  impossible to give; the bound still refuses an unbounded caller-supplied list.
- **PKIX reports "no trust anchor" through the generic `UNSPECIFIED` reason**, so mapping by reason
  alone labelled an unknown CA as `PATH_TOO_LONG` — a wrong diagnosis about the user's own
  certificate. The reason mapping now reads the validator message first.

## Verification

| Check | Result |
|---|---|
| JVM | **285 tests, 0 failures** (security 152, data 116, app 17); new `CertificateInspectorTest` 13, `CertificateVaultServiceTest` 7 |
| Fixtures | six real X.509 certificates generated once with the JDK's own `keytool`: root CA (RSA-2048, `keyCertSign`), ECDSA P-384 intermediate with `pathlen:0`, leaf with DNS/IP/email SANs and EKU, self-signed non-CA leaf, an unrelated root, and a leaf signed by that unrelated root. Expiry is tested by injecting the clock, so nothing rots |
| Negative paths (JVM) | empty · oversized · non-certificate · truncated DER · PEM bundle · base64 that is not DER · malformed ASN.1 · unknown CA · no anchors · self-signed without an anchor · expired at a future clock · not-yet-valid at a past clock · chain longer than the bound · wildcard below the leftmost label refused · host suffix trickery refused · signature verified against the wrong issuer |
| Instrumented | `CertificateInspectorDeviceTest` **written, NOT RUN** — no handset attached during this pass. Android's `CertPathValidator` provider is *not* the desktop JDK's, so this is the single most valuable unverified item in this mission |
| Lint | 0 errors |
| APK | clean build **20,093,919 bytes**, SHA-256 `b88253f38c4e763d230475a21f4a472ced55275b19a3042de0e1ed0c8993dc83` |

## Not verified / limits

- The screen has never rendered on a device: layout, RTL, the fingerprint reveal, the SAF picker and
  the anchor toggles are **DEVICE_UNVERIFIED**. Inspection works while locked; storing and anchoring
  require an unlocked session, which needs the owner's fingerprint.
- Only the extensions an inspector needs are decoded (basic constraints, key usage, EKU, SAN, SKI,
  AKI, CRL distribution points, AIA). Name constraints, policy mappings, QC statements and custom OIDs
  are counted and shown as OIDs, not interpreted.
- No OCSP, no CRL fetch, no transparency logs, no certificate-transparency check, no network at all.
  "Not revoked" is never said, because it is never known.
- The platform trust store is the handset's, and its contents are not auditable from here; results
  obtained through it are labelled as such rather than presented as the app's own judgement.
- No independent security review. **AUDIT_PENDING.**
