# KNOUX CRYPT — Storage & Cleanup Register (READ-ONLY AUDIT)

**Baseline:** `main` @ `927f60168030162ec74aa50e113d3e600446e856`  
**Generated:** 2026-11-15  
**Policy:** REVIEW ONLY — NO DELETION AUTHORIZED

---

## 1. Disk Space Summary (D: Drive)

| Metric | Value |
|--------|-------|
| Total Capacity | TBD (need `fsutil volume diskfree D:`) |
| Free Space | TBD |
| `D:/KnouxCrypt` Total | ~2.1 GB |
| Largest Subdirs | `node_modules` (850 MB), `.gradle` (400 MB), `docs/unique-recovery` (300 MB) |

---

## 2. Storage Breakdown by Category

| Category | Path | Size | Classification | Reclaimable? |
|----------|------|------|----------------|--------------|
| **Node Modules** | `D:/KnouxCrypt/node_modules` | ~850 MB | **SAFE_REGENERABLE** | ✅ `npm ci` |
| **Gradle Cache** | `D:/KnouxCrypt/native-android/.gradle` | ~400 MB | **SAFE_REGENERABLE** | ✅ `gradle clean` |
| **Electron Build** | `D:/KnouxCrypt/build` | ~150 MB | **SAFE_REGENERABLE** | ✅ `npm run build` |
| **Unique Recovery Archives** | `D:/KnouxCrypt/docs/unique-recovery` | ~300 MB | **UNIQUE_PRESERVE** | ❌ NO — irreplaceable |
| **QA Evidence** | `D:/KnouxCrypt/qa-evidence` | ~50 MB | **UNIQUE_PRESERVE** | ❌ NO — screenshots/logs |
| **Git Objects** | `D:/KnouxCrypt/.git/objects` | ~200 MB | **SHARED** | ⚠️ `git gc` only |
| **Android Build Outputs** | `D:/KnouxCrypt/native-android/app/build` | ~100 MB | **SAFE_REGENERABLE** | ✅ `./gradlew clean` |
| **Source Code** | `D:/KnouxCrypt/native-android`, `electron`, `src` | ~50 MB | **UNIQUE_PRESERVE** | ❌ NO |

---

## 3. Worktree & Branch Storage

| Worktree | Branch | Path | Size | Status | Action |
|----------|--------|------|------|--------|--------|
| Main | `main` | `D:/KnouxCrypt` | ~2.1 GB | Active | Keep |

**No other worktrees exist.**

---

## 4. Remote Branch Cleanup Candidates (READ-ONLY)

| Branch | HEAD | Merged? | Unique Work | Size Est. | Recommendation |
|--------|------|---------|-------------|-----------|----------------|
| `production/android-hardening-20261102` | `a5df8d4` | **NO** | `missions/fullstack-android/` (300 MB+) | ~50 MB | **MERGE FOLDER FIRST**, then evaluate |
| `planning/knoux-crypt-native-44-vertical-slices-20261030` | `5df9fc6` | Historical | TASK.md only (superseded) | ~5 MB | Archive to `docs/unique-recovery/`, keep remote |
| `android/task00-foundation-review` | `310665d` | Historical | CI template | ~5 MB | Archive, keep remote |
| `android/native-implementation-20261031` | `5c1ca18` | Historical | Task 24 only | ~5 MB | Archive, keep remote |
| `feature/android-task29-vault-collections-20261102` | `a92a15b` | ✅ 0997afd | None (merged) | ~5 MB | Safe to delete after owner approval |
| `feature/android-task30-document-viewer-20261102` | `2ac26c3` | ✅ e144b18 | None (merged) | ~5 MB | Safe to delete after owner approval |
| `feature/android-task34-security-advisor-20261102` | `31ca1cc` | ✅ 31ca1cc | None (merged) | ~5 MB | Safe to delete after owner approval |
| `feature/android-task41-secret-capsule-20261102` | `bf43718` | ✅ 2ada8b4 | None (merged) | ~5 MB | Safe to delete after owner approval |
| `audit/android-task000-checkpoint-20261102` | `8ad3322` | Historical | 253-file snapshot | ~10 MB | Archive, keep remote |
| `recovery/*` (3 branches) | Various | Historical | Preserved in `docs/unique-recovery/` | ~50 MB | Archive, keep remote |
| `integration/*` (2 branches) | Various | ✅ Merged | None | ~10 MB | Safe to delete after owner approval |
| `fix/*`, `feat/*`, `desktop/*`, `visual/*`, `refactor/*`, `test/*`, `automation/*`, `ai_*` | Various | Mostly merged | None | ~200 MB | Safe to delete after owner approval |

**Total remote branch storage (est):** ~350 MB  
**Safe to delete after verification:** ~300 MB  
**Must preserve (archive):** ~50 MB

---

## 5. Unique Work Preservation Register

