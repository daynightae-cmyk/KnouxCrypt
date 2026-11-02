# KNOUX CRYPT — ANDROID NATIVE / SECOND-GENERATION PROJECT EXECUTION PROMPT
## Verified continuation directive — 2026-11-02 — for the next authorized coding agent

**THIS IS AN EXECUTION DIRECTIVE, NOT A CLAIM OF CURRENT COMPLETION.**
Revalidate every mutable fact below before write. Deliver real code, real tests and exact source evidence. No planning-only response, fake PASS, cosmetic security labels, automatic cleanup or premature release.

### 0. Product lock and authority

Product: **KNOuX Crypt Android Native**, Kotlin + Jetpack Compose.
Remote: `https://github.com/daynightae-cmyk/KnouxCrypt.git`.
Integration target: `main`. Last verified integration HEAD: **`fd16739b6988249d0f8e8e057f579a3cda5f163c`**.
Primary integration checkout: **`D:\KnouxCrypt-Android-Ready`**.
Separate planning checkout: **`D:\KnouxCrypt`**.
Native source: **`native-android/`**.
Mission truth: **`missions/fullstack-android/TASK_INDEX.json`**, `missions/fullstack-android/{NN}_*/TASK.md`, `missions/fullstack-android/STATUS_LEDGER_CURRENT.md`.
Read this prompt with `00_ANDROID_FOUNDATION/FORENSIC_CHECKPOINT_2026-11-02.md` and `UNIQUE_WORK_REGISTER_2026-11-02.md`.

There is ALSO a Windows/Electron app in the **same** repository. Do not execute Electron tasks, alter desktop visuals, or share its native security/IPC assumptions with Android. Protected desktop paths include `electron/`, `electron_main/`, `src/`, desktop missions and `docs/production-program/`. PR #33 is Desktop/CI DRAFT, **not** authority to rewrite Android. Android-only modifications require exclusive owner lease over each shared source contract.

**Current source truth:** `production/android-hardening-20261102` (`a5df8d4`) is already an ancestor of main (behind 13, ahead 0 at observation); the Android hardening was merged as `f586e80`. Do not replay TASK 39, TASK 05 or TASK 07 from scratch. Current `main` also incorporates desktop work through `24a75ca`. Previous plans citing `c240b87` as active HEAD are historical.

### 1. Boot and safety (MANDATORY, before any mutation)

1. Read current repo `AGENTS.md` if one exists (no tracked `AGENTS.md` was found during this audit, so also inspect local/untracked instructions safely). Check owner-approved brand/UX policy and task-specific acceptance.
2. Inspect all relevant roots, remotes, `HEAD`, `origin/main`, `status --porcelain=v2 -uall`, branch tracking, `worktree list --porcelain`, untracked and ignored files, remote refs, stash, reflog, open PRs, checks and current file owners. Fetch only safely if permitted.
3. **URGENT UNIQUE WORK:** in `D:\KnouxCrypt`, `planning/android-crypt-suite-20261029` at `6c19107`, there were **253 untracked files** at audit time, including 44 design PNG references, prompt/source packages, scripts, mission task sheets and ZIPs. These files are **NOT PROTECTED BY THE EXISTING GIT BRANCH**, but a separate copy-only K: snapshot was subsequently created and all **253 file SHA-256 pairs verified**. Destination: `K:\KNOUX_PROJECT_PROMPT_VAULT\KnouxCrypt__ANDROID\UNTRACKED_SNAPSHOT_20261102_6c19107` with `MANIFEST_SHA256.csv` (manifest SHA-256 `E9A02A91C894C777CBD55C2003BDFA198A57BD14BEC7D73D44DA2FD915F9CC75`). This is not an atomic/off-device backup; revalidate presence/hash/ownership before changing or cleaning anything. Require exact owner/agent non-overlap.
4. The Windows system had C = 6.42 GB, D = 4.52 GB, K = 4.50 GB free (decimal) at audit time; recheck before builds or backup, use `D:\Temp` as appropriate, never target C without capacity check. Never overwrite active agent caches or temporary build output.
5. No `git reset --hard`, `git clean`, force push, rebase of another agent's branch, shared worktree removal, delete, prune, checkout clobber, user-data reset, changing keys or migrations without isolated data-migration verification and explicit authorization for destructive effects.
6. The only accepted sequence is **REALITY -> RISKS -> UNIQUE WORK -> GAPS -> TASK CLAIM -> MINIMAL IMPLEMENTATION -> TESTS -> DEVICE/VISUAL RUNTIME -> REVIEW -> COMMIT -> INTEGRATION/CI -> NEXT TASK**.
7. If another agent owns a task or source file, **do not touch it**. Single writer for `Catalog.kt`, `KnouxNavHost.kt`, `AppContainer.kt`, `MainActivity.kt`, `SecretsDatabase.kt`, Keystore/session/Room contracts, Gradle/lockfiles and `.github/workflows/android.yml`. Announce a bounded `TASK_CLAIM` or stay READ_ONLY.
8. The audit produced docs on a separate non-default branch; it did not create any Android code write lease. Recheck claims before beginning.

