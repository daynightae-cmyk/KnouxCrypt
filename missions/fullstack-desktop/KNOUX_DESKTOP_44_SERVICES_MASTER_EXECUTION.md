# KNOUX CRYPT — WINDOWS DESKTOP FULL-STACK EXECUTION MASTER
## 44 REAL SERVICES · 11 BATCHES × EXACTLY 4 TASKS · ONE AUTHORITATIVE TASK FILE

**OWNER DIRECTIVE — EXECUTE; DO NOT JUST PLAN.**
**Repository:** `daynightae-cmyk/KnouxCrypt`
**DESKTOP-ONLY BRANCH:** `desktop/electron-fullstack-44-services-20261031`
**Branch starting baseline (main at creation):** `de01b23f9a010cb3743bc117bb3b78c2bb5ee86c`
**Platform:** Windows 10/11 x64, Electron + existing React/Vite. Separate Windows installer/portable distribution.
**Parallel owner:** DeepSeek is working on native Android; NEVER write to its branch/worktree/task ledger.
**Last authoritative task register:** `src/config/missionRoutes.js` (44 identifiers), `src/config/screens.js` (paths and Home hierarchy).

### 0. NONNEGOTIABLE OPERATING CONTRACT

You are the Vercel/cloud coding agent working on the **already existing** KNOUX CRYPT desktop product. Your mandate is to deliver the 44 *real*, Windows-specific full-stack services, **four complete vertical slices per batch**, without interfering with the concurrent Android work. THIS DOCUMENT IS YOUR ACTION QUEUE. Read and start executing batch 01 immediately; no repeated owner prompts, no strategy-only report.

- **Only push to the named desktop branch.** Never push to `main`, `android/*`, `integration/*`, `planning/*`, or other agents' branches. Do not open an automatic merge/auto-merge; final integration requires owner review. If Vercel connects by default to main, select the desktop branch explicitly and treat any preview as PREVIEW, NOT production. No production deployment, billing or DNS changes.
- **Use an isolated checkout/worktree**, not the same working folder that DeepSeek is modifying. Confirm `pwd`, `git status --short`, `git rev-parse HEAD`, `git branch --show-current`, `git rev-parse origin/main`, `git worktree list` when accessible. Check branch, SHA, open PRs and uncommitted work before writing; stop rather than overwrite concurrent changes. Do not wipe, `reset --hard`, `clean`, force push, rewrite histories, delete worktrees, or overwrite unique changes.
- **Preserve existing working code and approved visual identity.** Read `agent-handoff/KNOUX_CRYPT/00_LATEST_OWNER_OVERRIDES.md`, `00_GLOBAL_AGENT_RULES.md`, `00_RUN_ORDER.md`, `docs/VISUAL_REFINEMENT_CURRENT.md`, and exact per-screen `TASK.md`/`REFERENCE.png` in `agent-handoff/` or `visuals/ANIMA_MISSIONS_01-44/` as they actually exist. Inspect the physical files; do NOT assume superseded Home screenshot is still approved. Keep the transparent stag-K, independent eye lighting, same obsidian/violet glass design, fixed shell/navigation, continuous descending cipher rain, shared audio OFF by default, AR/EN and RTL/LTR; do not recreate the UI from scratch. Screenshot comparison must be against the latest approved image, not a generated approximation.
- **Reality before implementation.** The current `main` has 44 routed visual-demo screens, not 44 verified secure services. `electron/main.js`, `electron/preload.js`, `electron_main/ipcHandlers.js`, and backend wrappers exist, but wiring and packaging are incomplete; don't count their presence as working services. Historical README/deployment 'complete' declarations are NOT evidence. Make a real inventory of sources, tests, registered handlers, route IDs, dependencies, and unverified behavior before coding. Do not blindly reuse legacy crypto.
- **One source of truth for routes.** Keep existing `src/config/missionRoutes.js`, `src/config/screens.js`, `src/App.jsx`, Home's eight cards and Tools hierarchy; prevent new parallel route registries, duplicate services or screens. 01 Splash, 02 Login, 03 Home are real foundational tasks; 04–44 extend real behaviors into the existing screens.
- **Four at a time, in order.** Each batch is exactly four numbered tasks (01–04, ... 41–44). For EACH task, inspect existing source → implement renderer UI + secure Electron bridge + real capability/service + validation/errors + meaningful UX and settings + tests → capture actual desktop runtime proof and commit. On completing a batch, push its commits with an evidence report, then immediately continue the next four. If an external key/provider, physical device or signing certificate is unavailable, finish all code/UI/configuration/error handling you *can*, mark only that part `BLOCKED_EXTERNAL`, and continue the other safe tasks; do not stall the entire queue. Never fabricate successful end-to-end tests.
- **Production-secure behavior.** No mocked crypto, in-memory-only sensitive 'vaults', invented OTP, fake permission, hardcoded secrets, stock 'verified' badges, fake security monitoring, or generic success toast before the real operation succeeds. Implement robust workflows, only claim a feature when its tests support it, and keep a clear `DEMO/UNAVAILABLE` boundary otherwise. No unsafe attempts to encrypt or format system disks while developing. Never run destructive filesystem operations against owner data without explicit per-operation confirmation and recovery safeguards.
- **Keep native Android completely separate.** No edits to `native-android/`, `android/`, `android-spec/`, `missions/fullstack-android/`, any Android worktrees, or PR #14. Windows may expose an explicit Android *integration/status* UI, but no pretend Android OS features within Electron; integration requires published cross-platform contracts and external verification later.
- **All user-private content stays local by default.** No upload of files, key material, clipboard or passwords to Vercel or third-party services; no debug logging of secrets. No requirement for a hosted backend to encrypt files offline. Optional remote services must be opt-in, visibly scoped, secret-safe and isolated. Do not invent API keys or claim remote provider works absent real credentials.
- **No automatic updates until verified.** Code-signing, official update endpoint, verified publisher identity, secure channel, rollback and installation test must precede enabling desktop auto-update. Installer never requires administrator privileges for normal user installation; elevation only when truly necessary and explicitly approved.

