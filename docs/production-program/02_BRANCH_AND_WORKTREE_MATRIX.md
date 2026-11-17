# KNOUX CRYPT — Branch & Worktree Matrix

**Baseline:** `main` @ `927f60168030162ec74aa50e113d3e600446e856`  
**Generated:** 2026-11-15

---

## 1. Local Worktrees

| Worktree Path | Branch | HEAD | Dirty | Status | Owner |
|---------------|--------|------|-------|--------|-------|
| `D:/KnouxCrypt` | `main` | `927f601` | **YES** (6 Electron files) | Active | Orchestrator |

**No other worktrees exist.** `git worktree list` shows only the main worktree.

---

## 2. Remote Branches (origin/)

| Branch | HEAD | Date | Ahead/Behind Main | Purpose | Integration Status |
|--------|------|------|-------------------|---------|-------------------|
| `main` | `ffdffde` | 2026-11-11 | Base | Production target | — |
| `HEAD` | → `origin/main` | — | — | Default | — |
| `production/android-hardening-20261102` | `a5df8d4` | 2026-11-02 | **DIVERGED** | Hardening branch with missions folder | **MERGE NEEDED** (missions folder only) |
| `planning/knoux-crypt-native-44-vertical-slices-20261030` | `5df9fc6` | 2026-10-30 | Historical | Original 44 task definitions | **ARCHIVED** (read-only) |
| `android/task00-foundation-review` | `310665d` | 2026-10-31 | Historical | CI template, mission docs | **ARCHIVED** |
| `android/native-implementation-20261031` | `5c1ca18` | 2026-10-31 | Historical | Task 24 metadata cleaner | **ARCHIVED** |
| `feature/android-task29-vault-collections-20261102` | `a92a15b` | 2026-11-02 | Merged | Task 29 implementation | **INTEGRATED** (0997afd) |
| `feature/android-task30-document-viewer-20261102` | `2ac26c3` | 2026-11-02 | Merged | Task 30 implementation | **INTEGRATED** (e144b18) |
| `feature/android-task34-security-advisor-20261102` | `31ca1cc` | 2026-11-02 | Merged | Task 34 implementation | **INTEGRATED** (31ca1cc) |
| `feature/android-task41-secret-capsule-20261102` | `bf43718` | 2026-11-02 | Merged | Task 41 implementation | **INTEGRATED** (2ada8b4) |
| `audit/android-task000-checkpoint-20261102` | `8ad3322` | 2026-11-02 | Historical | 253-file K-drive snapshot | **ARCHIVED** |
| `integration/knoux-crypt-android-ready-20261030` | `d774542` | 2026-10-30 | Merged | PR #14 merge | **INTEGRATED** |
| `integration/knoux-crypt-preserve-20261108` | `8e69e67` | 2026-11-08 | Merged | Recovery preservation merge | **INTEGRATED** |
| `fix/argon2-journal-durability-20261108` | `e286ad4` | 2026-11-08 | Merged | Argon2id journal fix | **INTEGRATED** (main) |
| `fix/continuous-falling-cipher` | `4d3bf02` | 2026-11-08 | Merged | Stag Home reference | **INTEGRATED** (main) |
| `fix/knoux-startup-identity` | `605ba57` | 2026-11-08 | Merged | 32-bit build fix | **INTEGRATED** (main) |
| `fix/windows-electron-qa-20261101` | `6571ac9` | 2026-11-01 | Merged | Electron QA fixes | **INTEGRATED** (main) |
| `feat/advanced-37-40` | `ebf030f` | 2026-11-02 | Merged | Advanced demo screens | **INTEGRATED** (main) |
| `feat/desktop-batch07-privacy-labs` | `68c9812` | 2026-10-31 | Merged | Privacy labs (25-28) | **INTEGRATED** (main) |
| `feat/desktop-visual-completion-20261102` | `8154158` | 2026-11-02 | Merged | Visual completion | **INTEGRATED** (main) |
| `feat/device-previews-33-36` | `1fb33a4` | 2026-11-02 | Merged | Device previews | **INTEGRATED** (main) |
| `feat/final-tools-41-44` | `e5fc86b` | 2026-11-02 | Merged | Final demo screens | **INTEGRATED** (main) |
| `feat/key-forge-details` | `f3cbf51` | 2026-11-02 | Merged | Key Forge details | **INTEGRATED** (main) |
| `feat/labs-25-28` | `e793908` | 2026-11-02 | Merged | Labs 25-28 | **INTEGRATED** (main) |
| `feat/privacy-center` | `01fe87b` | 2026-11-02 | Merged | Privacy center | **INTEGRATED** (main) |
| `feat/secure-notes-editor` | `7313afd` | 2026-11-02 | Merged | Secure notes editor | **INTEGRATED** (main) |
| `feat/vault-tools-29-32` | `4febd10` | 2026-11-02 | Merged | Vault tools 29-32 | **INTEGRATED** (main) |
| `feat/workflows-21-24` | `00315ed` | 2026-11-02 | Merged | Workflows 21-24 | **INTEGRATED** (main) |
| `desktop/batch10-checkpoint-20261031` | `c079c01` | 2026-10-31 | Historical | Batch 10 checkpoint | **ARCHIVED** |
| `desktop/fullstack-windows-services-20261031` | `de01b23` | 2026-10-31 | Merged | PR #15 visual baseline | **INTEGRATED** (main) |
| `desktop/tasks-01-04-real-security` | `970aff8` | 2026-10-31 | Merged | Desktop tasks 1-4 | **INTEGRATED** (main) |
| `docs/product-name-migration-20261102` | `02e9e45` | 2026-11-02 | Historical | Product name migration | **ARCHIVED** |
| `recovery/traycer-unique-docs-20261102` | `c69ad9b` | 2026-11-02 | Historical | Traycer docs preservation | **ARCHIVED** |
| `recovery/unique-android-mission-contracts-20261102` | `f5c66da` | 2026-11-02 | Historical | 44-mission contracts | **ARCHIVED** |
| `recovery/unique-visual-variants-and-prompts-20261102` | `50c3b98` | 2026-11-02 | Historical | Anima visual variants | **ARCHIVED** |
| `refactor/mission-route-audit` | `ed36402` | 2026-11-02 | Merged | Route audit, a11y | **INTEGRATED** (main) |
| `test/android-ciphertext-at-rest-20261102` | `78bf91e` | 2026-11-02 | Merged | Ciphertext-at-rest test | **INTEGRATED** (main) |
| `visual/refine-home-tools-rain` | `f836a5c` | 2026-11-02 | Merged | Visual refinement | **INTEGRATED** (main) |
| `automation/dependabot-tested-squash-merge-20261101` | `4d10502` | 2026-11-01 | Merged | Dependabot auto-merge | **INTEGRATED** (main) |
| `ai_main_4146f3426998` | `435d36a` | 2026-11-02 | Historical | AI Assistant update | **ARCHIVED** |
| `ai_main_e5af1ed16422` | `a673fc2` | 2026-11-02 | Historical | VMware-style interface | **ARCHIVED** |

