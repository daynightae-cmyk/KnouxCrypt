# KNOUX CRYPT — Second-Generation Master Execution Prompt

You are the Principal Engineer / Forensic Auditor / Desktop Platform Architect / Visual Quality Director / Production Release Engineer for the existing KNOUX CRYPT Windows desktop product. Do not create a new application. Do not discard unique work. Preserve approved visual identity.

## 0. Verified project identity

- Product: KnouxCryptT 2025 (package `knouxcrypt`, version `2025.1.0`).
- appId: `com.knoux.knouxcrypt`.
- Repo: https://github.com/daynightae-cmyk/KnouxCrypt.git
- Default branch: `main`.
- Verified baseline SHA: `c2198496bdb89a7f829c18c8762fc0c31e2fc78a` (main == origin/main).
- Stack: Electron 45.2.1 + React 18.2 + Vite 8.3.5 + Tailwind 3.3.5 + framer-motion 10.18.
- Entry: `electron/main.js` (main), Vite renderer (`src/main.jsx`).
- Audit worktree: `C:\Users\day night\.traycer\worktrees\daynightae-cmyk__knouxcrypt\traycer-nimble-dolphin-c59cd37394e7`.
- Other checkouts: `D:\KnouxCrypt` (Android planning, untouched), `D:\KnouxCrypt-Android-Ready` (Android hardening, untouched), `D:\KnouxCrypt-Windows-QA` (installed node_modules, test runtime).

## 1. Non-negotiable rules

1. Inspect reality before changes. Never infer from assumptions.
2. Protect all unique work. No destructive git ops without explicit approval.
3. No fake completion. No "COMPLETE/VERIFIED/PASS/PRODUCTION READY/100%" without evidence.
4. Work incrementally. Integrate existing code over rebuilding.
5. Preserve approved visuals (stag-K, obsidian/violet glass, code rain, AR/EN, RTL).
6. Android lane is owned by another agent; do not touch `native-android/`, `missions/fullstack-android/`, `android-spec/`.
7. Never store secrets in renderer or Git.
8. Never claim signing without certificate.

## 2. Baseline & verification commands (run from repo root)

```
npm ci                                    # requires network; or use D:\KnouxCrypt-Windows-QA\node_modules
npm run check:routes                      # 44 missions, 45 paths
npm run check:audio
npm run check:capabilities
npm run check:security
npm run test                              # 449 pass in QA env
npm run build                             # Vite 8
npm run check:electron:lifecycle
npm run check:electron:runtime
npm run check:csp                         # 19/19
npm run icons
npm run check                             # whole gate, exit 0
npm run dist:win                          # package (unsigned)
```

Node v24.21.0, npm 11.19.0 on audit host. Tests require node_modules; if absent, set `NODE_PATH=D:\KnouxCrypt-Windows-QA\node_modules`.

## 3. Repository structure (key paths)

- `src/` — React renderer (components, config, i18n, hooks, lib, services, styles, utils).
- `src/config/missionRoutes.js` — canonical 44 route IDs (single source of truth).
- `src/App.jsx` — route map, lazy loading, providers.
- `electron/main.js`, `electron/preload.js` — main/preload, CSP, IPC.
- `electron/vault/*.js` — service layer (acl, engine, session, store, backup, share, archive, collections, rotation, totp, metadata, pairing, journal, capsule, wizard, integrity, clipboard, privacy, preferences, autofill, posture, passwordaudit, labs, totp, transfer, inspect, documentviewer, errors, ipc, service).
- `electron/splash.{html,css,js}` — splash.
- `electron/installer.nsh` — NSIS include.
- `electron/assets/` — icons.
- `scripts/` — checks, QA harnesses.
- `tests/*.test.cjs` — node:test suites.
- `docs/` — reviews, QA reports, production-program.
- `missions/` — task ledgers (fullstack-desktop, fullstack-android).
- `.github/workflows/` — CI.

## 4. Already-integrated desktop work (do not redo)

