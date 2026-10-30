# KNOUX CRYPT — VISUAL QA / NATIVE ANDROID HANDOFF
## Prepared integration snapshot (2026-10-30)

STATUS: PREPARED AND PARTIALLY AUTOMATED-TESTED. Not visually approved, device-tested, security-audited or released.

### Exact working source
- Authoritative READY worktree: D:\KnouxCrypt-Android-Ready
- Integration branch: integration/knoux-crypt-android-ready-20261030
- Remote UI baseline: dc22d15ff4b936576c68197663a2b5847d079198 (origin/main; merged PR #13)
- Integrated unique local planning source: 6c19107c181372bdca307c40b0876fe34270eb89 (cherry-picked, not discarded)
- Integrated 46-task native mission source: 5df9fc6 (cherry-picked, not discarded)
- Original D:\KnouxCrypt remains on its planning branch, untouched. Old untracked artifacts are preserved.
- Active/unmerged PR #4 feat/splash-entry must be separately reviewed; do not auto-merge or overwrite accepted art.
- Vercel checks on PR #13 indicated blocked deployment. Source merge is not successful Vercel publication.

### The visual reference rule (MANDATORY)
Use agent-handoff/KNOUX_CRYPT/**/REFERENCE.png and the owner latest overrides as the canonical pixel source, NOT full-page screenshots baked into native Image composables. Exactly 44 canonical PNG references exist.
Each matching Anima .txt prompt is copied to visuals/ANIMA_MISSIONS_01-44/NN_SLUG/NN_SLUG.txt.
Read visuals/ANIMA_REFERENCE_MAP.csv for exact mission-to-canonical-PNG mapping and checksum classification.
43 local PNGs match the GitHub approved files SHA-256 exactly. The local 03_HOME PNG DIFFERED. Preserve that single alternative at visuals/reference-review/03_HOME_LOCAL_DIFFERENT_REFERENCE.png, but use agent-handoff/KNOUX_CRYPT/03_HOME/REFERENCE.png (freestanding approved Home, NO legacy globe) as canonical.
Each prompt folder also has REFERENCE.md giving precise canonical PNG relative path. Do not duplicate all 44 PNGs or recreate design from scratch.

### Screen-level acceptance, for ALL 44 missions
1. Reference fidelity: exact deer/stag-K silhouette, eye geometry, typography, gradients, antler detail, purple-on-obsidian atmosphere, clean card spacing, icon geometry and footer, without image stretched as UI.
2. Auth optical centering: entire identity + sign-in form + alternate methods centered in available viewport; balanced top/bottom empty space; no logo/title overlap or clipping. Screen 01 -> 02 -> 03 flow; authentication and Guest Preview strictly separated.
3. True UI controls: clickable and keyboard/touch accessible buttons, tabs, forms, switches, dropdowns, sheets, menus, cards and modal Back actions with typed state, not invisible hotspots or backdrop images.
4. Native Compose typography, safe insets, 360x800, 390x844, 412x915, high font scale, rotated/keyboard states when supported, dark mode, Arabic RTL and English LTR. Scrolling and input focus work.
5. Navigation: eight Home services and all leaf routes; system Back / gesture / predictive Back; modal first, child -> parent; nested Notes Editor, Password Detail, Key Details and Recovery return to correct caller. Direct routes while locked must be denied.
6. Atmosphere/motion: original free-standing stag, separate subtle purple eye highlights, persistent falling cipher atmosphere across routes, directional top-to-bottom motion without reseeding/jumping. Localized violet embers behind text/controls; no tap blockers, no excessive power drain; reduced motion.
7. Audio: silent by default, opt-in only, quiet click/transition cues, no fake crypto success sounds, correctly mute on background/hidden and no autoplay.
8. State + security truth: existing React pages are visual demos; never label real Keystore encryption, biometric auth, backup, TOTP, signed transfer, hash proof, Android Autofill, cloud backend or hardware-backed key without native implementation and tests.
9. Loading/error cases: failed lazy import, route not found, reload, offline, revoked permission, empty list, keyboard overlay, rapid repeated clicks, browser Back/Forward; no navigation loops or lost edits hidden under a success label.
10. Capture actual rendered screenshot comparisons and interaction evidence for every section; do not treat reference PNG or SSR as visual acceptance.

### Automated QA currently available
- npm run check:routes: source/SSR component check across 44 screens, AR/EN, 45 patterns including Tools, eight Home cards, visible internal links. Does NOT test browser Back, dialogs, pixel similarity, actual OS gestures, crypto or device.
- npm run check:audio: fake Web Audio engine tests. Does NOT prove actual sound, permission, mobile playback or speaker fidelity.
- npm run build: Vite bundle compile. Does NOT prove runtime, release or Android.
- For native Android, write independent Compose screenshot and instrumentation tests plus real APK install; do not claim success from React results.

### Native Android handoff test contract
For each mission: read its missions/fullstack-android/NN_SLUG/TASK.md, matching reference from manifest and matching TXT, implement Compose + ViewModel/StateFlow + domain use case + repository/secure adapter + permission and recovery handling. Test positive and negative cases; gate feature readiness by actual capabilities.
Critical: Kotlin + Compose, Android Keystore, BiometricPrompt, authenticated envelope and independently tested recovery. UI prototype guest path NEVER grants access to a real vault. No WebView/PWA as release.
After native feature implementation, create missions/fullstack-android/NN_SLUG/EVIDENCE.md with commit SHA, files, tests and raw results, device API, screenshots, threat-model negatives, known gaps and next task. Do not claim COMPLETE if device/security evidence missing.

### Acceptance matrix status
- 44 canonical reference routes: SOURCE_PRESENT (not approved by runtime screenshot)
- 44 Anima prompts: IMPORTED / LINKED (not native implementation)
- React merged routing/audio: CODE_PRESENT (see actual npm test log for local status)
- Browser interaction and screenshot: NOT YET VERIFIED
- Native Android app/modules: NOT YET IMPLEMENTED
- Android security E2E / real hardware: NOT YET VERIFIED
- Vercel deployment: BLOCKED / NOT VERIFIED from available PR checks

### Safety / cleanup boundaries
The original repository contains distinct branches, untracked missions, older Anima ZIPs, source and unfinished staging artifacts. None are thrown away merely to clean the appearance. The READY worktree is deliberately clean: canonical latest React source, integrated native mission specs and one efficient set of reference mappings; no old ZIPs, extraneous staging or parallel duplicate mission roots.
Do not run git clean/reset --hard, force push, delete old worktree/branches or change production Vercel/Play account. Inspect disk/release status and obtain owner approval for enumerated destructive removal after verifying unique data is protected.

<!-- PR15_VISUAL_BASELINE_V1 -->
## POST-MERGE HANDOFF STATUS UPDATE - 2026-10-31
- The earlier dates, LOCAL ONLY, NO NATIVE SOURCE, ANDROID UNIMPLEMENTED and VISUAL NOT BROWSER-TESTED descriptions are preserved as historical checkpoints, NOT the current situation.
- Latest visually merged main: 'de01b23f9a010cb3743bc117bb3b78c2bb5ee86c'; original PR #15 source head: 'f836a5c8e7c2e03a94f06fa8dc22a3cb5c702f55'. User accepted this source as the native coding starting point, **not** perfect design fidelity, deployed app or production release.
- Android integration branch was previously pushed at 3d986c8; current branch/HEAD must always be rechecked. PR #14 native TASK 00 source exists at 310665d **only in a separate unmerged branch**, implemented but not natively tested.
- Updated 44 SCREEN_QA.md files, 46 TASK.md instructions and shared cross-screen design/exception matrix: 'missions/fullstack-android/POST_PR15_VISUAL_BASELINE.md'.
- The 34 Tools destinations include restored Vault, Secure Notes, Passwords, Encrypt Files, Authenticator, Privacy and Recovery; preserve all eight Home cards. Keep AR/EN searching, grouped Tools UI, continuous cyber rain, original stag and eye light, safe bottom navigation, proper scrolling and motion accessibility.
- Chromium evidence in qa-evidence/pr15-fidelity/ belongs to PR15; it documents real browser runs, not Compose/runtime security. Vercel account remains blocked. All native APK/Keystore/device/security claims require new independent evidence.
- Do not touch protected original D:\KnouxCrypt, lose unique planning branches/worktrees, force-push, rewrite history, auto-merge PR #14 or delete references.
