# KNOUX CRYPT — PR #15 VISUAL FREEZE FOR ANDROID HANDOFF

> Status: OWNER ACCEPTED AS IMPLEMENTATION BASELINE on 2026-10-31 (Asia/Dubai); **not** pixel-perfect, visually released, deployed, security-tested, or native Android tested.
>
> This document supersedes the *historical baseline/status claims* in 2026-10-29/30 preparation notes. The original notes and all 46 missions remain preserved.

## Provenanced source
- Repository: `https://github.com/daynightae-cmyk/KnouxCrypt`
- Visual source PR: `#15`, branch `visual/refine-home-tools-rain`, final visual head `f836a5c8e7c2e03a94f06fa8dc22a3cb5c702f55`.
- Merged visual baseline: **`main` merge `de01b23f9a010cb3743bc117bb3b78c2bb5ee86c`**.
- Historical pre-visual `main` baseline: `dc22d15ff4b936576c68197663a2b5847d079198` (never treat it as current visual source).
- Native integration baseline prior to reconciliation: `3d986c8a9625e3e4c8fdf57c1a90c5ebd39983e0`.
- PR #14 (`android/task00-foundation-review`, head `310665d2119c80ce549ea0c3af2c34052697a434`) holds **separate partial unverified Kotlin foundation**; not in `main`, not in this integration branch until deliberately reconciled. Do not assume TASK 00 is accepted.
- Protected historical worktree: `D:\KnouxCrypt`; Android READY execution worktree: `D:\KnouxCrypt-Android-Ready`.

## Approval scope and source of truth
The owner has explicitly decided to stop iterating visuals and use the current PR #15 implementation as the coding baseline. This is permission to **implement against the current source**, not a certification of reference-perfect rendering or deployed Vercel runtime.

For each native Compose screen read, in this order:
1. The **canonical** `agent-handoff/KNOUX_CRYPT/<screen>/REFERENCE.png` (see `visuals/ANIMA_REFERENCE_MAP.csv`). The historical different Home PNG in `visuals/reference-review/` is NOT canonical.
2. The corresponding `visuals/ANIMA_MISSIONS_01-44/<screen>/*.txt`, `TASK.md`, and `SCREEN_QA.md`.
3. `src/components/entry/StagEmblem.jsx`, `stag.css`, `src/components/home/Home.jsx`, `home.css`, `src/components/shell/AppShell.jsx`, `shell.css`, `interaction.css`, `src/config/screens.js`, and the mission-specific React scene.
4. The merged `docs/VISUAL_REFINEMENT_CURRENT.md` and `qa-evidence/pr15/` and `qa-evidence/pr15-fidelity/` logs/screenshots.

React is a **visual behavior reference**, never a cryptographic, authentication, or Android runtime implementation.

## Locked-in visual behavior for native translation
- Preserve the **exact original transparent stag-K logo image, antler geometry and wordmark**, not a replacement deer, globe, screenshot-only UI, or obsolete Home.
- Preserve premium violet-on-obsidian glass, service artwork, deterministic particles, curved energy ribbons, continuous downward cyber-security code/terms and subtle independent violet-white eye lights. Implement reduced-motion and background pauses; visual ray/eye anatomical alignment remains a known review exception.
- Initial Splash → Secure Access → Home navigation and owner-approved flow; preserve guest/demo isolation. Native guest **must never** unlock stored secrets.
- Home hero must stay proportionally compact: at 441×784 reference aspect the final 8 Home cards clear the fixed footer in both languages according to PR15 browser evidence. At smaller widths permit necessary content scroll rather than clipping or unreadable miniaturization.
- Home must retain **8 canonical cards**; Tools must preserve **34 unique canonical destinations** and accessible AR/EN search across all titles, including seven restored routes: Encrypt Files, Vault, Secure Notes, Passwords, Authenticator, Privacy Center, Recovery. Do not regress to 27 entries.
- Tools now uses categorized default Essentials and category selection with an explicit All tools mode. Its compact default 390×844 layout avoids the old giant directory; All tools may require ordinary vertical scrolling. Keep anchored bottom navigation, correct safe insets, keyboard clearance, unique results and a useful empty state.
- Preserve native navigation/back behavior, authentic tappable controls and meaningful empty/loading/error/permission states. Native Compose components must be real UI, not a screenshot with transparent hit targets.
- Treat all security, encrypted, biometric, backup, sync, TOTP, autofill, and hardware claims in React as **VISUAL DEMO** until proved by independently tested Android features.

## Available evidence; do NOT overclaim
- PR15 reports `npm run check` exit 0, 44 Arabic/English SSR routes, 45 route patterns, 8 Home cards, audio mocks and Vite build.
- Browser evidence in `qa-evidence/pr15-fidelity/`: 136 search inputs, 68 Tools clicks, categorized Tools tests at five sizes and both locales, 88 mission route opens/captures at 390×844, no JS errors/overflow warnings in reported final pass, rain and eyes animation checks. These are **archived tests from the PR agent**, not automatically rerun on this Windows worktree.
- Composition evidence: `qa-evidence/pr15-fidelity/composition-metrics.json` confirms 8 Home cards clear footer at 441×784 reference ratio. Additional 360×800 may still scroll naturally.
- Vercel status remained `failure: Account is blocked`; do **not** claim a successful preview, production deployment, or live-hosted acceptance.
- Full reference-by-reference perceptual parity, eye/video timing, custom typography/icons, all service illustrations, physical Android safe areas/keyboard/Back, audio quality, device FPS and Android security/runtime **not fully verified**.
- PR14 native Kotlin/Compose/AES-GCM source is **IMPLEMENTED_UNVERIFIED / PRESENT_UNMERGED**; compiler/Gradle, emulator, APK and security tests not proven by React tests.

## Mandatory future verification gates
- For every native mission, compare real Compose screenshot at representative device sizes plus AR/EN to canonical PNG; enumerate accepted exceptions and unresolved differences without declaring perfect fidelity.
- Validate 8 Home cards, 34 Tools destinations, categorized navigation, bilingual search/empty results, footer safe areas, keyboard, predictive Back and nested routes.
- Test eye animation masks, reduced motion and continuous downward rain on actual Android hardware/emulator; do not infer timing solely from SVG bounds.
- Implement real service state/domain/Keystore/AEAD/storage with negative tests and tested failure handling; never fake secure completion.
- Preserve QA evidence per task in its `EVIDENCE.md` and report exact branch/SHA, commands, device/API, screenshot diffs, limitations and next action.

## Execution and Git safety
- Main is the merged visual product; Android integration is a **distinct branch** with unique 2026-10-29/30 planning and mission commits. Do not reset/rebase/force-push or delete any worktree.
- Fetch and reconcile the visual merge through a regular non-destructive merge, preserving all 46 TASK files and 44 SCREEN_QA files.
- Do not merge PR14 automatically during visual sync. Inspect its diff separately after the updated handoff and native toolchain readiness.
- Source reconciliation, React checks and Git push are **not** an Android APK, Play release or security sign-off.