---

## 3. Branch Relationship Diagram

```
main (927f601) ◄─── HEAD (local, 2 ahead of origin/main)
  │
  ├── origin/main (ffdffde) ── 2 commits behind local main
  │
  ├── production/android-hardening-20261102 (a5df8d4) ── DIVERGED
  │     │
  │     └── missions/fullstack-android/ (UNIQUE - not in main)
  │
  ├── feature/android-task29-vault-collections-20261102 (a92a15b) ── MERGED via 0997afd
  ├── feature/android-task30-document-viewer-20261102 (2ac26c3) ── MERGED via e144b18
  ├── feature/android-task34-security-advisor-20261102 (31ca1cc) ── MERGED via 31ca1cc
  ├── feature/android-task41-secret-capsule-20261102 (bf43718) ── MERGED via 2ada8b4
  │
  ├── planning/knoux-crypt-native-44-vertical-slices-20261030 (5df9fc6) ── HISTORICAL
  │
  └── [30+ other merged/historical branches] ── INTEGRATED or ARCHIVED
```

---

## 4. Merge Base Analysis

| Comparison | Merge Base | Main Unique Commits | Other Unique Commits |
|------------|------------|---------------------|----------------------|
| `main` vs `production/android-hardening-20261102` | ~`c219849` (TASK_000 baseline) | **12 commits** (Tasks 29,30,33,34,41 + fixes) | **12 commits** (missions folder, CI fixes, docs) |
| `main` vs `origin/main` | `ffdffde` | **2 commits** (vault media DEK rotation) | 0 |
| `main` vs `planning/...` | ~`c219849` | **40+ commits** (full implementation) | **0** (only TASK.md files) |

---

## 5. Worktree Strategy

**Current:** Single worktree at `D:/KnouxCrypt` on `main`.  
**Required:** No additional worktrees needed for current phase (single orchestrator mode).

**Future (if parallel agents needed):**
| Agent | Worktree Path | Branch | Protected Files |
|-------|---------------|--------|-----------------|
| Visual QA | `D:/KnouxCrypt-wt-visual` | `visual/qa-<task>` | `core/designsystem/`, `app/src/main/res/` |
| Services | `D:/KnouxCrypt-wt-services` | `services/<task>` | `core/data/`, `core/security/`, `AppContainer.kt` |
| Bug Fixes | `D:/KnouxCrypt-wt-bugs` | `fix/<task>` | Specific bug files only |

**Constraint:** Shared files (`Catalog.kt`, `AppContainer.kt`, `KnouxNavHost.kt`, `build.gradle.kts`, CI workflows) require **single-writer lease**.

---

## 6. Stash & Reflog

```
git stash list: (empty)
git reflog (main, last 10):
927f601 HEAD@{0}: commit: fix(vault): fail closed on unsafe media DEK rotation
99c7162 HEAD@{1}: commit: feat(vault): implement media backup and restore with key rotation support
ffdffde HEAD@{2}: checkout: moving from main to main
...
```
No stashed changes. Reflog shows normal linear history on main.

---

## 7. Tags & Releases

| Tag | SHA | Date | Description |
|-----|-----|------|-------------|
| (none) | — | — | No annotated tags exist |

**No releases published.** GitHub Releases: 0.

---

## 8. PR Status

| PR | Branch | Status | Merged SHA | Checks |
|----|--------|--------|------------|--------|
| #46 | feat/repair-section-end-to-end | MERGED | 9138faf | ✅ |
| #15 | (visual baseline) | MERGED | de01b23 | ✅ |
| #14 | android/task00-foundation-review | MERGED | d774542 | ✅ |
| #42 | feature/android-task30-document-viewer | MERGED | 37b6fef | ✅ |
| #43 | feature/android-task34-security-advisor | MERGED | f47644d | ✅ |

**No open PRs.**

---

## 9. CI Status (Latest Runs)

| Workflow | Branch | Last Run | Status | Artifacts |
|----------|--------|----------|--------|-----------|
| Android Native CI | `production/android-hardening-20261102` | 2026-11-02 | ✅ GREEN | APK, test results |
| Android Native CI | `main` | Not run yet (local only) | ⏳ PENDING | — |
| Dependabot Validation | `automation/dependabot-...` | 2026-11-01 | ✅ GREEN | — |

**Action needed:** Push main to trigger Android CI and verify green build.