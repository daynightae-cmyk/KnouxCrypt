# KNOUX CRYPT - Android Full-Stack Execution Missions (46 tasks)

## Delivery model
This folder holds **44 screen-by-screen vertical service missions**, plus **00 native foundation** and **45 final integration/release**. It is separate from Anima/Vercel visual work and does not change UI code or repository history by itself. Everything starts PLANNED.

### Execution order
00 Android foundation -> 01 Splash -> 02 Secure Access -> 03 Home -> 04..44 actual services (respect dependency notes) -> 45 integrated device test/release gates.

### Exact directory mapping
Each numbered task is one directory with exactly one `TASK.md`. A task describes: approved UI parity, Android Kotlin/Compose implementation, domain models, crypto/privacy boundaries, persistence, optional network backend when genuinely required, per-feature errors, tests and verified deliverables.

### Non-negotiable guardrails
- Production path: Kotlin + Jetpack Compose, Android Keystore and vetted crypto, scoped storage, Room encrypted content and modern lifecycle. **Not** Electron, React Native or website-in-WebView.
- UI reference: owner-approved KNOUX identity and screenshot, one image per screen. Preserve active Vercel/Anima visual agent work; avoid parallel edits to its files.
- Android local gate: Splash -> Secure Access -> Home; once production auth is implemented, it must not be bypassable. Demo-only visual login is never production access.
- Security: authentic encryption, nonce and key lifecycle, documented recovery, no simulated progress/status, no 'unhackable' claims, meaningful device and tamper tests.
- Server code ONLY for features that actually need remote services and only with provider approval/consent: ciphertext-only sync, key exchange metadata, OAuth server-side auth when approved; never offload raw vault keys/secret plaintext.
- Treat each task as a dependency-complete vertical slice; do not create 44 empty screens and claim full stack.
- If external keys, credentials, account ownership or destructive/release actions are needed, BLOCKED is the correct non-interactive stop. Continue safe independent tasks without asking repeated questions.

### Source of truth
Review `android-spec/ANDROID_ARCHITECTURE.md`, `android-spec/CRYPTO_SECURITY_CONTRACT.md`, `missions/SERVICE_CATALOG.md`, and the latest remote main and current visual code. Existing 35 missions remain useful, not superseded or deleted.

### Begin
Read `LOCAL_AGENT_AFTER_VISUALS.md` in this directory for an executable, evidence-led implementation mandate.

<!-- PR15_VISUAL_BASELINE_V1 -->
## POST-MERGE HANDOFF STATUS UPDATE - 2026-10-31
- The earlier dates, LOCAL ONLY, NO NATIVE SOURCE, ANDROID UNIMPLEMENTED and VISUAL NOT BROWSER-TESTED descriptions are preserved as historical checkpoints, NOT the current situation.
- Latest visually merged main: 'de01b23f9a010cb3743bc117bb3b78c2bb5ee86c'; original PR #15 source head: 'f836a5c8e7c2e03a94f06fa8dc22a3cb5c702f55'. User accepted this source as the native coding starting point, **not** perfect design fidelity, deployed app or production release.
- Android integration branch was previously pushed at 3d986c8; current branch/HEAD must always be rechecked. PR #14 native TASK 00 source exists at 310665d **only in a separate unmerged branch**, implemented but not natively tested.
- Updated 44 SCREEN_QA.md files, 46 TASK.md instructions and shared cross-screen design/exception matrix: 'missions/fullstack-android/POST_PR15_VISUAL_BASELINE.md'.
- The 34 Tools destinations include restored Vault, Secure Notes, Passwords, Encrypt Files, Authenticator, Privacy and Recovery; preserve all eight Home cards. Keep AR/EN searching, grouped Tools UI, continuous cyber rain, original stag and eye light, safe bottom navigation, proper scrolling and motion accessibility.
- Chromium evidence in qa-evidence/pr15-fidelity/ belongs to PR15; it documents real browser runs, not Compose/runtime security. Vercel account remains blocked. All native APK/Keystore/device/security claims require new independent evidence.
- Do not touch protected original D:\KnouxCrypt, lose unique planning branches/worktrees, force-push, rewrite history, auto-merge PR #14 or delete references.
