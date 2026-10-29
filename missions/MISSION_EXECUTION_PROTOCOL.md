# Universal Agent Contract — Every Mission

This protocol applies to every numbered mission in this folder.

## Check before touching anything
- `git status --porcelain=v1`, `git log -1 --format=%H`, `git rev-parse origin/main`, `git branch -avv`, `git worktree list --porcelain`, `git stash list`, `git reflog -10`.
- Enumerate existing active branches/PRs/agents before reusing files or branches; do not trample simultaneous work.
- Read actual relevant files, dependency versions, assets, tests, CI, environment, device limitations; record SHA before modifications.
- Preserve local project directory and unique work; no `reset --hard`, `clean`, history rewrite, worktree prune, or accidental installer caches on small D.

## Strict task lifecycle
SPEC → IMPLEMENT → UNIT TEST → INTEGRATE → DEVICE TEST → SECURITY REVIEW → VISUAL REVIEW → EVIDENCE → PR → OWNER APPROVAL.

Every card must have `idle | unavailable | needsPermission | ready | working | verified | failed | cancelled` mapping to actual domain state. `verified` only after authenticated result checks. Every error has corrective action, and every destructive action has an explicit consent and rollback/recovery description.

## Reuse first
Audit current desktop and preserve proven behavior as reference; only port platform-appropriate code and approved visual language. Never conflate desktop BitLocker/system encryption with Android app-scoped file vaults. No custom cryptographic primitives; no remote data uploads without explicit opt-in and privacy policy.

## Deliverable format after executing any mission
```text
MISSION:
BASELINE SHA:
BRANCH / NEW SHA:
CHANGED FILES:
WHAT REALLY WORKS:
WHAT REMAINS PLANNED / BLOCKED:
BUILD COMMAND + REAL RESULT:
UNIT/INSTRUMENTATION COMMAND + REAL RESULT:
DEVICE / API LEVEL / INSTALL PROOF:
SECURITY NEGATIVE TESTS:
SCREENSHOT REFERENCES & VISUAL DIFF:
CI URL + STATE:
DATA LOSS / REGRESSION RISKS:
NEXT SAFE ACTION:
```

No fake PASS/DONE. Release requires signed artifact + verify + device smoke + policy checks and independent review; screenshots alone never count.