### 1. FIRST WORK: DESKTOP FOUNDATION CONTRACT (executed inside task 01–04, not an extra task)

The existing `package.json` has Electron/Electron Builder but **no `electron-dev`, `dist`, `dist:win` or `pack` scripts** despite docs referencing them. Existing `build-app.js` manufactures invalid placeholder `.ico/.png/.icns` files. Existing `electron/main.js` doesn't import/call `electron_main/ipcHandlers.js`; `vite.config.js` uses `base:"/"` while packaged Electron loads local files; splash packaging paths and app paths must be checked; `package.json` publish target points to a different owner. Verify these issues in *this branch* and repair safely. Preserve the SVG and produce valid Windows ICO assets with an actual encoder; don't invent an icon. Set Windows x64 first (x86 only if warranted). Build target should produce both an installer EXE and a portable EXE after runtime QA, with hashed artifacts; do not assert EXEs exist until successful build is observed. Keep artifacts out of Git.

Recommended modular boundaries (reuse existing paths if equivalent; not a rewrite):
- **Renderer:** existing routed React UI; `src/features/<service>/` or existing category folder; TypeScript types/contracts, state, error handling, i18n and visual effects. The renderer MUST NOT get `fs`, Node `crypto`, `child_process`, or raw Electron.
- **Preload:** `contextIsolation:true`, `nodeIntegration:false`, least-privilege `contextBridge.exposeInMainWorld("knouxDesktop", ...)` with narrow typed invoke/subscribe APIs. Remove broad arbitrary channel forwarding. Explicit IPC allowlist, sender/origin validation, strict request/response schemas, input size limits and durable cancellation/progress.
- **Main/service layer:** isolated `electron/` or `electron_main/` adapters for cryptographic providers, encrypted persistent data store, key custody, file streaming, audit trail, Windows integration, authenticated cross-device transport when available. Backend functions actually wired/registered. Separate async jobs from renderer life cycle. No `shell:true` for user-influenced arguments; no arbitrary paths, unchecked programs or insecure URL navigation.
- **Cryptography:** rely on reviewed mainstream libraries/platform APIs; authenticated encryption AES-256-GCM with fresh unique per-item/per-chunk nonces, versioned framing and authenticated metadata, or vetted authenticated streaming construction. Avoid custom ciphers/pseudo-randomness. Use secure randomness and Argon2id with appropriate measured parameters for password-derived KEK; authenticated KEK/DEK wrapping and zero plaintext persistence. On Windows, evaluate DPAPI/Credential Manager for local wrapping with explicit limitations and cross-device recovery. Key rotation and recovery are crash-safe/rollback-tested. Use clear versioned file formats and format-interoperability documentation.
- **File integrity/safety:** default is **encrypt to a new output file** and preserve originals. Atomic temp-to-final commit, path/symlink/hardlink checks, disk-space preflight, cancel/resume semantics, reject wrong-key/tampered/truncated packages without partial plaintext, preserve timestamps when safe, never clobber existing destinations without consent. Disable raw disk/partition/boot encryption and unreviewed VeraCrypt/DiskCryptor operations by default; any future disk-volume workflow requires separate high-risk design review, elevated permission gating, backups and device testing.
- **Platform/security:** packaging CSP, secure protocol/origin routing, sandbox where compatible, resource/permission policy, `shell.openExternal` URL allowlist, no untrusted remote code or embedded secret in renderer bundle, dependency lockfile, reproducible Node/Electron versions, ASAR/resources sanity and source map handling. Audit notification/window/tray/clipboard integrations, Windows shutdown/sleep/lock behavior and cleanup. No false 'screen capture prevention' guarantees.
- **Quality toolchain:** `npm ci` only after verified lockfile committed; build/check/typed contracts/tests/real Electron smoke; browser UI tests are not Electron runtime tests. Configure Windows CI build/test if connector has workflow write permission; if not, publish a safe human-installable workflow template and log the 403, without claiming CI. Use ephemeral synthetic test files and test key fixtures only.
- **Acceptance surface:** 360×800, 390×844, 412×915 reference checks where relevant; real Windows desktop 1280×800, 1440×900 and 1920×1080, 100%/125%/150% scaling, keyboard focus, screen reader labels, AR/EN, RTL/LTR, light/dark only if the app truly supports both, reduced motion, no horizontal overflow. Shared shell must never remount its descending cyber-glyph effect on route transitions.

