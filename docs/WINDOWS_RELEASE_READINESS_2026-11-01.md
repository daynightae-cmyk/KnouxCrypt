# KNOUX CRYPT — Windows Release Readiness (1 November 2026)

Scope: the Windows desktop product only (`electron/`, the Vite renderer, the
x64 packages). This is a **release-readiness ledger**, not a security audit.
No independent third-party review has been performed and nothing here should be
quoted as one. See "What has not been verified".

Environment: DESKTOP-VQKU9P8, Windows 10 build 19045, Node v24.21.0, npm
11.19.0, isolated checkout `D:\KnouxCrypt-Windows-QA` on branch
`fix/windows-electron-qa-20261101`.

---

## 1. Gate results

Final run on the exact source merged below, from `final-gate.txt`:

| Step | Command | Result |
|---|---|---|
| Route inventory | `npm run check:routes` | pass — 44 mission components AR+EN, 45 unique paths, 162 internal links resolve |
| Audio | `npm run check:audio` | pass — silent default, 12 distinct signatures (not an audible mix test) |
| Capability claims | `npm run check:capabilities` | pass — 39 evidence-backed cards |
| Dependency triage | `npm run check:security` | pass — no runtime-reachable finding at high or above |
| Test suite | `npm run test` | **446 passed, 0 failed, 0 skipped**, 71s |
| Production build | `npm run build` | pass (Vite 8) |
| Electron lifecycle | `npm run check:electron:lifecycle` | pass — splash → main, built renderer, sandboxed preload |
| Electron runtime/IPC | `npm run check:electron:runtime` | pass — file:// renderer, IPC round-trip |
| CSP enforcement | `npm run check:csp` | pass — **19/19** |
| Icons | `npm run icons` | pass |
| **Whole gate** | `npm run check` | **pass, exit 0** |

`check:csp` is a new gate step; before it, nothing proved any policy was
enforced rather than merely present in a source file.

Test count went from 427 (3 failing on Windows) to 446, with **no test skipped**:
13 new in `tests/file-protection.test.cjs`, 1 new in `tests/file-cipher.test.cjs`,
5 new in `tests/electron-hardening.test.cjs`.

## 2. Artifacts

Final build, from the source this document ships with:

| Artifact | Bytes | SHA-256 | Authenticode |
|---|---|---|---|
| `KnouxCrypt-2025-2025.1.0-portable-x64.exe` | 113,529,725 | `C2A8DFAD1CE1AE89803EB6403A63D938A9C5B28D51052DC194C129B18908C889` | **NotSigned** |
| `KnouxCrypt-2025-Setup-2025.1.0.exe` (NSIS x64) | 125,147,601 | `44221D6585A0665DFB499D463981157C7BEE7A126DAB3E855F75C4B683BC51CD` | **NotSigned** |

Both report status `NotSigned` with no signer and no thumbprint, and
electron-builder logged `no code signing certificate configured, signing is
skipped` for the unpacked executable and for the portable target.

| Target | Status |
|---|---|
| portable x64 | built, installed nowhere, run and tested directly |
| NSIS x64 | built, installed, run, uninstalled and tested |
| ia32 (portable + NSIS) | **not built in this pass**, though `win.target` lists it |
| macOS dmg/zip, Linux AppImage/deb/rpm | not built or tested on this host |

The portable target previously inherited the shared `win.artifactName`, which
labelled a portable binary `...-Setup-...-x64.exe`. That is a
release-correctness defect — a portable file named "Setup" invites someone to run
it as an installer — so portable now carries its own `artifactName` with
`-portable-`.

## 3. Signing requirements (what production needs, and does not have)

Nothing in this repository signs anything today. To ship:

1. **An Authenticode code-signing certificate** for `Knoux Technologies`, either
   an EV code-signing certificate or an OV certificate, from a public CA
   (DigiCert, GlobalSign, SSL.com, Sectigo, e.g.). Requirements typically
   include a verified legal entity, and for EV a hardware token or a cloud
   HSM/key vault, because the private key must not sit on a build machine.
   Note that as of 2024 CA/Browser Forum rules, EV keys must be hardware-backed;
   a `.pfx` on disk is not compliant for EV.
2. **Wire it into electron-builder** — `win.certificateFile` /
   `certificateSubjectName` (or `certSha1`), plus `win.signtoolOptions`.
   `publisherName: "Knoux Technologies"` is already set and must match the
   certificate subject exactly, otherwise Windows reports a publisher mismatch.
   The build accepts an absence of a certificate and merely skips signing, which
   is why this has gone unnoticed: unsigned output builds successfully.
3. **Timestamping** (`win.timeStampServer`, e.g. a RFC3161 TSA) so signatures
   survive certificate expiry. Without it, installers stop working when the
   certificate expires.
4. **Smart-screen / reputation**: unsigned installers downloaded from the web
   trigger Windows SmartScreen warnings and are heavily flagged by browsers.
   A good-reputation EV certificate removes most of that; an OV certificate
   builds reputation over weeks of download volume.