**Recommended read-only commands** (use the authorized shell on device; do not assume any command has been run merely by appearing here):

```sh
git -C D:/KnouxCrypt-Android-Ready rev-parse --show-toplevel
git -C D:/KnouxCrypt-Android-Ready rev-parse HEAD
git -C D:/KnouxCrypt-Android-Ready status --porcelain=v2 -uall
git -C D:/KnouxCrypt-Android-Ready worktree list --porcelain
git -C D:/KnouxCrypt-Android-Ready branch -avv
git -C D:/KnouxCrypt-Android-Ready stash list
git -C D:/KnouxCrypt-Android-Ready reflog -n 25
git -C D:/KnouxCrypt status --porcelain=v2 -uall
git -C D:/KnouxCrypt ls-files --others --exclude-standard
```

Confirm actual full SHA and `origin/main` matching on the intended checkout before changing any file.

### 2. Platform and source inventory

Gradle modules presently documented and present: `:app`, `:core:designsystem`, `:core:security`, `:core:data`.
Source build root: `native-android/`, with wrapper `gradlew.bat` and `settings.gradle.kts`.
Observed toolchain in native README: AGP 8.10.1, Kotlin 2.1.20, Gradle wrapper 8.14.6, Android SDK 36, Compose BOM 2025.04.01, Room 2.7.1, DataStore 1.1.4, JDK target 17. These versions were not re-audited against Gradle files on this run; inspect source on the new HEAD.

**Existing classes to inspect and reuse** (no duplicate parallel crypto/repository systems):

- `native-android/app/src/main/kotlin/com/knoux/crypt/Catalog.kt`: real catalog, labels, feature/route status; previous TASK 39 fixed corrupted Arabic. Don't reintroduce `????` or UI-only success.
- `native-android/app/src/main/kotlin/com/knoux/crypt/KnouxNavHost.kt`: navigation, Back; one writer, no duplicate feature routes.
- `native-android/app/src/main/kotlin/com/knoux/crypt/ui/ShadowVaultScreen.kt` and `ui/ShadowVaultMedia.kt`: TASK 05 media UI; reusable vault selection/navigation.
- `native-android/core/data/src/main/kotlin/com/knoux/crypt/data/ShadowVault.kt`: encrypted media implementation; avoid inventing a second vault/keyring.
- `native-android/core/data/src/main/kotlin/com/knoux/crypt/data/SecretsDatabase.kt`: repository and Room migrations; preserve ciphertext and exact schema constraints.
- `native-android/core/data/src/main/kotlin/com/knoux/crypt/data/SecurityEventRepository.kt`: typed nonsecret security audit; 500 newest entries/90-day retention, actual Room Flow, controlled clear.
- `native-android/core/data/src/main/kotlin/com/knoux/crypt/data/VaultKeys.kt`, `VaultKeyRotation.kt`, `VaultBackup.kt`, `VaultFileCipher.kt`: key/session backup and file security architecture; inspect current variants and test vectors.
- `native-android/core/data/src/androidTest/kotlin/com/knoux/crypt/data/VaultDatabaseMigrationTest.kt`: migration 1→2→3 tests **compiled but not run**.
- `native-android/core/data/src/test/kotlin/com/knoux/crypt/data/ShadowVaultServiceTest.kt`, `SecretRepositoryAuditTest.kt`: already verified in CI context; extend rather than duplicate.
- `native-android/scripts/check-source.py`: source boundary checks; avoid hardcoding non-existent legacy paths.

