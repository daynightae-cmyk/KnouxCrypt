# KNOUX CRYPT — MASTER SERVICE CATALOG

> **Planning matrix — NOT a statement of implementation.** All services below are PLANNED in the Android product. Desktop legacy features are separate and unverified. Priority P0 = foundational; P1 = core extension; P2 = after core review; P3 = advanced optional research/provider-dependent.

Each catalog card must expose `platformCapability`, `permissionNeeds`, `requiresNetwork`, `providerReady`, `realTestEvidence`, and `displayStatus`. `displayStatus` cannot become ACTIVE or VERIFIED without tested working implementation. No phantom clickable tools.

## Local Vault & Encryption

| Service | Priority | Missions | Conditions | Android status |
|---|---|---|---|---|
| File encrypt/decrypt AES-GCM | P0 | 08 | Android SAF + AEAD | PLANNED |
| Authenticated streaming file packages | P0 | 04/08/29 | vetted stream design | PLANNED |
| Secure folder/collection organization | P1 | 07/08 | encrypted metadata | PLANNED |
| Media photo vault | P1 | 09 | Photo Picker | PLANNED |
| Video vault/playback | P1 | 09 | secure temporary stream | PLANNED |
| Audio vault/playback | P1 | 09 | secure temporary stream | PLANNED |
| Encrypted text clipboard utility | P1 | 12 | explicit clipboard warning | PLANNED |
| Secure notes | P1 | 10 | per-note encryption | PLANNED |
| Private journal | P1 | 10 | encrypt autosaves | PLANNED |
| Password and credential vault | P1 | 11 | Autofill after audit | PLANNED |
| Password/passphrase generator | P1 | 11 | CSPRNG | PLANNED |
| Safe encrypted archive | P2 | 32 | vetted parser/quotas | PLANNED |
| Cross-platform encrypted portable format | P2 | 27 | authenticated versioned format | PLANNED |
| Large file resumable protection | P1 | 29 | nonce-safe atomic recovery | PLANNED |
| Encrypted temporary document preview | P1 | 08 | no plaintext residue | PLANNED |
| Metadata stripping on export | P1 | 09 | opt-in user consent | PLANNED |

## Cryptography Toolkit

| Service | Priority | Missions | Conditions | Android status |
|---|---|---|---|---|
| SHA-256/SHA-512 hashes | P1 | 12 | platform reviewed | PLANNED |
| BLAKE3 hash | P1 | 12 | reviewed dependency | PLANNED |
| HMAC-SHA-256 verification | P1 | 12 | constant-time compare | PLANNED |
| AES-256-GCM message encrypt | P0 | 04/12 | unique nonces | PLANNED |
| XChaCha20-Poly1305 (optional) | P2 | 04 | vetted library first | PLANNED |
| Digital signing | P1 | 18 | Ed25519/ECDSA provider | PLANNED |
| Signature verification | P1 | 18 | public key verification | PLANNED |
| Certificate viewer | P1 | 18 | X.509 parse limits | PLANNED |
| PEM/DER public key reader | P1 | 18 | strict parser | PLANNED |
| Base64 encode/decode | P1 | 12 | encoding NOT crypto | PLANNED |
| Hex encode/decode | P1 | 12 | encoding NOT crypto | PLANNED |
| Random bytes generator | P1 | 12 | CSPRNG only | PLANNED |
| Integrity checksum comparison | P1 | 12 | treat source identity correctly | PLANNED |
| Key fingerprint QR display | P1 | 18 | fake test fixtures only | PLANNED |
| OpenPGP compatibility | P3 | 33 | interoperability and licensing | PLANNED |
| Post-quantum ML-KEM research | P3 | 34 | not production by default | PLANNED |
| Post-quantum ML-DSA research | P3 | 34 | no quantum-proof claims | PLANNED |

## Keys Identity & Recovery

| Service | Priority | Missions | Conditions | Android status |
|---|---|---|---|---|
| Android Keystore-backed wrapping | P0 | 05 | hardware check | PLANNED |
| Device credential + biometric unlock | P0 | 06 | BiometricPrompt | PLANNED |
| Biometric re-enrollment behavior | P0 | 06 | document key invalidation | PLANNED |
| Separate app auto-lock policy | P0 | 06 | actual gate | PLANNED |
| Key rotation | P0 | 05 | resumable rewrap | PLANNED |
| Encrypted local backup | P0 | 14 | restore test | PLANNED |
| Recovery encrypted export | P0 | 14 | password-derived wrapper | PLANNED |
| Fresh device recovery drill | P0 | 14 | on another device | PLANNED |
| TOTP authenticator | P1 | 15 | RFC 6238 | PLANNED |
| HOTP authenticator | P1 | 15 | RFC 4226 | PLANNED |
| OTP QR import | P1 | 15 | otpauth URI | PLANNED |
| OTP migration import | P2 | 15 | only supported source formats | PLANNED |
| Passkey / Credential Manager readiness | P2 | 22 | separate user account product | PLANNED |
| FIDO2 hardware key workflows | P2 | 22 | device support required | PLANNED |
| NFC/USB token adapters | P2 | 22 | hardware dependency | PLANNED |

