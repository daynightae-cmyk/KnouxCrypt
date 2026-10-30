# KNOUX CRYPT — ANDROID MASTER EXECUTION DIRECTIVE

> Status: planning package created 2026-10-29. These files are PLANNED work, not implemented Android functionality.

## Repository of truth / preservation
- GitHub: https://github.com/daynightae-cmyk/KnouxCrypt
- Desktop repo copied, not moved, to `D:\KnouxCrypt`.
- Baseline `main` and `origin/main`: `21879a318402fe2429f304a0a9f6f991c66af548`.
- Planning work branch: `planning/android-crypt-suite-20261029`. No changes to remote/main authorized.
- Legacy project is React 18 + Vite + Electron, not native Android; legacy Windows BitLocker/VeraCrypt workflows are not portable Android APIs.
- 35 execution missions reside here, 01..35. All status PLANNED until real implementation and evidence.
- `visuals/prompts/01_SPLASH.md` through `10_SETTINGS.md` define exactly ten DIFFERENT independent reference images to produce later; no approved art exists yet.
- `visuals/references/` holds incoming reference screenshots and logos, `visuals/generated/` holds first candidates, `visuals/approved/` holds owner-approved final images only.

## Mandatory orchestration
1. Establish reality with git status, HEAD, remote/main, branches, git worktree list, PRs, stash, untracked, active agent edits, build dependencies, CI and source review.
2. Protect unique history and design artifacts; never reset --hard, clean, delete, force push or overwrite reference art.
3. Read `AUDIT_FINDINGS_2026-10-29.md`, `SERVICE_CATALOG.md`, `visuals/VISUAL_SYSTEM.md`, `android-spec/ANDROID_ARCHITECTURE.md` and `android-spec/CRYPTO_SECURITY_CONTRACT.md`.
4. Implement P0 first: missions 01,03,02,04,05,06,07,14,24,25,26,28,30,35 (dependency order can vary). First genuinely useful end-to-end delivery: file encryption mission 08.
5. Implement P1 user-facing features with credible cryptographic use cases: 09,10,11,12,13,15,18,19,20,29.
6. P2/P3 optional services require separately approved dependency, network provider or external audit: 16,17,21,22,23,27,31,32,33,34. Catalog disabled until verified.
7. Generate and approve 10 separate reference images as a later design milestone; wire into Compose only when approved and assets exist. Images cannot substitute for functioning code.
8. Define each feature's UI state machine, security boundary, permission model, encrypted data format, recovery, cancellation, errors, test vectors and documented limitations before marking complete.
9. Keep a live evidence ledger for every mission: source SHA, branch, changed files, commands, raw test results, screenshot diffs, device install, security tests, CI, signed AAB and review status.
10. Integration goes through scoped PR, human review and owner-approved merge; never silently publish or access private data.

## Non-negotiable security stop signs
- `src/core/crypto/AESCipher.ts` currently processes 16-byte blocks independently with PKCS7 and no authenticated mode or IV. Treat as INSECURE legacy implementation, not production crypto.
- Never migrate existing Serpent/Twofish custom implementations before crypto review; prefer standard, audited providers.
- Never label simulated BitLocker/VeraCrypt progress as real. Android app cannot offer Windows system partition encryption as Android functionality.
- Do not claim root/spyware monitoring, guaranteed secure deletion or universal hack detection. Capability check and truthful labels always.
- Encrypt with vetted AEAD; protect keys with Android Keystore where appropriate and recovery separately; build negative tamper tests.

## Resource/space control
On first inspection D had only ~2.76 GB free, C ~6.28 GB. Recheck immediately before Gradle/SDK setup. Do NOT automatically install gigantic Android SDK/Gradle distributions or put uncontrolled caches on D. Keep source small, request owner-approved storage strategy when disk capacity becomes a blocker. Never delete existing worktrees or cached builds without preservation and explicit approval.

## Completion reporting grammar
- IMPLEMENTED + TESTED: command, SHA, raw output and device/environment specified.
- IMPLEMENTED / UNVERIFIED: code present, test evidence missing.
- PRESENT / UNMERGED: tracked in branch or worktree only.
- COMMITTED / UNPUSHED: local commit with SHA.
- MERGED / NOT RELEASED: merge proven, release unproven.
- PLANNED: documents only.
- BLOCKED: missing API, consent, hardware, provider, review or storage.

## Instructions to any AI developer
EXECUTE, do not merely outline. Do not rewrite app from scratch without source gap analysis, destroy unique work, fake status, fabricate test output or claim all features already completed. After each mission present the evidence with file paths and SHA, genuine test results and honest next step. Maintain the owner's aesthetic identity. Never remove approved reference images.

<!-- PR15_VISUAL_BASELINE_V1 -->
## POST-MERGE HANDOFF STATUS UPDATE - 2026-10-31
- The earlier dates, LOCAL ONLY, NO NATIVE SOURCE, ANDROID UNIMPLEMENTED and VISUAL NOT BROWSER-TESTED descriptions are preserved as historical checkpoints, NOT the current situation.
- Latest visually merged main: 'de01b23f9a010cb3743bc117bb3b78c2bb5ee86c'; original PR #15 source head: 'f836a5c8e7c2e03a94f06fa8dc22a3cb5c702f55'. User accepted this source as the native coding starting point, **not** perfect design fidelity, deployed app or production release.
- Android integration branch was previously pushed at 3d986c8; current branch/HEAD must always be rechecked. PR #14 native TASK 00 source exists at 310665d **only in a separate unmerged branch**, implemented but not natively tested.
- Updated 44 SCREEN_QA.md files, 46 TASK.md instructions and shared cross-screen design/exception matrix: 'missions/fullstack-android/POST_PR15_VISUAL_BASELINE.md'.
- The 34 Tools destinations include restored Vault, Secure Notes, Passwords, Encrypt Files, Authenticator, Privacy and Recovery; preserve all eight Home cards. Keep AR/EN searching, grouped Tools UI, continuous cyber rain, original stag and eye light, safe bottom navigation, proper scrolling and motion accessibility.
- Chromium evidence in qa-evidence/pr15-fidelity/ belongs to PR15; it documents real browser runs, not Compose/runtime security. Vercel account remains blocked. All native APK/Keystore/device/security claims require new independent evidence.
- Do not touch protected original D:\KnouxCrypt, lose unique planning branches/worktrees, force-push, rewrite history, auto-merge PR #14 or delete references.
