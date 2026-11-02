# KNOUX CRYPT | NATIVE ANDROID FULL-STACK MISSIONS 01-44

STATUS: DOCUMENTATION / PLANNED, NOT IMPLEMENTED OR AUDITED.

## PURPOSE
One numbered folder per approved visual screen, and one FULLSTACK_MISSION.md per folder. Each mission covers native visual UI, real domain use cases, durable encryption/storage, Android API integration, errors, abuse cases, tests, evidence, and dependencies. Every mission corresponds to the matching visual asset in visuals/ANIMA_MISSIONS_01-44. Do not replace any current visual-agent outputs.

## SOURCE OF TRUTH
At run time inspect actual Git/PR/worktree history, approved assets, remote branches and existing Android implementation. Reconcile with existing 35 foundation missions, 80-service SERVICE_CATALOG.md, android-spec/ANDROID_ARCHITECTURE.md, android-spec/CRYPTO_SECURITY_CONTRACT.md. These mission files are ADDITIVE and must not duplicate working code.

## REQUIRED FLOW
01 SPLASH_ENTRY -> 02 SECURE_ACCESS_LOGIN -> 03 HOME -> service screens 04-44. Touch to Enter is a visual CTA TO AUTH, not authorization. Actual release requires real Keystore-protected local vault unlock via BiometricPrompt or approved credential; protected Home routes cannot bypass lock.

## NATIVE STACK
New isolated android/ workspace if one does not exist. Kotlin, Gradle Kotlin DSL, Jetpack Compose, Hilt, Navigation Compose, ViewModels with immutable StateFlow and coroutines, Room for minimal metadata plus AEAD-encrypted data, app-private encrypted files, Keystore, SAF/Photo Picker and eligible WorkManager. Testable modules: app, core-ui, core-domain, core-crypto, core-keyring, core-storage, core-files, core-capabilities, core-testing; feature modules by domain, not one crypto engine per screen.

## ACTION ORDER
A. Verify source, preserve unique branches, integrate reviewed visuals without touching active agents; create shared Android foundation and real crypto/keyring/auth/storage/backup tests.
B. Implement 01 Splash, 02 Auth, 03 Home, 04 File Cipher. Backed-up file must survive a fresh-device recovery test before claiming protected.
C. Continue missions by numbered UI order, pulling dependency foundations 15/31/37/42 earlier when necessary, without duplicating features.
D. Optional network/device/provider tools stay honestly DISABLED until backend, permissions, hardware, server ownership, threat review and testing exist.

## CONTRACT
A feature is not completed by UI or build alone: it must pass actual functional, security negative, data restore, visual parity, device and CI checks. Keep feature states PLANNED / IMPLEMENTED_UNVERIFIED / DEVICE_TESTED / SECURITY_REVIEWED / APPROVED. Never invent full-stack success, passwords, OAuth keys, signing secrets, providers or successful scans.

## VISUAL QUALITY
Preserve exact stag-K and cinematic purple identity. Match approved screenshots, spacing, logo/wordmark clearance and Android mobile insets. Compose controls are native, not embedded screenshots. Support Arabic RTL, English LTR, TalkBack, reduced motion, local mute default and appropriate per-screen subtle purple particles BEHIND the UI.

## NO DESTRUCTIVE OPERATIONS
Do not reset --hard, clean, force push, delete a worktree, remove old branches, overwrite untracked files, merge into main or publish the app without explicit approvals and preservation. Source is currently React/Electron legacy; port intentionally to Kotlin, do not use WebView wrapper.

## START
After Vercel visual agent completes, deliver 00_LOCAL_AGENT_MASTER_PROMPT.md to local model and follow 00_SAFE_SYNC_AND_GATES.md. Then execute FULLSTACK_MISSION.md in each numbered folder.