### 2. UNIVERSAL FULL-STACK DEFINITION OF DONE — EVERY ONE OF 44 TASKS

For task `NN`, deliver **all seven** (or explicitly disclose inability):
1. **Faithful UI:** its existing approved reference, real keyboard/mouse interaction, loading/empty/error/locked/offline states, settings/parameters, confirmations, accessible text, no dead buttons. Restore service-specific art/animation and global app shell; no redesign.
2. **Typed API:** exact frontend ↔ preload ↔ main IPC contract, input validation and capability/permission gate. UI uses the actual implementation, never fake `setTimeout` to claim work.
3. **Real engine:** persistence/crypto/Windows adapter or verified provider protocol. Authentication and locked-state checks at the backend, not only hiding controls in UI. Input/output constraints, cleanup, progress and cancel.
4. **Security + failure:** invalid/locked/wrong password/denied permission/tamper/network-offline/disk-full/interrupt/restart tested as applicable. Secrets never logged, operations fail closed.
5. **UX completion:** settings, help/limitations, safe defaults, copy/export/import only when explicitly authorized and secure. Resolve missing provider/key with a complete guided configuration screen and `BLOCKED_EXTERNAL` status, not a broken screen.
6. **Repeatable tests + screenshots:** unit/integration/negative tests for real engine and IPC, real running Electron screenshot and interaction test (not just Vite browser), compare reference, verify AR/EN, keyboard, DPI and scaling; do not claim performance/visual acceptance without evidence.
7. **Truthful delivery:** update in-file ledger or linked evidence with `IMPLEMENTED_VERIFIED`, `IMPLEMENTED_UNVERIFIED`, `PARTIAL`, `BLOCKED_EXTERNAL`, or `NOT_STARTED`; branch/head SHA, exact files changed, commands with exit codes, actual screenshot paths and proof. Differentiate local commit, pushed commit, PR, merged, deployed and released.

**Do not replace missing evidence with a claim of 100%, PASSED or 'ready for production'.** If task uses unsafe elevated operations, stop that operation and complete the safe implementation/stubs with visible unavailable state.

### 3. EXACT BATCH QUEUE (11 batches, 4 tasks each)

The screen numbers and IDs follow the canonical 44 mission list. Implement real Windows functionality in these screens and only documented desktop-adapted alternatives for OS-specific unsupported actions.

