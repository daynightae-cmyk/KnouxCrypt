# KNOUX CRYPT — CODE RABBIT + VERCEL UNIQUE WORK RECONCILIATION
## OWNER EXECUTION ORDER • DESKTOP ONLY • 2026-10-31

**Authoritative integration target:** `desktop/electron-fullstack-44-services-20261031`.

**MANDATE:** Preserve CodeRabbit's desktop visual work AND Vercel's unique working crypto/data services; reconcile them into the DESKTOP branch without altering Android or automatically merging into main. CodeRabbit resumes the next four-task increments after verified reconciliation.

### Evidence at the time of this handoff (NOT a completion certificate)

- Verified GitHub Desktop remote head: `3ce168973436ba81010ab717d083bcc691fa623a`. It includes all 10 individually committed design references at `visuals/DESKTOP_WORKSPACE_REFERENCES_01-10/` and their SHA-256 manifest.
- Verified `main` at `8b98d3175e7ffc810c6f1a8af3e67ab3a447c956`. Relative to main, Desktop was **5 commits ahead, 1 behind**. Main is NOT a safe drop-in replacement for Desktop.
- CodeRabbit screenshot: current task **"Implement the first four desktop workspace screens from the approved references"** displays **25 changed files (+823/-3)**, screenshot outputs for Home, File Cipher, Vault, Notes, Passwords, Authenticator, Key Forge and Privacy, and 6 CodeRabbit review findings. These are SCREENSHOT/AGENT-LOCAL observations, **not evidence of pushed commits or finished backend services**. The task's repository panel previously showed `main`, so verify the actual task base before writing anything.
- Vercel screenshot: agent claims a local commit `22108edad3fe15ffe785ba7ecc00fd74bf06929` (short `22108ed`) with encrypted Password Manager, TOTP import/live codes, Ed25519 inventory and app-scoped Privacy, plus **43 passing engine/IPC tests**. It explicitly says **NOT PUSHED**. These test claims are unverified by this handoff.
- Vercel downloads shown in the task: `KNOUX-Increment2-delta-from-e3f236b.bundle`, `KNOUX-Increment2-implementation-tests-and-limitations.md`, and `KNOUX-Increment2-22108ed.sha256`. Source parent `e3f236b` and child `22108ed` were **not found on remote GitHub** when checked. The delta bundle may have prerequisites not contained in this repository.
- Vercel reports **31 audit findings including 1 critical**, and missing Windows runtime/QA and other workflows. **Never mark production security as cleared** based on 43 tests.
- Android work is independent; its latest remote SHA changes frequently. Do not touch its branch or worktrees.

## 1 — FREEZE AND PRESERVE CODE RABBIT'S ACTUAL WORK FIRST

1. Inspect current working folder, `git status --short`, `git branch --show-current`, `git rev-parse HEAD`, `git remote -v`, all untracked work, changed files, task state and existing PR. Review all six findings and any failed commands.
2. The task may have started from `main`. **Do not commit onto main. Do not create a PR to main. Do not discard work to switch branches.**
3. Preserve all unique CodeRabbit Desktop changes in an isolated, suitably named **rescue task branch**; include intended source, tests, and legitimate design screenshots, but never stage credentials, `.env`, cache, build outputs or irrelevant secrets. If branch switching risks losing edits, make a lossless workspace snapshot before doing so.
4. Record the resulting rescue commit SHA, remote push (or exported patch/bundle if push unavailable), and exact upstream base. Without this verified checkpoint, do not move on to integration.
5. Do not merge and delete source branches while they contain unique work. Preserve raw snapshots until validation completes.

## 2 — ACQUIRE AND VALIDATE VERCEL'S UNIQUE WORK

