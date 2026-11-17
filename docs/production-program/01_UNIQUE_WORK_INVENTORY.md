# KNOUX CRYPT — Unique Work Inventory

**Baseline:** `main` @ `927f60168030162ec74aa50e113d3e600446e856`  
**Generated:** 2026-11-15

---

## Classification Legend
- **UNIQUE_NOT_INTEGRATED** — Exists only in source branch, not in main, valuable
- **INTEGRATED_VERIFIED** — In main, tested, CI passes
- **INTEGRATED_UNVERIFIED** — In main, but lacks device/runtime verification
- **PARTIAL** — Started but incomplete
- **ACTIVE_AGENT** — Currently being worked by an agent (none currently)
- **UNKNOWN** — Needs investigation

---

## 1. Android Native Implementation (main branch)

| Task | Feature | Source Branch | SHA | Status | Unique Code | Tests | Evidence |
|------|---------|---------------|-----|--------|-------------|-------|----------|
| 00 | Android Foundation | main | 927f601 | INTEGRATED_VERIFIED | Gradle multi-module, Hilt-free DI, Room schemas 1-3 | JVM | Build passes |
| 01 | Splash Entry | main | 927f601 | INTEGRATED_VERIFIED | `SplashScreen.kt`, animated stag, build badge | JVM | Screen QA in production branch |
| 02 | Secure Access Login | main | 927f601 | INTEGRATED_VERIFIED | `AccessScreen.kt`, `AccessViewModel.kt`, biometric prompt | JVM | Screen QA in production branch |
| 03 | Home | main | 927f601 | INTEGRATED_VERIFIED | `HomeScreen.kt`, `KnouxNavHost.kt`, `Catalog.kt` | JVM | Screen QA in production branch |
| 04 | File Cipher | main | 927f601 | INTEGRATED_VERIFIED | `FileCipherScreen.kt`, `VaultFileCipher.kt`, KNF1/KNF2 | JVM | Screen QA in production branch |
| 05 | Shadow Vault | main | 927f601 | INTEGRATED_VERIFIED | `ShadowVaultScreen.kt`, `ShadowVault.kt`, media import/export | JVM (7 tests) | Screen QA in production branch |
| 06 | Secure Notes | main | 927f601 | INTEGRATED_VERIFIED | `NotesScreen.kt` (71KB), `NotesEditor.kt` | JVM | Screen QA in production branch |
| 07 | Notes Editor | main | 927f601 | INTEGRATED_VERIFIED | Encrypted autosave, history, conflicts, recovery | JVM (5 tests) | Screen QA in production branch |
| 08 | Passwords | main | 927f601 | INTEGRATED_VERIFIED | `PasswordsScreen.kt`, `PasswordCredential.kt` | JVM | Screen QA in production branch |
| 09 | Password Detail | main | 927f601 | INTEGRATED_VERIFIED | `PasswordDetailScreen.kt` (44KB) | JVM | Screen QA in production branch |
| 10 | Authenticator | main | 927f601 | INTEGRATED_VERIFIED | `AuthenticatorScreen.kt`, `Totp.kt`, TOTP RFC 6238 | JVM | Screen QA in production branch |
| 11 | Auth Import | main | 927f601 | INTEGRATED_VERIFIED | `AuthImportScreen.kt` (31KB), QR migration, `OtpImport.kt` | JVM | Screen QA in production branch |
| 12 | Key Forge | main | 927f601 | INTEGRATED_VERIFIED | `KeyForgeScreen.kt`, ephemeral keys, SHA-256 fingerprint | JVM | Screen QA in production branch |
| 13 | Key Details | main | 927f601 | INTEGRATED_VERIFIED | `KeyDetailsScreen.kt` (21KB), `KeyDetails.kt`, Keystore evidence | JVM | Screen QA in production branch |
| 14 | Privacy | main | 927f601 | INTEGRATED_VERIFIED | `PrivacyScreen.kt` (19KB), session/key/backup limits | JVM | Screen QA in production branch |
| 15 | Backup/Recovery | main | 927f601 | INTEGRATED_VERIFIED | `RecoveryScreen.kt` (30KB), `VaultBackup.kt`, SAF | JVM | Screen QA in production branch |
| 16 | Secure Share | main | 927f601 | INTEGRATED_VERIFIED | `SecureShareScreen.kt` (67KB), `ShareService.kt`, `SecureSharePackage.kt` | JVM | Screen QA in production branch |
| 17 | Hash & Integrity | main | 927f601 | INTEGRATED_VERIFIED | `HashIntegrityScreen.kt`, `FileEnvelope.kt` | JVM | Screen QA in production branch |
| 18 | Text Cipher | main | 927f601 | INTEGRATED_VERIFIED | `TextCipherScreen.kt`, `PassphraseEnvelope.kt`, KNP2 | JVM | Screen QA in production branch |
| 19 | Digital Signature | main | 927f601 | INTEGRATED_VERIFIED | `DigitalSignatureScreen.kt` (25KB), `DigitalSignatureService.kt` | JVM | Screen QA in production branch |
| 20 | Certificate Inspector | main | 927f601 | INTEGRATED_VERIFIED | `CertificateInspectorScreen.kt` (36KB), `CertificateInspector.kt`, PKIX | JVM | Screen QA in production branch |
| 21 | Encrypted Archive | main | 927f601 | INTEGRATED_VERIFIED | `EncryptedArchiveScreen.kt` (39KB), `ArchiveService.kt`, KNF2 | JVM | Screen QA in production branch |
| 22 | Local Transfer | main | 927f601 | INTEGRATED_UNVERIFIED | `LocalTransferScreen.kt`, `TransferProtocol.kt` (KTX1), **no transport** | JVM | BLOCKED — transport not implemented |
| 23 | Fingerprint Verify | main | 927f601 | INTEGRATED_VERIFIED | `PublicKeyToolsScreens.kt`, `KeyFingerprint.kt` | JVM | Screen QA in production branch |
| 24 | Metadata Cleaner | main | 927f601 | INTEGRATED_VERIFIED | `MetadataCleanerScreen.kt`, `MetadataCleaner.kt`, JPEG/TIFF EXIF | JVM | Screen QA in production branch |
| 25 | Clipboard Guard | main | 927f601 | INTEGRATED_VERIFIED | `ClipboardGuardScreen.kt`, `ClipboardPrivacy.kt`, `ClipboardLease.kt` | JVM | Screen QA in production branch |
| 26 | Secure Random | main | 927f601 | INTEGRATED_VERIFIED | `SecureRandomScreen.kt`, `SecureSharePackage.kt` random | JVM | Screen QA in production branch |
| 27 | HMAC Authenticity | main | 927f601 | INTEGRATED_VERIFIED | `HmacLabScreen.kt`, `HmacJobGate.kt`, `HmacStreamer.kt` | JVM | Screen QA in production branch |
| 28 | Public Key QR | main | 927f601 | INTEGRATED_VERIFIED | `PublicKeyToolsScreens.kt`, `QrSupport.kt` | JVM | Screen QA in production branch |
| 29 | **Vault Collections** | main | 0997afd | **INTEGRATED_VERIFIED** | `VaultCollectionsScreen.kt` (32KB), `VaultCollections.kt`, `VaultCollectionsServiceTest.kt` | JVM | **NOT in production branch ledger** |
| 30 | **Document Viewer** | main | e144b18 | **INTEGRATED_VERIFIED** | `DocumentViewerScreen.kt` (52KB), `DocumentViewer.kt`, `DocumentViewerServiceTest.kt` (16KB) | JVM | **NOT in production branch ledger** |
| 31 | Vault Key Rotation | main | 927f601 | INTEGRATED_VERIFIED | `VaultKeyRotationScreen.kt`, `VaultKeyRotation.kt`, `VaultKeyRotationTest.kt` (27KB) | JVM | Screen QA in production branch |
| 32 | Package Inspector | main | 927f601 | INTEGRATED_VERIFIED | `PackageInspectorScreen.kt`, `PackageInspector.kt` | JVM | Screen QA in production branch |
| 33 | **Android Autofill** | main | 981842c | **INTEGRATED_VERIFIED** | `AutofillScreen.kt` (11KB), `KnouxAutofillService.kt`, `AutofillMatcherTest.kt`, Manifest service | JVM | **NOT in production branch ledger** |
| 34 | **Offline Security Advisor** | main | 31ca1cc | **INTEGRATED_VERIFIED** | `SecurityAdvisorScreen.kt` (34KB), `SecurityAdvisor.kt`, `SecurityAdvisorServiceTest.kt` (23KB) | JVM | **NOT in production branch ledger** |
| 35 | Multi-Device Pairing | main | 927f601 | INTEGRATED_UNVERIFIED | **DESIGN_ONLY** in Catalog (no route) | None | Placeholder only |
| 36 | Password Strength Audit | main | 927f601 | INTEGRATED_VERIFIED | `PasswordAuditScreen.kt`, `PasswordAudit.kt`, `PasswordAuditTest.kt` | JVM | Screen QA in production branch |
| 37 | Argon2id Key Derivation | main | 927f601 | INTEGRATED_VERIFIED | `KeyDerivationScreen.kt`, `Argon2id.kt`, `Argon2idTest.kt` | JVM | Screen QA in production branch |
| 38 | Signature Studio | main | 927f601 | INTEGRATED_VERIFIED | `SignatureStudioScreen.kt` (34KB), `SignatureStudio.kt`, `SignatureStudioTest.kt` | JVM | Screen QA in production branch |
| 39 | Local Security Activity | main | 038c734/7c0c8c0 | INTEGRATED_VERIFIED | `SecurityActivityScreen.kt`, `SecurityEventRepository.kt`, Room Flow | JVM (migration tests compiled not run) | Screen QA in production branch |
| 40 | Transfer Wizard | main | 927f601 | INTEGRATED_UNVERIFIED | **DESIGN_ONLY** in Catalog (no route) | None | Placeholder only |
| 41 | **Expiring Secret Capsule** | main | 2ada8b4 | **INTEGRATED_VERIFIED** | `SecretCapsuleScreen.kt` (41KB), `SecretCapsule.kt`, `SecretCapsuleServiceTest.kt` (14KB) | JVM | **NOT in production branch ledger** |
| 42 | Session Privacy | main | 927f601 | INTEGRATED_VERIFIED | `SessionPrivacy.kt`, `DataStoreAdvisorDismissalStore.kt`, enforced in MainActivity | JVM | Screen QA in production branch |
| 43 | File Integrity | main | 927f601 | INTEGRATED_VERIFIED | `FileEnvelope.kt`, `HashIntegrityScreen.kt` | JVM | Screen QA in production branch |
| 44 | Secure Clipboard | main | 927f601 | INTEGRATED_VERIFIED | `SecureClipboardScreen.kt`, `ClipboardPrivacy.kt` | JVM | Screen QA in production branch |
| 45 | Final Integration | main | 927f601 | INTEGRATED_VERIFIED | `KnouxNavHost.kt`, `KnouxRoot.kt`, full routing | JVM | Screen QA in production branch |