#### BATCH 01 — FOUNDATION / ENTRY / FILE ENCRYPTION — 01–04
**01 SPLASH_ENTRY — Windows bootstrap + premium splash:** preserve original stag-K and eye-light motion; start local Electron app, secure bridge, CSP and sandbox verification; initialize storage, offline capability registry, Windows single-instance, locked session and error boundary. Startup never falsely says 'protected'. Verify cold boot, offline boot, safe failure, exact splash and transition.
**02 SECURE_ACCESS_LOGIN — real local unlock:** implement initial master passphrase setup, confirmation, encrypted key envelope, Argon2id-based derivation with rate-limiting/cooldown, lock/unlock, timeout, failed attempt state, Windows lock/suspend handling. OS biometrics/Windows Hello only via audited compatible native API and verified device; otherwise mark unavailable, not simulated. Guest remains clearly restricted visual demo; no secret access.
**03 HOME — live honest service dashboard:** keep exactly eight Home cards + Tools, approved large free-standing logo, persistent code rain, shared safe-area nav. Read real task/job/storage states; route permissions correctly; no fake encryption counters, device health or protected claim. Test navigation, locked/Guest/ready/offline UX and all 44 routes.
**04 FILE_CIPHER — real authenticated file encryption/decryption:** choose source/destination with safe dialogs, encrypt new package using vetted streaming AEAD, progress/cancel/retry and conflict prompts, decrypt only after authentication, format version validation, test with tiny/large/binary files, wrong key, truncated/tampered file, disk full and no accidental source deletion. Disable disk C:/volume/boot encryption.

#### BATCH 02 — VAULT / NOTES / PASSWORDS — 05–08
**05 SHADOW_VAULT — encrypted local vault:** derive/wrap independent data keys, create/lock/list/import/export protected items, indexed metadata minimized, search after authorized unlock, atomic migrations and safe recovery. Prove nothing readable before unlock; no plaintext on disk.
**06 NOTES — encrypted note list:** create/read/update/delete with drafts, tags/search and encrypted persistence; confirm delete, no plaintext autosave, sensitive clipboard copy warning, prove restart persistence and locked read-denial.
**07 NOTES_EDITOR — secure rich/plain editor:** autosave only encrypted data with bounded debounce + crash recovery, conflict handling, unsaved indicator, undo/redo and safe export; guard against injection/XSS when rendering markdown; verify no plaintext localStorage.
**08 PASSWORDS — password manager:** encrypted entry CRUD, categories/folders, masked values, generator, copy with opt-in timeout, safe edit/reveal with re-authentication and locked-state guards; never store raw secrets in UI logs or cloud.

#### BATCH 03 — PASSWORD DETAIL / TOTP / KEY FORGE — 09–12
**09 PASSWORD_DETAIL — full entry details:** reveal/copy/edit/delete/history indicators and site URL checks; require fresh unlocked capability for highly sensitive actions, don't expose password in DOM until reveal, sanitize external URLs and prove expiration/lock behavior.
**10 AUTHENTICATOR — actual offline TOTP:** RFC 6238 with tested RFC vectors, clock drift/remaining time, SHA1/256/512 support as appropriate, secure protected secret storage, copy/accessibility and no fake codes; HOTP only with correctly persisted counters if offered.
**11 AUTH_IMPORT — real token import/export:** read otpauth URI/QR safely with correct algorithm/digits/period, migration QR formats only when validated, duplicate detection and human confirmation, encrypted backup/export with warnings, camera permissions explicit; never upload QR to remote servers.
**12 KEY_FORGE — key inventory/generation:** cryptographically secure key generation for explicit supported algorithms; create/import/wrap/store, key purposes, expiration metadata and locked access; reject weak/unsupported algorithm combinations; never export private material silently.

#### BATCH 04 — KEY DETAIL / PRIVACY / RECOVERY / SHARING — 13–16
**13 KEY_DETAILS — key lifecycle:** usage, fingerprint, safe import/export format, authorization, active/revoked state and delete warning; real key ownership and versioning. Test signature operations and no private-key leaks.
**14 PRIVACY — Windows privacy center:** actual local privacy preferences, session lock controls, permission indicators derived from real granted capabilities, retention/export/delete workflows. Never present unverified OS surveillance detection or permissions.
**15 BACKUP — encrypted backup and recovery:** versioned authenticated backup of supported vault datasets, optional destination, passphrase/recovery material custody, manifest/checksums, dry-run restore, wrong-key/corrupt/partial backup tests, atomic restore with user confirmation and rollback.
**16 SECURE_SHARE — encrypted package sharing hub:** recipient public-key or shared-secret model clearly selected, authenticated encryption/package signatures/expiration semantics, export to file without auto-upload. Secure Share stays in Tools, not ninth Home tile.

