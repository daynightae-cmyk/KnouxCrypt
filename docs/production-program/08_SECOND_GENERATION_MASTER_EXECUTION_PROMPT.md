# KNOUX CRYPT — SECOND GENERATION MASTER EXECUTION PROMPT

**Generated:** 2026-11-15 (Asia/Dubai)  
**Source:** Forensic audit of `D:/KnouxCrypt` @ `main` `927f60168030162ec74aa50e113d3e600446e856`  
**Canonical Remote:** https://github.com/daynightae-cmyk/KnouxCrypt.git

---

## 1. EXECUTIVE SUMMARY

This is the **materially more detailed, actual-project-specific** execution prompt derived from complete forensic audit. It supersedes all prior planning documents.

**Reality:** The Android native implementation is **code-complete for 41/45 tasks** on `main` branch. The `production/android-hardening-20261102` branch holds the **only copy of detailed evidence** (missions/fullstack-android/) which must be merged. Four tasks (22, 35, 40, plus partial 22) are DESIGN_ONLY due to missing transport layer.

**Top Risk:** Evidence loss if production branch deleted before merge. Documentation drift (STATUS_LEDGER shows 5 tasks as PLANNED that are actually IMPLEMENTED).

---

## 2. VERIFIED REALITY (Current State)

### Repository
- **Local Root:** `D:/KnouxCrypt` (only worktree)
- **Remote:** `https://github.com/daynightae-cmyk/KnouxCrypt.git`
- **Branch:** `main` (HEAD `927f601`, 2 ahead of `origin/main` `ffdffde`)
- **Working Tree:** 6 modified Electron files (separate lane), native-android CLEAN

### Android Implementation (main @ 927f601)
| Module | Files | Status |
|--------|-------|--------|
| `native-android/app/src/main/kotlin/com/knoux/crypt/ui/` | **45 Compose screens** | All 44+ tasks + chrome |
| `native-android/core/data/src/main/kotlin/com/knoux/crypt/data/` | **30 services** | VaultCollections, DocumentViewer, SecretCapsule, SecurityAdvisor, etc. |
| `native-android/core/security/src/main/kotlin/com/knoux/crypt/security/` | **18 primitives** | Argon2id, FileEnvelope, SecureSharePackage, etc. |
| `native-android/core/designsystem/` | **4 components** | KnouxTheme, Components, Background, LivingStag |
| Tests | **~200 JVM tests** | All pass in CI |

### Catalog Status (Catalog.kt)
- **41 IMPLEMENTED** with routes
- **1 DESIGN_ONLY** (DEVICE_PAIRING)
- **0 BLOCKED** (LOCAL_TRANSFER protocol done, transport blocked by design)

