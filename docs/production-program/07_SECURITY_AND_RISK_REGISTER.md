# KNOUX CRYPT — Security & Risk Register

**Baseline:** `main` @ `927f60168030162ec74aa50e113d3e600446e856`  
**Generated:** 2026-11-15

---

## 1. Cryptographic Architecture

| Component | Algorithm | Implementation | Status |
|-----------|-----------|----------------|--------|
| Master Key | AES-256-GCM | Android Keystore (StrongBox preferred) | ✅ Hardware-backed |
| Data Encryption | AES-256-GCM (KNF1) / XChaCha20-Poly1305 (KNF2) | `FileEnvelope.kt`, `AuthenticatedEnvelope.kt` | ✅ AEAD |
| Key Derivation | Argon2id (configurable params) | `Argon2id.kt` (native lib) | ✅ JVM tested |
| Password Hash | Argon2id | `Argon2id.kt` | ✅ |
| TOTP | HMAC-SHA1 (RFC 6238) | `Totp.kt` | ✅ |
| Digital Signature | Ed25519 / RSA-PSS | `DigitalSignatureService.kt` | ✅ |
| Key Agreement | X25519 (for Secure Share) | `RecipientKeys.kt`, `SecureSharePackage.kt` | ✅ |
| Certificate Validation | PKIX (RFC 5280) | `CertificateInspector.kt` | ✅ No revocation |
| HMAC | HMAC-SHA256 | `HmacJobGate.kt`, `HmacStreamer.kt` | ✅ Streaming |
| Random | `SecureRandom` (Linux `/dev/urandom`) | `SecureSharePackage.kt` | ✅ |

---

## 2. Threat Model Summary (from Mission 03)

| Threat | Mitigation | Residual Risk |
|--------|------------|---------------|
| Device compromise (unlocked) | Session timeout, biometric re-auth, in-memory key wipe on lock | **MEDIUM** — Keys not auth-bound per-use |
| Device compromise (locked) | Keystore hardware protection, StrongBox | **LOW** |
| Malicious app data access | `allowBackup=false`, `fullBackupContent=false`, encrypted Room | **LOW** |
| Network interception | No network calls (offline-first) | **NONE** |
| Clipboard leakage | `ClipboardGuard`, lease timer, auto-clear | **LOW** |
| Media file remnant | Encrypted streaming, no decrypted temp files | **LOW** |
| Backup theft | SAF-encrypted, key rotation support | **LOW** |
| Autofill abuse | Vault session gate, domain/package matching | **LOW** |
| Evil maid (physical) | Biometric + PIN, lock screen | **MEDIUM** |

---

## 3. Security Risk Register

| ID | Risk | Severity | Location | Status | Mitigation |
|----|------|----------|----------|--------|------------|
| SEC-001 | Master key not auth-bound per-use | **P1** | `KeystoreManager.kt` | Documented | Session capability gates use; documented in-app |
| SEC-002 | No certificate revocation checking | **P2** | `CertificateInspector.kt` | Known gap | OCSP/CRL not implemented; documented |
| SEC-003 | Local Transfer transport missing | **P2** | `TransferProtocol.kt` | Blocked | Protocol ready; transport deferred |
| SEC-004 | Instrumentation tests not run on device | **P1** | `app/src/androidTest/` | Blocked | Requires device farm / emulator |
| SEC-005 | Argon2id native lib supply chain | **P2** | `Argon2id.kt` (JNI) | Monitored | Pinned version; verify checksum |
| SEC-006 | Debug APK installable on any device | **P2** | CI artifact | Known | Release build requires signing |
| SEC-007 | No code signing for release | **P0** | Release pipeline | **BLOCKED_EXTERNAL** | Owner action required |
| SEC-008 | No Play Console access configured | **P0** | Release pipeline | **BLOCKED_EXTERNAL** | Owner action required |
| SEC-009 | Dependency vulnerabilities | **P1** | `gradle.lockfile` | Not scanned | Add `dependencyCheck` to CI |
| SEC-010 | Debuggable flag in release build | **P1** | `build.gradle.kts` | Check needed | Ensure `debuggable false` in release |
| SEC-011 | Exported components without permission | **P1** | `AndroidManifest.xml` | Reviewed | Autofill service has `BIND_AUTOFILL_SERVICE` |
| SEC-012 | Data extraction rules | **P2** | `xml/data_extraction_rules.xml` | Present | Limits backup content |

---

## 4. Permission Analysis

| Permission | Component | Protection Level | Justification |
|------------|-----------|------------------|---------------|
| `android.permission.BIOMETRIC` | AccessScreen | Normal | Biometric auth |
| `android.permission.USE_BIOMETRIC` | AccessScreen | Normal | Biometric auth (API 28+) |
| `android.permission.CAMERA` | AuthImportScreen, MetadataCleaner | Dangerous | QR scan, photo metadata |
| `android.permission.READ_MEDIA_IMAGES` | ShadowVault, MetadataCleaner | Dangerous (API 33+) | Media import/clean |
| `android.permission.READ_MEDIA_VIDEO` | ShadowVault | Dangerous (API 33+) | Video import |
| `android.permission.READ_MEDIA_AUDIO` | ShadowVault | Dangerous (API 33+) | Audio import |
| `android.permission.WRITE_EXTERNAL_STORAGE` | Legacy (API <29) | Dangerous | SAF fallback |
| `android.permission.MANAGE_DOCUMENTS` | Recovery (SAF) | Special | Backup/restore |
| `android.permission.BIND_AUTOFILL_SERVICE` | KnouxAutofillService | Signature | System autofill |
| `android.permission.FOREGROUND_SERVICE` | Media streaming | Normal | ShadowVault playback |
| `android.permission.WAKE_LOCK` | Media streaming | Normal | Prevent sleep during playback |

