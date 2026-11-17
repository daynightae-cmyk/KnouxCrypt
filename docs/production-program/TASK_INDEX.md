# KNOUX CRYPT — Task Index

**Baseline:** `main` @ `927f60168030162ec74aa50e113d3e600446e856`  
**Generated:** 2026-11-15

---

## Task List

| ID | Title | Priority | Status | Depends On | Owner |
|----|-------|----------|--------|------------|-------|
| TASK 000 | Forensic baseline, preservation & integration verification | P0 | **COMPLETE** | — | Orchestrator |
| TASK 001 | Merge missions/fullstack-android/ from production branch & reconcile STATUS_LEDGER | P0 | **READY** | TASK 000 | Orchestrator |
| TASK 002 | Push main & verify Android CI green | P0 | **READY** | TASK 001 | Orchestrator |
| TASK 003 | Local Android build verification (Debug APK) | P0 | **READY** | TASK 002 | Orchestrator |
| TASK 004 | Device/emulator setup for instrumentation tests | P1 | **BLOCKED_EXTERNAL** | TASK 003 | Owner |
| TASK 005 | Run instrumentation tests (AccessFlowTest, PublicKeyQrDeviceTest) | P1 | **BLOCKED** | TASK 004 | Orchestrator |
| TASK 006 | Visual verification on device (compare to PR #15 baseline) | P1 | **BLOCKED** | TASK 004 | Orchestrator |
| TASK 007 | Accessibility audit (TalkBack, switch access, font scaling, RTL) | P1 | **BLOCKED** | TASK 004 | Orchestrator |
| TASK 008 | Add dependency vulnerability scanning to CI (dependencyCheck) | P1 | **READY** | TASK 002 | Orchestrator |
| TASK 009 | Code signing integration (release build) | P0 | **BLOCKED_EXTERNAL** | TASK 002 | Owner |
| TASK 010 | Play Console setup & first internal release | P0 | **BLOCKED_EXTERNAL** | TASK 009 | Owner |
| TASK 011 | Independent security review | P1 | **BLOCKED_EXTERNAL** | TASK 008 | Owner |
| TASK 012 | Local Transfer transport implementation (WebRTC/BLE) | P2 | **NOT_STARTED** | TASK 005 | Orchestrator |
| TASK 013 | Multi-Device Pairing implementation | P2 | **NOT_STARTED** | TASK 012 | Orchestrator |
| TASK 014 | Transfer Wizard implementation | P2 | **NOT_STARTED** | TASK 012 | Orchestrator |

---

## Execution Order

```
TASK 000 (DONE)
    ↓
TASK 001 → TASK 002 → TASK 003
    ↓                    ↓
TASK 008            TASK 004 (Owner)
    ↓                    ↓
TASK 005 → TASK 006 → TASK 007
    ↓
TASK 009 (Owner) → TASK 010 (Owner)
    ↓
TASK 011 (Owner)
    ↓
TASK 012 → TASK 013 → TASK 014
```

---

## Status Definitions

| Status | Meaning |
|--------|---------|
| NOT_STARTED | No work begun |
| READY | Prerequisites met, can start immediately |
| IN_PROGRESS | Actively being worked |
| IMPLEMENTED_UNVERIFIED | Code complete, not yet tested/verified |
| COMMITTED_UNPUSHED | Committed locally, not pushed |
| PUSHED_UNMERGED | Pushed to remote branch, PR open |
| MERGED_UNVERIFIED | Merged to main, not yet verified on target |
| VERIFIED | All gates pass, evidence recorded |
| REGRESSED | Previously verified, now failing |
| BLOCKED | Waiting on prerequisite |
| BLOCKED_EXTERNAL | Waiting on owner/external action |
| BLOCKED_POLICY | Waiting on policy approval |

---

## Notes

- Tasks are generated from actual audit findings, not invented
- Each task has acceptance criteria and gates; see individual task files
- No task claims completion without evidence
- P0 = Security / Data integrity / Release blocking
- P1 = Core functionality / Quality gates
- P2 = Enhancement / Post-release