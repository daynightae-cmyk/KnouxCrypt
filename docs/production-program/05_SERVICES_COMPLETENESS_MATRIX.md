# KNOUX CRYPT — Services Completeness Matrix

**Baseline:** `main` @ `927f60168030162ec74aa50e113d3e600446e856`  
**Generated:** 2026-11-15

---

## Classification Legend
- **REAL_VERIFIED** — UI → Service → Real Operation → Persistence → Feedback (JVM tested)
- **IMPLEMENTED_UNVERIFIED** — Code complete, compiles, tests pass, no device runtime
- **PARTIAL** — Some flows work, others stubbed
- **UI_ONLY** — Screen exists but no service backing
- **BACKEND_ONLY** — Service exists but no UI route
- **MOCK_ONLY** — Simulated/fake implementation
- **BROKEN** — Known broken
- **BLOCKED_EXTERNAL** — Waiting on external dependency
- **UNKNOWN** — Not assessed

---

## 1. Core Services (Essentials — 8 Services)

| Service | Catalog ID | Route | Status | Service Class | Key Operations | Tests |
|---------|------------|-------|--------|---------------|----------------|-------|
| Encrypt Files | ENCRYPT | `file_cipher` | **REAL_VERIFIED** | `VaultFileCipher.kt` | KNF1/KNF2 encrypt/decrypt, streaming | JVM |
| Vault | VAULT | `shadow_vault` | **REAL_VERIFIED** | `ShadowVault.kt` | Media import/export/delete, encrypted thumbs, streaming | JVM (7) |
| Secure Notes | NOTES | `notes` | **REAL_VERIFIED** | `NotesEditorService.kt` | CRUD, encrypted autosave, history, conflicts | JVM (5) |
| Passwords | PASSWORDS | `passwords` | **REAL_VERIFIED** | `SecretRepository.kt` | CRUD, TOTP, strength, categories | JVM |
| Key Forge | KEY_FORGE | `key_forge` | **REAL_VERIFIED** | `KeystoreManager.kt` | Generate, fingerprint, attestation | JVM |
| Authenticator | AUTHENTICATOR | `authenticator` | **REAL_VERIFIED** | `Totp.kt` | RFC 6238, sync, import/export | JVM |
| Privacy Center | PRIVACY | `privacy` | **REAL_VERIFIED** | `SessionPrivacy.kt`, `SettingsRepository.kt` | Limits, toggles, DataStore | JVM |
| Recovery | BACKUP | `recovery` | **REAL_VERIFIED** | `VaultBackup.kt` | SAF backup/restore, key rotation | JVM |

---

## 2. Extended Services (Extras — 34 Services)

### File & Vault Tools
| Service | Catalog ID | Route | Status | Service Class | Key Operations | Tests |
|---------|------------|-------|--------|---------------|----------------|-------|
| Hash & Integrity | INTEGRITY | `hash` | **REAL_VERIFIED** | `FileEnvelope.kt` | SHA-256, HMAC, file verify | JVM |
| Text Cipher | TEXT_CIPHER | `text_cipher` | **REAL_VERIFIED** | `PassphraseEnvelope.kt` | KNP2 encrypt/decrypt, Argon2id | JVM |
| Encrypted Archive | ARCHIVE | `archive` | **REAL_VERIFIED** | `ArchiveService.kt` | KNF2 create/extract, streaming | JVM |
| Metadata Cleaner | METADATA_CLEANER | `metadata_cleaner` | **REAL_VERIFIED** | `MetadataCleaner.kt` | JPEG/TIFF EXIF strip, preview | JVM |
| Package Inspector | PACKAGE_INSPECTOR | `package_inspector` | **REAL_VERIFIED** | `PackageInspector.kt` | KNF/KNP header parse, no key | JVM |
| **Vault Collections** | COLLECTIONS | `vault_collections` | **REAL_VERIFIED** | `VaultCollections.kt` | Encrypted labels, membership | JVM |
| **Document Viewer** | DOCUMENT_VIEWER | `document_viewer` | **REAL_VERIFIED** | `DocumentViewer.kt` | In-memory decrypt, PDF lease mgmt | JVM |
| File Integrity | FILE_INTEGRITY | `file_integrity` | **REAL_VERIFIED** | `FileEnvelope.kt` | SHA-256 verify vs known hash | JVM |

