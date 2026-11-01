# KNOUX CRYPT — Task Index

Baseline: `main` @ `c2198496bdb89a7f829c18c8762fc0c31e2fc78a`.

## Task list

| ID | Title | Priority | Status | Depends on |
|---|---|---|---|---|
| TASK 000 | Forensic baseline, preservation & integration verification | P0 | IN_PROGRESS | — |
| TASK 001 | Enable CI on all PRs (remove Dependabot-only gate) | P0 | NOT_STARTED | TASK 000 |
| TASK 002 | Build ia32 artifacts + verify packaging matrix | P1 | NOT_STARTED | TASK 000 |
| TASK 003 | Self-host Inter font (remove googleapis request) | P2 | NOT_STARTED (design decision) | TASK 000 |
| TASK 004 | Linux POSIX verification of ACL branches (CI or WSL) | P1 | NOT_STARTED | TASK 001 |
| TASK 005 | Second-local-user confidentiality demonstration | P2 | NOT_STARTED | TASK 000 |
| TASK 006 | electron-updater verification (signed feed) | P1 | BLOCKED_EXTERNAL (signing) | TASK 010 |
| TASK 007 | Full visual parity re-check on Windows display | P2 | NOT_STARTED | TASK 000 |
| TASK 008 | Performance baseline & measurement | P2 | NOT_STARTED | TASK 000 |
| TASK 009 | Accessibility audit (keyboard/focus/screen reader) | P2 | NOT_STARTED | TASK 000 |
| TASK 010 | Code signing integration (external cert) | P0 | BLOCKED_EXTERNAL | — |
| TASK 011 | Independent security review | P1 | BLOCKED_EXTERNAL | — |
| TASK 012 | macOS/Linux target verification | P2 | NOT_STARTED | TASK 001 |

## Execution order

TASK 000 → TASK 001 → TASK 004 / TASK 002 → TASK 007/008/009 → (external gates TASK 010/011).

## Notes

- Tasks are generated from actual audit findings, not invented.
- Each task has acceptance criteria and gates; see individual task files.
- No task claims completion without evidence.