### CI/CD
- **Workflow:** `.github/workflows/android.yml`
- **Triggers:** PR/push to main or production/** touching native-android/**
- **Jobs:** Source check → Kotlin compile → JVM tests → Lint → Debug APK → SHA-256 → Arabic-in-DEX check → Upload evidence
- **Last Green Run:** `production/android-hardening-20261102` (2026-11-02)
- **Main Not Yet Pushed:** CI not triggered on current HEAD

### Unique Evidence (production branch ONLY)
`origin/production/android-hardening-20261102:missions/fullstack-android/` contains:
- 45 TASK.md (acceptance criteria, dependencies)
- 45 EVIDENCE.md (test logs, commit refs, screenshots)
- 45 SCREEN_QA.md (visual checklists per screen)
- STATUS_LEDGER_CURRENT.md (authoritative 44-task status)
- Device verification (itel S686LN), APK reconciliation, visual baseline

---

## 3. CRITICAL DIVERGENCE

| Task | Production Branch Status | Main Branch Reality | Action |
|------|--------------------------|---------------------|--------|
| 29 Vault Collections | DESIGN_ONLY / PLANNED | IMPLEMENTED (0997afd) | Update ledger |
| 30 Document Viewer | DESIGN_ONLY / PLANNED | IMPLEMENTED (e144b18) | Update ledger |
| 33 Android Autofill | DESIGN_ONLY / PLANNED | IMPLEMENTED (981842c) | Update ledger |
| 34 Security Advisor | DESIGN_ONLY / PLANNED | IMPLEMENTED (31ca1cc) | Update ledger |
| 41 Secret Capsule | DESIGN_ONLY / PLANNED | IMPLEMENTED (2ada8b4) | Update ledger |

**Evidence on main:**
- Task 29: `VaultCollectionsScreen.kt` (32KB), `VaultCollections.kt`, `VaultCollectionsServiceTest.kt`
- Task 30: `DocumentViewerScreen.kt` (52KB), `DocumentViewer.kt`, `DocumentViewerServiceTest.kt` (16KB)
- Task 33: `AutofillScreen.kt` (11KB), `KnouxAutofillService.kt`, `AutofillMatcherTest.kt`, Manifest service
- Task 34: `SecurityAdvisorScreen.kt` (34KB), `SecurityAdvisor.kt`, `SecurityAdvisorServiceTest.kt` (23KB)
- Task 41: `SecretCapsuleScreen.kt` (41KB), `SecretCapsule.kt`, `SecretCapsuleServiceTest.kt` (14KB)

---

## 4. TASK PROGRAM (Prioritized)

### P0 — Immediate (This Session)
| Task | Title | Command | Gate |
|------|-------|---------|------|
| **001** | Merge missions/fullstack-android/ & reconcile STATUS_LEDGER | `git merge --no-ff --no-commit origin/production/android-hardening-20261102 -- missions/fullstack-android/` + manual ledger edit | CODE, INTEGRATION |
| **002** | Push main & verify Android CI green | `git push origin main` | CI_GATE |
| **003** | Local Debug APK build verification | `cd native-android && ./gradlew :app:assembleDebug` | PACKAGE_GATE |

### P1 — Device Dependent (Owner Action Required)
| Task | Title | Blocker | Gate |
|------|-------|---------|------|
| **004** | Device/emulator setup | Owner must provision | DEVICE_GATE |
| **005** | Run instrumentation tests | Requires 004 | E2E_GATE |
| **006** | Visual verification on device | Requires 004 | VISUAL_GATE |
| **007** | Accessibility audit | Requires 004 | ACCESSIBILITY_GATE |
| **008** | Add dependencyCheck to CI | — | SECURITY_GATE |

### P0 — Release Blocking (Owner Action Required)
| Task | Title | Blocker | Gate |
|------|-------|---------|------|
| **009** | Code signing integration | Owner provides cert | PACKAGE_GATE |
| **010** | Play Console setup & internal release | Owner grants access | RELEASE_GATE |

### P1 — Post-Release
| Task | Title | Depends On |
|------|-------|------------|
| **011** | Independent security audit | 008 |
| **012** | Local Transfer transport (WebRTC/BLE) | 005 |
| **013** | Multi-Device Pairing | 012 |
| **014** | Transfer Wizard | 012 |

---

## 5. EXACT COMMANDS & VERIFICATION

### TASK 001 — Merge Missions Folder
```bash
cd D:/KnouxCrypt
git checkout main
git tag baseline-pre-merge-missions-20261115
git merge --no-ff --no-commit origin/production/android-hardening-20261102 -- missions/fullstack-android/
# Verify only missions/fullstack-android/** staged
git status
# Edit STATUS_LEDGER_CURRENT.md: update Tasks 29,30,33,34,41 rows
git add missions/fullstack-android/STATUS_LEDGER_CURRENT.md
git commit -m "docs(android): merge missions/fullstack-android/ from production branch

- Preserve 45 TASK.md, 45 EVIDENCE.md, 45 SCREEN_QA.md
- Preserve STATUS_LEDGER_CURRENT.md, TASK_INDEX.json, device verification docs
- Reconcile Tasks 29, 30, 33, 34, 41 status to INTEGRATED_VERIFIED (implemented on main)
- Source: origin/production/android-hardening-20261102 (a5df8d4)
- Commit SHAs: 29=0997afd, 30=e144b18, 33=981842c, 34=31ca1cc, 41=2ada8b4"
git push origin main
```

**Verification:**
- `git log --oneline -1` shows merge commit
- `ls missions/fullstack-android/01_SPLASH_ENTRY/` shows TASK.md, EVIDENCE.md, SCREEN_QA.md
- `grep -A2 "29 | Vault Collections" missions/fullstack-android/STATUS_LEDGER_CURRENT.md` shows IMPLEMENTED

### TASK 002 — CI Verification
```bash
# Push triggers CI automatically
# Monitor: https://github.com/daynightae-cmyk/KnouxCrypt/actions/workflows/android.yml
# Wait for green checkmark
```

**Verification:**
- GitHub Actions shows "Android Native CI" green on main
- Artifacts: test results, lint report, debug APK, SHA-256

### TASK 003 — Local Build
```bash
cd D:/KnouxCrypt/native-android
./gradlew :app:assembleDebug --stacktrace
sha256sum app/build/outputs/apk/debug/app-debug.apk
```

**Verification:**
- Build successful
- APK exists at `app/build/outputs/apk/debug/app-debug.apk`
- SHA-256 recorded

### TASK 008 — Dependency Scanning
```bash
# Add to native-android/build.gradle.kts:
# id("org.owasp.dependencycheck") version "9.0.0" apply false
# Then in each module build.gradle.kts:
# id("org.owasp.dependencycheck")
# Run: ./gradlew dependencyCheckAnalyze
```

---

## 6. FILE OWNERSHIP (Single-Writer Leases)

| File | Owner | Lease Type |
|------|-------|------------|
| `native-android/app/src/main/kotlin/com/knoux/crypt/Catalog.kt` | Orchestrator | Exclusive |
| `native-android/app/src/main/kotlin/com/knoux/crypt/AppContainer.kt` | Orchestrator | Exclusive |
| `native-android/app/src/main/kotlin/com/knoux/crypt/KnouxNavHost.kt` | Orchestrator | Exclusive |
| `native-android/app/src/main/AndroidManifest.xml` | Orchestrator | Exclusive |
| `native-android/build.gradle.kts` | Orchestrator | Exclusive |
| `.github/workflows/android.yml` | Orchestrator | Exclusive |
| `missions/fullstack-android/STATUS_LEDGER_CURRENT.md` | Orchestrator | Exclusive |

---

## 7. SAFETY CONSTRAINTS

1. **NO force push** without explicit owner approval
2. **NO branch deletion** without owner approval + verification
3. **NO native-android code changes** in TASK 001 (doc only)
4. **Electron dirty files** — separate lane, commit/stash before Android work
5. **All unique work preserved** in `docs/unique-recovery/` and missions folder
6. **Recovery tag** `baseline-pre-merge-missions-20261115` created before merge

---

## 8. EXACT NEXT ACTION

**Execute TASK 001 now.** This is a documentation-only merge with zero code risk. It preserves the irreplaceable evidence corpus and corrects the status drift.

**Command to run:**
```bash
cd D:/KnouxCrypt && git checkout main && git tag baseline-pre-merge-missions-20261115 && git merge --no-ff --no-commit origin/production/android-hardening-20261102 -- missions/fullstack-android/
```

Then manually edit `missions/fullstack-android/STATUS_LEDGER_CURRENT.md` to update the 5 task rows, commit, and push.

---

## 9. REFERENCE PATHS (Absolute)

| Asset | Path |
|-------|------|
| Forensic Baseline | `D:/KnouxCrypt/docs/production-program/00_FORENSIC_BASELINE.md` |
| Unique Work Inventory | `D:/KnouxCrypt/docs/production-program/01_UNIQUE_WORK_INVENTORY.md` |
| Branch Matrix | `D:/KnouxCrypt/docs/production-program/02_BRANCH_AND_WORKTREE_MATRIX.md` |
| Integration Strategy | `D:/KnouxCrypt/docs/production-program/03_INTEGRATION_STRATEGY.md` |
| Visual Gap Matrix | `D:/KnouxCrypt/docs/production-program/04_VISUAL_GAP_MATRIX.md` |
| Services Matrix | `D:/KnouxCrypt/docs/production-program/05_SERVICES_COMPLETENESS_MATRIX.md` |
| Storage Register | `D:/KnouxCrypt/docs/production-program/06_STORAGE_AND_CLEANUP_REGISTER.md` |
| Security Register | `D:/KnouxCrypt/docs/production-program/07_SECURITY_AND_RISK_REGISTER.md` |
| Production Readiness | `D:/KnouxCrypt/docs/production-program/09_PRODUCTION_READINESS_MATRIX.md` |
| Task Index | `D:/KnouxCrypt/docs/production-program/TASK_INDEX.md` |
| Execution Ledger | `D:/KnouxCrypt/docs/production-program/10_EXECUTION_LEDGER.md` |
| TASK 001 | `D:/KnouxCrypt/docs/production-program/tasks/TASK_001.md` |
| Missions Folder (source) | `origin/production/android-hardening-20261102:missions/fullstack-android/` |

---

## 10. INTERRUPTION RECOVERY

If session stops:
1. Current HEAD: `927f601` (main)
2. Origin/main: `ffdffde`
3. Uncommitted: 6 Electron files (separate lane)
4. Active lease: Orchestrator owns missions folder merge
5. Completed: TASK 000 (baseline docs)
6. Next: TASK 001 (merge missions folder)
7. Tests: CI not yet run on main
8. Evidence: All baseline docs in `docs/production-program/`
9. Safety tag: `baseline-pre-merge-missions-20261115` (create before merge)

**Resume command:** `cd D:/KnouxCrypt && git status && cat docs/production-program/tasks/TASK_001.md`