## Sharing & Connectivity

| Service | Priority | Missions | Conditions | Android status |
|---|---|---|---|---|
| Ciphertext-only Android ShareSheet | P1 | 13 | explicit user transfer | PLANNED |
| Encrypted file package recipient exchange | P1 | 13 | public key verification | PLANNED |
| Local QR secret delivery | P2 | 13 | payload limit and verification | PLANNED |
| Local P2P encrypted transfer | P2 | 17 | explicit two-peer consent | PLANNED |
| Encrypted 1:1 messenger | P2 | 16 | reviewed protocol/server | PLANNED |
| Encrypted messaging groups | P3 | 16 | independent protocol review | PLANNED |
| Ciphertext-only cloud backup | P3 | 31 | separate signed-in consent | PLANNED |
| Multi-device key exchange | P3 | 31 | device pairing | PLANNED |
| Optional encrypted email PGP | P3 | 33 | no metadata anonymity | PLANNED |
| VPN tunnel adapter | P3 | 21 | real provider + Android consent | PLANNED |

## Privacy & Security Tools

| Service | Priority | Missions | Conditions | Android status |
|---|---|---|---|---|
| Local app permissions viewer | P1 | 19 | Android-supported permissions | PLANNED |
| Notification privacy | P1 | 19 | real settings | PLANNED |
| Screen capture reduction | P1 | 19 | OS limitations | PLANNED |
| Clipboard hygiene | P1 | 19 | platform limitations | PLANNED |
| Security patch status | P1 | 20 | OS API evidence | PLANNED |
| Device posture advisory | P1 | 20 | no universal intrusion detection | PLANNED |
| Root / integrity signal (imperfect) | P2 | 20 | false positive warning | PLANNED |
| Network endpoint TLS diagnosis | P2 | 20 | explicit target | PLANNED |
| Metadata safety before sharing | P1 | 09/19 | consent and preview | PLANNED |
| Privacy dashboard data inventory | P1 | 19 | local only | PLANNED |
| Offline-first advisor | P2 | 23 | no secret ingestion | PLANNED |
| Security checklist and recovery guide | P1 | 20 | non-invasive | PLANNED |

## Foundations & Quality

| Service | Priority | Missions | Conditions | Android status |
|---|---|---|---|---|
| Native Android Kotlin + Compose | P0 | 02 | new android module | PLANNED |
| Bilingual Arabic/English | P0 | 28 | RTL/LTR | PLANNED |
| TalkBack and reduced motion | P0 | 28 | a11y verified | PLANNED |
| Cinematic splash entry | P0 | 25 | no long blocking | PLANNED |
| Vault Home Command Hub | P0 | 26 | capability registry | PLANNED |
| Per-service unique card gestures | P0 | 24/26 | interactive native UI | PLANNED |
| OWASP MASVS traceability | P0 | 03/30 | real negative tests | PLANNED |
| Signed Play release AAB | P0 | 30 | owner approval | PLANNED |
| Dependency security and SBOM | P0 | 30 | real scan evidence | PLANNED |
| Application integrity/rollback safety | P0 | 35 | reviewed release process | PLANNED |

## Coverage and honest limitations

Catalog entries: **80**. This is a broad prioritized catalog, not literally every cryptographic method on earth; new services require a security review and capability proof. Unsupported Android system-disk/bootloader encryption, Windows BitLocker on Android, covert surveillance, guaranteed malware detection, guaranteed wipe of flash blocks and claims of universal anonymity are **NOT OFFERED**.

Security-critical core launch path: **local auth → new key hierarchy → authenticated file encrypt → verified decrypt → backup → fresh-device recovery**. The Play Store claim is no stronger than that tested chain. Other catalog cards remain disabled until their own missions are independently verified.

## Display rules for service cards
- ACTIVE only when real provider passes runtime capability checks; TESTED and AUDITED have separate evidence, not interchangeable.
- PLANNED cards show roadmap text and no fake encrypt button.
- Unsupported hardware/provider cards show dependency and user-friendly fallback.
- Distinct UI per family, yet consistent colors and nav; no proprietary copied logos.
- All data remains local unless user expressly opts into a network feature after a permission and privacy review.

## Source standards
- https://mas.owasp.org/MASVS/
- https://developer.android.com/privacy-and-security/keystore
- https://support.google.com/googleplay/android-developer/answer/11926878
