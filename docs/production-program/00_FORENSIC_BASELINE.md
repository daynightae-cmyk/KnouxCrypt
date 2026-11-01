# KNOUX CRYPT — Forensic Baseline (TASK 000)

Generated: 2026-11-02 (audit pass). Repository: `daynightae-cmyk/KnouxCrypt`.

## 1. Verified project identity

| Item | Value |
|---|---|
| Product name | KnouxCryptT 2025 (`KnouxCrypt`) |
| Package name | `knouxcrypt` |
| Version | `2025.1.0` |
| appId | `com.knoux.knouxcrypt` |
| Canonical repository | https://github.com/daynightae-cmyk/KnouxCrypt.git |
| Default branch | `main` |
| Verified HEAD (main / origin/main) | `c2198496bdb89a7f829c18c8762fc0c31e2fc78a` |
| Current audit worktree | `C:\Users\day night\.traycer\worktrees\daynightae-cmyk__knouxcrypt\traycer-nimble-dolphin-c59cd37394e7` |
| Audit branch | `traycer/nimble-dolphin` (at HEAD `c219849`, clean working tree) |
| Runtime | Electron 45.2.1 + React 18.2 + Vite 8.3.5 + Tailwind 3.3.5 |
| Node | v24.21.0, npm 11.19.0 |
| OS (audit host) | Windows 10 build 19045, x64 |

Other local checkouts (not switched during this audit):
- `D:\KnouxCrypt` — branch `planning/android-crypt-suite-20261029` @ `6c19107` (Android planning + untracked missions/visuals; untouched).
- `D:\KnouxCrypt-Android-Ready` — branch `production/android-hardening-20261102` @ `c219849` (Android hardening; untouched).
- `D:\KnouxCrypt-Windows-QA` — fully installed `node_modules` (356 packages); used as the test runtime source of truth.

## 2. Working tree safety

- Audit worktree `git status --porcelain` is empty at baseline.
- No staged/unstaged changes, no untracked files in the audit worktree.
- No destructive git operations performed.

## 3. Disk capacity

| Drive | Size GB | Free GB |
|---|---|---|
| C: | 130.67 | 7.14 |
| D: | 58.59 | 8.05 |
| K: | 47.98 | 4.87 |

Disk is constrained. No large duplicate archives generated. Builds run only when necessary.

## 4. Branch inventory (28 remote branches)

Most branches are already integrated into `main` via squash/merge commits. Branches with commits not in `main`:

| Branch | Ahead of main | Disposition |
|---|---|---|
| `origin/fix/windows-electron-qa-20261101` | 4 | Desktop-relevant files identical to main; only Android evidence/missions differ. Desktop security work (ACL, CSP, installer) already in main via `71f6b12`. |
| `origin/feat/splash-entry` | 1 | Doc/agent note only ("recover Anima scaffold"). Preserve as reference; no code delta in desktop shell. |
| `origin/desktop/tasks-01-04-real-security` | 1 | Full-repo snapshot (Android + desktop). Superseded by main. |
| `origin/desktop/electron-fullstack-44-services-20261031` | 21 | Older integration branch; superseded by main's PR #28–#30 squash merges. |
| `origin/desktop/batch10-checkpoint-20261031` | 18 | Older checkpoint; superseded (main has more). |
| `origin/feat/desktop-batch07-privacy-labs` | 12 | Superseded by main. |
| `origin/integration/knoux-crypt-android-ready-20261030` | 1 | Android-only merge (PR #14). Do not touch. |
| `origin/automation/dependabot-tested-squash-merge-20261101` | 2 | CI improvement (Dependabot validation). Candidate for selective cherry-pick. |
| `origin/planning/knoux-crypt-native-44-vertical-slices-20261030` | 1 | Android planning doc. Do not touch. |

All other branches: 0 commits ahead of main (fully integrated or stale).

## 5. Worktree inventory

| Path | Branch | HEAD | Notes |
|---|---|---|---|
| `D:\KnouxCrypt` | planning/android-crypt-suite-20261029 | 6c19107 | Android planning + untracked missions/visuals. Not touched. |
| `D:\KnouxCrypt-Android-Ready` | production/android-hardening-20261102 | c219849 | Android hardening. Not touched. |
| `C:\Users\...\traycer-clever-robin-...` | traycer/clever-robin | c219849 | Clean. |
| `C:\Users\...\traycer-nimble-dolphin-...` (this) | traycer/nimble-dolphin | c219849 | Audit worktree. |
| `C:\Users\...\traycer-nimble-otter-...` | traycer/nimble-otter | c219849 | Clean. |

No worktree contains unverified unique desktop code. Android worktrees are out of scope.

## 6. Unique-work conclusion (desktop lane)

No desktop-specific unique work is stranded outside `main`. The desktop security work (NTFS ACLs, CSP, installer, QA scripts) is already present in `main` at `c219849`. The remaining unique commits are Android-side or documentation-only. Therefore no merge/recovery operation is required before proceeding; the integration baseline is `main` @ `c219849`.

## 7. Critical blockers (P0)

1. **No code signing** — both artifacts `NotSigned`. Unsigned SmartScreen warnings. External credential required (Authenticode cert).
2. **CI does not run on normal PRs** — both workflow jobs gated on `dependabot[bot]`. `npm run check` only ever ran on one Windows host. Linux POSIX branches unverified.
3. **No independent security audit.** Self-testing only.
4. **ia32 not built** despite being listed in `win.target`.
5. **macOS/Linux targets untested** on this host.
6. **electron-updater unverified** — no signed update feed.
7. **Inter font loaded from fonts.googleapis.com** — availability/IP leak for a local-first tool (recorded, not fixed).
8. **node_modules absent in this worktree** — tests require `npm ci` (disk + network) before they can run here. Use `D:\KnouxCrypt-Windows-QA\node_modules` as runtime reference for now.

## 8. Baseline test evidence (run with `D:\KnouxCrypt-Windows-QA\node_modules` on PATH)

- `npm run test`: 410 tests, 400 pass, 7 fail initially (environment: missing jsqr, missing node_modules in worker, PowerShell Get-Acl module unavailable). With proper node_modules: all pass. Canonical QA run: **449 passed, 0 failed, 0 skipped** (per WINDOWS_RELEASE_READINESS, run on isolated checkout).
- `npm run check:routes`: pass (44 missions, 45 paths, ~162 internal links).
- `npm run build`: pass (Vite 8).
- `npm run check:csp`: 19/19 pass.
- `npm run check` (whole gate): pass, exit 0 (on QA checkout).

## 9. Safe next action

Proceed to TASK 001 (environment/tooling + CI enablement) and the production program documents. Do not claim production readiness.
