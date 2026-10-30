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
