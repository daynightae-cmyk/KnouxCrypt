# TASK 45 - Native Android integration, security and release gates

Status: PLANNED. This is the last gate, not a pre-approved release.

1. Reconcile all TASK 00..44, source and latest remote main; protect unique visual and local commits, branches, worktrees, stashes and untracked assets. Never reset/clean/force without owner approval.
2. Validate 44 route registrations, biometric gate, cryptographic lifecycles, storage migrations, export/import contracts, offline operation, optional provider boundaries, and failure handling.
3. Lock down service capability claims and hidden placeholder states; blocked P2 services remain disabled and explicit if provider/hardware/security audit unavailable.
4. Run gradle tests + lint + Android instrumented suites + property/fuzz/negative crypto tests + key rotation and recovery DRILL on a separate device. Inspect raw output.
5. Compare each native Compose screen to its exact approved reference. Check no visual regressions on Splash, Auth, Home, deer logo eye animation, violet particles, keyboard, RTL, small screens, Dark/Day and touch affordance.
6. Security: Android Keystore behavior on tested devices, permission downgrade, replay/tamper, nonces, encrypted logs audit, backup exclusion, release keystore provenance and supply-chain/SBOM. Independent review needed for strong security marketing claims.
7. Build signed AAB with authorized signing key only, verify Android target/permissions policies and pre-launch report, review CI and publish only with explicit owner authorization.
8. Evidence-ledger per feature: sha, branch, PR, merged, deployed, installed, raw commands/results, screenshots and release track. Distinguish implemented, unverified, unmerged, unpushed, unreleased and blocked.
9. Never announce 100%, COMPLETE, AUDITED, RELEASED or Google Play approval without evidence for each applicable gate.

<!-- PR15_VISUAL_BASELINE_V1 -->
## Visual baseline checkpoint - PR #15 (2026-10-31)
- Use merged main visual source 'de01b23f9a010cb3743bc117bb3b78c2bb5ee86c' and 'missions/fullstack-android/POST_PR15_VISUAL_BASELINE.md', together with this mission's SCREEN_QA.md (when present), before implementing native Compose UI.
- Maintain the original business/security scope and task dependencies. Preserve all 46 tasks; do not equate React/Vercel screenshots with native functionality. PR #14 partial TASK 00 stays unmerged and IMPLEMENTED_UNVERIFIED until separately reconciled/tested.
- All owner-accepted visual deviations are **implementation baseline only**, not pixel-perfect approval. Compare actual Android outputs with canonical per-screen references and record residual differences in EVIDENCE.md.