1. The owner should download all 3 Vercel artifacts and provide them to the coordinator's authorized workspace. If already present, inspect them in an isolated sandbox. Do not upload secrets to a third-party environment.
2. Verify the binary bundle SHA-256 against the supplied checksum file, `git bundle verify`, bundle refs and required ancestors. Treat the downloaded content as untrusted; inspect scripts before running.
3. **This is a DELTA FROM `e3f236b`.** If `git bundle verify` reports missing prerequisite objects, obtain the complete prerequisite bundle/known-base patch from the Vercel agent. Never fabricate the missing Git history, force-update refs, or overlay all files blindly.
4. Compare the Vercel source and CodeRabbit source against their **actual common ancestor**, not assumed `main`. Inventory novel changes: secure Electron IPC/engines, cryptography, TOTP, Passwords, keys, Privacy, new UI, tests, storage migrations and dependencies.
5. Ensure the Vercel archive contains its claimed commit `22108edad3fe15ffe785ba7ecc00fd74bf06929`; if not, stop that import and request a self-contained artifact. Preserve the report and verification hashes.

## 3 — MERGE INTO DESKTOP, NOT MAIN

1. Create an isolated integration branch FROM the latest `origin/desktop/electron-fullstack-44-services-20261031`. Re-fetch and review if the remote moves.
2. Bring over validated CodeRabbit visual architecture first (shared Desktop Shell, layouts, visual references, responsive UI and accessibility), while keeping working routes and brand assets.
3. Bring over Vercel's **unique, reviewed backend code**, secure IPC, real encrypted credential storage, TOTP engine, key inventory, tests and any safe app-scoped Privacy controls.
4. For collisions in the same files, **manually merge by functionality and invariants**, not `--ours`/`--theirs`, file-copy overwrites or automatic wholesale cherry-picks. Choose CodeRabbit's proven workspace presentation where appropriate and retain Vercel's verified service logic underneath. Neither source is presumed correct; re-run security tests.
5. Never replace working security code with a UI stub. Never copy Vercel example secrets/test fixtures into the production vault. Never claim system-wide Windows privacy controls if only app-scoped controls exist.
6. Address all CodeRabbit review findings, and separately triage Vercel's 31 security findings (critical item first, do not silently mark fixed).
7. Run positive and negative tests, Electron build/IPC checks, real available renderer/UI smoke tests, RTL/LTR + reference screenshots; label Windows EXE runtime/installer SIGNING as UNVERIFIED unless actually performed on Windows.
8. Commit and push reviewed integrated code to the **Desktop** branch only after showing all unique work has been retained and regressions addressed. If integration is risky, keep it as a reviewable PR with **base = Desktop branch**, never main.
9. Verify remote SHA, git diff, preserved rescue branches/bundles, and reconciled service ledger. **Do not merge Desktop into main automatically.**

## 4 — CONTINUE REAL SERVICES IN FOUR-TASK INCREMENTS

- Resume the exact current state of `missions/fullstack-desktop/KNOUX_DESKTOP_44_SERVICES_MASTER_EXECUTION.md` and `missions/fullstack-desktop/DESKTOP_VISUAL_REFERENCE_INTEGRATION_2026-10-31.md`.
- Visual references 01–10 are separate from the canonical 44 task IDs. The first two visual batches must not be conflated with finished full-stack services.
- After reconciliation, implement the next missing **FOUR** canonical/visual tasks per the established ledger, commit verified increments and push to the Desktop branch.
- Preserve all screenshots and branded KNOUX assets. Maintain full-stack functionality and negative security tests, not just visual resemblance.
- Vercel billing, deployment and account recovery are OUT OF SCOPE, per owner. Do not stop work for payment issues.

## 5 — REQUIRED HANDOFF EVIDENCE

Record clearly:
- Actual source branch, base and commit SHA for **each** of CodeRabbit and Vercel.
- Preserved rescue branches/archive checksums, no lost unique changes.
- Exact changed files and per-service contribution (CodeRabbit vs Vercel).
- Conflicts/decisions and all unresolved critical findings.
- Real test commands/exit codes/counts, builds and screenshots.
- Final **pushed Desktop SHA**, target branch and PR status if any.
- What remains DEVICE/WINDOWS_UNVERIFIED, PARTIAL, BLOCKED or AUDIT_PENDING.
- The exact next four tasks, started if tooling/time permits.

**Never report MERGED, COMPLETE, PASS or RELEASED from screenshots or agent narration alone. A local commit is not a remote push.**
