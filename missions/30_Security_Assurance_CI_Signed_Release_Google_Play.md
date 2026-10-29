# MISSION 30 — Security Assurance, CI, Signed Release & Google Play

**Status:** PLANNED / NOT IMPLEMENTED
**Priority:** P0
**Repository:** daynightae-cmyk/KnouxCrypt
**Workspace:** D:\KnouxCrypt
**Branch:** planning/android-crypt-suite-20261029
**Baseline SHA:** 21879a318402fe2429f304a0a9f6f991c66af548
**Visual prompt:** `visuals/prompts/10_SETTINGS.md` (reference definition only; render later)

## Goal and non-negotiable execution order
Create demonstrable Android release gates, policy compliance and secure signing practices. Deliver working code and evidence, not only a plan. Preserve original desktop application and approved aesthetics. Before writing, inspect git HEAD, origin/main, pending PRs, current worktrees, untracked work, source files, existing tests, and platform constraints; preserve all unique work. Scope: Android CI workflow, release checklist, security reports; no actual publishing without owner approval.

## Product and service specification
1. **Create GitHub Actions pipeline lint unit tests instrumentation and secret scan.** Supply real Android code, user journey and acceptance evidence. Each feature has an explicit eligibility/capability check, disabled state and user-readable failure recovery.
2. **Run dependency/license audit, SBOM, SAST and vulnerability triage.** Supply real Android code, user journey and acceptance evidence. Each feature has an explicit eligibility/capability check, disabled state and user-readable failure recovery.
3. **Run OWASP MASVS/STORAGE/CRYPTO/AUTH/NETWORK/PLATFORM/CODE/RESILIENCE/PRIVACY mapping.** Supply real Android code, user journey and acceptance evidence. Each feature has an explicit eligibility/capability check, disabled state and user-readable failure recovery.
4. **Configure signed AAB with secure signing keys kept outside repo and no key disclosure.** Supply real Android code, user journey and acceptance evidence. Each feature has an explicit eligibility/capability check, disabled state and user-readable failure recovery.
5. **Set targetSdk 36 or later for October 2026 Google Play new app requirement.** Supply real Android code, user journey and acceptance evidence. Each feature has an explicit eligibility/capability check, disabled state and user-readable failure recovery.
6. **Prepare truthful Data Safety, privacy policy and permission descriptions.** Supply real Android code, user journey and acceptance evidence. Each feature has an explicit eligibility/capability check, disabled state and user-readable failure recovery.
7. **Build reproducible release artifact metadata, versioning and rollback plan.** Supply real Android code, user journey and acceptance evidence. Each feature has an explicit eligibility/capability check, disabled state and user-readable failure recovery.
8. **Block release for critical crypto issues, missing device tests and unverified UX.** Supply real Android code, user journey and acceptance evidence. Each feature has an explicit eligibility/capability check, disabled state and user-readable failure recovery.

## Security contract / permission model
No unsigned or debug build called production, no fake test PASS, no Play submission without owner authorization. Default offline first, request Android capabilities only for feature use and after user consent. Use reviewed cryptographic libraries (AEAD only for encrypted payloads), Keystore when suitable, constrained URI and intent handling, least-privilege network/data APIs, zero logging of secrets and explicit fallbacks. A security claim must have a reproducible test or documented technical source. Hardware-backed key support is device-specific. Do not edit or ship the original custom desktop cipher as if secure.

## UX implementation blueprint
Discover from Service Hub → details page with threat/permission capabilities → preview choices and safety note → authorize sensitive actions → perform verified operation → show actionable receipt, failure or retry. Define loading, empty, permission-denied, offline, malformed input, resumed activity, app lock, expired credential and interrupted work flows. Compose components must use typed ViewModel UI states and real lifecycle-aware event handling.

## Visual-specific mission
**Mood:** Release Seal dashboard shows SHA, device test matrix and audit status. Design language is KNOUX Obsidian Protocol: #070912 noir, #7556FF violet, #65F0E8 cyan, polished dark alloys, rare precise signals; no generic dashboard copied across screens.

**Exclusive card mechanics:** Sign-and-release button remains disabled until owner-approved gate report and real keystore present. Produce a visual and interaction specification including pressed/revealed/loading/success/failed and disabled states. Use `visuals/prompts/10_SETTINGS.md` for corresponding screen slot and `visuals/approved/` for approved future imagery only. Support Arabic RTL and English LTR, 48dp touch regions, foldables, TalkBack, accessibility contrast and reduced-motion mode. All status labels and animations must reflect verified service state.

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
Artifact SHA, signing verification, CI run URLs, UI screenshots, independent security review and Play checks. Also require successful compilation in the target branch, state restoration, no silent permission prompts, no sensitive data in logs, appropriate feature-flag gating and documented uncertainty. For optional P2/P3 service, a disabled and honest service catalog entry is preferable to a deceptive mock.

## Handoff and dependencies
Follow `missions/00_START_HERE.md`, `missions/03_Threat_Model_Secure_Architecture_Claims_Registry.md`, `missions/SERVICE_CATALOG.md` and `visuals/VISUAL_SYSTEM.md`. Produce evidence, update status registry, and request owner approval before release, external sync, secret/asset deletion, irreversible operations or merge to main.