Never log raw key material, seed/OTP, decrypted plaintext title, file name/path, credential or sensitive URI in analytics/security events. Understand Keystore/auth capability minting, lock race, on-device key wrapper and rotation before altering secret storage. Nonsecret Room metadata is not automatically encrypted; write a threat boundary and redact appropriately.

### 3. Established progress — don't redo it

The **existing** `STATUS_LEDGER_CURRENT.md` reports source + JVM test coverage for foundation, splash/login/home, file/text crypto, encrypted media vault, notes and notes editor, passwords, TOTP/import, key forge, privacy/backup, share, hash, digital signature, certificate inspection, archive, clipboard, random, HMAC, public key QR, key rotation, package inspection, password audit, Argon2id, signature studio, audit activity, privacy controls, file integrity and secure clipboard.

Important exact limitations, not footnotes:

- **TASK 05** `SHADOW_VAULT`: KNF2 media + KNC2 metadata + encrypted thumbnails and authenticated streaming; seven targeted service tests according to ledger. **No device/visual verification**.
- **TASK 07** Notes Editor: encrypted autosave, bounded history, undo/conflicts/recovery, five targeted service tests according to ledger; device unverified.
- **TASK 15** Backup/Recovery: source implemented, SAF, but no end-to-end device restoration/keys-loss drill proof.
- **TASK 16** Secure Share: two-device success path **unverified**.
- **TASK 20** Certificate Inspector: revocation not implemented.
- **TASK 22** Local Transfer: protocol exists, but **transport is not implemented**; keep BLOCKED/honest.
- **TASK 24** Metadata Cleaner: JPEG/TIFF only.
- **TASK 31** Key Rotation: source + JVM tests, not a blanket hardware migration safety certificate.
- **TASK 37** Argon2id: source + JVM tests, not a new task to start from zero.
- **TASK 38** Signature Studio: limited digest mode 2.
- **TASK 39** Security Activity: real typed producers/Room Flow, 500/90 policy, migration fix, Arabic text correction; `39_LOCAL_SECURITY_ACTIVITY/EVIDENCE.md` has exact details. Room migration instrumented tests compiled **not run**. Its nonsecret metadata is plaintext Room by design and must be explicitly described.
- **TASK 42** Session Privacy: shared PrivacyScreen and runtime enforcement; do not duplicate a disconnected screen.
- **TASK 45** Final Integration: ledger SOURCE_IMPLEMENTED/JVM_TESTED, **not** DEVICE_TESTED, SECURITY_AUDITED, VISUAL_VERIFIED or RELEASED.

**Not source-implemented per current ledger:** TASK 29, 30, 33, 34, 35, 40 and 41. Preserve tasks 00 through 46; TASK 46 is reserved. TASK_INDEX.json lists 44 regular feature entries and must not be replaced by a second incompatible index.

Every feature is a real vertical slice:
`user action -> typed validation -> ViewModel StateFlow -> authorized use case -> native repository/OS crypto -> encrypted persistence or secured OS outcome -> truthful UI state`.
The code is real only if that trace exists and negative/failure/cancel paths are handled.

