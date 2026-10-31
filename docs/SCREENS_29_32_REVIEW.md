# Screens 29–32 review — real service evidence (Batch 08)

This batch replaces the four remaining decorative Vault/Tools screens with real,
test-backed services. Each capability card in `src/config/desktopCapabilities.js`
now exposes `platformCapability`, `permissionNeeds`, `requiresNetwork`,
`providerReady`, `realTestEvidence` and `displayStatus`, and every `ACTIVE`
claim is backed by a real test file.

## Verified test counts

Counts are the real `node --test` totals for each file, not estimates.

| Suite | Tests | Pass | Fail |
| --- | --- | --- | --- |
| `tests/batch08-vaulttools.test.cjs` | 31 | 31 | 0 |
| `tests/vault-ipc.test.cjs` | 35 | 35 | 0 |
| `tests/preload-contract.test.cjs` | 8 | 8 | 0 |
| Whole suite (`node --test tests/*.test.cjs`) | 353 | 353 | 0 |

`npm run check` (routes, audio, capabilities, dependency triage, tests, build,
Electron lifecycle + runtime) exits `0`.

## Task 29 — Collections (`electron/vault/collections.js`)

- Nested collections with a bounded depth, normalised tags and in-memory search
  over decrypted metadata. No plaintext index is written to disk.
- Items are stored as the same authenticated AES-256-GCM containers as the File
  Cipher. A test asserts the stored blob does not contain the plaintext.
- A move keeps the item id and blob; a copy re-encrypts under a fresh nonce.
- A non-empty collection needs a confirmed recursive delete; a locked or guest
  session is refused (`SESSION_REQUIRED`).

## Task 30 — Document viewer (`electron/vault/documentviewer.js`)

- Decrypts a supported document into a private, owner-only temporary file,
  returns bounded content and deletes the plaintext on close, on lock and on
  quit. A startup sweep clears orphans left by a crash.
- Unsupported formats are refused (`UNSUPPORTED_FORMAT`); large documents are
  paged through bounded chunks rather than inlined.
- The screen states plainly that OS-level screen capture cannot be blocked from
  within the application.

## Task 31 — Key rotation (`electron/vault/rotation.js`)

- `rewrap` re-wraps the data-encryption key under a new password; `reencrypt`
  rewrites every stored container under a fresh key.
- Journaled with a post-rotation reopen check. A failed reencrypt rolls the
  enrollment back so the old password still opens the vault; a completed
  reencrypt refuses a rollback (`NOT_FOUND`).
- Confirmation and password length are enforced at the service and IPC layers.

## Task 32 — Package inspector (`electron/vault/engine.js`)

- Key-less header parse reports *unauthenticated* claims and never claims
  decryptability (`canDecrypt: null`).
- Authenticated verification streams the whole package: header MAC, per-chunk
  GCM tags, trailing content MAC and a plaintext digest. It never writes
  plaintext.
- Tampered byte, truncation, foreign key, non-vault file and unsupported version
  each fail with a distinct typed code.

## Dependency triage

`npm audit` reports 15 moderate findings and no high or critical finding. Every
finding is reached only through the electron-builder packaging toolchain
(`glob` → `minimatch`), not the shipped renderer or main process. `npm run
check:security` classifies each one and fails on any runtime-reachable or
critical finding; it passes. The single `minimatch` advisory is an accepted,
documented exception with its reason recorded in the triage script.

## Scope notes

- No biometrics, GitHub OAuth or Passkey flow is claimed; none of their genuine
  providers exist in this application.
- Guest mode remains a nonprivileged visual preview: every privileged channel
  refuses a guest session.
- These are browser/Node verification results. Windows runtime execution is
  verified separately by the packaged build, not by this suite.
