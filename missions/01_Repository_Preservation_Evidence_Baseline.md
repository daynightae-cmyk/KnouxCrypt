# MISSION 01 — Repository Preservation & Evidence Baseline

**Status:** PLANNED / NOT IMPLEMENTED
**Priority:** P0
**Repository:** daynightae-cmyk/KnouxCrypt
**Local workspace:** D:\KnouxCrypt
**Planning branch:** planning/android-crypt-suite-20261029
**Protected baseline:** 21879a318402fe2429f304a0a9f6f991c66af548
**Visual reference:** `visuals/prompts/01_SPLASH.md` (specification; image not generated yet)

## 1. Mission directive — DO REAL WORK
Audit current React/Electron implementation and record every reusable asset before native migration. This file is a delivery contract for an implementation agent, not a proposal. Inspect all relevant code first, implement in safe, reviewable increments on a dedicated work branch, and produce evidence. If an external dependency, permission or device is missing, stop only that subtask and document the blocker; continue independent tasks.

## 2. Current reality, preservation and owned boundaries
Relevant legacy reference: `src/App.jsx; src/components/modern/ModernApp.tsx; src/core/crypto; electron; electron_main; .storage`. The existing product is a desktop React/Electron application. Reuse validated domain requirements, navigation language and approved visual assets when portable; do not pretend legacy Windows-specific disk encryption runs on Android. Audit the current HEAD, git status, linked branches/worktrees/stash, unique commits and current CI before editing. Preserve unmerged work. Avoid editing unrelated files or replacing the original desktop application. No deletion, reset --hard, clean, force push, disk mutation or production migration without owner approval.

## 3. Mandatory implementation scope
1. **Inventory all 120 tracked paths and their roles.** Create concrete Android interfaces, production-capable behavior or verified documentation as appropriate; keep the UI state machine consistent with real backend capability.
2. **Map all routes, navigation duplicates, UI variants and dormant pages.** Create concrete Android interfaces, production-capable behavior or verified documentation as appropriate; keep the UI state machine consistent with real backend capability.
3. **Map frontend/backend IPC and note platform-only Windows operations.** Create concrete Android interfaces, production-capable behavior or verified documentation as appropriate; keep the UI state machine consistent with real backend capability.
4. **Record original asset screenshots, logo, splash and interaction patterns.** Create concrete Android interfaces, production-capable behavior or verified documentation as appropriate; keep the UI state machine consistent with real backend capability.
5. **Diff main against both ai_main branches and keep unique data if found.** Create concrete Android interfaces, production-capable behavior or verified documentation as appropriate; keep the UI state machine consistent with real backend capability.
6. **Separate claims in README from executable behavior.** Create concrete Android interfaces, production-capable behavior or verified documentation as appropriate; keep the UI state machine consistent with real backend capability.
7. **Establish test, CI, dependency and license baseline.** Create concrete Android interfaces, production-capable behavior or verified documentation as appropriate; keep the UI state machine consistent with real backend capability.
8. **Write a preservation matrix old-to-new and a rollback strategy.** Create concrete Android interfaces, production-capable behavior or verified documentation as appropriate; keep the UI state machine consistent with real backend capability.

## 4. Architecture and user journey
Implement an Android-native Kotlin + Jetpack Compose feature with ViewModel + StateFlow, navigation destinations, domain use cases, repositories and typed results. Map every user action to a real, testable operation. Minimum journey: discover the feature from the Service Hub → inspect capabilities/permissions → select inputs → preview risks/options → authenticate if sensitive → execute with cancellable, persistent state where practical → verify actual result → show receipt or an actionable error. Handle offline mode, empty state, first use, interruption, expiry and recovery without silent data loss. Define imported/exported data format and migration boundaries. Do not invent success progress or tool capability.

## 5. VISUALS / experience contract
**Creative direction:** Repo lineage explorer with branch-chip comparison, evidence receipts and protected-state status. The design is restrained offensive-security-inspired premium cyber noir: obsidian #070912, muted violet #7556FF, electric cyan #65F0E8, sparse hot magenta and low-lit metal. Real trust signals use text and real evidence, not fake terminals. Honor screen reference `visuals/prompts/01_SPLASH.md`, and approved assets only after review.

**Unique card interaction:** Tap an evidence chip to reveal SHA, source file and verification status; no fake green badges. Build a proprietary interaction rather than repeating a generic glass card everywhere. Include a sensible reduced-motion version, one-handed Android touch targets (>=48dp), contrast, Arabic RTL and English LTR; haptics must be optional. Protect sensitive previews from recent-app snapshots where supported.

**Visual deliverables:** composable screen, icon states, loading/empty/success/error states, lightless dark token mapping, responsive small/large device layouts, Compose Preview, screenshot baseline and animation behavior specification. Do not put an image over nonfunctional controls.

## 6. Security and privacy guardrails
Source code audit is read-only for legacy crypto; no migration of unsafe cipher routines. Use platform APIs and independently validated libraries; no bespoke cryptographic algorithms. For ciphertext use authenticated encryption with vetted key lifecycle and verified failure behavior. Minimize permissions, never log plaintext/passwords/keys/recovery phrases; no secrets in analytics, CI or crash dumps. Default local-first. Clearly label unavailable capabilities as PLANNED, not ACTIVE. Security assertions require threat-model evidence and negative tests.

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
**Feature-specific verification:** git tree tracked count and SHA, file/route inventory, test and build evidence with precise missing checks. In addition: show exact Gradle commands/results, test device API levels, installed app smoke-test screenshots, Accessibility and RTL/LTR validation, process death/rotation/low-storage handling, permission denials, correct failure-state copy, and no plaintext leaks. If security audit is incomplete, state IMPLEMENTED / NOT AUDITED, not SECURE or RELEASED. No DONE without real verifiable outcomes.

## 9. Dependency and integration handoff
Review `missions/00_START_HERE.md`, `missions/03_Threat_Model_Secure_Architecture_Claims_Registry.md`, `visuals/VISUAL_SYSTEM.md` and `missions/SERVICE_CATALOG.md`. The ten `visuals/prompts/` specifications must be generated as **separate files** only after owner approval. Hand off a concise contract to the next mission including navigation, models, crypto format IDs, states, and feature flags.
