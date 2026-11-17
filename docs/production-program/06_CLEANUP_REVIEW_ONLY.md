# KNOUX CRYPT — Cleanup Review (READ-ONLY)

**Baseline:** `main` @ `927f60168030162ec74aa50e113d3e600446e856`  
**Generated:** 2026-11-15  
**Policy:** **REVIEW ONLY — NO DELETION AUTHORIZED**

---

## 1. Inventory Summary

| Category | Count | Size | Action |
|----------|-------|------|--------|
| Local regenerable caches | 5 | ~1.5 GB | Safe to clean (npm ci, gradle clean) |
| Unique preservation archives | 3 | ~300 MB | **PROTECT — DO NOT TOUCH** |
| Remote merged branches | 15 | ~100 MB | Safe to delete after owner approval |
| Remote historical branches | 8 | ~50 MB | Archive, keep remote |
| Production branch (diverged) | 1 | ~50 MB | **MERGE MISSIONS FOLDER FIRST** |

---

## 2. Safe Regenerable Candidates (Local)

| # | Path | Size | Recovery Command |
|---|------|------|------------------|
| 1 | `D:/KnouxCrypt/node_modules` | 850 MB | `npm ci` |
| 2 | `D:/KnouxCrypt/native-android/.gradle` | 400 MB | `./gradlew --version` (downloads wrapper) |
| 3 | `D:/KnouxCrypt/build` | 150 MB | `npm run build` |
| 4 | `D:/KnouxCrypt/native-android/app/build` | 100 MB | `./gradlew :app:assembleDebug` |
| 5 | `D:/KnouxCrypt/native-android/core/*/build` | 50 MB | `./gradlew :core:data:assembleDebug :core:security:assembleDebug` |

**Total reclaimable:** ~1.5 GB  
**Risk:** ZERO — all regenerable from source

---

## 3. Unique Preservation (DO NOT DELETE)

| Path | Size | Why Protected |
|------|------|---------------|
| `D:/KnouxCrypt/docs/unique-recovery/` | ~300 MB | Irreplaceable: Traycer docs, Anima variants, planning contracts, K-drive snapshot |
| `D:/KnouxCrypt/qa-evidence/` | ~50 MB | Screenshots, logs, verification evidence |
| `D:/KnouxCrypt/missions/fullstack-android/` (after merge) | ~50 MB | Authoritative task evidence, device verification |
| `D:/KnouxCrypt/.git/` | ~200 MB | Full history |

---

## 4. Remote Branch Cleanup Candidates (Post-Approval)

| Branch | HEAD | Merged SHA | Size | Recommendation |
|--------|------|------------|------|----------------|
| `feature/android-task29-vault-collections-20261102` | `a92a15b` | 0997afd | ~5 MB | Delete after approval |
| `feature/android-task30-document-viewer-20261102` | `2ac26c3` | e144b18 | ~5 MB | Delete after approval |
| `feature/android-task34-security-advisor-20261102` | `31ca1cc` | 31ca1cc | ~5 MB | Delete after approval |
| `feature/android-task41-secret-capsule-20261102` | `bf43718` | 2ada8b4 | ~5 MB | Delete after approval |
| `integration/knoux-crypt-android-ready-20261030` | `d774542` | d774542 | ~5 MB | Delete after approval |
| `integration/knoux-crypt-preserve-20261108` | `8e69e67` | 8e69e67 | ~5 MB | Delete after approval |
| `desktop/batch10-checkpoint-20261031` | `c079c01` | (partial) | ~5 MB | Delete after approval |
| `desktop/fullstack-windows-services-20261031` | `de01b23` | de01b23 | ~5 MB | Delete after approval |
| `desktop/tasks-01-04-real-security` | `970aff8` | 5f49ac0 | ~5 MB | Delete after approval |
| `fix/argon2-journal-durability-20261108` | `e286ad4` | e286ad4 | ~5 MB | Delete after approval |
| `fix/continuous-falling-cipher` | `4d3bf02` | 4d3bf02 | ~5 MB | Delete after approval |
| `fix/knoux-startup-identity` | `605ba57` | 605ba57 | ~5 MB | Delete after approval |
| `fix/windows-electron-qa-20261101` | `6571ac9` | 6571ac9 | ~5 MB | Delete after approval |
| `automation/dependabot-tested-squash-merge-20261101` | `4d10502` | 4d10502 | ~5 MB | Delete after approval |
| `visual/refine-home-tools-rain` | `f836a5c` | f836a5c | ~5 MB | Delete after approval |

**Total:** ~75 MB reclaimable on remote

---

## 5. Remote Branches to ARCHIVE (Keep Remote)

| Branch | HEAD | Reason |
|--------|------|--------|
| `production/android-hardening-20261102` | `a5df8d4` | Source of missions folder (until merged) |
| `planning/knoux-crypt-native-44-vertical-slices-20261030` | `5df9fc6` | Historical 44 task definitions |
| `android/task00-foundation-review` | `310665d` | CI template, mission docs |
| `android/native-implementation-20261031` | `5c1ca18` | Task 24 implementation |
| `audit/android-task000-checkpoint-20261102` | `8ad3322` | 253-file K-drive snapshot |
| `recovery/traycer-unique-docs-20261102` | `c69ad9b` | Traycer preservation |
| `recovery/unique-android-mission-contracts-20261102` | `f5c66da` | 44-mission contracts |
| `recovery/unique-visual-variants-and-prompts-20261102` | `50c3b98` | Anima visual variants |

---

## 6. Authorization Required

**NO deletion, pruning, force-push, or destructive operation is authorized by this review.**

Each destructive action requires:
1. Explicit owner approval (verbal/written)
2. Verification of recovery method
3. Execution with confirmation

**Next Step:** Present this review to owner for approval on specific candidates.