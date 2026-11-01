# KNOUX Crypt — Native Android Status Ledger (current HEAD)

Generated for hardening branch. Source baseline: c219849. This ledger does not delete historical reports.

Status vocabulary: PLANNED, DESIGN_ONLY, BLOCKED, SOURCE_IMPLEMENTED, JVM_TESTED, DEVICE_TESTED, VISUAL_VERIFIED, SECURITY_REVIEWED, RELEASE_READY, RELEASED.

| Task | Feature | Catalog route | Catalog status | Source status | Tests | Notes |
|---|---|---|---|---|---|---|
| 00 | Android Foundation | n/a | n/a | SOURCE_IMPLEMENTED | JVM_TESTED | foundation |
| 01 | Splash Entry | splash | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 02 | Secure Access Login | access | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | biometric |
| 03 | Home | home | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 04 | File Cipher | file_cipher | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | KNF1/KNF2 |
| 05 | Shadow Vault | (none) | DESIGN_ONLY | PLANNED | none | needs media impl |
| 06 | Secure Notes | notes | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | KNC records |
| 07 | Notes Editor | notes | (via 06) | PLANNED | none | enhancement pending |
| 08 | Passwords | passwords | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 09 | Password Detail | password_detail | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 10 | Authenticator | authenticator | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | TOTP |
| 11 | Auth Import | auth_import | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | QR migration |
| 12 | Key Forge | key_forge | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 13 | Key Details | key_details | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 14 | Privacy | privacy | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 15 | Backup/Recovery | recovery | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | SAF |
| 16 | Secure Share | secure_share | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | two-device unverified |
| 17 | Hash & Integrity | hash | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 18 | Text Cipher | text_cipher | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | KNP2 |
| 19 | Digital Signature | signature | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 20 | Certificate Inspector | certificate_inspector | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | no revocation |
| 21 | Encrypted Archive | archive | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 22 | Local Transfer | local_transfer | BLOCKED | SOURCE_IMPLEMENTED (protocol) | JVM_TESTED | no transport |
| 23 | Fingerprint Verify | fingerprint_verify | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 24 | Metadata Cleaner | metadata_cleaner | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | JPEG/TIFF only |
| 25 | Clipboard Guard | clipboard_guard | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 26 | Secure Random | random | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 27 | HMAC Authenticity | hmac | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 28 | Public Key QR | public_key_qr | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 29 | Vault Collections | (none) | DESIGN_ONLY | PLANNED | none | depends 05 |
| 30 | Document Viewer | (none) | DESIGN_ONLY | PLANNED | none | depends 04,05 |
| 31 | Vault Key Rotation | key_rotation | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 32 | Package Inspector | package_inspector | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 33 | Android Autofill | (none) | DESIGN_ONLY | PLANNED | none | |
| 34 | Offline Security Advisor | (none) | DESIGN_ONLY | PLANNED | none | |
| 35 | Multi-Device Pairing | (none) | DESIGN_ONLY | PLANNED | none | |
| 36 | Password Strength Audit | password_audit | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 37 | Argon2id Key Derivation | key_derivation | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 38 | Signature Studio | signature_studio | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | digest mode 2 |
| 39 | Local Security Activity | security_activity | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | added this pass |
| 40 | Transfer Wizard | (none) | DESIGN_ONLY | PLANNED | none | |
| 41 | Expiring Secret Capsule | (none) | DESIGN_ONLY | PLANNED | none | |
| 42 | Session Privacy | session_privacy | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | catalog fixed this pass |
| 43 | File Integrity | file_integrity | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 44 | Secure Clipboard | secure_clipboard | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 45 | Final Integration | n/a | n/a | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 46 | (reserved) | n/a | n/a | PLANNED | none | |

Device evidence: none on current SHA (ADB empty). Visual evidence: not re-run this pass. Security review: not independently performed.
