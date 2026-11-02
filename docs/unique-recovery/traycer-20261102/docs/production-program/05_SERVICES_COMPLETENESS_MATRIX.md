# KNOUX CRYPT — Services Completeness Matrix

All 44 mission services are routed (`src/config/missionRoutes.js`) and render in AR+EN. Engines live under `electron/vault/`. Status values: `IMPLEMENTED_VERIFIED`, `IMPLEMENTED_UNVERIFIED`, `PARTIAL`, `BLOCKED_EXTERNAL`, `NOT_STARTED`.

| # | Service ID | Engine (electron/vault) | Status | Notes |
|---|---|---|---|---|
| 01 | SPLASH_ENTRY | main/preload/splash | IMPLEMENTED_VERIFIED | Packaged runtime verified. |
| 02 | SECURE_ACCESS_LOGIN | session.js, argon2.js | IMPLEMENTED_VERIFIED | Argon2id KDF; Windows Hello only if available. |
| 03 | HOME | App.jsx, shell | IMPLEMENTED_VERIFIED | 8 cards + Tools. |
| 04 | FILE_CIPHER | engine.js | IMPLEMENTED_VERIFIED | Streaming AEAD, typed PERMISSION_DENIED. |
| 05 | SHADOW_VAULT | store.js, session.js | IMPLEMENTED_VERIFIED | Owner-only DACL. |
| 06 | NOTES | (renderer + vault) | IMPLEMENTED_VERIFIED | Encrypted persistence. |
| 07 | NOTES_EDITOR | (renderer) | IMPLEMENTED_VERIFIED | Encrypted autosave. |
| 08 | PASSWORDS | (renderer + vault) | IMPLEMENTED_VERIFIED | Encrypted CRUD. |
| 09 | PASSWORD_DETAIL | (renderer) | IMPLEMENTED_VERIFIED | Reveal requires unlocked session. |
| 10 | AUTHENTICATOR | totp.js | IMPLEMENTED_VERIFIED | RFC 6238 vectors. |
| 11 | AUTH_IMPORT | (renderer) | IMPLEMENTED_VERIFIED | otpauth/QR import. |
| 12 | KEY_FORGE | (renderer + vault) | IMPLEMENTED_VERIFIED | Secure key gen. |
| 13 | KEY_DETAILS | (vault) | IMPLEMENTED_VERIFIED | No private leak. |
| 14 | PRIVACY | privacy.js | IMPLEMENTED_VERIFIED | Real local prefs. |
| 15 | BACKUP | backup.js | IMPLEMENTED_VERIFIED | Round-trip verified. |
| 16 | SECURE_SHARE | share.js | IMPLEMENTED_VERIFIED | Recipient-key + shared-secret. |
| 17 | HASH_INTEGRITY | (vault labs) | IMPLEMENTED_VERIFIED | SHA-256/512. |
| 18 | TEXT_CIPHER | (vault) | IMPLEMENTED_VERIFIED | Authenticated envelope. |
| 19 | SIGNATURE | (vault) | IMPLEMENTED_VERIFIED | Ed25519/RSA. |
| 20 | CERTIFICATE_INSPECTOR | (vault) | IMPLEMENTED_VERIFIED (parse) | Chain trust verification limited; honest status. |
| 21 | ARCHIVE | archive.js | IMPLEMENTED_VERIFIED | Path traversal/zip bomb guards. |
| 22 | LOCAL_TRANSFER | transfer.js | IMPLEMENTED_VERIFIED | Loopback only. |
| 23 | FINGERPRINT_VERIFY | (vault) | IMPLEMENTED_VERIFIED | SHA-256 of SPKI. |
| 24 | METADATA_CLEANER | metadata.js | IMPLEMENTED_VERIFIED | JPEG EXIF. |
| 25 | CLIPBOARD_GUARD | clipboard.js | IMPLEMENTED_VERIFIED | Consent-based. |
| 26 | SECURE_RANDOM | (vault labs) | IMPLEMENTED_VERIFIED | CSPRNG. |
| 27 | HMAC_AUTHENTICITY | (vault labs) | IMPLEMENTED_VERIFIED | Timing-safe verify. |
| 28 | PUBLIC_KEY_QR | (vault labs) | IMPLEMENTED_VERIFIED | QR gen/parse. |
| 29 | COLLECTIONS | collections.js | IMPLEMENTED_VERIFIED | Encrypted nested. |
| 30 | DOCUMENT_VIEWER | documentviewer.js | IMPLEMENTED_VERIFIED | Ephemeral plaintext, cleanup. |
| 31 | VAULT_KEY_ROTATION | rotation.js | IMPLEMENTED_VERIFIED | Rewrap/reencrypt + rollback. |
| 32 | PACKAGE_INSPECTOR | (vault) | IMPLEMENTED_VERIFIED | Header unauthenticated. |
| 33 | AUTOFILL | autofill.js | IMPLEMENTED_VERIFIED (desktop-adapted) | No native Autofill claim. |
| 34 | OFFLINE_ADVISOR | (vault posture) | IMPLEMENTED_VERIFIED | Deterministic rules. |
| 35 | DEVICE_PAIRING | pairing.js | IMPLEMENTED_VERIFIED | X25519 + phrase. |
| 36 | PASSWORD_AUDIT | passwordaudit.js | IMPLEMENTED_VERIFIED | Offline strength. |
| 37 | KEY_DERIVATION | argon2.js | IMPLEMENTED_VERIFIED | Tested vectors. |
| 38 | SIGNATURE_STUDIO | (vault inspect) | IMPLEMENTED_VERIFIED | Detached sigs. |
| 39 | SECURITY_ACTIVITY | journal.js | IMPLEMENTED_VERIFIED | Tamper-evident chain. |
| 40 | TRANSFER_WIZARD | wizard.js | IMPLEMENTED_VERIFIED | Loopback self-test. |
| 41 | SECRET_CAPSULE | capsule.js | IMPLEMENTED_VERIFIED | remoteRevocable=false honest. |
| 42 | SESSION_PRIVACY | (vault) | IMPLEMENTED_VERIFIED | Idle lock. |
| 43 | FILE_INTEGRITY | integrity.js | IMPLEMENTED_VERIFIED | Baseline/compare. |
| 44 | SECURE_CLIPBOARD | (vault clipboard) | IMPLEMENTED_VERIFIED | Clear-on-timer. |

## External/production gaps (not service-logic gaps)

- Code signing (all artifacts unsigned).
- CI not running on normal PRs.
- No independent audit.
- macOS/Linux untested.
- ia32 not built.
- electron-updater unverified.
- Inter font from googleapis.
