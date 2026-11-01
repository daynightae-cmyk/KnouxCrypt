# KNOUX CRYPT — Windows Native QA and Security Acceptance (1 November 2026)

Two passes are recorded here. The first (earlier today, on `main`) found four
production problems and fixed two of them. The second — this revision — closes
the remaining work: the Windows filesystem-security question, the three failing
tests, CSP verification, the packaged-app runtime, the installer, and the
release ledger.

Base: GitHub `main` at `365d565262d5319572036fe1a94440d46e60f598` (PR #30).
Work branch: `fix/windows-electron-qa-20261101`, PR #31, preserved commit
`a4f9789633a537e6841ee39cb25d71d9e0112812`.
Host: DESKTOP-VQKU9P8, Windows 10 build 19045, Node v24.21.0, npm 11.19.0.
All work happened inside the isolated `D:\KnouxCrypt-Windows-QA` checkout.
`D:\KnouxCrypt` and `D:\KnouxCrypt-Android-Ready` were not switched, cleaned or
written to; `git worktree list` shows only the QA worktree.

---

## 1. The Windows ACL question — a real confidentiality defect, now fixed

### What was actually true before

The vault asked for owner-only files with `{ mode: 0o600 }` and
`fs.chmod(path, 0o600)`. On Windows neither does what it appears to. libuv maps
only the POSIX *write* bit onto `FILE_ATTRIBUTE_READONLY`; the security
descriptor a new file actually receives is inherited from its directory.
Measured on this host — a file written with `{mode: 0o600}` inside a fresh
`os.tmpdir()` tree:

```
stat().mode           0o666        (and still 0o666 after chmod(0o600))
icacls probe.bin      BUILTIN\Administrators:(I)(F)
                      NT AUTHORITY\SYSTEM:(I)(F)
                      NT AUTHORITY\Authenticated Users:(I)(M)
                      BUILTIN\Users:(I)(RX)
```

`BUILTIN\Users:(RX)` means **every ordinary local user account could read** the
sealed `*.knx` collections, the recovered plaintext, the saved capsules, the
journal HMAC key — and `vault-enrollment.json`, which holds the salt, the
verifier and the wrapped DEK. That last one converts a filesystem read into an
offline password-guessing target, so this was not a hygiene issue but the real
weakness the QA pass had left open as `WINDOWS_FILESYSTEM_SECURITY_UNVERIFIED`.

The three failing tests were the visible symptom of the same thing: they asserted
`mode == 0o600` and `mode & 0o077 == 0`, which on Windows compare a value derived
from a read-only attribute rather than the access control list, and
`chmod(dir, 0o500)` does not make a directory unwritable, so the app had never
been shown a genuine Windows write refusal.

### What was skipped, not solved

`tests/batch11-finaltools.test.cjs` guarded its capsule-permission assertion with
`if (process.platform !== "win32")`. The property was therefore untested on the
platform where it was false. That guard is gone; the assertion now runs on both.

### The fix

New module `electron/vault/acl.js`. On POSIX it still uses modes. On Windows it
replaces the DACL so that only the owner, `NT AUTHORITY\SYSTEM` and
`BUILTIN\Administrators` hold a grant, and it verifies the result by asking the
OS, by SID rather than display name (`icacls /findsid`), because `icacls` prints
localised names and a name-based assertion would be brittle on any non-English
Windows. Enforcement uses `icacls.exe` only; PowerShell is used solely for
exhaustive verification and last-resort repair, so no write path depends on a
PowerShell host.

Applied at: enrollment (create, rotate, restore), the encrypted store root and
each sealed collection, encrypted and decrypted file outputs (including outside
the vault root, where nothing is inherited), the secret capsule save, the atomic
write helper, the security journal's HMAC key, preferences and the Autofill
preview file. `VaultService` confines its own `userData` root when constructed,
and reports the outcome through `fileSecurity()` rather than swallowing a failure.
A relative or repository `userDataPath`, and the process working directory, are
explicitly refused — relabelling a checkout would be an unrelated, hard-to-reverse
change.

Two tiers, because they answer different questions:

- **fast** — one atomic `icacls` per object: `/inheritance:r`, `/remove` for each
  known-broad trustee, `/grant:r` for the allow-list.
- **exhaustive** — enumerate every trustee from the security descriptor and, if a
  principal outside the allow-list is found, remove it. The fast tier is a
  blocklist; the exhaustive tier is what makes "owner-only" mean something. A
  grant to `NT AUTHORITY\LOCAL SERVICE` — on no list — is detected and removed,
  and that is covered by a test.

### Three safety rules, each learned by breaking it on this host

1. **`/inheritance:r` with a grant that fails leaves an empty DACL, and an empty
   DACL locks the owner out of their own vault.** The first probe hit this by
   accident: a malformed SID made the grant fail, and the file then refused
   `stat()` with `EPERM` and `icacls` with `Access is denied`. `takeown` needs
   elevation. Enforcement therefore never separates strip and grant — they are one
   `icacls` command, so the ACL is computed once and applied in one
   `SetSecurityInfo` call with no intermediate state.
2. **Never apply `(OI)(CI)` to a file, and never remediate with `/T`.**
   `(OI)(CI)` are inheritance templates and inert on a file object, so
   `icacls dir /T /inheritance:r /grant sid:(OI)(CI)F` stripped each existing
   child's inherited ACEs while the child's only grant was inert — leaving
   existing vault files unreadable. Measured, then removed from the design.
   Repair walks the tree itself, parents first, with a type-matched grant per
   node. Parents first matters: a file with a bad DACL is recoverable with
   `icacls /reset` *provided its parent directory still grants the owner access*,
   which is exactly how every deliberately-broken probe tree here was recovered.
3. **Windows propagates a parent DACL change into existing children.** One
   non-recursive call on a vault root removed `Authenticated Users` and `Users`
   from a two-level-deep pre-existing `*.knx` file and replaced them with the
   owner-only set, while the file stayed readable and writable by its owner. So
   protection is one call per root, not a tree walk — cheaper and free of the
   inert-ACE failure above. Propagation only rewrites *inherited* ACEs, though:
   an **explicit** broad ACE survives it, which is why the recursive pass and the
   `/remove` step are still required.

That last point is also why `/grant:r` alone was not enough. `/grant:r` replaces
the named trustees' ACEs only, so an explicit `Everyone:R` survived the first
implementation and was reported as "protected". Caught by a test that manufactures
its own adversarial ACL instead of trusting the machine's default.

### Honest limits of this claim

`SYSTEM` and `Administrators` deliberately retain full control; see
`WINDOWS_RELEASE_READINESS_2026-11-01.md`. And the second-local-user exposure was
**argued from the DACL, not demonstrated from a second logged-in account** — this
host has one interactive user. What was demonstrated is the mechanism, including
against a principal no blocklist knows.

## 2. The three Windows test failures

Fixed with platform-appropriate assertions, no skips, no weakened confidentiality
checks:

- `tests/vault-session.test.cjs` — enrollment confinement now asserted against the
  NTFS DACL on Windows and the mode bits on POSIX, for the record *and* its parent
  directory. The `0o600` check survives, but only as the POSIX branch.
- `tests/vault-store.test.cjs` — retitled from "not world-readable" (a POSIX
  framing) to owner confinement of both the sealed collection and the store
  directory, and it now additionally proves the file is still ciphertext, because
  an owner-only file holding plaintext would pass either ACL assertion.
- `tests/file-cipher.test.cjs` — the unwritable destination is now produced by the
  platform's real mechanism: an explicit NTFS `DENY` ACE on
  `WriteData/AddFile`, which Windows evaluates before the owner's `Allow` ACE,
  instead of `chmod 0o500` (a no-op on Windows). The test first asserts the OS
  genuinely refuses, so it cannot pass by accident.
- `tests/batch11-finaltools.test.cjs` — the `win32` guard removed.

New `tests/file-protection.test.cjs` (16 tests) covers the mechanism, both
verification tiers, inheritance, pre-existing-child remediation, the empty-DACL
regression, enrollment/store/output confinement through the real service, genuine
denials for encryption and for the store, fail-closed behaviour, and the refusal
to relabel the working directory.

### A real behaviour change fell out of this

`_assertWritableTarget` used to `stat()` the directory, which on Windows succeeds
even when the DACL denies creating files — so encryption hashed the entire input
and only then failed, with a raw `EPERM` crossing IPC. It now probes by actually
creating a file, and both the probe and the temp-file open translate
`EPERM`/`EACCES` (Windows reports an NTFS denial as `EPERM`, **not** `EACCES`)
into a new typed code, `PERMISSION_DENIED`, so encrypt, decrypt and store-write
all refuse cleanly with no partial output and no leftover temp files. The UI copy
for the cipher screens maps it; an unmapped code already fell back to the
main-process message, so nothing rendered blank either way.

## 3. Content Security Policy

Verified against live documents rather than source greps, because the previous
suite had a test named "a strict CSP is applied to every document" that only
searched `electron/main.js` for directive strings.

- **Development server** (Chromium, real browser): inline script injection
  blocked, `eval` refused, cross-origin import refused, React mounted, AR/EN
  toggle switched `ar/rtl ⇄ en/ltr`, Secure Access route reachable, HMR
  connected, zero CSP violations. Vite's React Refresh preamble is injected into
  `<head>` *before* the policy element, which is why hot reload survives
  `script-src 'self'` with no `unsafe-inline` for scripts.
- **Production build in a browser**: same results, and the CSP element sits at
  head index 1 while the bundle script is index 11, so the policy governs the
  whole app. A clean load produced **zero** console messages.
- **Packaged Electron over `file://`**: 19/19 in `npm run check:csp` —
  inline blocked, `eval` and `new Function` both `EvalError`, cross-origin
  refused, React mounted, 12 framer-motion nodes still animating under
  `style-src 'unsafe-inline'`, both preload bridges present, AR/EN toggle works.
- **No `unsafe-eval` anywhere** (index.html, splash, main.js) and no source-level
  need for it: `src/` contains no `eval`, no `new Function`, and no
  `fetch`/XHR/WebSocket.

**Gap found and fixed: the splash document had no CSP at all.** `main.js`
installs its policy through `onHeadersReceived`, which does not cover it, and
`electron/splash.html` carried no `<meta>` while inlining both its stylesheet and
its script. The splash is now strict by construction: its CSS and JS are external
files, so its policy needs no `unsafe-inline` anywhere and can set
`connect-src 'none'`. Verified that the externalised document still animates the
loading text and generates its particles.

Source-level guards now lock all of this in, including that `installer.nsh`
cannot regress (see §5) and that no policy acquires `unsafe-eval`.

**Note, not changed:** the packaged renderer makes a live request to
`fonts.googleapis.com` for Inter on every load, while the Arabic face is already
self-hosted from `build/assets`. For a local-first encryption tool that is an IP
and availability leak, and offline the typography degrades. Fixing it means
removing a `<link>` and changing rendered type, which is a design decision rather
than a security fix, so it is recorded instead of silently applied.
`connect-src` also still allows `ws://localhost:3000` for development; the
production renderer opens no sockets, so it is dead allowance, harmless but not
ideal.

## 4. Packaged applications, actually run

**Portable x64 EXE** — `scripts/qa-windows-exe.cjs`, 40/40 checks, driving the
real `.exe` over the DevTools Protocol with an isolated `--user-data-dir`:
splash→main handoff, Arabic/RTL mount, enrollment, guest session refused
(`SESSION_REQUIRED`), file encrypt→decrypt with the recovered plaintext's
SHA-256 equal to a digest computed outside the app, ED25519 generation with no
private material reaching the renderer, TOTP producing a 6-digit code without
returning the seed, encrypted-store round trip, AR/EN toggle, lock; then a full
process restart proving enrollment, note, key and account all persisted, the
correct passphrase still unlocked and the wrong one rejected (`AUTH_FAILED`).
`icacls` on the files this run produced shows the owner-only DACL on the profile
root, the enrollment record, the store directory, the sealed collection, the
encrypted container and the recovered plaintext.

**NSIS x64 installer** — `scripts/qa-windows-installer.cjs`, 28/28. Silent
install produced the executable, `app.asar`, the uninstaller, the start-menu
shortcut and the per-user registry entries; the *installed* program opened a real
vault at Electron's actual default path; silent uninstall removed the program,
the asar, the uninstaller, both registry keys and the shortcut while
`vault-enrollment.json` and `vault-store/notes.knx` remained **byte-identical**
and still owner-only. No existing user vault data was touched: the harness
refuses to run if any `%APPDATA%` directory already contains a vault, and it
removed everything it created afterwards.

## 5. Packaging defects fixed on the way

- **The x64 NSIS target could not build at all.** `electron/installer.nsh`
  redefined `MUI_ICON`, which electron-builder already defines from
  `nsis.installerIcon`, so `makensis` aborted with `!define: "MUI_ICON" already
  defined!` — a hard release blocker that nothing in `npm run check` noticed,
  because the test script never invokes electron-builder. The file also declared
  its own install `Section` copying `${BUILD_DIR}\*` (undefined, and a duplicate
  of what the template already does), wrote to `HKLM`/`HKCR` while the package
  requests `asInvoker`, used `${If} ${AtMostWin7}` without `LogicLib`, and pointed
  a shortcut at `resources\help\index.html`, which is not shipped. It is rewritten
  as guarded defines plus the supported `customInit`/`customInstall`/`customUnInit`/
  `customUnInstall` macros, writing only to `HKCU`. A source-level test now keeps
  that class of failure in CI.
- **Silent uninstall hung.** The confirmation dialog first placed in
  `customUnInit` displayed even under `/S`: the uninstaller copied itself to
  `%TEMP%`, waited for a click that never came, and removed nothing — the process
  was found still alive and blocked. It is now guarded with `IfSilent`, so the
  question appears for a human at the console and never in a scripted run, and
  the harness keeps the uninstaller's own error text instead of discarding it.
- **`Set-Acl` on a freshly constructed security object needs
  `SeSecurityPrivilege`**, which an ordinary user does not have ("The process does
  not possess the 'SeSecurityPrivilege' privilege"), because it writes the SACL
  too. Foreign-trustee repair therefore removes exactly the discovered trustees
  with `icacls`, privilege-free, with the outright DACL replacement kept as a
  guarded fallback.
- **PowerShell `-Command` does not bind trailing argv to `$args`** (verified:
  `echo GOT=$args[0] hello` printed `GOT=[0]` then `hello`). Targets are embedded
  as single-quoted literals with apostrophes doubled — load-bearing, since a
  `%USERPROFILE%` name may legitimately contain one.
- **A portable binary labelled "Setup"** — see the release ledger.

- **The `npm audit` fallback could not find npm on POSIX.** Raised as an inline
  review comment on PR #31 and correct: `findNpmCli` used
  `<dirname(process.execPath)>/node_modules/npm/bin/npm-cli.js`, which is the
  Windows install layout but resolves to `/usr/local/bin/node_modules` on
  Linux/macOS, where npm lives under `/usr/local/lib/node_modules`. Running
  `node scripts/check-dependency-security.cjs` directly — i.e. without
  `npm_execpath` in the environment, which is how `npm run check:security`
  invokes it — therefore failed there. Candidates are now existence-checked
  across the Windows, `/usr/local/lib`, nvm-style and `PREFIX` layouts before
  being used, and the caller falls back to `npm` on PATH (valid on POSIX) only
  when none resolve. Verified on this host by running the script directly with
  `npm_execpath` unset: exit 0 with the same 15-moderate report. The POSIX
  layouts are fixed by construction from the known install paths, not executed
  here — this is a Windows run.
- **A probe could delete a file it did not create.** The writable-directory probe
  removed its temp path in a `finally` even when it had not opened it, so an
  `EEXIST` collision would have unlinked somebody else's file. Removal is now
  scoped to the handle actually obtained.

## 6. Earlier findings, status

| # | Finding | Status |
|---|---|---|
| 1 | `npm audit` runner `spawnSync npm ENOENT` on Windows | fixed in `a4f9789`, still passing |
| 2 | POSIX-mode tests / ACL assurance gap | **fixed and verified here** |
| 3 | Insecure renderer CSP | fixed in `a4f9789`; **verified and extended here** (splash) |
| 4 | electron-builder schema failure | fixed in `a4f9789`, builds |

## 7. Review round on the pushed branch

The agent review on PR #31 raised three findings after the first commit. Two were
real defects **in this change** and are fixed; the third was the POSIX test issue
already corrected independently.

1. **`atomicWrite` relabelled the user's chosen output directory.** It called
   `ensureProtected(dir)` before writing, and its three callers are archive
   export, archive *extract*, and the metadata-cleaned copy — all destinations the
   user picks. On POSIX that is `chmod 0700` on someone's shared folder; on
   Windows the stripped, propagated DACL change reaches every other file in it.
   Extracting an archive into a folder shared with a colleague must not silently
   make that whole folder private. It now confines **only the file it writes**.
   A regression test writes an archive into a deliberately world-readable folder
   that already contains somebody else's file, and asserts the archive is
   owner-only while the folder and the unrelated file are untouched.
2. **`decryptFile` left recovered plaintext exposed for the whole operation.**
   `_openTemp` created the sibling temp file with `{mode: 0o600}`, which on
   Windows restricts nothing, so the temp inherited the destination directory's
   broad DACL; confinement happened only after the atomic commit. For a large
   decrypt that is every local user reading the plaintext for the entire
   duration. `_openTemp` now confines the temp immediately after the handle
   exists — the smallest window this API allows — before a single byte is
   written. A test opens a temp through the real engine and inspects its ACL
   before writing to it.
3. **A relative `userDataPath` would have relabelled the working directory.**
   Several components build paths from `userDataPath || "."`. `_sealVaultRoots`
   already refused the cwd, but `preferences`, `autofill`, `journal` and `store`
   did not, so a service constructed without an absolute path would strip the ACL
   of a real checkout. The refusal now lives in `acl.protectDirectoryOnce` and its
   synchronous equivalent, so it applies to every caller.

Fixing 3 surfaced a reporting error of the same family: a deliberate refusal was
being counted as a protection **failure**, so the security report would claim
something had gone wrong when exactly the right thing had happened — and a real
failure could hide among the false ones. `protectionStatus()` now separates
`failures` from `refused`.

Both findings 1 and 2 are the shape of bug that a passing suite does not reveal:
the tests asserted the file ended up confined, which stayed true while the
*directory* was collateral damage and while the temp file leaked. They are covered
now.

## 8. Status

`WINDOWS_FILESYSTEM_SECURITY_VERIFIED_OWNER_ONLY_DACS`; 449 tests pass with none
skipped (427 before this work); full `npm run check` gate exit 0; CSP enforced
with no `unsafe-eval` in development, production browser and packaged Electron;
unsigned portable x64 EXE and x64 NSIS installer built, installed, run and
uninstalled with vault data preserved. `NOT_SIGNED`; `NO_INDEPENDENT_AUDIT`;
`NOT_YET_PRODUCTION_READY` until code signing and the unverified items in the
release ledger are addressed.