### 4. The FIRST ready service after TASK 000: TASK 29 VAULT_COLLECTIONS

Task source: `missions/fullstack-android/29_VAULT_COLLECTIONS/TASK.md` (P1; dependency TASK 05).
Visual map in task: `visuals/ANIMA_MISSIONS_01-44/29_VAULT_COLLECTIONS/29_VAULT_COLLECTIONS.png` — **verify that file is actually present and approved**. There is a separate untracked Anima V5 primary PNG pack in the planning checkout, which may contain a useful reference but is not automatically owner approval.

**Execution (only after exclusive file lease):**

1. Re-read `ShadowVault.kt`, `ShadowVaultMedia.kt`, `ShadowVaultScreen.kt`, the Room database entities/DAO/migrations and existing test fixture. Recover real media IDs, metadata encryption boundaries and transactional semantics before designing a new relationship.
2. Introduce only necessary domain concepts `VaultCollection`, `CollectionMembership`, `EncryptedMetadata` and `ItemLink`, adapting to actual existing records rather than inventing new parallel storage. Collection labels/titles can be sensitive: protect at rest with existing authenticated encryption/AAD/versioning; no plaintext search index unless threat model explicitly accepts it and UI tells the truth.
3. Implement create/rename/delete, membership add/move/remove, list/filter/search, duplicates and empty states with stable typed failure categories, lock cancellation and process restart resilience. Validate destination, duplicate titles, stale membership and orphan references.
4. For destructive collection deletion use a distinct confirmation; preserve media when removing the collection unless explicit separate content deletion was authorized. Keep operations transactional, avoid nonce reuse, cross-record reference corruption and TOCTOU around session revocation.
5. Add Compose UI and ViewModel after repository tests; wire actual nav and approved catalog state with one owner for shared registries. Bilingual AR/EN (RTL/LTR), accessibility talkback, high font scale, Back, landscape/tablet where supported, no fake progress/claimed export.
6. Tests: empty/create/rename/duplicate/move/search/delete/undo, locked and revoked session, persistence reopen, Room migration and corrupted membership, ciphertext-at-rest invariant, retry/cancel, two users' vault/key separation as supported; UI screenshot before/after and device visual tests when available.
7. Commit bounded changes with paths, exact SHA, command exit codes, test counts, CI links, screenshots, and honest `DEVICE_UNVERIFIED` if no target. Never mark VERIFIED or complete merely because UI compiles.

Potential source-file targets after inspection (not a preapproved wildcard write lease): new collection model/service/DAO/tests, `ShadowVaultScreen.kt`, `Catalog.kt`, `KnouxNavHost.kt`, and a precisely reviewed Room version migration. Do not change cryptographic envelope formats just to implement folders.

If another Android agent already owns TASK 29, **do not race**: checkpoint this task and start an independent nonconflicting P1 gap or run read-only validation.

### 5. Next independent feature: TASK 30 DOCUMENT_VIEWER

Task source: `missions/fullstack-android/30_DOCUMENT_VIEWER/TASK.md` (P1, dependencies 04/05).
Goal: **protected PDF and text viewer**, not a generic WebView or cached plaintext dump.

- Reuse existing encrypted file/vault read paths and `VaultAccess` capability. Never expose raw decrypted bytes in globally accessible media directories.
- Use Android `PdfRenderer` only when a valid seekable PDF descriptor is available; stage ciphertext/decrypted content only within a tightly scoped private lease when needed. Enforce lock/session revoke closure of descriptor and bitmap resources; clear temporary plaintext after use, not during source-file failure.
- Handle corrupt, password-protected, huge PDF, unsupported MIME, many pages, zoom, rotation, background/recents, OOM and share consent honestly. `FLAG_SECURE` is protection-in-depth, not a guarantee against compromised devices.
- Preserve originals, do not globally register exported content providers or insecure file URIs. Explicit user consent and constrained `content://` permission duration for any share handoff.
- Integrate only after native test coverage and visual reference verification. Report runtime evidence separately from compile.

