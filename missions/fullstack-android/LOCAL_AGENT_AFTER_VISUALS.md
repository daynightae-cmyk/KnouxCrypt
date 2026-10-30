# KNOUX CRYPT - LOCAL ANDROID AGENT: EXECUTE AFTER VERCEL/ANIMA VISUAL WORK

YOU ARE THE IMPLEMENTATION AGENT FOR AN ANDROID NATIVE APPLICATION.
THIS IS EXECUTION, NOT A DESIGN DISCUSSION OR A PLANNING-ONLY REPORT.
Read this entire mandate, then TASK 00 and each TASK 01..45.

## Work ownership and readiness
The Vercel/Anima agent is currently editing screens and the GitHub repository. DO NOT run a competing edit on the same app files. Start the actual Android port only after the user says the visual agent has finished or there is clear evidence that its current branch/PR has been merged/reconciled. Do not assume a process is finished from one silent minute.

## Step A - establish Git reality before ANY write
1. Confirm exact local repo path, git status --short, git rev-parse HEAD, git remote -v, git ls-remote origin refs/heads/main, git branch -avv, git worktree list --porcelain, git stash list, reflog and all local untracked screenshots/files.
2. Compare origin/main with remote live HEAD and GitHub PR status. Existing local planning branch is distinct from production main and may have unique mission work; NEVER discard it as outdated. Determine which work exists only in local branches/worktrees or agent PRs.
3. Establish a non-destructive preservation point and inventory; export patch/bundle or copy untracked work to reviewed safe location before risky reconciliation. Do not rewrite Git history, hard reset, clean, force push, delete branches/worktrees or overwrite assets.
4. Fetch remote refs, then build a reconciliation matrix: REMOTE MAIN, LOCAL CURRENT, UNIQUE BRANCHES, ACTIVE AGENTS, APPROVED UI assets, UNMERGED TASK BRANCHES. Merge/cherry-pick scoped work only after confirming uniqueness, conflicts and current visual acceptance. Make integrated changes on a dedicated Android feature branch, leaving main clean until reviewed.
5. Read the latest actual source and mission notes. If Vercel's work remains in flight, do read-only reconciliation, then stop at the boundary rather than colliding with another agent.

## Step B - implement native Android, service by service
1. TASK 00: Create tested Gradle Kotlin DSL Android app with Jetpack Compose UI, Navigation, MVVM/StateFlow, DI, Room protected repository, Keystore-backed keyring and vetted crypto. Do NOT reuse insecure JS block cipher as production crypto.
2. Implement 01 Splash -> 02 Secure Access -> 03 Home, adhering to the ORIGINAL purple stag-K visual identity. Preserve logo proportions, center auth block, collision-free wordmark, safe areas, ambient violet particles, reduced motion and optional sound.
3. For each TASK 04..44: read its file; inspect existing implementation and avoid duplicate work; implement the complete vertical path: native Compose screen + state and forms + domain workflow + crypto/OS/native services + real encrypted storage where applicable + optional consented backend only if necessary + errors/cancel/restore + tests.
4. All routes must resolve, be locked appropriately, and retain navigation/back state. Integrate unfinished P2 only with truthful disabled/gated state; do not claim a dummy demo is complete.
5. Every service's fully functional production behavior must follow Android platform realities: Scoped Storage, Photo Picker, BiometricPrompt, Android Keystore, WorkManager, AutofillService, ClipboardManager, NDK only where justified, signed AAB, release prerequisites. Determine tested minSdk/targetSdk from current Android/Google Play requirements.
6. Implement end-to-end security with AEAD, versioned envelopes, vetted algorithms, fresh nonces, authenticated chunking, reliable key rotation, recovery across devices and no secret exposure in logs. External sync must never receive raw plaintext secrets or device Keystore keys.
7. Maintain visual parity with each approved PNG, including dimension ratios, logo gap, spacings, gravity/centering, motion and RTL. No full-screen screenshot with invisible taps.

## Step C - independent audit gates
For EACH task report: REALITY -> RISKS -> UNIQUE WORK -> GAPS -> SAFE NEXT ACTION.
Mark exactly PLANNED, BLOCKED, PRESENT_UNMERGED, IMPLEMENTED_UNVERIFIED, TESTED, MERGED_NOT_RELEASED or RELEASED only when raw evidence supports it.
Run unit tests, negative cryptographic vectors, instrumented device tests, screenshot diffs and build. Record commands, exact output, current commit SHA, target branch, deployment and physical/emulator validation. A build passing alone != production. Preserve independent agent evidence and failed tests.

## Step D - finish and reconcile
After task 44, complete TASK 45: integrate modules, test hostile inputs and interrupted operations, verify recovery on a second device, security review and signed Android App Bundle. Only push reviewed scoped commits; merge after actual CI and code review. Publishing to Google Play, signing account changes, new billing/provider setup, deleting user data or destructive Git actions need owner authorization; do not invent credentials or bypass those decisions.

## Autonomy and no-interruption rule
Work autonomously in non-destructive bounds. When information is available in repo/code/CI, inspect it rather than asking. If a task is blocked on missing API key, external provider, permission, hardware or owner approval, document BLOCKED with evidence, disable unavailable functionality honestly, and continue the next safe independent task. Do not fake closure or silently skip a P0 security requirement.

## Minimal final report
1. Verified HEAD, source and branch vs remote; 2. Visual source and SHA; 3. Feature tasks completed with actual tests; 4. Unique work preserved; 5. Unmerged/unpushed work; 6. Remaining blockers; 7. Safest next action.
