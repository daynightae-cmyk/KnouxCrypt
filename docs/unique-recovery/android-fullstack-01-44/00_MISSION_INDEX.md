# KNOUX CRYPT | 44 ANDROID FULLSTACK MISSIONS

Order is visual-screen order. Dependencies may be implemented earlier but remain tracked here.

| # | Native feature | Priority | Core prerequisites |
|---|---|---|---|
| 01 | SPLASH_ENTRY | P0 | native foundation and brand assets |
| 02 | SECURE_ACCESS_LOGIN | P0 | Keystore, key hierarchy, recovery and lifecycle gates |
| 03 | HOME | P0 | native shell, capability registry and auth gate |
| 04 | FILE_CIPHER | P0 | core AEAD, Keyring, SAF, encrypted storage |
| 05 | SHADOW_VAULT | P1 | File Cipher, encrypted blobs and user auth |
| 06 | SECURE_NOTES | P1 | encrypted records and unlock gate |
| 07 | NOTES_EDITOR | P1 | Secure Notes and encrypted write journal |
| 08 | PASSWORDS | P1 | vault keyring and encrypted records |
| 09 | PASSWORD_DETAIL | P1 | Passwords and per-item auth policy |
| 10 | AUTHENTICATOR | P1 | secure TOTP seed storage, clock time |
| 11 | AUTH_IMPORT | P1 | Authenticator and QR parser |
| 12 | KEY_FORGE | P0 | Android Keystore capability and keyring |
| 13 | KEY_DETAILS | P1 | Key Forge and audited rotation contract |
| 14 | PRIVACY | P1 | permission and local device state inspectors |
| 15 | BACKUP | P0 | key hierarchy, recovery schema and encrypted blobs |
| 16 | SECURE_SHARE | P1 | verified encryption packages and recipient keys |
| 17 | HASH_INTEGRITY | P1 | streaming file reader |
| 18 | TEXT_CIPHER | P1 | AEAD and KDF vetted crypto providers |
| 19 | DIGITAL_SIGNATURE | P1 | Key Forge signing keys |
| 20 | CERTIFICATE_INSPECTOR | P1 | trusted parser and public key verification |
| 21 | ENCRYPTED_ARCHIVE | P2 | File Cipher and safe bounded archive reader |
| 22 | LOCAL_TRANSFER | P2 | Secure Share and paired trusted peer keys |
| 23 | FINGERPRINT_VERIFY | P1 | Key Forge and public trust model |
| 24 | METADATA_CLEANER | P1 | media SAF import and secure export |
| 25 | CLIPBOARD_GUARD | P1 | privacy settings and UI focus |
| 26 | SECURE_RANDOM | P1 | vetted cryptographic RNG provider |
| 27 | HMAC_AUTHENTICITY | P1 | key hierarchy and hash provider |
| 28 | PUBLIC_KEY_QR | P1 | Key Forge and fingerprint trust |
| 29 | VAULT_COLLECTIONS | P1 | Shadow Vault and encrypted metadata index |
| 30 | DOCUMENT_VIEWER | P1 | Shadow Vault and secure stream |
| 31 | VAULT_KEY_ROTATION | P0 | Keyring, Backup and transactional storage |
| 32 | CIPHERTEXT_PACKAGE_INSPECTOR | P1 | versioned envelope format and checksum |
| 33 | ANDROID_AUTOFILL | P2 | Password vault and explicit user consent |
| 34 | OFFLINE_SECURITY_ADVISOR | P2 | privacy facts and permissions evidence |
| 35 | MULTI_DEVICE_PAIRING | P3 | verified key exchange and portable recovery |
| 36 | PASSWORD_STRENGTH_AUDIT | P1 | Password vault after unlock |
| 37 | ARGON2ID_KEY_DERIVATION | P0 | trusted KDF integration and recovery policy |
| 38 | SIGNATURE_STUDIO | P1 | Key Forge, signatures and cert viewer |
| 39 | LOCAL_SECURITY_ACTIVITY | P1 | real auditable domain event emitters |
| 40 | TRANSFER_WIZARD | P2 | Local Transfer verified peer engine |
| 41 | EXPIRING_SECRET_CAPSULE | P2 | Secure Share package envelope |
| 42 | SESSION_PRIVACY_CONTROLS | P0 | Auth, device lifecycle and secure settings |
| 43 | FILE_INTEGRITY_TOOL | P1 | Hash Integrity and Ciphertext Inspector |
| 44 | SECURE_CLIPBOARD | P1 | Clipboard Guard and encrypted text utility |