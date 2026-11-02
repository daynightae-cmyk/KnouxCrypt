# KNOUX CRYPT — Security & Risk Register

## Verified security controls

| Control | Evidence |
|---|---|
| contextIsolation true, nodeIntegration false | `tests/electron-hardening.test.cjs` |
| Strict CSP all documents (no unsafe-eval) | `tests/electron-hardening.test.cjs`, `check:csp` 19/19 |
| Splash CSP (external CSS/JS) | verified |
| IPC allowlist + sender validation | `electron/preload.js`, tests |
| Navigation/new-window denied by default | tests |
| Permissions denied | tests |
| NTFS owner-only DACL (fast + exhaustive) | `electron/vault/acl.js`, `tests/file-protection.test.cjs` |
| Atomic writes, no partial output | tests |
| Argon2id KDF (tested vectors) | `electron/vault/argon2.js` |
| Authenticated encryption (AEAD) | `electron/vault/engine.js` |
| Tamper-evident journal | `electron/vault/journal.js` |
| No secrets in renderer bundle | tests/build |

## Open risks

| ID | Risk | Severity | Status |
|---|---|---|---|
| R-1 | Unsigned artifacts (SmartScreen, AV false positives) | High | External: needs Authenticode cert. |
| R-2 | CI only runs for Dependabot PRs | High | Fixable: remove `if` gate (TASK). |
| R-3 | POSIX ACL branches unverified on real Linux | Medium | Needs Linux run. |
| R-4 | Confidentiality vs second local user argued from DACL, not demonstrated | Medium | Needs second-account test. |
| R-5 | SYSTEM/Administrators retain full control by design | Low (accepted) | Documented trade-off. |
| R-6 | Inter font from googleapis (IP/availability leak) | Low-Medium | Design decision; recorded. |
| R-7 | electron-updater unverified (no signed feed) | Medium | Blocked on signing. |
| R-8 | ia32 not built | Low | Build task. |
| R-9 | macOS/Linux targets untested | Low | Platform task. |
| R-10 | No independent security audit | Medium | External. |
| R-11 | 15 moderate npm advisories in build toolchain only | Low | Accepted; re-check on electron-builder releases. |
| R-12 | No auto-update until signing verified | Low | By design. |

## Security principle

No secret is logged. Operations fail closed. Renderer has no fs/crypto/child_process. Privileged ops in main with validation.
