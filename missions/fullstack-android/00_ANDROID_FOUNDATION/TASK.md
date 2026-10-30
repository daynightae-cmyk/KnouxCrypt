# TASK 00 - Native Android full-stack foundation

STATUS: PLANNED. This is an execution spec, not a claim that Android is already implemented.

## Objective
Create the production Android Kotlin/Jetpack Compose vertical foundation alongside existing React/Electron assets WITHOUT deleting or replacing them. Preserve the current cinematic KNOUX stag-K identity and approved designs. Never migrate insecure legacy JavaScript crypto to native.

## Implementation
1. Inspect Git and Vercel/Anima agent output, collect actual current origin/main, all unique branches/worktrees/stash, existing Android Gradle modules and screenshot assets. Do not rebuild anything already done.
2. Native Android: Gradle Kotlin DSL; Kotlin; Compose + Material 3 themed KNOUX tokens; Navigation Compose; ViewModel + StateFlow + Coroutines; Hilt or selected DI; Room for nonsecret metadata and correctly encrypted sensitive fields; DataStore for nonsecret settings; WorkManager only for valid background work.
3. Modules, if appropriate to repo: :app, :core:designsystem, :core:domain, :core:crypto, :core:keyring, :core:storage, :core:files, :core:capability, :core:testing; :feature:<name> modules as actual boundaries, not empty scaffolding.
4. Crypto boundary: audited AEAD with unique nonces and AAD, versioned envelope, authenticated chunked file streaming, Android Keystore wrapping and explicit fallback, dedicated encrypted restore/recovery. No custom block modes or unauthenticated legacy primitives. Define key lifecycle, error types and event audit.
5. Security: OWASP MASVS checks, least Android permissions, no analytics on secrets, threat model and signed-app provenance; do not claim StrongBox/Keystore hardware guarantees without runtime evidence.
6. Android entry route: SPLASH_ENTRY -> SECURE_ACCESS_LOGIN -> HOME. Require real lock policy to access actual secrets; temporary demo entry is explicitly feature-flagged and disabled in release.
7. App UI: use current approved screen images as reference, implement real native Compose components; not a screenshot wrapped in click hotspots; compare snapshots for responsive Android, dark mode, RTL, reduced motion, clipping, safe areas, and logo clearance.
8. If an external service is truly needed, define threat boundary, minimal ciphertext-only DTO schema, authentication, authorization, data retention, abuse limits, OpenAPI contract, staging and server test suite before making server calls. Offline features remain fully native; a server is NOT fabricated to call them 'full-stack'.
9. Establish build/test scripts, emulator/device provisioning within disk budget, detekt/ktlint, security vectors, Android instrumented tests, accessibility and screenshot regression CI. Check actual latest Google Play target SDK requirements before release.
10. Maintain one truthful feature registry: PLANNED, UNSUPPORTED, IMPLEMENTED_UNVERIFIED, TESTED, AUDITED. Every claim tied to SHA, test command, report and actual device evidence.

## Acceptance
Android debug build installs and launches on a tested Android device/emulator; route stack and lock state function; core AEAD tests pass independent vectors; no actual secrets in logs; screenshot parity assessed; CI and gradle outputs archived; app remains independent of Windows BitLocker/VeraCrypt assumptions. No PASS without evidence.