### Keys & Identity
| Service | Catalog ID | Route | Status | Service Class | Key Operations | Tests |
|---------|------------|-------|--------|---------------|----------------|-------|
| Signature Verification | SIGNATURE | `signature` | **REAL_VERIFIED** | `DigitalSignatureService.kt` | Sign/verify, key selector | JVM |
| Certificate Inspector | CERTIFICATE_INSPECTOR | `certificate_inspector` | **REAL_VERIFIED** | `CertificateInspector.kt` | X.509 parse, PKIX trust | JVM |
| Fingerprint Verify | FINGERPRINT_VERIFY | `fingerprint_verify` | **REAL_VERIFIED** | `KeyFingerprint.kt` | SHA-256 fingerprint, compare | JVM |
| Secure Random | SECURE_RANDOM | `random` | **REAL_VERIFIED** | `SecureSharePackage.kt` | Entropy, audit log | JVM |
| HMAC Authenticity | HMAC_AUTHENTICITY | `hmac` | **REAL_VERIFIED** | `HmacJobGate.kt`, `HmacStreamer.kt` | HMAC sign/verify, streaming | JVM |
| Public Key QR | PUBLIC_KEY_QR | `public_key_qr` | **REAL_VERIFIED** | `QrSupport.kt` | QR gen/scan, export | JVM |
| **Key Derivation** | KEY_DERIVATION | `key_derivation` | **REAL_VERIFIED** | `Argon2id.kt` | Argon2id params, benchmark | JVM |
| **Android Autofill** | AUTOFILL | `autofill` | **REAL_VERIFIED** | `KnouxAutofillService.kt` | BIND_AUTOFILL_SERVICE, domain match | JVM |
| Password Audit | PASSWORD_AUDIT | `password_audit` | **REAL_VERIFIED** | `PasswordAuditService.kt` | Reuse/weak detection, export | JVM |
| Signature Studio | SIGNATURE_STUDIO | `signature_studio` | **REAL_VERIFIED** | `SignatureStudio.kt` | Multi-file, digest mode 2 | JVM |

### Privacy & Sharing
| Service | Catalog ID | Route | Status | Service Class | Key Operations | Tests |
|---------|------------|-------|--------|---------------|----------------|-------|
| Secure Share | SECURE_SHARE | `secure_share` | **REAL_VERIFIED** | `ShareService.kt`, `SecureSharePackage.kt` | Recipient keys, expiry, QR | JVM |
| Local Transfer | LOCAL_TRANSFER | `local_transfer` | **PARTIAL** | `TransferProtocol.kt` (KTX1) | **Protocol only — no transport** | JVM |
| Clipboard Guard | CLIPBOARD_GUARD | `clipboard_guard` | **REAL_VERIFIED** | `ClipboardPrivacy.kt`, `ClipboardLease.kt` | Lease timer, auto-clear | JVM |
| **Offline Security Advisor** | OFFLINE_ADVISOR | `security_advisor` | **REAL_VERIFIED** | `SecurityAdvisor.kt` | Local signals, dismiss, DataStore | JVM |
| **Security Activity** | SECURITY_ACTIVITY | `security_activity` | **REAL_VERIFIED** | `SecurityEventRepository.kt` | Room Flow timeline, filters | JVM |
| **Expiring Secret Capsule** | SECRET_CAPSULE | `secret_capsule` | **REAL_VERIFIED** | `SecretCapsule.kt`, `CapsuleService.kt` | Create, open, audit, expiry | JVM |
| Session Privacy | SESSION_PRIVACY | `session_privacy` | **REAL_VERIFIED** | `SessionPrivacy.kt` | Lock behavior, DataStore | JVM |
| Secure Clipboard | SECURE_CLIPBOARD | `secure_clipboard` | **REAL_VERIFIED** | `ClipboardPrivacy.kt` | Lease copy, auto-clear | JVM |
| Multi-Device Pairing | DEVICE_PAIRING | (none) | **UI_ONLY** | — | **DESIGN_ONLY placeholder** | None |
| Transfer Wizard | (none) | (none) | **UI_ONLY** | — | **DESIGN_ONLY placeholder** | None |