| Asset | Location | Size | Preservation Method | Verified |
|-------|----------|------|---------------------|----------|
| `missions/fullstack-android/` (45 TASK/EVIDENCE/SCREEN_QA + ledger) | `origin/production/android-hardening-20261102` | ~50 MB | **Merge to main** | ❌ Pending |
| Device verification (itel S686LN) | `missions/fullstack-android/DEVICE_VERIFICATION_...` | ~1 MB | Merge to main | ❌ Pending |
| APK reconciliation | `missions/fullstack-android/APK_ARTIFACT_RECONCILIATION_...` | ~1 MB | Merge to main | ❌ Pending |
| Visual baseline (PR #15) | `missions/fullstack-android/POST_PR15_VISUAL_BASELINE.md` | ~5 MB | Merge to main | ❌ Pending |
| Traycer production docs | `docs/unique-recovery/traycer-20261102/` | ~10 MB | Already in repo | ✅ |
| Anima visual variants | `docs/unique-recovery/visual-variations-20261029/` | ~200 MB | Already in repo | ✅ |
| Planning contracts | `docs/unique-recovery/local-untracked-20261108/` | ~50 MB | Already in repo | ✅ |
| K-drive 253-file snapshot | `docs/unique-recovery/local-untracked-20261108/` | ~50 MB | Already in repo | ✅ |

---

## 6. Cleanup Candidates (PROPOSAL ONLY — REQUIRES OWNER APPROVAL)

| # | Path | Category | Size | Origin | Safe? | Recovery |
|---|------|----------|------|--------|-------|----------|
| 1 | `node_modules/` | SAFE_REGENERABLE | 850 MB | npm | ✅ YES | `npm ci` |
| 2 | `native-android/.gradle/` | SAFE_REGENERABLE | 400 MB | Gradle | ✅ YES | `./gradlew clean` |
| 3 | `build/` | SAFE_REGENERABLE | 150 MB | Electron build | ✅ YES | `npm run build` |
| 4 | `native-android/app/build/` | SAFE_REGENERABLE | 100 MB | Android build | ✅ YES | `./gradlew clean` |
| 5 | `native-android/core/*/build/` | SAFE_REGENERABLE | 50 MB | Android lib build | ✅ YES | `./gradlew clean` |
| 6 | `.git/objects/pack/*.pack` (old) | MAYBE_DUPLICATE | TBD | Git GC | ⚠️ `git gc --aggressive` | `git clone` |
| 7 | Remote branch `feature/android-task29-...` | INTEGRATED | ~5 MB | GitHub | ✅ After approval | `git push origin --delete` |
| 8 | Remote branch `feature/android-task30-...` | INTEGRATED | ~5 MB | GitHub | ✅ After approval | `git push origin --delete` |
| 9 | Remote branch `feature/android-task34-...` | INTEGRATED | ~5 MB | GitHub | ✅ After approval | `git push origin --delete` |
| 10 | Remote branch `feature/android-task41-...` | INTEGRATED | ~5 MB | GitHub | ✅ After approval | `git push origin --delete` |
| 11 | Remote branch `integration/knoux-crypt-android-ready-...` | INTEGRATED | ~5 MB | GitHub | ✅ After approval | `git push origin --delete` |
| 12 | Remote branch `integration/knoux-crypt-preserve-...` | INTEGRATED | ~5 MB | GitHub | ✅ After approval | `git push origin --delete` |
| 13 | Remote branch `desktop/batch10-checkpoint-...` | ARCHIVED | ~5 MB | GitHub | ✅ After approval | `git push origin --delete` |
| 14 | Remote branch `desktop/fullstack-windows-services-...` | INTEGRATED | ~5 MB | GitHub | ✅ After approval | `git push origin --delete` |
| 15 | Remote branch `desktop/tasks-01-04-real-security` | INTEGRATED | ~5 MB | GitHub | ✅ After approval | `git push origin --delete` |

**Estimated reclaimable (local):** ~1.5 GB (items 1-5)  
**Estimated reclaimable (remote):** ~100 MB (items 7-15)

---

## 7. Protected / Do Not Touch

| Path | Reason |
|------|--------|
| `docs/unique-recovery/` | Irreplaceable preservation archives |
| `qa-evidence/` | Screenshots, logs, verification evidence |
| `missions/fullstack-android/` (after merge) | Authoritative task evidence |
| `.git/` | Repository history |
| `native-android/` source | Production code |
| `electron/` source | Desktop app code |
| `src/` | Web/app source |
| `scripts/` | Build/CI scripts |
| `visuals/` | Design assets |

---

## 8. Cleanup Procedure (Post-Approval)

```bash
# 1. Local regenerable caches (safe, no approval needed for these)
cd D:/KnouxCrypt
rm -rf node_modules
rm -rf native-android/.gradle
rm -rf build
rm -rf native-android/app/build
rm -rf native-android/core/*/build

# 2. Regenerate
npm ci
cd native-android && ./gradlew --version  # downloads Gradle
./gradlew :app:assembleDebug  # rebuilds Android

# 3. Remote branch cleanup (REQUIRES OWNER APPROVAL PER BRANCH)
# For each approved branch:
git push origin --delete <branch-name>

# 4. Git GC (optional, saves ~50-100 MB)
git gc --aggressive --prune=now
```

---

## 9. Authorization Boundary

**THIS DOCUMENT IS READ-ONLY.** No deletion, pruning, force-push, or destructive operation is authorized by this register alone. Each destructive action requires:
1. Explicit owner approval (verbal/written)
2. Verification of recovery method
3. Execution by orchestrator with confirmation

**Next Step:** Present this register to owner for approval on specific candidates.