# 15 Backup & Recovery — first-pass source implementation

## Files / routes
- `src/components/recovery/Recovery.jsx`, `recovery.css`: split safe illustration, title, accessible Create/Restore tabs, four setup rows, amber preservation warning, configuration and educational recovery tutorial.
- `src/App.jsx`: active `/backup` replaces the holding page, preserves eight Home cards.
- `src/components/privacy/PrivacyCenter.jsx`: recovery links carry allowlisted caller state; Back returns Privacy or defaults to Home.
- `src/i18n/ar.js`: bilingual labels and explicit non-operational explanations.

## Actual checks
`npm run build` passes (existing module-type warning). No configured lint/typecheck scripts.
Temporary jsdom reproduction passes: four setup rows, allowlisted Back caller, independent mock destination/source labels across create/restore, always Not configured credentials, no secret/file inputs, acknowledgement does not report success, three-step tutorial explicitly states no test recovery/decryption/output. Native dialog is mocked, not real browser validation.
`git diff --check` passes.

## Source before/after
Before: `/backup` generic holding route. After: reference-guided accessible local React controls. Vault halves shift a single pixel on mode change; they never seal to imply success. Reduced-motion disables transitions. This is source-state evidence, not rendered screenshot comparison.

## Functional boundary
No backup/archive creation, device/cloud/file access, encryption, decryption, passwords/seeds/private keys, import, restore or verified integrity. All destinations are fictional in-memory labels. Credentials remain Not configured even after acknowledgement. Originals are never modified. Tutorial steps do not imitate recovery percentages or success.

## Visual review deferred
Canonical mission TASK and REFERENCE.png inspected. No fresh runtime screenshot captured: available browser supports only READY Vercel Preview, not localhost/Production; deployment is billing/account-blocked as previously documented. Owner requested continued source work with later preview review. Approved reference is not substituted as implementation evidence.
Procedural safe/vector icons are first-pass approximations. Exact illustration, spacing, typography, Arabic wrapping, eye/motion timing, keyboard behavior, tab focus on device and responsive safe-area clearance still require rendered comparison at reference aspect ratio and 360×800/390×844/412×915/desktop. Do not mark visual fidelity PASS.

Next numbered task: 16 Secure Share. Existing Privacy changes stay in the same unmerged successor PR; no production/billing mutation.
