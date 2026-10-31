# MISSION 31 — Encrypted Cloud Backup & Multi Device Sync

**Status:** PLANNED / NOT IMPLEMENTED
**Priority:** P3
**Repository:** daynightae-cmyk/KnouxCrypt
**Workspace:** D:\KnouxCrypt
**Branch:** planning/android-crypt-suite-20261029
**Baseline SHA:** 21879a318402fe2429f304a0a9f6f991c66af548
**Visual prompt:** `visuals/prompts/10_SETTINGS.md` (reference definition only; render later)

## Goal and non-negotiable execution order
Design opt-in ciphertext-only sync with defensible cross-device recovery and conflict rules. Deliver working code and evidence, not only a plan. Preserve original desktop application and approved aesthetics. Before writing, inspect git HEAD, origin/main, pending PRs, current worktrees, untracked work, source files, existing tests, and platform constraints; preserve all unique work. Scope: Future android/feature-sync; backend contract separate.

## Product and service specification
1. **Choose provider-agnostic backend adapter with local-only default.** Supply real Android code, user journey and acceptance evidence. Each feature has an explicit eligibility/capability check, disabled state and user-readable failure recovery.
2. **Use client-side data encryption and device-specific key envelopes.** Supply real Android code, user journey and acceptance evidence. Each feature has an explicit eligibility/capability check, disabled state and user-readable failure recovery.
3. **No raw key or plaintext telemetry in server or database.** Supply real Android code, user journey and acceptance evidence. Each feature has an explicit eligibility/capability check, disabled state and user-readable failure recovery.
4. **Handle conflicts using versioned records and verified integrity.** Supply real Android code, user journey and acceptance evidence. Each feature has an explicit eligibility/capability check, disabled state and user-readable failure recovery.
5. **Support selective sync per vault and recovery when device is lost.** Supply real Android code, user journey and acceptance evidence. Each feature has an explicit eligibility/capability check, disabled state and user-readable failure recovery.
6. **Define account onboarding and account deletion independently of local vault.** Supply real Android code, user journey and acceptance evidence. Each feature has an explicit eligibility/capability check, disabled state and user-readable failure recovery.
7. **Create privacy policy and data retention rules.** Supply real Android code, user journey and acceptance evidence. Each feature has an explicit eligibility/capability check, disabled state and user-readable failure recovery.
8. **Prototype only behind disabled opt-in flag until threat model reviewed.** Supply real Android code, user journey and acceptance evidence. Each feature has an explicit eligibility/capability check, disabled state and user-readable failure recovery.

## Security contract / permission model
Do not present generic cloud storage as E2EE without key custody and cryptographic proof. Default offline first, request Android capabilities only for feature use and after user consent. Use reviewed cryptographic libraries (AEAD only for encrypted payloads), Keystore when suitable, constrained URI and intent handling, least-privilege network/data APIs, zero logging of secrets and explicit fallbacks. A security claim must have a reproducible test or documented technical source. Hardware-backed key support is device-specific. Do not edit or ship the original custom desktop cipher as if secure.

## UX implementation blueprint
Discover from Service Hub → details page with threat/permission capabilities → preview choices and safety note → authorize sensitive actions → perform verified operation → show actionable receipt, failure or retry. Define loading, empty, permission-denied, offline, malformed input, resumed activity, app lock, expired credential and interrupted work flows. Compose components must use typed ViewModel UI states and real lifecycle-aware event handling.

## Visual-specific mission
**Mood:** Sync Nebula constellation with explicit connected devices and encrypted payload counters. Design language is KNOUX Obsidian Protocol: #070912 noir, #7556FF violet, #65F0E8 cyan, polished dark alloys, rare precise signals; no generic dashboard copied across screens.

**Exclusive card mechanics:** Link a new device via explicit key verification and visible revocation controls. Produce a visual and interaction specification including pressed/revealed/loading/success/failed and disabled states. Use `visuals/prompts/10_SETTINGS.md` for corresponding screen slot and `visuals/approved/` for approved future imagery only. Support Arabic RTL and English LTR, 48dp touch regions, foldables, TalkBack, accessibility contrast and reduced-motion mode. All status labels and animations must reflect verified service state.

## Implementation steps for the developer agent
1. Confirm baseline SHA and clean/dirty working state; protect existing artifacts and agents.
2. Write concise feature ADR with trust boundary, API shape, data formats, permissions, tradeoffs and migrations.
3. Implement in a dedicated scoped work branch with module boundaries, sealed result types, explicit errors and telemetry-free default.
4. Add real Compose UI, distinctive cards, haptics as opt-in, native Android intents and permissions.
5. Add unit tests for happy, negative, boundary, tamper, interrupted and recovery paths; run them.
6. Run device/emulator smoke testing, record exact API level, device and steps.
7. Compare screenshots and motion to approved visual assets when those assets exist; no fabricated visual sign-off.
8. Prepare proof package: commit SHA, changed paths, commands, raw PASS/FAIL outcomes, screenshots and unresolved blockers.

## Acceptance gate / evidence
Multi-device tests, offline conflict, account revoke, backup restoration and provider compromise tabletop. Also require successful compilation in the target branch, state restoration, no silent permission prompts, no sensitive data in logs, appropriate feature-flag gating and documented uncertainty. For optional P2/P3 service, a disabled and honest service catalog entry is preferable to a deceptive mock.

## Handoff and dependencies
Follow `missions/00_START_HERE.md`, `missions/03_Threat_Model_Secure_Architecture_Claims_Registry.md`, `missions/SERVICE_CATALOG.md` and `visuals/VISUAL_SYSTEM.md`. Produce evidence, update status registry, and request owner approval before release, external sync, secret/asset deletion, irreversible operations or merge to main.