#### BATCH 05 — INSPECTORS / CIPHERS / SIGNATURES — 17–20
**17 HASH_INTEGRITY — streaming hash inspector:** SHA-256/512 and explicitly selected algorithms, file-drop, progress and known-digest compare with timing-safe comparison, encoding/normalization controls; explain hash is not encryption.
**18 TEXT_CIPHER — authenticated text cipher:** actual encrypt/decrypt using envelope with version, nonce and KDF; copy/export and encoding handling; invalid ciphertext and wrong password fail without plaintext; never imply reversible hash.
**19 SIGNATURE — digital signing and verification:** sign and verify with tested Ed25519/P-256/RSA-PSS as supported, key selection, identity/fingerprint disclosure and verification status grounded in actual crypto; never generate verification success without supplied signature.
**20 CERTIFICATE_INSPECTOR — X.509 inspector:** parse PEM/DER, chain details, subject/issuer/SAN/validity/key usage, timestamps, trust/chain verification ONLY if actually implemented with OS trust store; present unknown/revoked status accurately, no fake CA assurance.

#### BATCH 06 — ARCHIVES / LOCAL TRANSFER / METADATA — 21–24
**21 ARCHIVE — encrypted archives:** select files/folders, safe archive layout, compression with path traversal/zip bomb/symlink and file-count limits, streamed authenticated encryption, preview manifest, atomic unpack, collision prompts and integrity negative tests.
**22 LOCAL_TRANSFER — peer transfer:** user-approved LAN discovery or manual pairing, mutually authenticated encrypted transport, explicit recipient identity/fingerprint and receipt confirmation, resume/integrity/timeout/cancel, denied LAN and offline modes; never transfer invisibly.
**23 FINGERPRINT_VERIFY — genuine fingerprint verification:** calculate and compare public-key/file fingerprints and optional authenticated trusted pairings; never claim Windows biometric fingerprint scanning through browser UI. Device hardware flow requires separate provider/test.
**24 METADATA_CLEANER — safe metadata analyzer:** enumerate supported EXIF/document metadata using real parsers, preview all changes, strip only selected fields into a NEW copy, preserve source and content, test file type mismatch and no-op. No promise to scrub every hidden metadata carrier.

#### BATCH 07 — CLIPBOARD / RANDOM / HMAC / QR — 25–28
**25 CLIPBOARD_GUARD — Windows clipboard guard:** explicit monitoring mode and access scope, real Electron clipboard change detection where feasible with safe polling or OS events, local-only alerts, masking, opt-in clear, false-positive prevention and no claim that other apps cannot read clipboard.
**26 SECURE_RANDOM — CSPRNG studio:** Node/platform cryptographic random bytes, unbiased ranges, entropy-source limitations, password/passphrase/key material generation with policy presets; test statistical-format boundaries and no Math.random security use.
**27 HMAC_AUTHENTICITY — real HMAC laboratory:** HMAC-SHA256/512, key generation/selection, file/text signing and timing-safe verification, encoding options, wrong-key negatives, clear distinction from digital signatures.
**28 PUBLIC_KEY_QR — public key QR exchange:** encode authenticated versioned public-key payload/fingerprint into actual generated QR, parse QR, compare fingerprint via a second channel, avoid storing/transmitting private key; test malformed, oversized and substituted keys.

#### BATCH 08 — COLLECTIONS / VIEWER / ROTATION / INSPECTION — 29–32
**29 COLLECTIONS — private vault collections:** encrypted nested collections, tags, sorting, move/copy with duplicate handling and locked-state reads denied; search index protected/minimized, destructive operations confirm and honor atomic updates.
**30 DOCUMENT_VIEWER — protected document reader:** local decryption to an ephemeral controlled renderer/stream, supported PDF/text/images only through hardened viewer, no leaked temp plaintext/cache, consent-based export/print, screen-capture limitation stated explicitly; test closure/lock/cleanup.
**31 VAULT_KEY_ROTATION — real key rotation wizard:** preflight, backups/recovery option, staged rewrap or full re-encryption depending threat model, journal/progress/resume/rollback, crash and wrong-old-key tests, preserve old data until verified; never rotate from a fake spinner.
**32 PACKAGE_INSPECTOR — ciphertext package validator:** parse version/algorithm/nonce/tag/length/manifest limits without treating a header as authenticated, verify authenticated metadata and integrity with valid key, tamper/truncation/unsupported-format warnings; don't claim decryptability without actual decryption.

