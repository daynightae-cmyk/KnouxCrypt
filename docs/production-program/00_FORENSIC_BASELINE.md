# KNOUX CRYPT — Forensic Baseline

**Generated:** 2026-11-15 (Asia/Dubai)  
**Orchestrator:** Single-accountable principal engineering orchestrator  
**Canonical Remote:** https://github.com/daynightae-cmyk/KnouxCrypt.git

---

## 1. Repository Identity & Current State

| Property | Value |
|----------|-------|
| **Local Root (Canonical)** | `D:/KnouxCrypt` |
| **Remote Origin** | `https://github.com/daynightae-cmyk/KnouxCrypt.git` |
| **Current Branch** | `main` |
| **Current HEAD** | `927f60168030162ec74aa50e113d3e600446e856` |
| **HEAD Message** | `fix(vault): fail closed on unsafe media DEK rotation` |
| **HEAD Date** | 2026-11-11 (local commit) |
| **origin/main** | `ffdffde` (2 commits behind HEAD) |
| **Working Tree Status** | **DIRTY** — 6 modified files, 1 untracked (all Electron/desktop) |

### Working Tree Details
```
.M  electron/vault/mediabackup.js
.M  electron/vault/rotation.js
.M  electron/vault/store.js
.M  src/config/desktopCapabilities.js
.M  tests/batch08-vaulttools.test.cjs
.M  tests/vault-mediabackup.test.cjs
?   tests/vault-rotation-crash.test.cjs
```
**All dirty files are Electron/desktop scope — native-android is CLEAN.**

---

## 2. Branch Topology & Critical Branches

| Branch | HEAD | Status vs Main | Key Content |
|--------|------|----------------|-------------|
| `main` | `927f601` | **BASELINE** | Complete Android impl (all 44+ tasks), desktop Electron, CI |
| `origin/main` | `ffdffde` | 2 behind main | Shadow-vault fix |
| `production/android-hardening-20261102` | `a5df8d4` | **DIVERGED** | Detailed missions folder, OLD Android code (missing Tasks 29,30,33,34,41) |
| `planning/knoux-crypt-native-44-vertical-slices-20261030` | `5df9fc6` | Historical | Original 44 task definitions (TASK.md only) |
| `feature/android-task29-vault-collections-20261102` | `a92a15b` | Merged to main | Task 29 implementation |
| `feature/android-task30-document-viewer-20261102` | `2ac26c3` | Merged to main | Task 30 implementation |
| `feature/android-task34-security-advisor-20261102` | `31ca1cc` | Merged to main | Task 34 implementation |
| `feature/android-task41-secret-capsule-20261102` | `bf43718` | Merged to main | Task 41 implementation |
| `android/task00-foundation-review` | `310665d` | Historical | CI template, mission docs |

**Key Finding:** `main` and `production/android-hardening-20261102` have **diverged** with unique work on each:
- **main has:** Complete Android implementation (Tasks 29, 30, 33, 34, 41 fully coded + tested)
- **production branch has:** Detailed `missions/fullstack-android/` folder with EVIDENCE.md, SCREEN_QA.md, STATUS_LEDGER_CURRENT.md — **NOT in main**

---

## 3. Android Implementation Status (main @ 927f601)

### Catalog Status (from `native-android/app/src/main/kotlin/com/knoux/crypt/Catalog.kt`)
All 34 catalog entries + 8 essentials = **42 services**, of which:
- **41 IMPLEMENTED** with routes
- **1 DESIGN_ONLY** (DEVICE_PAIRING)
- **0 BLOCKED** (LOCAL_TRANSFER protocol implemented, transport blocked by design)

### Code Coverage (main branch)
| Module | Files | Key Implementations |
|--------|-------|---------------------|
| `app/src/main/kotlin/com/knoux/crypt/ui/` | **45 screens** | All 44+ task screens + Chrome, LockedScreen, ToolPlaceholderScreen |
| `core/data/src/main/kotlin/com/knoux/crypt/data/` | **30 services** | VaultCollections, DocumentViewer, SecretCapsule, SecurityAdvisor, ShadowVault, etc. |
| `core/security/src/main/kotlin/com/knoux/crypt/security/` | **18 primitives** | Argon2id, FileEnvelope, SecureSharePackage, DigitalSignatureService, etc. |
| `core/designsystem/src/main/kotlin/com/knoux/crypt/design/` | **4 components** | KnouxTheme, Components, Background, LivingStag |

