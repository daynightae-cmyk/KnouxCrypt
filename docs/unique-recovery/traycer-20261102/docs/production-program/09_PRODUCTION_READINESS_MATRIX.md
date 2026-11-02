# KNOUX CRYPT — Production Readiness Matrix

No single completion percentage is claimed. Each subsystem rated with evidence.

| Subsystem | State | Evidence |
|---|---|---|
| Repository integration | Integrated baseline `main@c219849` | Git audit. |
| Desktop service logic (44 services) | Implemented & tested | `npm run test` 449 pass (QA env); route check 44/44. |
| Electron security (CSP/IPC/isolation) | Verified | `check:csp` 19/19; hardening tests. |
| Windows filesystem security (ACL) | Verified on Windows | `file-protection.test.cjs` 16 tests. |
| Splash & bootstrap | Verified (packaged) | QA EXE run. |
| App shell & navigation | Verified (routes) | `check:routes`. |
| Visual identity | Implemented; full parity not re-verified this pass | Screen reviews; no new screenshots. |
| Performance | Not measured this pass | Prior reports. |
| Accessibility | Partially tested | Screen reviews. |
| Packaging (portable+NSIS x64) | Built & runtime-tested | QA harness 40/40 + 28/28. |
| Code signing | NOT SIGNED | Release readiness doc. |
| Installer (ia32) | Not built | — |
| macOS/Linux | Not tested | — |
| CI/CD | Not running on normal PRs | Workflow gated. |
| Auto-update | Not verified | Blocked on signing. |
| Independent audit | None | — |

## Overall

`BUILT — QA_VERIFIED_UNSIGNED — RELEASE_BLOCKED_ON_SIGNING_AND_CI`

Not production-ready until signing, CI, and independent review are addressed.
