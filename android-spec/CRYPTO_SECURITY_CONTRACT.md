# CRYPTOGRAPHY SECURITY CONTRACT — REQUIRED FOR ALL FEATURES

**Status:** DESIGN ONLY. No claim of audited implementation.

1. **Primitives:** Use only reviewed/platform providers: AES-256-GCM with unique nonces and authenticated associated data; optional audited XChaCha20-Poly1305 only if vetted. No bespoke AES/Serpent/Twofish/cascade implementations or unauthenticated ECB/CBC legacy use for new items.
2. **Keying:** Android Keystore for non-exportable device key encryption keys when available, per-item data encryption keys, documented key wrapping. Device-specific hardware support/fallback must be probed not assumed.
3. **Recovery:** Device-only Keystore keys are not recovery. Offer user-driven encrypted recovery export using a memory-hard KDF (e.g. reviewed Argon2id integration with documented params) and real restore tests on a fresh device. No hidden escrow.
4. **File format:** Versioned authenticated envelope with size limits, random salt, nonce, KDF identity, algorithm and key ID. Use verified chunk framing for large files, integrity check at every step, final truncation detection and no nonce reuse after crashes.
5. **Authentication:** BiometricPrompt and OS credential, never custom fingerprint processing or bypassable UI-only gate. Pin challenge state to cryptographic key-use authorization where appropriate.
6. **Threat model:** Malware/rooted/compromised unlocked phone breaks some guarantees; no absolute protection. Clipboard, screenshot, accessibility, keyboard, app backups, URI exports and notification previews are explicit boundaries.
7. **No data loss:** Keep original plaintext source until user confirms separate deletion. Android flash deletion is not provably secure after writes; do not claim shredding physically removes bytes.
8. **Testing:** known-answer vectors, wrong-key, tampering, replay/downgrade, boundary lengths, corruption, interrupted writes, device reboot, lock, backup/restore and multi-device portability tests; independent review before marketing security claims.
9. **Crypto policy:** hash is not encryption; encoding is not encryption; signing is not identity proof; VPN is not anonymity; “expiry” cannot erase copied ciphertext.
10. **Privacy:** No secrets in logs/analytics/crash traces, no hidden external calls, least permission, signed release, security update and vulnerability report process.

Legacy `src/core/crypto/AESCipher.ts` performs independent block encryption and lacks authenticated-mode guarantees; it is forbidden for new Android production data. Record a separate archive-migration review if old format must be read.

Reference: https://mas.owasp.org/MASVS/ and https://developer.android.com/privacy-and-security/keystore