### 6. Remaining pending task graph (do not create duplicate task IDs)

| Task | Source state | Prerequisites / decisive acceptance |
|---|---|---|
| 33 ANDROID_AUTOFILL | Design-only | 08/09; Android AutofillService with explicit user enablement, verified fill security, fake cross-app fill forbidden |
| 34 OFFLINE_SECURITY_ADVISOR | Design-only | 14/39; rules derived from real local security data, distinguish guidance from verified live protection |
| 35 MULTI_DEVICE_PAIRING | Design-only | 12/16/28; authenticated QR/key exchange, SAS/fingerprint confirmation, replays/rollback and device evidence |
| 40 TRANSFER_WIZARD | Design-only | 04/16/22; BLOCKED by incomplete transport where applicable; no fake transfer status |
| 41 EXPIRING_SECRET_CAPSULE | Design-only | 16/40; authenticated expiry semantics, truthful offline/replay constraints; cannot promise remote revocation of copies |
| 46 (reserved) | Not a ready feature | Do not invent a service without scoped owner requirements |
| 45 final integration | Source marked implemented | **Remain open for real device/visual/security/release gates** |

For each service, trace real UI handler -> auth/permission -> implementation -> local/OS outcome -> persistence -> error path -> tests. Separate implemented-but-untested from production verified.

### 7. Security and data-integrity acceptance gates

**P0 threat boundaries:**
- Auth: verified biometric CryptoObject/unlock gate, capability issue only after verified auth, atomic lock revocation, session background/screen-off rules, non-secret audit events.
- Crypto: authenticated AES-GCM, unique nonces, AAD includes record identity/context, key wrapping provenance, versioned KNC/KNF/KNP envelopes, KAT vectors, Argon2id parameter bounds/limits and no silent fallback to weaker crypto.
- Persistence: Room migrations 1→2→3 currently have instrumented tests **compiled only**. Add device execution and ciphertext byte-for-byte checks; prepare future schema migrations with safe rollback and no user-data destructive fallback.
- Files: SAF permission revocation, atomic outputs, safe temp cleanup and cancellation without source loss, path traversal/ZipSlip prevention for encrypted archives.
- Auditing: 500-event 90-day bound, nonsecret kind/action only, no OTP/key/user titles/file paths, no UI seeded system event. Avoid flooding audit on autosave.
- Privacy: keystore/device binding limitations and rollback/restore limitations shown truthfully. No plaintext screen captures/logcat in production. No user secrets in test artifacts.

Use unit KAT, instrumented migration, actual device biometric negative, process death, backup/recovery and property tests as distinct gates; static analysis or passing compilation does not substitute for actual runtime.

### 8. Visual fidelity and interaction contract

Preserve the owner-approved KNOUX stag-K identity (obsidian/violet, luminous antlers/eyes, freestanding emblem, 8-card Home, original 34-destination Tools, cipher-rain atmosphere only where performance/accessibility allow). Android visual references: mission `SCREEN_QA.md` files, `missions/fullstack-android/POST_PR15_VISUAL_BASELINE.md`, and the per-screen `visuals/ANIMA_MISSIONS_01-44/` mappings or isolated Anima V5 pack in the planning checkout.

Audit full Android lifecycle: launcher/adaptive icon -> splash -> login -> Home -> Tools -> each service -> nested editor/modal/confirmation -> lock/unlock -> errors/empty/success -> Back/IME/rotation. No Home-only cosmetic pass. Use equal viewport/state/theme captures; explicitly record accepted and unresolved differences. Test RTL Arabic typography, LTR English, contrast, 48dp touch targets, edge-to-edge bars, screenreader labels, high font scale, reduced motion, memory/frame cost. Never convert an image mockup into an inoperable bitmap-based screen.