**Bold tasks** = Implemented on main AFTER production branch cutoff; missing from production branch STATUS_LEDGER.

---

## 2. Production Branch Unique Work (missions/fullstack-android/)

| Asset | Path | Status | Value | Risk if Lost |
|-------|------|--------|-------|--------------|
| Task Definitions | `XX_FEATURE/TASK.md` × 45 | UNIQUE_NOT_INTEGRATED | Acceptance criteria, dependencies, security notes | **HIGH** — Only source of detailed task specs |
| Implementation Evidence | `XX_FEATURE/EVIDENCE.md` × 45 | UNIQUE_NOT_INTEGRATED | Test logs, commit refs, screenshots, manual verification notes | **HIGH** — Only proof of implementation |
| Visual QA Checklists | `XX_FEATURE/SCREEN_QA.md` × 45 | UNIQUE_NOT_INTEGRATED | Per-screen visual verification criteria | **HIGH** — Only visual baseline |
| Status Ledger | `STATUS_LEDGER_CURRENT.md` | UNIQUE_NOT_INTEGRATED | Authoritative 44-task status table | **HIGH** — Source of truth for production readiness |
| Task Index | `TASK_INDEX.json` | UNIQUE_NOT_INTEGRATED | Dependency graph for 44 tasks | **MEDIUM** — Reconstructible from TASK.md |
| Device Verification | `DEVICE_VERIFICATION_2026-11-01_ITEL_S686LN.md` | UNIQUE_NOT_INTEGRATED | Physical device test record (itel S686LN) | **HIGH** — Only device evidence |
| APK Reconciliation | `APK_ARTIFACT_RECONCILIATION_2026-11-01.md` | UNIQUE_NOT_INTEGRATED | APK hash, size, contents verification | **MEDIUM** — Reproducible from CI |
| Visual Baseline | `POST_PR15_VISUAL_BASELINE.md` | UNIQUE_NOT_INTEGRATED | 10-screen visual reference from PR #15 | **HIGH** — Approved design baseline |
| Native Status Snapshot | `NATIVE_STATUS_2026-10-31.md` | UNIQUE_NOT_INTEGRATED | Historical status at hardening branch start | **MEDIUM** — Historical |
| Owner Actions | `OWNER_ACTIONS_REQUIRED.md` | UNIQUE_NOT_INTEGRATED | External deps: signing, Play Console, Firebase | **HIGH** — Blocking release |

