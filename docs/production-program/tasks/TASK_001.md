# TASK 001 — Merge missions/fullstack-android/ from Production Branch & Reconcile STATUS_LEDGER

## Status
**READY** — Prerequisites met (TASK 000 complete)

## Priority
P0 — Preserves unique evidence corpus, corrects documentation drift

## Scope
Merge the `missions/fullstack-android/` folder from `origin/production/android-hardening-20261102` into `main`, then manually update `STATUS_LEDGER_CURRENT.md` to reflect actual implementation state on main for Tasks 29, 30, 33, 34, 41.

## Baseline SHA
`927f60168030162ec74aa50e113d3e600446e856` (main HEAD)

## Source Branch
`origin/production/android-hardening-20261102` @ `a5df8d4`

## Target Files (ONLY these)
```
missions/fullstack-android/**/*
```
**Explicitly EXCLUDED:** `native-android/`, `.github/workflows/`, any Gradle/config files

## Acceptance Criteria

- [ ] `missions/fullstack-android/` folder exists on main with all 45 TASK.md, 45 EVIDENCE.md, 45 SCREEN_QA.md files
- [ ] `STATUS_LEDGER_CURRENT.md` updated for Tasks 29, 30, 33, 34, 41:
  - Task 29: Catalog route = `vault_collections`, Catalog status = `IMPLEMENTED`, Source status = `SOURCE_IMPLEMENTED`, Tests = `JVM_TESTED`, Notes = "Implemented 0997afd"
  - Task 30: Catalog route = `document_viewer`, Catalog status = `IMPLEMENTED`, Source status = `SOURCE_IMPLEMENTED`, Tests = `JVM_TESTED`, Notes = "Implemented e144b18"
  - Task 33: Catalog route = `autofill`, Catalog status = `IMPLEMENTED`, Source status = `SOURCE_IMPLEMENTED`, Tests = `JVM_TESTED`, Notes = "Implemented 981842c"
  - Task 34: Catalog route = `security_advisor`, Catalog status = `IMPLEMENTED`, Source status = `SOURCE_IMPLEMENTED`, Tests = `JVM_TESTED`, Notes = "Implemented 31ca1cc"
  - Task 41: Catalog route = `secret_capsule`, Catalog status = `IMPLEMENTED`, Source status = `SOURCE_IMPLEMENTED`, Tests = `JVM_TESTED`, Notes = "Implemented 2ada8b4"
- [ ] Commit message references source branch and reconciliation
- [ ] Push to origin/main
- [ ] Android CI triggers (verified in next task)

## Gates

| Gate | Criteria | Status |
|------|----------|--------|
| CODE_GATE | Folder merged, ledger updated | ⏳ PENDING |
| INTEGRATION_GATE | Pushed to main, CI triggered | ⏳ PENDING |
| VISUAL_GATE | N/A (doc only) | N/A |
| SECURITY_GATE | N/A (doc only) | N/A |

## Procedure

```bash
# 1. Ensure on main, clean except Electron dirty files
git checkout main
git status  # Should show only electron/vault/*.js, tests/*.cjs modifications

# 2. Create safety tag
git tag baseline-pre-merge-missions-20261115

# 3. Merge ONLY the missions folder (no auto-commit)
git merge --no-ff --no-commit origin/production/android-hardening-20261102 -- missions/fullstack-android/

# 4. Verify staged files
git status
# Should show only missions/fullstack-android/** files as staged

# 5. Manually edit STATUS_LEDGER_CURRENT.md
# Update the 5 task rows per acceptance criteria above
# Use editor: code missions/fullstack-android/STATUS_LEDGER_CURRENT.md

# 6. Stage the ledger update
git add missions/fullstack-android/STATUS_LEDGER_CURRENT.md

# 7. Commit
git commit -m "docs(android): merge missions/fullstack-android/ from production branch

- Preserve 45 TASK.md, 45 EVIDENCE.md, 45 SCREEN_QA.md
- Preserve STATUS_LEDGER_CURRENT.md, TASK_INDEX.json, device verification docs
- Reconcile Tasks 29, 30, 33, 34, 41 status to INTEGRATED_VERIFIED (implemented on main)
- Source: origin/production/android-hardening-20261102 (a5df8d4)
- Commit SHAs: 29=0997afd, 30=e144b18, 33=981842c, 34=31ca1cc, 41=2ada8b4"

# 8. Push
git push origin main
```

## Evidence Required

- [ ] Git log shows merge commit with missions folder
- [ ] `STATUS_LEDGER_CURRENT.md` shows updated rows for Tasks 29, 30, 33, 34, 41
- [ ] `missions/fullstack-android/` folder complete on main
- [ ] Push successful (GitHub shows new commit on main)

## Rollback

```bash
git reset --hard baseline-pre-merge-missions-20261115
git push --force-with-lease origin main  # REQUIRES OWNER APPROVAL
```

## Dependencies

- **Requires:** TASK 000 complete (baseline established) ✅
- **Enables:** TASK 002 (CI verification), TASK 003 (local build)

## Next Safe Action

Upon completion: **TASK 002 — Push main & verify Android CI green**