### 9. Testing commands and what they can prove

Commands are **examples to execute from `native-android/` only after checking local wrappers, resources and current ownership**:

```sh
./gradlew :core:security:test --no-daemon
./gradlew :core:data:testDebugUnitTest --no-daemon
./gradlew :app:testDebugUnitTest --no-daemon
./gradlew :core:data:compileDebugAndroidTestKotlin --no-daemon
./gradlew :app:lintDebug --no-daemon
./gradlew :app:assembleDebug --no-daemon
```

Windows uses `gradlew.bat` if executing from native Windows shell. Do not blindly use `:core:data:test` or `:core:data:compileKotlin`: those non-variant names previously made the Android CI fail. Run instrumental `:core:data:connectedDebugAndroidTest` **only on an isolated, owner-authorized emulator/test device**; do not install or run tests on a phone with precious user data without backup/explicit permission. Confirm specific tasks with `gradlew tasks` when uncertain.

Each evidence entry MUST include `COMMAND`, `FULL_SHA`, `WORKTREE`, `ENVIRONMENT`, `EXIT_CODE`, `PASS/FAIL/SKIP/TIMEOUT`, `TEST_COUNT`, `LOG_OR_ARTIFACT`. Source CI is different from installed APK runtime.

Independent GitHub Actions truth at the time of this prompt:
- **Android Native CI run 41392808824** = success on head `24a75ca6cb46573bf30e07b9f11d61cd807c2ecd` (main ancestor), with JDK, SDK, source check, Kotlin, JVM tests, lint, APK, SHA-256 and evidence upload green.
- Artifact: `android-native-evidence` ID `13117494650`, archive reported sha256 `45ae96e965c460538baa93721a3136cc30fc7a51f407b1a31bcbe97a0e6e7990`.
- **Not** a device-run proof. No completed real migration instrumented tests, biometric device tests, visual screenshots or security audit in this checkpoint.
- Desktop draft PR #33 at `315445a` had failed Actions run 41362502524 at checkout (tests skipped); this is a **separate CI owner issue**.
- Main external Vercel status was failure; don't conflate blocked Vercel deployment with Android source CI.
- Validate CI on the actual new feature HEAD, not a previous nearby commit.

### 10. Integration and release

1. Capture checkpoint and obtain exclusive scoped write ownership. Work in a safe new branch/worktree when storage supports it, **without switching an active dirty worktree**.
2. Reuse existing tasks and modules. Implement a vertical slice and regression tests; preserve privacy and approved design. Commit only claimed source files.
3. Push to a non-default branch and open a PR with exact `BASE_SHA`, `HEAD_SHA`, changed files, security/data impacts, test logs, CI URLs and device/visual results.
4. Do not merge while CI fails, branch lacks fresh main reconciliation, agent writes overlap, data migration is destructive, or owner approval/protected-branch workflow is outstanding. A push is not merge; a merge is not release.
5. Device gate: real install, cold/warm start, device Keystore/biometric, lock race, SAF encrypt/decrypt, restore/key rotation, Room migration with existing encrypted data, RTL screenshots and process-death recovery. Record Android model/API/ABI and evidence.
6. Release gate: signing provenance/keystore custody, dependency vulnerability/security review, supported min/target SDK verification, Google Play policy at that date, AAB/APK integrity, upgrade/rollback path and owner approval. Unsigned debug APK is not production.
7. Cleanup never follows merge automatically; old branches, worktrees and untracked references remain until exact-path permission after verified unique-work preservation.

### 11. Required ongoing registers — one authoritative source, not a competing tree

Prefer extending current `missions/fullstack-android/` records:

- `TASK_INDEX.json`: existing 44 task entries; do not change IDs without evidence.
- `STATUS_LEDGER_CURRENT.md`: classify SOURCE_IMPLEMENTED / JVM_TESTED / DEVICE_TESTED / VISUAL_VERIFIED / SECURITY_REVIEWED / RELEASE_READY with exact dates.
- `NN_*/TASK.md`, `NN_*/EVIDENCE.md`, `SCREEN_QA.md`: amend actual scope/evidence for task worked on.
- `00_ANDROID_FOUNDATION/FORENSIC_CHECKPOINT_2026-11-02.md` and `UNIQUE_WORK_REGISTER_2026-11-02.md`: frozen observations, not evergreen truth.
- This file: SECOND_GENERATION_PROJECT_EXECUTION_PROMPT; update only when facts/procedures materially change and with owner-safe integration.

Worker handoff: `TASK_ID | OWNER | BRANCH | BASE_SHA | HEAD_SHA | WORKTREE | EXACT_CHANGED_FILES | UNTRACKED | REQUIRED_DEPS | TEST_COMMANDS_AND_EXIT_CODES | CI_RUN_URL | DEVICE_EVIDENCE | VISUAL_REFERENCE_SCREENSHOTS | SECURITY/DATA_RISK | INTEGRATION_STATE | NEXT_SAFE_ACTION`.

**Statuses:** NOT_STARTED / PARTIAL / LOCAL_UNCOMMITTED / COMMITTED_UNPUSHED / PUSHED_UNMERGED / MERGED_UNVERIFIED / VERIFIED / REGRESSED / BLOCKED_EXTERNAL / BLOCKED_POLICY. Use them literally; never mark VERIFIED based only on an agent's summary.

### 12. Exact restart action

**First:** Recheck `origin/main` vs `fd16739`, active agent claims and the 253 untracked planning assets; protect the irreplaceable files safely with sizes/hashes/provenance and verified recovery. Do not delete or clobber them.

**Then:** Locate the latest implementation of TASK 29 and prove it is still missing. Claim the smallest non-overlapping `Vault Collections` Android scope; implement real encrypted collection/membership persistence with tests, then real Compose UI connected to the repository, Arabic/English UX and honest errors. Run focused tests and CI; seek device runtime evidence. If TASK 29 is already owned, do not duplicate it: select another ready, non-colliding task.

**Finish each session:** Real git status/SHAs, unique work protected vs unprotected, changed source paths, test evidence, current PR and CI, native device state and exact next ready task. No fake closure, no broad planning in place of implementation, no rerun of already-integrated work.

**Mission success = preserved work + real service advancement + independently verifiable proof.**

## Verified local unique-work backup — post-checkpoint update, 2026-11-02

A subsequent **copy-only, non-destructive** preservation operation on the authorized Windows device completed successfully, exit code **0**. Before copying it revalidated the planning HEAD `6c19107c181372bdca307c40b0876fe34270eb89`, canonical remote, exact count 253, path scope (`missions/` and `visuals/` only), and K: free-space reserve. The snapshot destination was required not to preexist (no overwrite).

- Source: `D:\KnouxCrypt` (253 previously untracked files, 149,911,480 source bytes).
- Destination: `K:\KNOUX_PROJECT_PROMPT_VAULT\KnouxCrypt__ANDROID\UNTRACKED_SNAPSHOT_20261102_6c19107`.
- File-level result: **253/253 copied and SHA-256 byte-identical** to their source files when checked. 254 destination files including `MANIFEST_SHA256.csv`.
- Manifest SHA-256: `E9A02A91C894C777CBD55C2003BDFA198A57BD14BEC7D73D44DA2FD915F9CC75`.
- K: free after operation: **4,346,589,184 bytes**.
- No original files moved/deleted, no Git checkout or index mutated, no commits made on the local planning branch.

**Limitations:** This is a per-file verified snapshot, not an atomic filesystem snapshot or an off-device/offsite backup. Agent writes to source between file copies are not globally excluded; exact active-agent file leases remain unverified. Revalidate the destination and hashes before any cleanup/recovery. Original untracked files remain high-value and should not be deleted automatically.
