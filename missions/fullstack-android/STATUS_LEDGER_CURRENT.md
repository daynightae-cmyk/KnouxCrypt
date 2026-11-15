# KNOUX Crypt — Native Android Status Ledger (main reconciliation 2026-11-15)

Generated for hardening branch. Source baseline: c219849. TASK 39 repair implementation: 7c0c8c0 (see `39_LOCAL_SECURITY_ACTIVITY/EVIDENCE.md`). TASK 05 implementation: ab0424a. TASK 07 implementation: 6ebcf96. CI/source-guard repair: fd54f27. This ledger does not delete historical reports.

Status vocabulary: PLANNED, DESIGN_ONLY, BLOCKED, SOURCE_IMPLEMENTED, JVM_TESTED, DEVICE_TESTED, VISUAL_VERIFIED, SECURITY_REVIEWED, RELEASE_READY, RELEASED.

| Task | Feature | Catalog route | Catalog status | Source status | Tests | Notes |
|---|---|---|---|---|---|---|
| 00 | Android Foundation | n/a | n/a | SOURCE_IMPLEMENTED | JVM_TESTED | foundation |
| 01 | Splash Entry | splash | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 02 | Secure Access Login | access | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | biometric |
| 03 | Home | home | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 04 | File Cipher | file_cipher | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | KNF1/KNF2 |
| 05 | Shadow Vault | shadow_vault (VAULT) | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED (7 service tests) | KNF2 media + KNC2 metadata + encrypted thumbs; authenticated streaming; device/visual NOT tested |
| 06 | Secure Notes | notes | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | KNC records |
| 07 | Notes Editor | notes | (via 06) | SOURCE_IMPLEMENTED | JVM_TESTED (5 service tests) | encrypted autosave, bounded history, undo, conflicts, recovery; device NOT tested |
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
| 29 | Vault Collections | vault_collections | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | Implemented 0997afd; current-main device/visual verification pending |
| 30 | Document Viewer | document_viewer | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | Implemented e144b18; current-main device/visual verification pending |
| 31 | Vault Key Rotation | key_rotation | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 32 | Package Inspector | package_inspector | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 33 | Android Autofill | autofill | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | Implemented 981842c; Android system integration needs device verification |
| 34 | Offline Security Advisor | security_advisor | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | Implemented 31ca1cc; device/visual verification pending |
| 35 | Multi-Device Pairing | (none) | DESIGN_ONLY | PLANNED | none | |
| 36 | Password Strength Audit | password_audit | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 37 | Argon2id Key Derivation | key_derivation | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 38 | Signature Studio | signature_studio | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | digest mode 2 |
| 39 | Local Security Activity | security_activity | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED; migration tests compiled not run | real producers + Room Flow; device unverified; see 39 evidence |
| 40 | Transfer Wizard | (none) | DESIGN_ONLY | PLANNED | none | |
| 41 | Expiring Secret Capsule | secret_capsule | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | Implemented 2ada8b4; expiry behavior needs device verification |
| 42 | Session Privacy | session_privacy | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | shared PrivacyScreen; settings enforced in MainActivity |
| 43 | File Integrity | file_integrity | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 44 | Secure Clipboard | secure_clipboard | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 45 | Final Integration | n/a | n/a | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 46 | (reserved) | n/a | n/a | PLANNED | none | |

Device evidence: none on current SHA (ADB empty, no emulator/system image installed). Visual evidence: not re-run this pass. Security review: not independently performed.

Follow-up to TASK 39 (commits ab0424a, fd54f27): generic `DATA_*` audit writes are suppressed
for the `media` and `note_draft` kinds so Shadow Vault imports and notes autosave cannot
evict real security events from the bounded 500-event timeline; media keeps its dedicated
`MEDIA_*` events. The Android CI workflow now accepts SDK licenses non-interactively and
`scripts/check-source.py` checks the current invariants (camera-only manifest, biometric
session gate, lock cleanup, AEAD framing) instead of a removed MainActivity path.

## 2026-11-15 main source reconciliation

Tasks 29, 30, 33, 34, and 41 have implementations and catalog/navigation routes on main at pre-import HEAD 927f60168030162ec74aa50e113d3e600446e856. All five implementation commits are ancestors of that HEAD. JVM_TESTED reflects earlier test evidence, not a fresh JVM run in this documentation-only integration. No device, TalkBack, visual-parity, code-signing, or Play release verification is implied. Imported evidence directory from origin/production/android-hardening-20261102 at a5df8d47bc6888bc7e8ae3c2e4360fc20ac2daaf: 147 files (46 TASK.md, 39 EVIDENCE.md, 44 SCREEN_QA.md, 18 other supporting files). Preserve missing-evidence gaps rather than counting absent files as verified.
