# KNOUX Crypt — Native Android Status Ledger (current HEAD)

Generated for hardening branch. Source baseline: c219849. TASK 39 repair implementation: 7c0c8c0 (see `39_LOCAL_SECURITY_ACTIVITY/EVIDENCE.md`). TASK 05 implementation: ab0424a. TASK 07 implementation: 6ebcf96. CI/source-guard repair: fd54f27. TASK 29 implementation branch: 0997afd (`feature/android-task29-vault-collections-20261102`, base main `619a1e3`). This ledger does not delete historical reports.

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
| 29 | Vault Collections | vault_collections | IMPLEMENTED | SOURCE_IMPLEMENTED (MERGED `6b3ef20`, CI green on PR SHA `a92a15b` run 41454942483 and on main run 41456728652) | JVM_TESTED (8 service tests) | encrypted labels + membership on media record; no Room migration; BLOCKED_DEVICE (no emulator/system image) |
| 30 | Document Viewer | (none) | DESIGN_ONLY | PLANNED | none | depends 04,05 |
| 31 | Vault Key Rotation | key_rotation | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 32 | Package Inspector | package_inspector | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 33 | Android Autofill | (none) | DESIGN_ONLY | PLANNED | none | |
| 34 | Offline Security Advisor | (none) | DESIGN_ONLY | PLANNED | none | |
| 35 | Multi-Device Pairing | (none) | DESIGN_ONLY | PLANNED | none | |
| 36 | Password Strength Audit | password_audit | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 37 | Argon2id Key Derivation | key_derivation | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 38 | Signature Studio | signature_studio | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | digest mode 2 |
| 39 | Local Security Activity | security_activity | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED; migration tests compiled not run | real producers + Room Flow; device unverified; see 39 evidence |
| 40 | Transfer Wizard | (none) | DESIGN_ONLY | PLANNED | none | |
| 41 | Expiring Secret Capsule | (none) | DESIGN_ONLY | PLANNED | none | |
| 42 | Session Privacy | session_privacy | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | shared PrivacyScreen; settings enforced in MainActivity |
| 43 | File Integrity | file_integrity | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 44 | Secure Clipboard | secure_clipboard | IMPLEMENTED | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 45 | Final Integration | n/a | n/a | SOURCE_IMPLEMENTED | JVM_TESTED | |
| 46 | (reserved) | n/a | n/a | PLANNED | none | |

Device evidence: none on current SHA (ADB empty, no emulator/system image installed). Visual evidence: not re-run this pass. Security review: not independently performed.

TASK 29 integration note: merged to `main` as `6b3ef20` via PR #41, with Android CI green on the
PR SHA (`a92a15b`, run 41454942483) and on the merged main SHA (run 41456728652). Post-merge
cleanup was limited to this session's own regenerable Gradle build output — 193 MiB reclaimed on
D: (3,824,013,312 → 4,026,585,088 bytes free). No worktree, branch, stash, archive, dependency
cache or visual reference was deleted; the K: preservation snapshots, the two Traycer recovery
archives and the untracked unique assets in `D:\KnouxCrypt` remain in place.

Follow-up to TASK 39 (commits ab0424a, fd54f27): generic `DATA_*` audit writes are suppressed
for the `media` and `note_draft` kinds so Shadow Vault imports and notes autosave cannot
evict real security events from the bounded 500-event timeline; media keeps its dedicated
`MEDIA_*` events. The Android CI workflow now accepts SDK licenses non-interactively and
`scripts/check-source.py` checks the current invariants (camera-only manifest, biometric
session gate, lock cleanup, AEAD framing) instead of a removed MainActivity path.

Integration record (2026-11-02): the Android hardening lane was merged into `main` as
`f586e80` (production tip `a5df8d4`), then `origin/main` desktop work (PRs #35, #36) was
merged in as `24a75ca` and pushed. File overlap between the lanes is zero
(`native-android/**`, `missions/fullstack-android/**`, `.github/workflows/android.yml` only).
**`Android Native CI` run `41392808824` on `main` = success**: checkout, JDK 17, SDK setup,
source boundary check, Kotlin compile (incl. `:core:data:compileDebugAndroidTestKotlin`),
JVM tests, Android lint, debug APK, SHA-256, evidence upload. Instrumented tests remain
compiled-but-not-executed: no device/emulator in CI or on this host. The orphaned `workspace`
gitlink was already removed by the desktop lane on `main`; it is not present in this tree.
