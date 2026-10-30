# KNOUX CRYPT — LOCAL SYNC AND QA RESULTS (2026-10-30)

## Scope, source of truth and release status
- READY working directory: D:\KnouxCrypt-Android-Ready
- Integration branch: integration/knoux-crypt-android-ready-20261030; LOCAL ONLY — not pushed, not merged into origin/main.
- Merged React visual baseline: dc22d15ff4b936576c68197663a2b5847d079198.
- Preserved unique local planning source commit: 6c19107c181372bdca307c40b0876fe34270eb89, applied via cherry-pick as 9f95798dd4afe82c9896787c1f5a905e2d99e2a4.
- Preserved unique native task source: 5df9fc6, applied via cherry-pick as d500e76 (see exact final SHA in Git).
- Original D:\KnouxCrypt planning worktree not modified or cleaned.
- PR #13 merged. PR #4 feat/splash-entry still OPEN at last check; review rather than assume it is obsolete.
- Vercel check FAILURE/blocked at last verification. Deployment not proven. No Android native implementation, SDK or APK proven.

## Source reconciliation
- 46 missions (00 foundation, 01-44 native feature vertical slices, 45 integration) in missions/fullstack-android.
- 44 additional per-screen SCREEN_QA.md documents generated and linked to correct local design prompt.
- 44 Anima .txt prompts imported, with pointer files and one reference manifest visuals/ANIMA_REFERENCE_MAP.csv.
- Of local historical PNGs, 43 SHA-256 identical to accepted GitHub handoff references, one differing Home. Local Home version preserved in visuals/reference-review/03_HOME_LOCAL_DIFFERENT_REFERENCE.png; official freestanding deer Home remains authoritative.
- Original supplemental old specs/ZIPs/staging remain preserved in original checkout. See CLEANUP_PROTECTION_LEDGER.md; nothing destructively deleted.

## Actual commands, exact results
Environment: Windows machine, Node v24.21.0, npm v11.19.0. npm cache redirected to D:\KnouxNpmCache to protect low C: free space.

npm install --no-audit --no-fund
- EXIT CODE 0, 566 packages installed; package-lock.json newly generated for reproducibility.
- Observed deprecated dependency warnings and skipped postinstall script approval notice for electron@32.3.3 and esbuild@0.18.20. Do not claim old dependency security audit PASS.

npm run check
- EXIT CODE 0.
- check:routes PASS: 44 mission components render under Arabic and English, 45 unique registered route patterns including Tools, eight Home cards, 166 visible internal links resolve. This checks SSR/source only, not browser interaction or visual pixel alignment.
- check:audio PASS: silent initial state, opt-in cues, rate limits, hidden/muted suppression, cleanup and idempotent disposal. This uses mock WebAudio, not listening/device playback.
- vite build PASS: 450 modules transformed, production assets produced in build/, built in 9.05 seconds. Warning about MODULE_TYPELESS_PACKAGE_JSON in postcss.config.js, existing / non-blocking. No signed APK.
- These results cannot verify actual live crypto, backend, Android OS permissions, application security or Google Play release.

## Actual real Chrome mobile browser smoke
Preview served from 127.0.0.1:3839. Installed Chrome controlled through DevTools Protocol from scripts/Run-Chrome-Mobile-Smoke.cjs using Emulation.setDeviceMetricsOverride with REAL viewport 390x844 (DPR 1, touch enabled). CDP script EXIT CODE 0.

- Splash route / — real window.innerWidth 390, document scrollWidth 390; h1 Knoux Crypt, real DOM and screenshot rendered; PASS preliminary browser render/no-horizontal-overflow.
- Auth route /secure-access-login — real width 390, document scrollWidth 390; h1 وصول آمن; correct sign-in form, method cards and branding visually present. PASS preliminary render/no-horizontal-overflow.
- Home route /home — real width 390, document scrollWidth 390; h1 خزنتك محمية; accepted standalone stag, eight service cards and bottom navigation visually present. PASS preliminary render/no-horizontal-overflow.

Evidence:
- qa-evidence/mobile-cdp-report.json
- qa-evidence/01_SPLASH_MOBILE_390x844.png
- qa-evidence/02_AUTH_MOBILE_390x844.png
- qa-evidence/03_HOME_MOBILE_390x844.png

Important measurement caution: Chrome headless CLI --window-size=390,844 WITHOUT CDP silently used 500 CSS px inner viewport and produced misleading clipped 390px image output. The incorrect first-pass screenshots are quarantined outside the ready worktree in D:\KnouxChromeQA_Artifacts\invalid_cli_500px_viewport. Do not report that fake clipping as an app regression. True CDP 390px viewport shows no horizontal overflow.

## QA not yet established
- Real tap-through interactions (Splash Touch to Enter -> Auth -> Home and back) not manually/browser-automated end-to-end, merely route/direct-render preliminary checks.
- Pixel-exact match to all 44 reference images, detailed CSS geometry, frame-rate, actual physical-device safe insets, dark/forced colors, Arabic/English typography at 200%, and manual sound quality not yet tested.
- Native Kotlin Android does not exist; Android SDK default path did not exist; Android app install, Keystore, BiometricPrompt, TOTP, secure storage, file cipher and backup/restore all NOT TESTED/NOT IMPLEMENTED.
- Vercel live deployment status blocked; no publication claim.
- npm audit / dependency vulnerability remediation not run; legacy deprecated dependency warnings remain.

## Safe next action for local implementation model
Read missions/fullstack-android/00_READY_TO_START_LOCAL_ANDROID.md, 00_VISUAL_QA_HANDOFF.md and 00_NAVIGATION_BACK_QA_HANDOFF.md, then TASK 00. Reverify remote origin/main and PR #4 before integration changes. Work in native Kotlin/Compose in isolated new module, reuse current approved React visual evidence, protect every unique branch and source; owner approval required for destructive cleanup, main merge, signing and production release.