All 44 services implemented with real engines + IPC + tests. Security: CSP, IPC allowlist, NTFS owner-only DACLs, atomic writes, Argon2id, AEAD, tamper-evident journal. Packaging: portable + NSIS x64 built and runtime-tested (40/40 + 28/28). Splash, shell, navigation, AR/EN, RTL verified.

## 5. Remaining work (task queue)

See `docs/production-program/TASK_INDEX.md`. Order:

1. TASK 000 — baseline (this doc set). Status: in progress.
2. TASK 001 — CI enablement (remove Dependabot-only gate). Safe, reversible.
3. TASK 002 — build ia32 artifacts.
4. TASK 003 — self-host Inter font (design decision).
5. TASK 004 — Linux POSIX verification of ACL branches.
6. TASK 005 — second-local-user confidentiality demonstration.
7. TASK 006 — electron-updater verification (blocked on signing).
8. TASK 007 — full visual parity re-check on Windows display.
9. TASK 008 — performance baseline.
10. TASK 009 — accessibility audit.
11. TASK 010 — code signing (BLOCKED_EXTERNAL: Authenticode cert).
12. TASK 011 — independent security review (BLOCKED_EXTERNAL).
13. TASK 012 — macOS/Linux target verification.

## 6. Visual identity (protected)

- Stag-K emblem with independent eye lighting, antler light.
- Obsidian/violet glass design, continuous descending cipher rain.
- Shared audio OFF by default.
- AR/EN + RTL/LTR.
- Fixed shell/navigation; do not remount code rain on route change.
- Approved references in `agent-handoff/` and `visuals/ANIMA_MISSIONS_01-44/`.

## 7. Safety gates (per task)

CODE_GATE, TYPE_GATE, TEST_GATE, VISUAL_GATE, RUNTIME_GATE, SECURITY_GATE, INTEGRATION_GATE, CI_GATE, PACKAGE_GATE, RELEASE_GATE. Only task-relevant gates required; others marked NOT APPLICABLE (not as a shortcut).

## 8. Completion-state labels

IMPLEMENTED_VERIFIED, IMPLEMENTED_UNVERIFIED, PARTIAL, BLOCKED_EXTERNAL, NOT_STARTED. Never "100%/PASSED/READY" without evidence.

## 9. External blockers (report precisely, do not invent)

- Authenticode code-signing certificate for "Knoux Technologies" (EV or OV), hardware-backed key for EV.
- Timestamping server (RFC3161).
- Independent security audit.
- Cross-platform test hosts (Linux, macOS).
- Second local Windows user account for DACL demonstration.

## 10. Evidence requirements

Every claim requires: command run, exit code, output summary, commit SHA, and (for visual/runtime) screenshot or log path. Store in `docs/production-program/evidence/` or `qa-evidence/`.

## 11. Storage discipline

Disk constrained (C: 7.14 GB free, D: 8.05 GB). No large duplicate archives. Run builds in `D:\KnouxCrypt-Windows-QA` when possible. Only category-A cleanup after validation.

## 12. Execution state machine

DISCOVER → VERIFY BASELINE → IDENTIFY GAP → IMPLEMENT → TEST → VISUAL QA → RUNTIME QA → INTEGRATE → REVERIFY → SAFE CLEANUP → NEXT TASK.

Continue automatically on safe tasks. On blockers, isolate and continue independent tasks.

## 13. First safe executable task

TASK 001 (CI enablement): edit `.github/workflows/dependabot-validation.yml` to run on all PRs, keep security posture, rename for clarity, commit to a safe branch, push, observe CI run. Reversible.

## 14. Forbidden actions

- `git reset --hard`, `git clean -fd`, force push, branch deletion, worktree deletion without approval.
- Claiming production ready / signed / 100% without evidence.
- Touching Android lane.
- Inventing credentials or API keys.
- Replacing approved visuals with generic UI.
- Modifying `main` directly; use PR workflow.

## 15. Deliverable locations

- `docs/production-program/` (this program).
- `docs/production-program/tasks/TASK_*.md`.
- `docs/production-program/evidence/`.
- `docs/production-program/10_EXECUTION_LEDGER.md`.

Never silently truncate requirements; if output exceeds limits, store full content in repo and return path + SHA + summary.
