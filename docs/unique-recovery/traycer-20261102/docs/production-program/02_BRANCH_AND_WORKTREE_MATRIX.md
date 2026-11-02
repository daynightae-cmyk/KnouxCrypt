# KNOUX CRYPT — Branch & Worktree Matrix

## Branches (remote, 28)

See `00_FORENSIC_BASELINE.md` §4. All branches inventoried; none deleted.

## Worktrees (5)

See `00_FORENSIC_BASELINE.md` §5. None removed.

## Integration strategy

- No merge required: desktop baseline `main` @ `c219849` already contains all desktop security work.
- CI improvement from `origin/automation/dependabot-tested-squash-merge-20261101` to be cherry-picked selectively (remove Dependabot-only gate) — reversible, low risk.
- Android branches left untouched.
- Historical branches preserved as references; not deleted.
