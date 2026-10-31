# MISSION 33 — PGP Key Exchange, Encrypted Email & Compatibility

**Status:** PLANNED / NOT IMPLEMENTED
**Priority:** P3
**Repository:** daynightae-cmyk/KnouxCrypt
**Workspace:** D:\KnouxCrypt
**Branch:** planning/android-crypt-suite-20261029
**Baseline SHA:** 21879a318402fe2429f304a0a9f6f991c66af548
**Visual prompt:** `visuals/prompts/08_KEYFORGE.md` (reference definition only; render later)

## Goal and non-negotiable execution order
Offer optional standards-based PGP file/email support after deep interoperability review. Deliver working code and evidence, not only a plan. Preserve original desktop application and approved aesthetics. Before writing, inspect git HEAD, origin/main, pending PRs, current worktrees, untracked work, source files, existing tests, and platform constraints; preserve all unique work. Scope: Future android/feature-pgp; key management boundaries.

## Product and service specification
1. **Evaluate vetted OpenPGP library and algorithm suite policy.** Supply real Android code, user journey and acceptance evidence. Each feature has an explicit eligibility/capability check, disabled state and user-readable failure recovery.
2. **Support import/export public keys and signatures with clear trust models.** Supply real Android code, user journey and acceptance evidence. Each feature has an explicit eligibility/capability check, disabled state and user-readable failure recovery.
3. **Explicit user-controlled external email app integration through encrypted attachments.** Supply real Android code, user journey and acceptance evidence. Each feature has an explicit eligibility/capability check, disabled state and user-readable failure recovery.
4. **Handle expired/revoked keys and untrusted signer warnings.** Supply real Android code, user journey and acceptance evidence. Each feature has an explicit eligibility/capability check, disabled state and user-readable failure recovery.
5. **Keep private key material encrypted and gated; favor hardware use where feasible.** Supply real Android code, user journey and acceptance evidence. Each feature has an explicit eligibility/capability check, disabled state and user-readable failure recovery.
6. **Do not store plaintext email body in third-party share intents.** Supply real Android code, user journey and acceptance evidence. Each feature has an explicit eligibility/capability check, disabled state and user-readable failure recovery.
7. **Create mailboxless offline file workflow as safe initial scope.** Supply real Android code, user journey and acceptance evidence. Each feature has an explicit eligibility/capability check, disabled state and user-readable failure recovery.
8. **Validate RFC-format compatibility on multiple independent clients.** Supply real Android code, user journey and acceptance evidence. Each feature has an explicit eligibility/capability check, disabled state and user-readable failure recovery.

## Security contract / permission model
Do not imply end-to-end email confidentiality for headers/subjects or recipient metadata. Default offline first, request Android capabilities only for feature use and after user consent. Use reviewed cryptographic libraries (AEAD only for encrypted payloads), Keystore when suitable, constrained URI and intent handling, least-privilege network/data APIs, zero logging of secrets and explicit fallbacks. A security claim must have a reproducible test or documented technical source. Hardware-backed key support is device-specific. Do not edit or ship the original custom desktop cipher as if secure.

## UX implementation blueprint
Discover from Service Hub → details page with threat/permission capabilities → preview choices and safety note → authorize sensitive actions → perform verified operation → show actionable receipt, failure or retry. Define loading, empty, permission-denied, offline, malformed input, resumed activity, app lock, expired credential and interrupted work flows. Compose components must use typed ViewModel UI states and real lifecycle-aware event handling.

## Visual-specific mission
**Mood:** Cipher Postbox with courier envelopes and public-key identity seals. Design language is KNOUX Obsidian Protocol: #070912 noir, #7556FF violet, #65F0E8 cyan, polished dark alloys, rare precise signals; no generic dashboard copied across screens.

**Exclusive card mechanics:** Select recipient fingerprint then fold message into encrypted envelope, export only ciphertext. Produce a visual and interaction specification including pressed/revealed/loading/success/failed and disabled states. Use `visuals/prompts/08_KEYFORGE.md` for corresponding screen slot and `visuals/approved/` for approved future imagery only. Support Arabic RTL and English LTR, 48dp touch regions, foldables, TalkBack, accessibility contrast and reduced-motion mode. All status labels and animations must reflect verified service state.

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
Cross-client fixtures, revoked keys, malformed packet parser and key mistrust tests. Also require successful compilation in the target branch, state restoration, no silent permission prompts, no sensitive data in logs, appropriate feature-flag gating and documented uncertainty. For optional P2/P3 service, a disabled and honest service catalog entry is preferable to a deceptive mock.

## Handoff and dependencies
Follow `missions/00_START_HERE.md`, `missions/03_Threat_Model_Secure_Architecture_Claims_Registry.md`, `missions/SERVICE_CATALOG.md` and `visuals/VISUAL_SYSTEM.md`. Produce evidence, update status registry, and request owner approval before release, external sync, secret/asset deletion, irreversible operations or merge to main.