#### BATCH 09 — WINDOWS INTEROPERABILITY / ADVISOR / PAIRING / AUDIT — 33–36
**33 AUTOFILL — DESKTOP-ADAPTED Password Autofill Control:** existing screen is called Android Autofill. On Windows, show truthful supported desktop password copy/manual fill and (only if developed) a separately permissioned browser extension or Windows credential integration. Provide Android integration status/guide as `NOT_AVAILABLE_ON_WINDOWS`; never pretend Electron can activate Android's Autofill Service.
**34 OFFLINE_ADVISOR — real deterministic security advisor:** evaluate ONLY verified local configuration and results, cite precise rule and remediation, configurable privacy-only scans, all offline by default. Optional local AI model must report model presence and confidence limits; no fabricated 'scanned/threat-free' claims.
**35 DEVICE_PAIRING — cross-device trust:** QR/short authentication string and supported public-key exchange, human fingerprint confirmation, persisted trust and revocation, retry/timeout/rollback, no silent implicit trust; distinguish desktop-to-Android protocol readiness from an Android client actually existing.
**36 PASSWORD_AUDIT — password strength/duplication:** offline strength assessment (approved estimator), detect duplicates within unlocked vault using keyed digests or in-memory handling, warnings, local policy and recommendations; optional breach-provider checks require explicit opt-in and privacy-preserving design, never send raw password.

#### BATCH 10 — KDF / SIGNATURE STUDIO / AUDIT EVENTS / TRANSFER — 37–40
**37 KEY_DERIVATION — Argon2id studio:** tested Argon2id KDF service using vetted dependency, device-calibrated memory/time/parallelism with safe ceilings, salt generation, RFC/test vectors, export format and migration/benchmark UI. Must be consistent with task 02 KDF, not a second incompatible derivation engine.
**38 SIGNATURE_STUDIO — advanced signing:** file/text signing workflows with trusted key selection, supported format encoding, detached signatures, inspection and independent verification with negative tests; no 'certified' claim without legitimate identity/trust chain.
**39 SECURITY_ACTIVITY — trustworthy audit journal:** local tamper-evident encrypted event records for meaningful operations, least-privilege redaction, sortable/filterable viewer, bounded retention/export/clear policy, distinguish OS-native events from app-origin events; never log secrets or assert it detects all attacks.
**40 TRANSFER_WIZARD — guided reliable transfer:** UI stepper over task 22 authenticated transport, device choice, recipient consent, preview, re-auth, progress, verified receipt/retry/resume, cancel recovery, integrity evidence; never fake delivered state.

#### BATCH 11 — CAPSULE / SESSIONS / FILE INTEGRITY / CLIPBOARD — 41–44
**41 SECRET_CAPSULE — expiring secret envelopes:** authenticated encrypted capsule with recipient binding, optional time/one-time policy backed by actual trusted-state/service capability; be explicit that offline exported copies cannot be forcibly recalled or guarantee expiration, safe copy/export and negative verification.
**42 SESSION_PRIVACY — session safety controls:** real inactivity lock, Windows sleep/lock handling, secure scope of remembered preferences, purge in-memory app state where feasible, safe session revoke/reset/export, explicit explanation of OS/process memory and screenshot limitations; verify lock-to-unlock paths.
**43 FILE_INTEGRITY — persistent integrity workflows:** user-selectable baseline snapshot and SHA-256 manifest, compare/recheck, changed/missing file diff, optional signed manifest via task 19, safe monitoring permissions and test mutation detection; distinguish integrity from malware protection.
**44 SECURE_CLIPBOARD — sensitive clipboard tool:** user-initiated secure copy with masking, countdown and safe clear only if clipboard still contains the value the app placed, explicit UX limitations against OS clipboard history/other processes, test race/lock/timeout and minimize plaintext exposure.

### 4. BATCH OUTPUT / TRACKING / CONTINUE RULES

**Batch order is absolute:** 01–04 → 05–08 → 09–12 → 13–16 → 17–20 → 21–24 → 25–28 → 29–32 → 33–36 → 37–40 → 41–44. Some foundational engines are used before their later advanced UI (e.g. Argon2id for login); implement reusable service once and reuse it.

