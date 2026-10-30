# TASK 03 - Home

**Status:** PLANNED / NOT YET IMPLEMENTED. **Priority:** P0.
**Feature ID:** `HOME`. **Prerequisite tasks:** 00,02. **Owner:** future local Android integration agent.
**Approved visual reference:** `visuals/ANIMA_MISSIONS_01-44/03_HOME/03_HOME.png`.
**Anima screen instruction:** `visuals/ANIMA_MISSIONS_01-44/03_HOME/03_HOME.txt`.
These file paths are local reference mappings; inspect actual presence and approvals before using. Never treat a concept image as a tested production screen.

## User-facing service: end-to-end behavior
Render eight home service entries backed by actual capability registry, live vault state, real usage counters and consistent navigation.

## Native Android implementation - not a web wrapper
- Reuse Android foundation from TASK 00 and code already implemented/verified. Implement `feature:home` or merge into an existing compatible feature module; avoid duplicating screens, ViewModels, routes or services.
- Compose UI must reproduce the approved screen: stag-K artwork, geometry, lighting, page-specific motion, content spacing, responsive insets, Android back stack, accessibility, Arabic RTL/English LTR, keyboard and real component tap states.
- Bind actual ViewModel StateFlow to real use cases and repository operations: `LoadHomeState`, `ExecuteHomeAction`, `ObserveHomeEvents` are proposed domain names, not an instruction to add three redundant classes unconditionally.
- User must see distinct idle, loading, ready, completed, rejected, cancelled, unsupported, permission-denied and recoverable-error states as appropriate. No dead buttons, fake spinners, fake success statuses or animations standing in for backend work.
- Screen-specific UI behavior: Render eight home service entries backed by actual capability registry, live vault state, real usage counters and consistent navigation.
- On-demand visual motion must derive from the page purpose; violet sparks remain behind text, pointer-events cannot intercept touches, safe-area layout takes precedence over ornamental effects. Sound optional, OFF by default.

## Data contracts and persistence
- Domain entities and DTOs to define and version: ServiceCapability, VaultHealth, SecurityState, StorageUsage; values measured not invented.
- Repository functions: list/load; create/import; validate; execute; observe progress; update/delete/export/restore only when relevant to this service.
- Persist real encrypted data at rest when needed; DataStore only for nonsecret settings; Room with ciphertext boundaries and safe migrations; lifecycle-aware cancellation and automatic lock handling.
- Never put raw secrets, OTP seeds, plaintext files, derived keys, PINs, private keys or sensitive URLs into logs, crash analytics, unencrypted Room tables or Compose saved state.
- Errors must be typed, user-actionable and remain stable across process death; no silent fallback to fake demo data.

## Platform integration
Compose Navigation, StateFlow viewmodels, Android insets and back-stack restore.
- Map OS permissions to real Android permission requests or system pickers; do not request obsolete broad storage privileges. Handle revoked grants, locked device, background restrictions and unsupported hardware.
- Full vertical stack means Compose UI -> ViewModel -> domain use case -> vetted core service -> encrypted local repository and/or OS API -> observable real outcome.
- Network or server implementation is conditional on a real requirement: explicit consent, provider credentials and documented trust boundary. If no remote component is needed, an entirely OFFLINE NATIVE full-stack feature is correct; never build a pointless server.

## Threat model and failure behavior
Never display 'protected', 'ready', 'connected' for services without proven state.
- Use established keyring, AEAD and versioned package APIs. Never implement private crypto primitives, migrate unauthenticated legacy algorithms blindly, or claim untested Android capabilities.
- Define failure, rollback, integrity and recovery semantics before destructive effects; original user data preserved until separately approved operation.
- For any user data that cannot be safely accessed, show truthful unavailable/permission-required state instead of simulated completion.

## Feature test plan - mandatory before closure
- Primary user workflow executes end-to-end on device, including process restart, screen rotate, lifecycle, Android back navigation and repeated invocation.
- Negative/edge cases specific to the service: Eight cards navigate or show honest unsupported state; light/dark, Arabic RTL, small-screen screenshot checks.
- Unit tests (known-answer vectors where cryptography relevant), repository persistence test, integration tests with real OS boundaries, Compose UI tests and device screenshot comparison against provided visual; test at narrow widths, high font scaling, RTL and reduced motion.
- Confirm zero known secret leakage in persistent storage, clipboard/screenshots/logcat, deep links and exported URIs for applicable threat boundaries.
- Test error/cancel/retry semantics, content integrity, and build/CI jobs. If blocked by absent backend/keys/hardware, label BLOCKED and show verified unsupported UI instead of claiming implemented.

## Delivery evidence and done definition
- Report actual modified Kotlin/Gradle files, working route, dependency updates, tests run and their raw results, Git SHA/branch, screenshots/diffs, emulator/phone API level and runtime behavior.
- A feature is COMPLETE only after the real UI, core service and persistence/OS/optional backend integration behave correctly with evidence. A React/Anima prototype, compiled Compose UI or passing build alone is NOT proof.
- Integrate the completed module safely with previous feature routes, preserve existing approved layout and unique code; move to task 04 ONLY after documenting the actual state, or continue under explicit BLOCKED condition with no fake closure.
