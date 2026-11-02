# KNOUX CRYPT — Unique Work Inventory

Baseline: `main` @ `c2198496bdb89a7f829c18c8762fc0c31e2fc78a`.

## Desktop lane

| Contribution | Location | Status | Disposition |
|---|---|---|---|
| 44 real desktop services (tasks 01–44) | `src/components/*`, `electron/vault/*` | Integrated in main | Keep; baseline. |
| NTFS owner-only DACL enforcement | `electron/vault/acl.js` | Integrated in main (`71f6b12`) | Keep. |
| CSP (dev/prod/packaged + splash) | `electron/main.js`, `electron/splash.html` | Integrated | Keep. |
| NSIS installer rewrite | `electron/installer.nsh` | Integrated | Keep. |
| QA harnesses (EXE + installer) | `scripts/qa-windows-exe.cjs`, `scripts/qa-windows-installer.cjs` | Integrated | Keep. |
| Runtime checks (lifecycle/runtime/csp/routes) | `scripts/*` | Integrated | Keep. |
| Visual QA screenshots | `qa-evidence/*` | Integrated | Keep. |
| Splash entry animation | `src/components/entry/*` | Integrated | Keep. |
| Desktop visual references | `visuals/`, `agent-handoff/` | Integrated | Keep. |

## Branches with non-zero ahead count

| Branch | Ahead | Desktop-relevant? | Disposition |
|---|---|---|---|
| `origin/fix/windows-electron-qa-20261101` | 4 | No (only Android evidence/missions) | Preserve Android evidence; desktop files identical. |
| `origin/feat/splash-entry` | 1 | Doc only | Preserve as reference. |
| `origin/desktop/tasks-01-04-real-security` | 1 | Full snapshot | Superseded. |
| `origin/desktop/electron-fullstack-44-services-20261031` | 21 | Superseded by main PRs #28–#30 | Preserve as historical reference only. |
| `origin/desktop/batch10-checkpoint-20261031` | 18 | Superseded | Preserve as historical reference only. |
| `origin/feat/desktop-batch07-privacy-labs` | 12 | Superseded | Preserve as historical reference only. |
| `origin/integration/knoux-crypt-android-ready-20261030` | 1 | Android only | Do not touch. |
| `origin/automation/dependabot-tested-squash-merge-20261101` | 2 | CI | Candidate cherry-pick (TASK: CI enablement). |
| `origin/planning/knoux-crypt-native-44-vertical-slices-20261030` | 1 | Android planning | Do not touch. |

## Android lane (out of scope, preserved)

All `native-android/`, `missions/fullstack-android/`, `android-spec/` work is owned by the Android agent. Not modified by this audit.

## Stashes / reflogs / dangling commits

Not enumerated in this pass; no destructive cleanup performed. Recovery references preserved.

## Unique-work rule applied

No branch, worktree, stash, or untracked file was deleted. No `git reset --hard`, `git clean`, or force push used.
