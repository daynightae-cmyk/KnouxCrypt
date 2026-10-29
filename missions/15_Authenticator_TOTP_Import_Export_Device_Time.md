# MISSION 15 — Authenticator TOTP, Import/Export & Device Time

**Status:** PLANNED / NOT IMPLEMENTED
**Priority:** P1
**Repository:** daynightae-cmyk/KnouxCrypt
**Local workspace:** D:\KnouxCrypt
**Planning branch:** planning/android-crypt-suite-20261029
**Protected baseline:** 21879a318402fe2429f304a0a9f6f991c66af548
**Visual reference:** `visuals/prompts/09_PRIVACY.md` (specification; image not generated yet)

## 1. Mission directive — DO REAL WORK
Integrate standards-based offline authenticator with controlled token migration. This file is a delivery contract for an implementation agent, not a proposal. Inspect all relevant code first, implement in safe, reviewable increments on a dedicated work branch, and produce evidence. If an external dependency, permission or device is missing, stop only that subtask and document the blocker; continue independent tasks.

## 2. Current reality, preservation and owned boundaries
Relevant legacy reference: `New android/feature-authenticator`. The existing product is a desktop React/Electron application. Reuse validated domain requirements, navigation language and approved visual assets when portable; do not pretend legacy Windows-specific disk encryption runs on Android. Audit the current HEAD, git status, linked branches/worktrees/stash, unique commits and current CI before editing. Preserve unmerged work. Avoid editing unrelated files or replacing the original desktop application. No deletion, reset --hard, clean, force push, disk mutation or production migration without owner approval.

## 3. Mandatory implementation scope
1. **Generate RFC 6238 TOTP and optional RFC 4226 HOTP with known vectors.** Create concrete Android interfaces, production-capable behavior or verified documentation as appropriate; keep the UI state machine consistent with real backend capability.
2. **Scan otpauth URI safely and parse issuer/account parameters with URI limits.** Create concrete Android interfaces, production-capable behavior or verified documentation as appropriate; keep the UI state machine consistent with real backend capability.
3. **Import legacy OTP migration bundles only after their scheme and user authorization are verified.** Create concrete Android interfaces, production-capable behavior or verified documentation as appropriate; keep the UI state machine consistent with real backend capability.
4. **Display rapidly changing tokens with no analytics, screenshot leaks or logs.** Create concrete Android interfaces, production-capable behavior or verified documentation as appropriate; keep the UI state machine consistent with real backend capability.
5. **Vault OTP seeds encrypted separately; backup seed export is sensitive and gated.** Create concrete Android interfaces, production-capable behavior or verified documentation as appropriate; keep the UI state machine consistent with real backend capability.
6. **Show countdown based on system clock and explain clock skew.** Create concrete Android interfaces, production-capable behavior or verified documentation as appropriate; keep the UI state machine consistent with real backend capability.
7. **Provide secure QR export only to authenticated local owner.** Create concrete Android interfaces, production-capable behavior or verified documentation as appropriate; keep the UI state machine consistent with real backend capability.
8. **Never access other authenticator apps data without supported user export.** Create concrete Android interfaces, production-capable behavior or verified documentation as appropriate; keep the UI state machine consistent with real backend capability.

## 4. Architecture and user journey
Implement an Android-native Kotlin + Jetpack Compose feature with ViewModel + StateFlow, navigation destinations, domain use cases, repositories and typed results. Map every user action to a real, testable operation. Minimum journey: discover the feature from the Service Hub → inspect capabilities/permissions → select inputs → preview risks/options → authenticate if sensitive → execute with cancellable, persistent state where practical → verify actual result → show receipt or an actionable error. Handle offline mode, empty state, first use, interruption, expiry and recovery without silent data loss. Define imported/exported data format and migration boundaries. Do not invent success progress or tool capability.

## 5. VISUALS / experience contract
**Creative direction:** Chrono Sigil: dark concentric timing dial with separate rotating token windows. The design is restrained offensive-security-inspired premium cyber noir: obsidian #070912, muted violet #7556FF, electric cyan #65F0E8, sparse hot magenta and low-lit metal. Real trust signals use text and real evidence, not fake terminals. Honor screen reference `visuals/prompts/09_PRIVACY.md`, and approved assets only after review.

**Unique card interaction:** Tap to copy code, animated countdown pauses/restarts correctly on lifecycle changes. Build a proprietary interaction rather than repeating a generic glass card everywhere. Include a sensible reduced-motion version, one-handed Android touch targets (>=48dp), contrast, Arabic RTL and English LTR; haptics must be optional. Protect sensitive previews from recent-app snapshots where supported.

**Visual deliverables:** composable screen, icon states, loading/empty/success/error states, lightless dark token mapping, responsive small/large device layouts, Compose Preview, screenshot baseline and animation behavior specification. Do not put an image over nonfunctional controls.

## 6. Security and privacy guardrails
No remote OTP capture, no promise to import secrets directly from unrelated apps without supported export. Use platform APIs and independently validated libraries; no bespoke cryptographic algorithms. For ciphertext use authenticated encryption with vetted key lifecycle and verified failure behavior. Minimize permissions, never log plaintext/passwords/keys/recovery phrases; no secrets in analytics, CI or crash dumps. Default local-first. Clearly label unavailable capabilities as PLANNED, not ACTIVE. Security assertions require threat-model evidence and negative tests.

## 7. Engineering implementation protocol
1. Inspect `git status --porcelain=v1`, `git rev-parse HEAD`, remote tracking, active agents/worktrees and relevant current files.
2. Create a small scoped branch from an explicit SHA; preserve untracked changes and preexisting work.
3. Write API contracts, data models, UI state and error classes before service wiring; mark permissions and platform limitations.
4. Implement incrementally with real handling of interrupted operations, import/export validation and recoverability.
5. Wire all buttons, cards, intents and visual status to real state; no clickable decorative shells.
6. Add unit, integration, UI and security regression tests with reproducible commands.
7. Compare screenshots against `visuals/approved/`; never claim pixel-match to absent references.
8. Produce task report with commit SHAs, changed paths, tests, remaining defects and next blocked items; never auto-merge or release.

## 8. Definition of Done — evidence only
**Feature-specific verification:** RFC vectors, time changes, screen lock, QR limits, account duplicates and restore seed tests. In addition: show exact Gradle commands/results, test device API levels, installed app smoke-test screenshots, Accessibility and RTL/LTR validation, process death/rotation/low-storage handling, permission denials, correct failure-state copy, and no plaintext leaks. If security audit is incomplete, state IMPLEMENTED / NOT AUDITED, not SECURE or RELEASED. No DONE without real verifiable outcomes.

## 9. Dependency and integration handoff
Review `missions/00_START_HERE.md`, `missions/03_Threat_Model_Secure_Architecture_Claims_Registry.md`, `visuals/VISUAL_SYSTEM.md` and `missions/SERVICE_CATALOG.md`. The ten `visuals/prompts/` specifications must be generated as **separate files** only after owner approval. Hand off a concise contract to the next mission including navigation, models, crypto format IDs, states, and feature flags.