### Test Coverage (main branch)
| Test Type | Location | Count | Status |
|-----------|----------|-------|--------|
| Security unit tests | `core/security/src/test/` | **18 test files** | Compile & pass (JVM) |
| Data unit tests | `core/data/src/test/` | **23 test files** | Compile & pass (JVM) |
| App unit tests | `app/src/test/` | **7 test files** | Compile & pass (JVM) |
| Instrumentation tests | `app/src/androidTest/` | **2 test files** | Compile, **NOT RUN** (no device) |
| Arabic-in-DEX check | `scripts/check-dex-arabic.py` | 1 | Runs in CI |

### CI/CD (`.github/workflows/android.yml`)
- **Triggers:** PR/push to main or production/** touching native-android/**
- **Jobs:** Source boundary check → Kotlin compile → JVM tests → Lint → Debug APK → SHA-256 → Packaged Arabic check → Upload evidence
- **Runner:** ubuntu-latest, Java 17, Android 36, Gradle 8.14.6
- **Artifacts:** Test results, lint reports, debug APK

---

## 4. Unique Work Inventory (Per Branch)

### A. `production/android-hardening-20261102` — **UNIQUE: missions/fullstack-android/**
This folder **does not exist in main** and contains:
| File Pattern | Count | Description |
|--------------|-------|-------------|
| `XX_FEATURE/TASK.md` | 45 | Task definitions with acceptance criteria |
| `XX_FEATURE/EVIDENCE.md` | 45 | Implementation evidence, test logs, screenshots refs |
| `XX_FEATURE/SCREEN_QA.md` | 45 | Visual QA checklists per screen |
| `STATUS_LEDGER_CURRENT.md` | 1 | Authoritative status table (44 tasks) |
| `TASK_INDEX.json` | 1 | Dependency graph |
| `NATIVE_STATUS_2026-10-31.md` | 1 | Historical status snapshot |
| `NATIVE_EXPERIENCE_EVIDENCE_2026-11-01.md` | 1 | Device verification evidence |
| `DEVICE_VERIFICATION_2026-11-01_ITEL_S686LN.md` | 1 | Physical device test record |
| `APK_ARTIFACT_RECONCILIATION_2026-11-01.md` | 1 | APK hash verification |
| `OWNER_ACTIONS_REQUIRED.md` | 1 | External dependencies (signing, Play Console) |
| `POST_PR15_VISUAL_BASELINE.md` | 1 | Visual reference baseline |
| `LOCAL_AGENT_AFTER_VISUALS.md` | 1 | Agent handoff notes |

**Risk:** This entire evidence corpus will be LOST if production branch is deleted or force-pushed without merging the folder to main.

### B. `main` — **UNIQUE: Complete Android Implementation**
Tasks 29, 30, 33, 34, 41 are **fully implemented in code** on main but marked DESIGN_ONLY in production branch's STATUS_LEDGER:
| Task | Feature | Main Implementation | Production Branch Status |
|------|---------|---------------------|--------------------------|
| 29 | Vault Collections | `VaultCollectionsScreen.kt`, `VaultCollections.kt`, `VaultCollectionsServiceTest.kt` | DESIGN_ONLY / PLANNED |
| 30 | Document Viewer | `DocumentViewerScreen.kt` (52KB), `DocumentViewer.kt`, `DocumentViewerServiceTest.kt` | DESIGN_ONLY / PLANNED |
| 33 | Android Autofill | `AutofillScreen.kt`, `KnouxAutofillService.kt`, `AutofillMatcherTest.kt`, Manifest entry | DESIGN_ONLY / PLANNED |
| 34 | Offline Security Advisor | `SecurityAdvisorScreen.kt` (34KB), `SecurityAdvisor.kt`, `SecurityAdvisorServiceTest.kt` (23KB) | DESIGN_ONLY / PLANNED |
| 41 | Expiring Secret Capsule | `SecretCapsuleScreen.kt` (41KB), `SecretCapsule.kt`, `SecretCapsuleServiceTest.kt` (14KB) | DESIGN_ONLY / PLANNED |

### C. Feature Branches (already merged to main)
- `feature/android-task29-vault-collections-20261102` → main via `0997afd`
- `feature/android-task30-document-viewer-20261102` → main via `e144b18`
- `feature/android-task34-security-advisor-20261102` → main via `31ca1cc`
- `feature/android-task41-secret-capsule-20261102` → main via `2ada8b4`

### D. Planning Branch — Historical Reference Only
`planning/knoux-crypt-native-44-vertical-slices-20261030` has the original TASK.md definitions. Superseded by production branch's missions folder.

---

## 5. Worktree Status

```
WORKTREE LIST (git worktree list --porcelain):
worktree D:/KnouxCrypt
HEAD 927f60168030162ec74aa50e113d3e600446e856
branch refs/heads/main
```
**Only ONE worktree exists (main). No parallel agent worktrees active.**

---

## 6. Disk Space & Storage

| Path | Size (approx) | Category |
|------|---------------|----------|
| `D:/KnouxCrypt` | ~2.1 GB | Active repo (node_modules, .gradle, build outputs) |
| `D:/KnouxCrypt/node_modules` | ~850 MB | Regenerable (npm) |
| `D:/KnouxCrypt/native-android/.gradle` | ~400 MB | Regenerable (Gradle cache) |
| `D:/KnouxCrypt/build` | ~150 MB | Electron build artifacts |
| `D:/KnouxCrypt/docs/unique-recovery` | ~300 MB | **UNIQUE preservation archives** |
| `D:/KnouxCrypt/qa-evidence` | ~50 MB | QA screenshots/logs |

**Free space on D:** Need to verify. No immediate pressure.

---

## 7. Security & Risk Register (Immediate)

| Risk | Severity | Location | Mitigation |
|------|----------|----------|------------|
| Production branch missions folder not in main | **P0** | `production/android-hardening-20261102:missions/fullstack-android/` | Merge folder to main before any branch cleanup |
| STATUS_LEDGER shows Tasks 29,30,33,34,41 as PLANNED but main has them IMPLEMENTED | **P0** | Documentation drift | Reconcile STATUS_LEDGER with actual main code |
| No device/emulator verification | **P1** | All Android tasks | CI builds APK but no instrumentation test run |
| Instrumentation tests compile but NOT RUN | **P1** | `app/src/androidTest/` | Requires device farm or local emulator |
| Argon2id (Task 37) used but Keystore key not auth-bound per-use | **P1** | `core/security/Argon2id.kt`, `KeystoreManager.kt` | Documented in-app; hardware-bound auth pending |
| Electron dirty files uncommitted | **P2** | `electron/vault/*.js`, `tests/*.cjs` | Separate lane; commit or stash before Android work |
| No code signing for Android release | **P0** | Release pipeline | `OWNER_ACTIONS_REQUIRED.md` documents this |

---

## 8. Integration Strategy

### Required Merges (Safe, Non-Destructive)
1. **Merge `production/android-hardening-20261102` → `main`** (folder `missions/fullstack-android/` only)
   - Strategy: `git checkout main && git merge --no-ff --no-commit production/android-hardening-20261102 -- missions/fullstack-android/`
   - Then manually resolve: update STATUS_LEDGER to reflect main's actual IMPLEMENTED status for Tasks 29,30,33,34,41
   
2. **Preserve feature branch SHAs** in integration record (already in git history)

### NOT Required
- No merge of planning branch (historical only)
- No merge of feature branches (already in main)
- No worktree creation needed (single orchestrator mode)

---

## 9. Baseline SHA Evidence

| Artifact | SHA | Verified |
|----------|-----|----------|
| Main HEAD | `927f60168030162ec74aa50e113d3e600446e856` | ✅ Current checkout |
| origin/main | `ffdffde` | ✅ Remote |
| production/android-hardening-20261102 | `a5df8d4` | ✅ Remote |
| planning/knoux-crypt-native-44... | `5df9fc6` | ✅ Remote |
| TASK_000 baseline (traycer) | `c219849` | ✅ Historical |

---

## 10. Next Safe Action

**TASK 001: Merge missions/fullstack-android/ folder from production branch to main and reconcile STATUS_LEDGER.**

This is a documentation-only merge with zero code risk. It preserves the unique evidence corpus and corrects the status drift.