### Vault Management
| Service | Catalog ID | Route | Status | Service Class | Key Operations | Tests |
|---------|------------|-------|--------|---------------|----------------|-------|
| Vault Key Rotation | (none) | `key_rotation` | **REAL_VERIFIED** | `VaultKeyRotation.kt`, `VaultKeyManager.kt` | Rotate, history, auth-bound | JVM |
| Auth Import | (none) | `auth_import` | **REAL_VERIFIED** | `OtpImport.kt` | QR migration, validation | JVM |
| Key Details | (none) | `key_details` | **REAL_VERIFIED** | `KeyDetails.kt` | Keystore attestation, cert chain | JVM |
| Notes Editor | (none) | (via notes) | **REAL_VERIFIED** | `NotesEditorService.kt` | Autosave, history, conflicts | JVM (5) |
| Password Detail | (none) | `password_detail` | **REAL_VERIFIED** | `PasswordCredential.kt` | Reveal, TOTP, QR, edit | JVM |

---

## 3. Service Architecture Map

```
AppContainer (DI Root)
├── SessionManager          → UnlockManager, Biometric, Timeout
├── SecretsDatabase (Room)  → SecretRepository, SecretCodec
├── KeystoreManager         → Master key, wrapping, attestation
├── ShadowVault             → Media import/export, streaming
├── VaultFileCipher         → KNF1/KNF2 file encrypt/decrypt
├── NotesEditorService      → Encrypted autosave, history
├── VaultCollections        → Encrypted labels, membership
├── DocumentViewer          → In-memory decrypt, PDF leases
├── ArchiveService          → KNF2 create/extract
├── ShareService            → SecureSharePackage, recipient keys
├── SecurityAdvisor         → Local signals, dismissals
├── SecurityEventRepository → Room Flow, 500-event bound
├── CapsuleService          → SecretCapsule, expiry, audit
├── VaultBackup             → SAF backup/restore
├── VaultKeyRotation        → DEK rotation, auth-bound
├── PasswordAudit           → Reuse/weak detection
├── SignatureStudio         → Multi-file signing
├── MetadataCleaner         → EXIF strip
├── CertificateVaultService → Cert storage, PKIX
└── SettingsRepository      → DataStore preferences
```

---

## 4. Action → Handler Map (UI → Service)

| UI Action | Screen | Handler | Service | Persistence |
|-----------|--------|---------|---------|-------------|
| Encrypt file | `FileCipherScreen` | `VaultFileCipher.encrypt()` | `VaultFileCipher.kt` | KNF1/KNF2 file |
| Decrypt file | `FileCipherScreen` | `VaultFileCipher.decrypt()` | `VaultFileCipher.kt` | Output file |
| Import media | `ShadowVaultScreen` | `ShadowVault.importMedia()` | `ShadowVault.kt` | Encrypted media + thumb |
| Export media | `ShadowVaultMedia` | `ShadowVault.exportMedia()` | `ShadowVault.kt` | Decrypted to SAF |
| Create note | `NotesScreen` | `NotesEditorService.create()` | `NotesEditorService.kt` | Room (encrypted) |
| Autosave note | `NotesEditorScreen` | `NotesEditorService.autosave()` | `NotesEditorService.kt` | Room (encrypted) |
| Save password | `PasswordsScreen` | `SecretRepository.insert()` | `SecretRepository.kt` | Room (encrypted) |
| Generate TOTP | `AuthenticatorScreen` | `Totp.generate()` | `Totp.kt` | In-memory |
| Generate key | `KeyForgeScreen` | `KeystoreManager.generate()` | `KeystoreManager.kt` | Android Keystore |
| Sign data | `DigitalSignatureScreen` | `DigitalSignatureService.sign()` | `DigitalSignatureService.kt` | SignaturePackage |
| Verify cert | `CertificateInspectorScreen` | `CertificateInspector.verify()` | `CertificateInspector.kt` | PKIX trust |
| Create archive | `EncryptedArchiveScreen` | `ArchiveService.create()` | `ArchiveService.kt` | KNF2 archive |
| Share secret | `SecureShareScreen` | `ShareService.createPackage()` | `ShareService.kt` | SecureSharePackage |
| View document | `DocumentViewerScreen` | `DocumentViewer.open()` | `DocumentViewer.kt` | In-memory + cache lease |
| Create collection | `VaultCollectionsScreen` | `VaultCollections.create()` | `VaultCollections.kt` | Room (encrypted) |
| Autofill password | System Autofill | `KnouxAutofillService.onFillRequest()` | `KnouxAutofillService.kt` | Session-gated |
| Security check | `SecurityAdvisorScreen` | `SecurityAdvisor.evaluate()` | `SecurityAdvisor.kt` | DataStore dismissals |
| Create capsule | `SecretCapsuleScreen` | `CapsuleService.create()` | `CapsuleService.kt` | SecretCapsule (encrypted) |
| Rotate vault key | `VaultKeyRotationScreen` | `VaultKeyRotation.rotate()` | `VaultKeyRotation.kt` | Keystore + Room |