5. **`electron-updater`**: `verifyUpdateCodeSignature` is currently `false`.
   That is the honest setting for an unsigned build, but once artifacts are
   signed it should become `true`, otherwise an updater would accept a tampered
   package — a real supply-chain hole that signing alone does not close.
6. Notarization is a macOS concern and is out of scope for this Windows pass.

Until 1–5 are done, the correct description of both artifacts is **"QA build,
unsigned"**, and neither should be published as a production release.

## 4. What running the packaged apps actually proved

Portable (`scripts/qa-windows-exe.cjs`, driven over the DevTools Protocol
against the real `.exe`, isolated `--user-data-dir`): all checks passed —
splash→main handoff, renderer mounted Arabic/RTL, enroll, guest isolation,
file encrypt→decrypt with the recovered plaintext SHA-256 matching a hash
computed outside the app, ED25519 key generation with no private material
crossing the bridge, TOTP with no seed returned, encrypted-store round trip,
AR/EN toggle, lock, then a full process restart proving the vault, note, key
and account all survived and a wrong passphrase was still rejected. It also
asked the OS who can read each produced file, and every one came back
owner-only.

Installer (`scripts/qa-windows-installer.cjs`): all checks passed — silent
install produced the app, `app.asar`, the uninstaller, the start-menu shortcut
and the per-user registry entries; the *installed* program opened a real vault
and wrote it to the default `%APPDATA%` location; silent uninstall removed the
program, the asar, the uninstaller, both registry keys and the shortcut, while
`vault-enrollment.json` and `vault-store/notes.knx` remained **byte-identical**
and still owner-only. The harness refuses to run at all if any `%APPDATA%`
directory already contains a vault, so it cannot touch real user data, and it
removed the data it created afterwards.

Screenshots: `D:\Temp\KnouxCrypt-QA-profile\screenshots`.

## 5. Dependency advisories

`npm audit`: **15 findings, all moderate, 0 high, 0 critical**, and none
reachable from the shipped application — they are all in the build/packaging
toolchain (`electron-builder`, `app-builder-lib`, `@electron/asar`,
`@electron/universal`, `dmg-builder`, `dir-compare`, `ejs`/`jake`/`filelist`,
`glob`/`rimraf`/`temp`, `electron-winstaller`, `electron-builder-squirrel-windows`),
which are `devDependencies` and are not packed into `app.asar`.

They are not 15 separate problems. There is **one root cause**: `minimatch`
below 11.0.1, GHSA-g3hv-75wg-m249 (denial of service through amplified glob
parsing). Everything else is that package propagating through the packaging
dependency tree.

It is not fixable from this repository today: the installed copies are
minimatch 3.1.5, 5.1.9, 9.0.9 and 10.2.6, pinned by `glob@7` (via
`@electron/asar`), `filelist` (via `ejs`→`jake`) and `dir-compare` (via
`@electron/universal`), none of which accept 11.x. A `overrides` entry forcing
11 would be an unrequested, untested change to a build tool that is not
reachable at runtime, so it has been left alone rather than silenced.

Assessment: accept and re-check on each `electron-builder` release. The advisory
requires feeding hostile glob patterns to a build tool running on the developer's
own machine; it does not affect a user's vault, and it is not present in the
shipped code.

## 6. What has not been verified

Stated plainly, because these are the things a release decision needs:

- **No independent security review.** Everything here is self-testing by the
  same change that introduced it.
- **Confidentiality against a second local user is argued from the DACL, not
  demonstrated from a second account.** The machine under test has one
  interactive user, so no ACE grants `Everyone`, `Authenticated Users`, `Users`,
  `Guests`, `Interactive`, `Network` or `All Application Packages`. What was
  *measured* is that a grant to `NT AUTHORITY\LOCAL SERVICE` — a principal on no
  blocklist — is detected and removed. The remaining assumption, sound but not
  executed here, is that a user who is not the owner and not in Administrators
  cannot read a file whose DACL names only those three SIDs.
- **SYSTEM and Administrators retain full control by design.** That is the
  Windows convention for per-user secrets (SSH keys, DPAPI); it keeps backup,
  antivirus and elevated servicing working and avoids locking users out of their
  own data. An administrator can take ownership of any file regardless of DACL,
  so excluding them would have bought nothing. The vault's defence against an
  administrator is the passphrase-derived key, not the filesystem.
- **No malware, AV false-positive or SmartScreen testing.** Unsigned binaries
  are exactly where those surface.
- **No install on a clean machine, no domain/GPO environment, no Roaming
  profiles or OneDrive redirection**, no non-English Windows locale, and no
  Windows 11. All of it ran on one already-developer-loaded Windows 10 host.
- **`electron-updater` was never exercised**: no update feed, no signed delta,
  no download-and-install cycle.
- **ia32 was not built**, despite being listed in `win.target`; a 32-bit
  consumer would today get no artifact.
- **The Vercel deployment failure on the PR is an account-level block** on the
  owner's plan, not a code failure, and is unrelated to this work.
- **Full visual parity across all 44 services on a real Windows display** was
  not re-checked; interaction coverage came from CDP driving the packaged app,
  plus lifecycle and IPC runtime checks.
- The macOS entitlements and Linux `.desktop` metadata remain unexecuted
  configuration on this host.