---

## 3. Desktop/Electron Unique Work (main branch)

| Area | Files | Status | Notes |
|------|-------|--------|-------|
| Vault Media Backup | `electron/vault/mediabackup.js`, `rotation.js`, `store.js` | LOCAL_UNCOMMITTED | 3 modified files — media DEK rotation |
| Desktop Capabilities | `src/config/desktopCapabilities.js` | LOCAL_UNCOMMITTED | 1 modified file |
| Vault Tool Tests | `tests/batch08-vaulttools.test.cjs`, `vault-mediabackup.test.cjs` | LOCAL_UNCOMMITTED | 2 modified test files |
| New Test | `tests/vault-rotation-crash.test.cjs` | UNTRACKED | New test file |

**Separate lane** — Not part of Android delivery. Track separately.

---

## 4. Historical / Recovery Branches (Read-Only Reference)

| Branch | SHA | Unique Content | Preservation |
|--------|-----|----------------|--------------|
| `planning/knoux-crypt-native-44-vertical-slices-20261030` | 5df9fc6 | Original 44 TASK.md definitions | Archived in `docs/unique-recovery/` |
| `recovery/traycer-unique-docs-20261102` | c69ad9b | Traycer production program docs | Archived in `docs/unique-recovery/traycer-20261102/` |
| `recovery/unique-android-mission-contracts-20261102` | f5c66da | 44-mission planning contracts | Archived in `docs/unique-recovery/` |
| `recovery/unique-visual-variants-and-prompts-20261102` | 50c3b98 | Anima visual variants | Archived in `docs/unique-recovery/` |
| `audit/android-task000-checkpoint-20261102` | 8ad3322 | 253-file K-drive snapshot | Archived in `docs/unique-recovery/` |

