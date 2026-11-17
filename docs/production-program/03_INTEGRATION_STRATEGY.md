# KNOUX CRYPT — Integration Strategy

**Baseline:** `main` @ `927f60168030162ec74aa50e113d3e600446e856`  
**Generated:** 2026-11-15

---

## 1. Integration Objectives

1. **Preserve** the unique `missions/fullstack-android/` evidence corpus from `production/android-hardening-20261102`
2. **Reconcile** STATUS_LEDGER with actual main branch implementation state
3. **Verify** Android CI passes on main
4. **Establish** single source of truth on `main` for all future work
5. **Archive** historical branches after verification (no deletion without owner approval)

---

## 2. Integration Plan: Production Branch → Main

### 2.1 What to Merge
**ONLY** the `missions/fullstack-android/` folder from `production/android-hardening-20261102`.

### 2.2 What NOT to Merge
- `native-android/` code from production branch (OLDER than main — missing Tasks 29,30,33,34,41)
- Any CI workflow changes (main has updated workflow)
- Any Gradle/config changes (main is current)

### 2.3 Merge Procedure

```bash
# 1. Ensure clean baseline
git checkout main
git status  # Should show only Electron dirty files

# 2. Create safety tag
git tag baseline-pre-integration-20261115

# 3. Merge ONLY the missions folder (no commit yet)
git merge --no-ff --no-commit origin/production/android-hardening-20261102 -- missions/fullstack-android/

# 4. Verify only missions/fullstack-android/ files are staged
git status

# 5. Manually reconcile STATUS_LEDGER_CURRENT.md
#    Update Tasks 29, 30, 33, 34, 41 from DESIGN_ONLY/PLANNED → INTEGRATED_VERIFIED
#    Update "Source status" to SOURCE_IMPLEMENTED, "Tests" to JVM_TESTED
#    Add commit SHAs: 0997afd (29), e144b18 (30), 981842c (33), 31ca1cc (34), 2ada8b4 (41)

# 6. Commit with descriptive message
git commit -m "docs(android): merge missions/fullstack-android/ from production branch

- Preserve 45 TASK.md, 45 EVIDENCE.md, 45 SCREEN_QA.md
- Preserve STATUS_LEDGER_CURRENT.md, TASK_INDEX.json, device verification docs
- Reconcile Tasks 29, 30, 33, 34, 41 status to INTEGRATED_VERIFIED (implemented on main)
- Source: origin/production/android-hardening-20261102 (a5df8d4)"

# 7. Push to origin
git push origin main
```

### 2.4 Post-Merge Verification
- [ ] `missions/fullstack-android/` folder exists on main with all files
- [ ] `STATUS_LEDGER_CURRENT.md` reflects actual implementation state
- [ ] Android CI triggers and passes on main
- [ ] No native-android code regressions

---

## 3. Conflict Resolution Rules

| Conflict Type | Resolution |
|---------------|------------|
| `missions/fullstack-android/` files | **Take production branch version** (unique evidence) |
| `native-android/` files | **Take main version** (newer implementation) |
| `STATUS_LEDGER_CURRENT.md` | **Manual reconciliation** — update to match main reality |
| CI workflow (`.github/workflows/android.yml`) | **Take main version** (has Arabic check, updated SDK) |
| Gradle/build files | **Take main version** |

---

## 4. Semantic Integration (Not Just Git Merge)

For each task where production branch says DESIGN_ONLY but main has IMPLEMENTED:

| Task | Production Status | Main Reality | Action |
|------|-------------------|--------------|--------|
| 29 Vault Collections | DESIGN_ONLY / PLANNED | IMPLEMENTED (0997afd) | Update ledger to INTEGRATED_VERIFIED |
| 30 Document Viewer | DESIGN_ONLY / PLANNED | IMPLEMENTED (e144b18) | Update ledger to INTEGRATED_VERIFIED |
| 33 Android Autofill | DESIGN_ONLY / PLANNED | IMPLEMENTED (981842c) | Update ledger to INTEGRATED_VERIFIED |
| 34 Offline Security Advisor | DESIGN_ONLY / PLANNED | IMPLEMENTED (31ca1cc) | Update ledger to INTEGRATED_VERIFIED |
| 41 Expiring Secret Capsule | DESIGN_ONLY / PLANNED | IMPLEMENTED (2ada8b4) | Update ledger to INTEGRATED_VERIFIED |