After each batch:
- Commit/push functional changes ONLY to this desktop branch, with a clear four-service commit or individually auditable commits; provide branch SHA, pushed state, modified files and link(s).
- Run `npm run check` after addressing current script limitations; unit/IPC/integration tests for each of four services; Electron/Windows smoke checks wherever the environment permits. Verify no Android paths changed via `git diff --name-only <desktop-baseline>...HEAD`. Check `git diff --check` and dependency/security review.
- Attach per-task real screenshots from the RUNNING app and comparison to applicable approved reference; report actual test viewport, AR/EN, RTL/LTR, keyboard, DPI and off-line behavior. A cloud Linux screenshot is NOT Windows native evidence; Windows build and device gates remain `WINDOWS_UNVERIFIED` if no Windows runner is available.
- Maintain progress under `desktop-evidence/` *on this desktop branch only*: `batch-01/...` through `batch-11/...` using non-secret evidence, sanitized logs, test results and references to actual screenshots; concise `STATUS.md` ledger can summarize each 01–44 task. Keep THIS file as single authoritative mission definition and avoid duplicate or conflicting mission packs.
- Emit a brief, honest summary: four tasks completed vs partial, tests with exit status, visual deviations, unresolved external integrations, Windows build/signing status, next 4. **Proceed immediately to next batch.** No 'plan only'; no stopping to ask what to do next.
- Do not invoke missing credentials or unsigned installer as an excuse to stop service development. For providers requiring a key/license, complete secure settings/adapter and test using controlled mock server *only for contract tests*, never present mock response as production. Keep missing key action for the owner at the final handoff.
- Keep the desktop branch reviewable, no automatic merge to main. After all 44, run a full regression matrix and produce Windows x64 EXE installer + portable EXE only if environment/build gates succeed; record SHA256 checksums, signing state, antivirus warnings and actual installation/uninstall evidence. If Cloud cannot run Windows/Electron natively, mark exact Windows checks pending and provide repeatable Windows CI instructions rather than inventing delivery.

### 5. INITIAL COMMANDS (RUN FIRST)

```bash
git fetch origin --prune
git switch desktop/electron-fullstack-44-services-20261031
git status --short
git rev-parse HEAD
git rev-parse origin/main
git worktree list
git branch -avv
git diff --name-only de01b23f9a010cb3743bc117bb3b78c2bb5ee86c...HEAD
# Inspect package.json, main/preload/IPC, screen routes, owner overrides and references.
# Start BATCH 01 now. Do not merely return a plan.
```

**If current checkout is in use by another agent, create a safe separate desktop worktree or use a dedicated cloud clone; DO NOT `git switch` in the Android agent's active checkout.** If `origin` is inaccessible, inspect local refs; never guess SHA or force anything. Never use `npm install` inside a shared Android worktree. If a branch was moved after this file was authored, treat `de01b23...` as original base only; inspect actual current branch/head.

### 6. FINAL PRODUCT ACCEPTANCE GATES (NOT AUTOMATIC PASS)

1. All 44 UI routes backed by working services or explicitly segregated `BLOCKED_EXTERNAL` with functional settings; all risk-critical actions locked down and tested.
2. Complete Electron runtime bridge coverage and secret-safe local persistence; no phantom service handlers or demo data masquerading as real.
3. Real Windows x64 smoke tests, installer + portable EXE, install/update/uninstall, startup/restart, 4K/125–150% DPI, AR/EN, accessibility, offline, system lock, large file and tamper cases verified.
4. Privacy/security review of dependencies, Electron IPC, CSP, cryptographic formats, password handling, file safety, package signatures and recovery; no unsupported 'military', 'quantum-safe', 'fully secure', 'undetectable' marketing claims.
5. Original approved visual identity retained and per-screen reference evidence present; no broken Android work or branch changes.
6. Git evidence: desktop branch and pushed SHAs, PR for review only on request, no automatic main merge, CI results where available, Windows runtime evidence clearly identified, owner-only credentials/signing remaining documented.

**NOW EXECUTE BATCH 01 (01 SPLASH_ENTRY, 02 SECURE_ACCESS_LOGIN, 03 HOME, 04 FILE_CIPHER), THEN KEEP PROCESSING FOUR AT A TIME THROUGH BATCH 11.**
