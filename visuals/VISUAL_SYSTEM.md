# KNOUX CRYPT — OBSIDIAN PROTOCOL VISUAL SYSTEM V1

**Status: concept specification, NOT approved image render.** Later generation must produce **10 independent PNG files**, one full screen per file; NEVER collage, contact sheet, grid, split-screen or multiple screens inside one image.

## Signature / mood
The world is silent, encrypted, impossible to casually penetrate. Sophisticated *defensive cryptography* meets cinematic, slightly ominous security research hardware. Inspired by precision, dark terminals, physical safes and orbital cipher diagrams, but **do not copy Offensive Security/Kali logos, marks, typography or product UI**. Own original KNOUX identity. No hacker clichés, skulls, Matrix rain, excessive RGB, fake breach gauges or stock dashboard.

## Design tokens
- Abyss: `#05070D`; Obsidian: `#070912`; Raised: `#111624`; Sealed Surface: `#171C2B`.
- Spectral Violet: `#7556FF`; Cipher Cyan: `#65F0E8`; Metal: `#8993AD`; Near-white: `#F2F4FF`; Alert: `#FF586D` (ONLY real error/risk).
- Icon stroke: 1.5–1.8dp vector, glowing edge only active state. Borders hairline. Sparse volumetric light and realistic metal/glass; maintain text contrast.
- 8dp grid; card radius 18–28dp with intentional asymmetric corners. Android touch 48dp+, Compose safe areas, single-hand control region and dynamic system insets.
- Typography: geometric English grotesk + legible Arabic sans; numeric hashes and identifiers monospaced in isolated LTR blocks. Never bake unreadable long text into backgrounds.
- Motion: spring-bound seal expansion, scanning halos and physical tactile refraction. Animations are aesthetic only; no fake 'encryption done' state. Reduced motion and muted sound defaults.

## Distinctive interaction families (do not repeat generic card pattern)
01 Splash: fractured seal closes and opens; 02 Onboarding: scrollable trust capsule; 03 Login: biometric illuminated gate; 04 Home: orbital radial nav with weighted tiles; 05 File Encrypt: armored cipher drawer and authenticated job receipt; 06 Media Vault: sealed parallax gallery; 07 Notes: book-fold archive; 08 Keys: key lattice and fingerprint verification; 09 Privacy: evidence-connected radar plates; 10 Settings: recovery dual-chamber and policy matrix.

## Generation contract for next phase
- Create portraits `1080x2400` target 9:20 Android phone reference; preview/mock up at higher resolution if generator allows. (A landscape review board may be created separately but NEVER substitute for 10 portrait files.)
- Each file **only one screen**, numbered `screen_01_splash.png` to `screen_10_settings.png`; no subtitles/artboards around screens, no watermark or unrelated logos.
- The generator must read **only that screen's prompt** plus this common visual system. The resulting screen must be crisp, buildable, consistent global shell and unambiguously different service-specific composition.
- Initially output to `visuals/generated/`. Review individually for accurate brand, typography, screen count, composition and accessible controls; only owner-approved files copied to `visuals/approved/` retaining file names.
- Put any user-provided inspiration/logos/screenshots in `visuals/references/` with provenance and owner-approved usage; no external copyrighted marks.
- Never bake secrets/phone numbers/recovery codes/real QR seed in screenshots. Use demonstrably fictional content.

## Visual → code acceptance
Compare Compose screenshot and reference on safe areas, typography, spacing, cards, typography, interaction states, RTL, small devices and motion. Assets may be raster but all tappable buttons, text and cards must be REAL native UI components. No image-only fake app.

<!-- PR15_VISUAL_BASELINE_V1 -->
## POST-MERGE HANDOFF STATUS UPDATE - 2026-10-31
- The earlier dates, LOCAL ONLY, NO NATIVE SOURCE, ANDROID UNIMPLEMENTED and VISUAL NOT BROWSER-TESTED descriptions are preserved as historical checkpoints, NOT the current situation.
- Latest visually merged main: 'de01b23f9a010cb3743bc117bb3b78c2bb5ee86c'; original PR #15 source head: 'f836a5c8e7c2e03a94f06fa8dc22a3cb5c702f55'. User accepted this source as the native coding starting point, **not** perfect design fidelity, deployed app or production release.
- Android integration branch was previously pushed at 3d986c8; current branch/HEAD must always be rechecked. PR #14 native TASK 00 source exists at 310665d **only in a separate unmerged branch**, implemented but not natively tested.
- Updated 44 SCREEN_QA.md files, 46 TASK.md instructions and shared cross-screen design/exception matrix: 'missions/fullstack-android/POST_PR15_VISUAL_BASELINE.md'.
- The 34 Tools destinations include restored Vault, Secure Notes, Passwords, Encrypt Files, Authenticator, Privacy and Recovery; preserve all eight Home cards. Keep AR/EN searching, grouped Tools UI, continuous cyber rain, original stag and eye light, safe bottom navigation, proper scrolling and motion accessibility.
- Chromium evidence in qa-evidence/pr15-fidelity/ belongs to PR15; it documents real browser runs, not Compose/runtime security. Vercel account remains blocked. All native APK/Keystore/device/security claims require new independent evidence.
- Do not touch protected original D:\KnouxCrypt, lose unique planning branches/worktrees, force-push, rewrite history, auto-merge PR #14 or delete references.