---

## 5. Integration Priority Matrix

| Priority | Item | Action | Owner |
|----------|------|--------|-------|
| P0 | Merge `missions/fullstack-android/` from production branch | Git merge (folder only), then update STATUS_LEDGER | Orchestrator |
| P0 | Reconcile STATUS_LEDGER for Tasks 29,30,33,34,41 | Edit markdown to INTEGRATED_VERIFIED | Orchestrator |
| P1 | Commit Electron dirty files or stash | Separate commit/stash | Desktop lane |
| P1 | Run Android CI on main to verify green | Push to trigger CI | Orchestrator |
| P2 | Device/emulator instrumentation test run | Requires device farm | Owner/External |
| P2 | Security review (independent) | External auditor | Owner/External |
| P3 | Code signing setup | `OWNER_ACTIONS_REQUIRED.md` | Owner |

---

## 6. Recovery Checkpoints

| Checkpoint | SHA | Description | Location |
|------------|-----|-------------|----------|
| Pre-merge main | 927f601 | Current main HEAD before any integration | `git tag baseline-pre-merge-20261115` |
| Production branch missions | a5df8d4 | Full missions folder with evidence | `origin/production/android-hardening-20261102` |
| Traycer program baseline | c219849 | TASK_000 forensic baseline | `docs/unique-recovery/traycer-20261102/` |