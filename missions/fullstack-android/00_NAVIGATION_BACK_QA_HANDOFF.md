# KNOUX CRYPT — Navigation, Back, Accessories and Native Handoff QA

Status: POST-PR13 REVIEW CHECKLIST, NOT DEVICE-TESTED. Created 2026-10-30 after reading merged source. This is ADDITIVE and does not modify visual agents' files.

## Observed GitHub fact
- PR #13 merged to origin/main at dc22d15ff4b936576c68197663a2b5847d079198.
- Feature head ed36402f177462edb09c2bae7709332961f77ec4.
- Merged source has BrowserRouter, 44 mission route registry entries, persistent AppShell, bottom nav, NavigationEffects (title / live region / focus), background visibility pause, and optional interaction sounds.
- Vercel PR #13 statusCheckRollup reports FAILURE (deployment blocked); merge is NOT runtime verification.
- Local working branch planning/android-crypt-suite-20261029 at 6c19107c181372bdca307c40b0876fe34270eb89. The many untracked mission/image folders MUST be preserved.

## Mandatory behavioral QA before marking visual delivery accepted
1. Splash: Touch to Enter -> Secure Access, never silently bypass local gate in final Android production.
2. Auth: Back -> Splash when entered from Splash; Back -> Home when opened from account. Guest -> Home as visual demo ONLY; Native production guest cannot read vault/private data or grant crypto key access.
3. Home: all eight cards navigate to the correct service; Tools/Account bottom navigation is consistent and protected-route rules stay intact.
4. Subroutes: Notes Editor returns to Notes; Password Detail returns to Passwords; Key Details returns to Key Forge; Recovery returns to Privacy or Home according to entry source; modal dismiss returns focus to opener.
5. Browser history: Back/Forward after 4+ hops restores correct route and scroll without jumping to outdated forms; direct URLs, refresh, nested routes, unknown route and reload work. Inspect state-based parent links separately from history-back semantics.
6. Native Android Back: Navigation Compose pops sheets/dialogs first, then nested feature, then Home; at entry/locked state behavior is explicit. Test system Back gesture, predictive-back API behavior and physical/software Back keys.
7. Transient UI: search, filter, tabs, overlays, gestures, loading and error sheets are keyboard/touch accessible; repeated taps do not duplicate navigation or sound.
8. Support: Arabic/English and RTL/LTR; TalkBack focus moves to heading once after route, not during typing; keyboard/insets, high font scale and small Android screens; reduce motion; sound off by default and muted in background.
9. Animations: stag-K unchanged; eye/antler glow aligned with artwork; falling violet cipher background persists across routes, descends top-to-bottom and pauses when app hidden; particles do not obstruct controls.
10. Never display fake protected/verified badges from demo routes. Source screenshot is not runtime evidence.

## Evidence required
- Working browser: screenshots or video of first three scenes, Home card to feature and back, modal dismiss, RTL, narrow screen and dark mode.
- Actual tested source SHA, dev build/test commands and outputs, browser console and network failures, Vercel deployment ID if created, CI status.
- Once ported: debug APK install on actual emulator/device API level, Android system Back and gesture results, restore state after process death and lock bypass-negative tests.
- Explicit status: CODE PRESENT / BUILD PASS / BROWSER TEST PASS / DEVICE TEST PASS / SECURITY REVIEW PASS as separate, never combined without evidence.

## Safe local agent kickoff
Read missions/fullstack-android/LOCAL_AGENT_AFTER_VISUALS.md.
Fetch remote refs without replacing local files. Inventory untracked data and branch-specific unique work, compare exact merged PR13 content and later remote commits. Work in a separate reviewed integration branch; do not clean/reset/force push or overwrite active visual work.
Port approved visual behavior into Native Kotlin Jetpack Compose and Android Navigation. Shared AppShell and route semantics must be recreated natively, not wrapped in WebView. Keep real data behind biometric/Keystore/local authorization. Connect each fullstack task with evidence.

<!-- PR15_VISUAL_BASELINE_V1 -->
## POST-MERGE HANDOFF STATUS UPDATE - 2026-10-31
- The earlier dates, LOCAL ONLY, NO NATIVE SOURCE, ANDROID UNIMPLEMENTED and VISUAL NOT BROWSER-TESTED descriptions are preserved as historical checkpoints, NOT the current situation.
- Latest visually merged main: 'de01b23f9a010cb3743bc117bb3b78c2bb5ee86c'; original PR #15 source head: 'f836a5c8e7c2e03a94f06fa8dc22a3cb5c702f55'. User accepted this source as the native coding starting point, **not** perfect design fidelity, deployed app or production release.
- Android integration branch was previously pushed at 3d986c8; current branch/HEAD must always be rechecked. PR #14 native TASK 00 source exists at 310665d **only in a separate unmerged branch**, implemented but not natively tested.
- Updated 44 SCREEN_QA.md files, 46 TASK.md instructions and shared cross-screen design/exception matrix: 'missions/fullstack-android/POST_PR15_VISUAL_BASELINE.md'.
- The 34 Tools destinations include restored Vault, Secure Notes, Passwords, Encrypt Files, Authenticator, Privacy and Recovery; preserve all eight Home cards. Keep AR/EN searching, grouped Tools UI, continuous cyber rain, original stag and eye light, safe bottom navigation, proper scrolling and motion accessibility.
- Chromium evidence in qa-evidence/pr15-fidelity/ belongs to PR15; it documents real browser runs, not Compose/runtime security. Vercel account remains blocked. All native APK/Keystore/device/security claims require new independent evidence.
- Do not touch protected original D:\KnouxCrypt, lose unique planning branches/worktrees, force-push, rewrite history, auto-merge PR #14 or delete references.
