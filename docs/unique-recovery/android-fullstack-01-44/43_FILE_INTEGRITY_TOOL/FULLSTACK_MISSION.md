# 43 - FILE_INTEGRITY_TOOL | FULL-STACK NATIVE ANDROID MISSION

STATUS: PLANNED. This document is an engineering contract, NOT a claim of implementation.
PRIORITY: P1 | Linked existing foundational mission numbers: 12
VISUAL ASSET: visuals/ANIMA_MISSIONS_01-44/43_FILE_INTEGRITY_TOOL/43_FILE_INTEGRITY_TOOL.png
VISUAL PROMPT: visuals/ANIMA_MISSIONS_01-44/43_FILE_INTEGRITY_TOOL/43_FILE_INTEGRITY_TOOL.txt
CONTRACTS: ../00_ANDROID_ENGINEERING_CONTRACT.md and ../00_SAFE_SYNC_AND_GATES.md; repo-level Android security contract and 80-service catalog.

## 1. Real prerequisite and execution boundary
- Required before claiming live service: Hash Integrity and Ciphertext Inspector.
- Inspect the actual working repo at runtime, preserve the Vercel agent's in-flight React/visual branch and unique local work, and check relevant prior implementations to avoid duplication.
- Implement this mission in new/current Kotlin Android modules, NOT as a website wrapper or only an Anima-style screen. Keep source design/art untouched.
- Confirm needed hardware/provider/network capabilities; if absent, render an honest DISABLED state and record blocker, never a fake working feature.

## 2. Screen-level user journey and UI completeness
- Implement screen-specific interaction contract: Select original and candidate, hash compare, change report, authenticated package validation.
- Compose UI must match its independently attached reference PNG, not the mock-device frame: exact stag-K, violet gradient material, titles, card geometry, optical spacing, bottom navigation, plus functional editable controls.
- Define visual states: idle, checking capability, needsUnlock, needsPermission, ready, running(progress), verified(receipt), error(cause/retry), canceled. Map terminal success to real operation receipts, not animation.
- Expose at minimum Back, cancel, progress, retry, unavailable explanation, accessibility labels, TalkBack announcements, RTL and English LTR. Maintain stable state on rotation, system bars, keyboard and narrow screens.
- Animate by domain: use meaningful purple energy arcs, subtle particles and glow behind content, while avoiding text obstruction and noisy duplication. Ensure reduced-motion and muted-by-default sound.
- No new root AppShell. Register screen route once in shared Navigation Compose registry; preserve Splash -> Auth -> Home lock boundary and return to originating parent screen.

## 3. End-to-end domain behavior (NO MOCK BACKEND)
- Real feature engine/use cases: Compute trusted byte-for-byte hash comparison of two sources, optionally cryptographically verify signed manifest; distinguish checksum from origin authenticity.
- Define typed Kotlin commands, results and error models; validate all user input; forbid UI from writing files or manipulating secret keys directly.
- Build ViewModel StateFlow reducer -> domain UseCase -> repository interface -> Android/native provider implementation. Use coroutines with explicit dispatcher, cancellation and progress; guarantee idempotent retry where feasible.
- Make actions persistent only after authenticated and atomic success; if optional remote service is truly required, add reviewed authenticated API/backend contract with user opt-in, offline/timeout and rollback behavior, otherwise keep feature disabled.

## 4. Storage, keying and data contracts
- Per-feature data schema and storage behavior: IntegrityComparison source hash, candidate hash, verification trust origin and report date.
- Choose encrypted payload columns or app-private authenticated ciphertext with versioning. Room is not inherently encrypted. Separate minimal non-sensitive index metadata and document disclosure risks.
- Reuse one reviewed key hierarchy and authenticated envelope format; never create a new custom cipher per screen. Validate unique nonce, AAD binding, authentication tags, rollback and truncation checks.
- Sensitive in-memory state is cleared/locked appropriately, never persisted in SavedStateHandle, clipboard/logs/analytics or notification previews without explicit informed consent.

## 5. Android platform, capabilities and lifecycle
- Real OS integration and permission strategy: SAF streaming, MessageDigest and signature verification module when attached.
- Use real Android lifecycle, SAF, Photo Picker, KeyStore, BiometricPrompt, Credential Manager, CameraX, AutofillService or WorkManager ONLY where appropriate and supported, after device capability and permission check.
- Never assume background privileges or unrestricted file access. Define process-death/reboot/offline/low-storage behavior and user-visible recovery action.
- Expose real providerReady, requiresNetwork, permissionNeeds, platformCapability and realTestEvidence values into shared Service Hub; avoid fake ACTIVE status.

## 6. Threat model and refusal/disabled boundaries
- Service-specific abuse cases and limitations: Do not infer authenticity from equal hashes without trusted expected source; no unauthenticated success.
- Reject malformed inputs, unsafe URI/path and huge payloads with bounded processing. Use guarded secret handling, authenticated data, no silent network access, and user approval for destructive export/delete.
- If security guarantees cannot be supported by platform/provider, state the limitation inside the actual UI rather than pretending to satisfy it.
- Never port known unsafe legacy custom AES/ECB or unsupported desktop BitLocker/VeraCrypt semantics into Android.

## 7. Acceptance and test plan
- Primary domain/negative tests: File changed during read, wrong hash, truncation, very large file, signed manifest invalid.
- Tests must include relevant positive result and read-back proof, wrong key/modified bytes, denied permissions, cancellation, process kill, app background/foreground, device reboot and low space as applicable.
- Test crypto with published known-answer vectors and independent verification. Test fresh-device backup/restore for any persistent secret or key-linked item where applicable.
- Test UI by actual Kotlin Compose screenshot: exact reference proportions, no logo overlap, balanced spacing, visible bottom navigation, scroll/keyboard safe, Android insets and dark theme.
- Test API compatibility with actual emulator/device install if available, accessibility/TalkBack and both RTL/LTR languages. Validate performance without memory leaks and without rendering a WebView.
- CI validation: Gradle assembleDebug, unit tests, instrumented tests, lint, dependency checks; archive command output, exit codes and actual APK/install evidence.

## 8. Definition of COMPLETE and evidence artifact
- A mission is COMPLETE only when native Compose UI, domain engine, data contract, platform permissions, real outputs, recoverability and device/security tests all pass with evidence.
- Do NOT mark VERIFIED because React preview, Anima prototype, unit tests alone or a static Android build looks successful.
- After implementation write EVIDENCE.md beside this file: current HEAD and source SHA; feature branch; Kotlin files; crypto/provider choices; commands + raw results; device/API; UI screenshot refs/diff; security negative cases; CI; risks; next safe action.
- Continue next independent mission without routine questions, but stop destructive Git operations, production release, provider billing, user-data deletion and unauthorized secret/network access until owner approval.

## 9. Handoff check
- Shared UI shell and capability registry updated without breaking previous missions.
- Domain service reused by dependent screens. Route from HOME or parent verified; Back returns to caller.
- Existing visual asset preserved, no duplicate repository/service implementations, no lost unique branch work.
- Actual implementation status recorded honestly; optional blocked dependencies listed concretely.