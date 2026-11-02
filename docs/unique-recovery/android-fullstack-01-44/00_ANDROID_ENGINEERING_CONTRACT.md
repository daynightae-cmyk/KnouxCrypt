# KNOUX CRYPT | SHARED ANDROID ENGINEERING CONTRACT

Inherited by every FULLSTACK_MISSION.md; service-specific sections override generic defaults.

FULL-STACK FEATURE LAYERS: Native Compose screen -> ViewModel event reducer/StateFlow -> validated UseCase -> domain service -> repository interface -> encrypted storage/platform adapter -> tests and observability without secrets. If remote service genuinely required, implement opt-in network data contract, authenticated backend, consent and failure/offline behavior. Pure animation/simulation never qualifies as functional service.

CRYPTO: Android Keystore wrapping, AEAD AES-256-GCM with unique nonce, authenticated metadata and verified tags. Independent portable user-held recovery wrapper with reviewed KDF, versioned ciphertext envelopes and truncation detection. No custom crypto, ECB, hardcoded keys, leaking secrets to Room/logs/clipboard/notifications/backups, or passing decryption keys into Composables. Room is not automatically encrypted. Locked app content must remain inaccessible via deep links or stale tasks.

FILES: SAF, Photo Picker, app-private data. Retain source input until explicit user-approved deletion; use atomic output and verify before marking success. Correct cancellation, disk full, lost URI grant, process death and file truncation. Long background work respects current Android rules.

UI: Pixel-close approved reference, exact stag-K, insets and bottom navigation, no logo collision, not a screenshot with invisible tap targets. Real focus/press/selected/loading/permission/error states, separate progress vs verified result. Android TalkBack, Arabic RTL, English LTR, narrow viewport, reduced motion, purple particles behind content, audio off by default.

STATE GRAPH: idle -> capability -> needsPermission/needsUnlock/ready -> running(progress) -> verified(receipt)/failed(reason)/canceled. Verified requires authenticated proof; a visual-only action should show an explicitly labeled demo rather than misrepresent success.

PERMISSION/SERVICE LIMITS: BiometricPrompt, Keystore, Credential Manager, AutofillService, CameraX and networking are separate capabilities, never presumed. Without actual provider keys/consent/hardware, show disabled and precise reason. VPN and intrusion detection need genuine providers and cannot be claimed from generic OS APIs.

TEST EVIDENCE: known-answer crypto vectors, tamper/wrong key/truncation, API denied permissions, process death, reboot, low storage, real device install, authenticated backup/restore on fresh device, CI, screenshot diffs, accessibility and reduced motion. A green build is not security proof. Owner-approved signed AAB/Play submission only after review.

POLICY: Android targetSdk 36+ for new Play submission as of Oct 30 2026; revalidate before release. MinSDK backed by device coverage analysis. Check OWASP MASVS/MSTG, package signing, dependency/SBOM vulnerability review and reproducible Gradle.
