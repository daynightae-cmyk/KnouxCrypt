# KNOUX CRYPT — Storage & Cleanup Register

## Disk state (audit host)

| Drive | Free GB |
|---|---|
| C: | 7.14 |
| D: | 8.05 |
| K: | 4.87 |

## Cleanup candidates

| Category | Item | Size est. | Disposition |
|---|---|---|---|
| A (safe, regenerable) | `dist/` build output (if present) | variable | Safe to delete after verified build; regenerable via `npm run build`/`dist`. |
| A | `node_modules` in worktrees | ~hundreds MB | Safe to delete if reinstallable; but no node_modules present in audit worktree. |
| A | Temp test dirs `D:\Temp\knoux-acl-*` | small | Safe; created by tests, cleaned by tests. |
| B (inspect) | `qa-evidence/` screenshots | large | Contains QA evidence; preserve until release sign-off. |
| C (unique) | `visuals/`, `agent-handoff/` | large | Preserve (approved references). |
| C | Worktrees with untracked missions/visuals (`D:\KnouxCrypt`) | large | Preserve. |
| D (in use) | `D:\KnouxCrypt-Windows-QA` (installed node_modules) | large | In use as test runtime; do not delete. |
| E (unknown) | Any untracked file not classified | — | Preserve. |

## Rules applied

- No destructive cleanup performed during this audit.
- No `git clean`, `git reset --hard`, or worktree deletion.
- Category A items only deleted after path/ownership/process-use validation and scope restriction to exact target.
- Actual recovered space reported only after verified cleanup (none performed yet).

## Recommendation

Before any resource-intensive build, ensure ≥10 GB free on the build drive. Prefer running builds in `D:\KnouxCrypt-Windows-QA` (has node_modules) to avoid reinstalling.