**Evidence to cite in ledger:**
- Screen file: `app/src/main/kotlin/com/knoux/crypt/ui/<Task>Screen.kt`
- Service file: `core/data/src/main/kotlin/com/knoux/crypt/data/<Task>.kt`
- Test file: `core/data/src/test/kotlin/com/knoux/crypt/data/<Task>ServiceTest.kt` or `core/security/src/test/...`

---

## 5. Branch Retention Policy

### Keep Indefinitely (Reference)
| Branch | Reason |
|--------|--------|
| `main` | Production baseline |
| `origin/main` | Remote tracking |
| `production/android-hardening-20261102` | Source of missions folder (until merged) |

### Archive (Read-Only, No Deletion Without Owner Approval)
| Branch | Archive Location |
|--------|------------------|
| `planning/knoux-crypt-native-44-vertical-slices-20261030` | `docs/unique-recovery/planning-native44-20261030/` |
| `android/task00-foundation-review` | `docs/unique-recovery/android-task00-foundation/` |
| `android/native-implementation-20261031` | `docs/unique-recovery/android-native-impl-20261031/` |
| `audit/android-task000-checkpoint-20261102` | `docs/unique-recovery/audit-android-task000/` |
| `recovery/*` branches | Already in `docs/unique-recovery/` |

### Safe to Delete After Verification (Owner Approval Required)
| Branch | Merged SHA | Verification |
|--------|------------|--------------|
| `feature/android-task29-vault-collections-20261102` | 0997afd | ✅ In main |
| `feature/android-task30-document-viewer-20261102` | e144b18 | ✅ In main |
| `feature/android-task34-security-advisor-20261102` | 31ca1cc | ✅ In main |
| `feature/android-task41-secret-capsule-20261102` | 2ada8b4 | ✅ In main |
| `integration/knoux-crypt-android-ready-20261030` | d774542 | ✅ In main |
| `integration/knoux-crypt-preserve-20261108` | 8e69e67 | ✅ In main |
| All other merged feature/fix branches | Various | ✅ In main |

**NO FORCE PUSH. NO BRANCH DELETION WITHOUT EXPLICIT OWNER APPROVAL.**

---

## 6. Shared File Lease Register

| File | Current Owner | Lease Type | Notes |
|------|---------------|------------|-------|
| `native-android/app/src/main/kotlin/com/knoux/crypt/Catalog.kt` | Orchestrator | Exclusive | Route registry |
| `native-android/app/src/main/kotlin/com/knoux/crypt/AppContainer.kt` | Orchestrator | Exclusive | DI container |
| `native-android/app/src/main/kotlin/com/knoux/crypt/KnouxNavHost.kt` | Orchestrator | Exclusive | Navigation graph |
| `native-android/app/src/main/AndroidManifest.xml` | Orchestrator | Exclusive | Permissions, services |
| `native-android/build.gradle.kts` | Orchestrator | Exclusive | Build config |
| `native-android/core/data/build.gradle.kts` | Orchestrator | Exclusive | Data module deps |
| `native-android/core/security/build.gradle.kts` | Orchestrator | Exclusive | Security module deps |
| `.github/workflows/android.yml` | Orchestrator | Exclusive | CI config |
| `missions/fullstack-android/STATUS_LEDGER_CURRENT.md` | Orchestrator | Exclusive | Status source of truth |

**Rule:** Any agent needing write access must request lease from orchestrator.

---

## 7. Rollback Plan

If integration breaks main:
1. `git reset --hard baseline-pre-integration-20261115`
2. `git push --force-with-lease origin main` (only with owner approval)
3. Investigate on separate branch

**Safety tag:** `baseline-pre-integration-20261115` created before merge.

---

## 8. Next Steps After Integration

1. **Trigger CI** — Push main, verify Android CI green
2. **Run local build** — `cd native-android && ./gradlew :app:assembleDebug`
3. **Verify APK** — Check SHA-256, install on device/emulator if available
4. **Update TASK_INDEX.md** — Mark TASK 000 complete, activate TASK 001 (CI enablement)
5. **Begin TASK 001** — Ensure CI runs on all PRs (remove Dependabot-only gate)