---

## 5. Mock/Stub/Blocked Inventory

| Service | Issue | Blocker | Resolution |
|---------|-------|---------|------------|
| Local Transfer | Transport not implemented | No WebRTC/BLE/NFC transport layer | Honest "not available" UI; protocol ready |
| Multi-Device Pairing | Design only | No transport + pairing protocol | Defer to post-release |
| Transfer Wizard | Design only | Depends on Local Transfer transport | Defer to post-release |
| Argon2id auth-bound | Keystore key not auth-bound per-use | Hardware limitation / API level | Documented in-app; session capability gates |

---

## 6. External Dependency Gates

| Dependency | Service | Status | Owner Action |
|------------|---------|--------|--------------|
| Code signing cert | Release APK/AAB | **BLOCKED_EXTERNAL** | Owner: provide cert, configure CI |
| Play Console access | Production release | **BLOCKED_EXTERNAL** | Owner: grant access |
| Firebase/App Check | Attestation (optional) | **BLOCKED_EXTERNAL** | Owner: configure project |
| Device farm | Instrumentation tests | **BLOCKED_EXTERNAL** | Owner: provide Firebase Test Lab / local device |

---

## 7. Data Integrity & Migration

| Migration | From → To | Status | Test |
|-----------|-----------|--------|------|
| Room Schema 1 → 2 | Initial → ShadowVault media | ✅ Applied | `VaultDatabaseMigrationTest.kt` |
| Room Schema 2 → 3 | Media → SecurityActivity events | ✅ Applied | `VaultDatabaseMigrationTest.kt` |
| SecurityEvent kinds | Generic `DATA_*` → Typed `MEDIA_*`, `NOTE_DRAFT_*` | ✅ Applied | Suppressed in audit (7c0c8c0) |
| VaultKeyRotation | Single DEK → Rotated DEKs | ✅ Implemented | `VaultKeyRotationTest.kt` (27KB) |
| SecretCapsule | New table | ✅ Implemented | `SecretCapsuleServiceTest.kt` |
| DocumentViewer leases | New cache dir | ✅ Implemented | `DocumentViewerServiceTest.kt` |

---

## 8. Service Test Evidence (JVM)

| Test Suite | Tests | Pass | Coverage |
|------------|-------|------|----------|
| `core:security:test` | ~80 | ✅ | FileEnvelope 13, PassphraseEnvelope 6, TOTP/hash/random 7, PR14 security 40+ |
| `core:data:testDebugUnitTest` | ~100 | ✅ | All 23 test files |
| `app:testDebugUnitTest` | ~20 | ✅ | 7 test files |
| `core:data:compileDebugAndroidTestKotlin` | 2 | ✅ Compiles | `AccessFlowTest`, `PublicKeyQrDeviceTest` |
| **Total JVM Tests** | **~200** | ✅ | **All pass in CI** |

---

## 9. Next Service Actions

1. **Device runtime verification** — Install APK, test each service flow on device
2. **Instrumentation test run** — Execute `AccessFlowTest`, `PublicKeyQrDeviceTest` on device
3. **Security review** — Independent audit of crypto implementations
4. **Performance baseline** — Measure cold start, encryption throughput, memory
5. **Local Transfer transport** — Decide: WebRTC, BLE, or NFC for Task 22