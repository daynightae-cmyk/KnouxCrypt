# TASK 001 — Enable CI on All Pull Requests

## Status
IMPLEMENTED_UNVERIFIED (CI run pending).

## Priority
P0.

## Scope
`.github/workflows/dependabot-validation.yml` — remove the Dependabot-only `if` gate so Desktop and Android JVM jobs run on every PR to `main`.

## Problem
Both jobs are gated on `github.event.pull_request.user.login == 'dependabot[bot]'`, so `npm run check` never runs in CI for human/agent PRs. The only `npm run check` evidence is a single Windows host. POSIX ACL branches unverified.

## Implementation
1. Remove the `if:` lines from both `desktop` and `android` jobs (or replace with a broader condition).
2. Keep `permissions: contents: read` and `persist-credentials: false` (security).
3. Keep xvfb-run for the desktop job.
4. Update workflow name from "Dependabot Validation" to "CI Validation" (optional, clarity).
5. Add a separate lightweight job? No — reuse existing.

## Risks
- Android gradle build may be slow/fragile on ubuntu; already configured with timeouts.
- Electron runtime checks need xvfb (already present).
- Cost: runs on every PR; acceptable.

## Acceptance criteria
- [ ] Workflow triggers on any PR to main.
- [ ] `npm ci` + `npm run check` runs for desktop.
- [ ] Android JVM tests run.
- [ ] YAML valid (lint).
- [ ] Commit pushed to a safe branch; no production deploy.

## Gates
- CODE_GATE: workflow edited.
- CI_GATE: workflow run observed (after push).
- Others: NOT APPLICABLE.
