# KNOUX CRYPT — Windows Native QA (1 November 2026)

## Scope and isolation

- Base GitHub main: `365d565262d5319572036fe1a94440d46e60f598` (merged PR #30).
- Authorized Windows desktop: DESKTOP-VQKU9P8, Windows 10 build 19045, Node v24.21.0, npm 11.19.0.
- All operations performed ONLY inside isolated `D:\KnouxCrypt-Windows-QA` on branch `fix/windows-electron-qa-20261101`. The user's `D:\KnouxCrypt` contains unique untracked work and MUST NOT be cleaned or switched. `D:\KnouxCrypt-Android-Ready` is separate and untouched.
- Dependencies installed with `npm ci --no-fund --no-audit` (449 packages, exit 0). QA caches are isolated under `D:\Temp\KnouxCrypt-QA-*`. The unmodified main SHA is NOT the same as this patched Windows QA checkout.

## Actual findings — no fake closure

1. **Windows npm audit runner bug.** On unmodified main, `npm run check` fails at `scripts/check-dependency-security.cjs` with `spawnSync npm ENOENT`. On Windows `npm` is a command shim and cannot reliably be used with Node `execFileSync`. Patched to launch the npm CLI via `process.execPath` and `npm_execpath` (with installed npm CLI fallback). After patch, `node scripts/check-dependency-security.cjs` exits 0; actual audit: **15 moderate, 0 high, 0 critical, 0 runtime-reachable**. No suppression was added.
2. **Windows POSIX-mode test incompatibility / potential ACL assurance gap.** Fresh Windows `npm run check` after audit fix executes 427 tests: **421 pass, 3 fail, 3 skipped**. Failing assertions: `tests/file-cipher.test.cjs` uses a POSIX `chmod`-based unwritable directory, which is not a portable Windows denial; `tests/vault-session.test.cjs` and `tests/vault-store.test.cjs` compare POSIX `0o600`/group-world bits that Node's Windows stat does not represent as Windows NTFS discretionary ACLs. **Do not skip or weaken confidentiality tests to manufacture green.** Verify production userData NTFS ACLs and, if necessary, enforce per-user DACLs; add a genuine Windows access-denial negative test. Until then: WINDOWS_FILESYSTEM_SECURITY_UNVERIFIED, full gate FAIL.
3. **Insecure renderer CSP.** Unmodified production Vite build on Windows passes, and real Electron splash/preload/lifecycle passes, but `check:electron:runtime` fails when renderer reports Electron's Insecure Content-Security-Policy warning. Added restrictive CSP meta to the isolated checkout (`script-src 'self'`, no `unsafe-eval`; existing external font hosts explicitly scoped; inline styles permitted for UI transitions). Rebuild exit 0; **Windows `npm run check:electron:runtime` exit 0**, with genuine IPC round-trip and no renderer console errors. This is a local QA fix; full dev/HMR and cross-platform CSP acceptance remain to be checked.
4. **electron-builder configuration schema failure.** The original `package.json` cannot build a Windows portable application with installed electron-builder 26.18.0: `linux.desktop` must contain an `entry` subobject, and `win.publisherName` belongs in `win.signtoolOptions.publisherName`. These were relocated in the QA checkout without deleting the intended Linux metadata or signing identity. After patch: portable build succeeds.

## Successful direct Windows evidence

- `npm ci --no-fund --no-audit`: **PASS / exit 0**.
- `npm run build`: **PASS / exit 0** (Vite 8).
- `npm run check:electron:lifecycle`: **PASS** on Windows, real Electron splash → main, file:// renderer mounted and preload bridge present (from `check:desktop` run).
- `npm run check:electron:runtime`: **PASS / exit 0** with CSP patch, real Electron IPC round-trips.
- `node scripts/check-dependency-security.cjs`: **PASS / exit 0** with npm CLI process fix, 15 moderate build-toolchain findings.
- `npm run check`: **FAIL / exit 1**, 3 Windows permissions tests still failing; no full-gate PASS is claimed.
- `npx --no-install electron-builder --win portable --x64 --publish never`: **PASS / exit 0** after schema fixes.
- File created on owner's Windows machine: `D:\KnouxCrypt-Windows-QA\dist\KnouxCrypt-2025-Setup-2025.1.0-x64.exe`
- Size: **113,520,438 bytes**; SHA-256: `582FF0EA7280E0E849B73D960CF1CAF4024CE26F2C82F4D50BAD476B9CE56936`.
- Windows Authenticode: **NOT SIGNED**. This is a QA artifact only; do not publish as production or claim package launch/integration beyond what was tested.
- No installer/NSIS installation, signed release, independent audit, or complete GUI visual parity has been verified in this QA pass.

## Next required work before merge/release

1. Test Windows NTFS ACLs for actual enrollment file, encrypted store and sensitive userData directory; implement owner-only DACL if needed and a real ACL-based negative test. Do not replace checks with `process.platform === 'win32' ? skip` alone.
2. Run the full `npm run check` after legitimate Windows filesystem security validation.
3. Verify CSP on dev HMR, browser and packaged Windows UI; avoid weakening script protections or making secret-network calls.
4. Run packaged Portable EXE in an isolated userData environment, verify splash/login/Home, Windows window controls and file operations, and collect screenshots. Then test x64 NSIS installer/uninstaller with rollback and persistence safeguards.
5. Record any package-signing certificate and provider requirements. Keep external Vercel subscription unrelated.
6. Integrate validated changes through a reviewable PR, preserve Android's diverged work, and merge only after genuinely applicable checks pass.

**Status:** SOURCE_PATCHED_IN_ISOLATED_QA_BRANCH; WINDOWS_ELECTRON_RUNTIME_VERIFIED; PORTABLE_X64_BUILT_UNSIGNED; FULL_SUITE_FAILS_3; WINDOWS_ACL_UNVERIFIED; NOT_RELEASE_READY.