**No `INTERNET` permission declared.** App is offline-first by design.

---

## 5. Data Flow Security

```
User Input → Validation → Service Layer → Crypto Primitive → Persistence
                    ↓              ↓              ↓              ↓
            Input sanitize   No secret      AEAD encrypt   Room (encrypted)
            & type check     in logs        + auth tag     columns
                    ↓              ↓              ↓              ↓
            Audit log       Keystore       Wipe on        SAF (encrypted)
            (SecurityEvent)  wrapping       lock/close     backup
```

**Key Guarantees:**
- No plaintext secrets in logs (audit uses typed events)
- Decrypted media never written to disk (streaming)
- PDF leases in app-private cache, wiped on lock/close
- Master key never leaves Keystore (wrapping only)
- Session capability required for all vault operations

---

## 6. Supply Chain Security

| Dependency | Version | Source | Verification |
|------------|---------|--------|--------------|
| Kotlin | 2.0.0 | Maven Central | ✅ Locked in `gradle.lockfile` |
| AGP | 8.5.0 | Google Maven | ✅ Locked |
| Room | 2.6.1 | Maven Central | ✅ Locked |
| Compose BOM | 2024.10.00 | Maven Central | ✅ Locked |
| Argon2id (JNI) | 2.11 | Custom build | ⚠️ Pinned, verify checksum |
| Bouncy Castle | 1.78 | Maven Central | ✅ Locked |
| Okio | 3.9.0 | Maven Central | ✅ Locked |
| Coroutines | 1.8.0 | Maven Central | ✅ Locked |
| Lifecycle | 2.7.0 | Maven Central | ✅ Locked |

**Action Needed:** Add `dependencyCheck` Gradle plugin to CI for CVE scanning.

---

## 7. Testing Security Coverage

| Test Type | Coverage | Status |
|-----------|----------|--------|
| Unit tests (crypto) | `core:security:test` — 80+ tests | ✅ PASS |
| Unit tests (data) | `core:data:testDebugUnitTest` — 100+ tests | ✅ PASS |
| Ciphertext-at-rest invariant | `CiphertextAtRestInvariantTest.kt` | ✅ PASS |
| Security boundary tests | `SecurityBoundaryTest.kt` (30KB) | ✅ PASS |
| Migration tests | `VaultDatabaseMigrationTest.kt` | ✅ Compiles |
| Instrumentation tests | `AccessFlowTest`, `PublicKeyQrDeviceTest` | ❌ NOT RUN |
| Fuzzing | None | ❌ NOT DONE |
| Penetration test | None | ❌ NOT DONE |
| Independent audit | None | ❌ NOT DONE |

---

## 8. Release Readiness Gates

| Gate | Criteria | Status | Blocker |
|------|----------|--------|---------|
| Code complete | All 44 tasks IMPLEMENTED | ✅ | — |
| JVM tests pass | ~200 tests green | ✅ | — |
| Device tests pass | Instrumentation on device | ❌ | No device/emulator |
| Security audit | Independent review | ❌ | External |
| Dependency scan | No critical CVEs | ❌ | Not configured |
| Code signing | Valid cert configured | ❌ | Owner action |
| Play Console | App created, access granted | ❌ | Owner action |
| Privacy policy | Published URL | ❌ | Owner action |
| APK/AAB built | Release build verified | ❌ | Needs signing |

---

## 9. Incident Response Notes

| Scenario | Detection | Response |
|----------|-----------|----------|
| Keystore compromise | Audit log `KEY_ROTATION` events | Rotate master key, re-encrypt vault |
| Biometric bypass | Failed `SECURITY_ACTIVITY` auth events | Enforce PIN fallback, reduce timeout |
| Media leak | `MEDIA_EXPORT` audit without user action | Revoke session, investigate |
| Autofill abuse | `AUTOFILL_REQUEST` without unlock | Session gate blocks; audit logs |
| Backup corruption | `BACKUP_VERIFY` failure | Alert user, provide recovery drill |

---

## 10. Compliance Notes

- **GDPR:** No personal data collected; offline-first; user controls all data
- **CCPA:** Same as GDPR
- **FIPS 140-2:** Keystore/StrongBox provides hardware crypto module
- **Android Security Best Practices:** Followed (no backup, encrypted storage, minimal permissions)
- **OWASP MASVS:** Targeting L1/L2 — gaps: device testing, independent audit, code signing

---

## 11. Next Security Actions

1. **Configure dependency scanning** in CI (`dependencyCheck`)
2. **Provision device/emulator** for instrumentation tests
3. **Owner provides code signing cert** for release build
4. **Owner grants Play Console access**
5. **Schedule independent security audit**
6. **Run ciphertext-at-rest verification on device**
7. **Verify release build `debuggable=false`**