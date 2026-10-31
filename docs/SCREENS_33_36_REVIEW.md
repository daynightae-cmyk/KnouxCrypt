# Screens 33–36 review — real service evidence (Batch 09)

This batch replaces the four remaining decorative device/password screens with
real, test-backed services. Each capability card in
`src/config/desktopCapabilities.js` exposes `platformCapability`,
`permissionNeeds`, `requiresNetwork`, `providerReady`, `realTestEvidence` and
`displayStatus`, and every `ACTIVE` claim is backed by a real test file
(`scripts/check-capabilities.cjs` enforces this).

## Verified test counts

Counts are the real `node --test` totals for each file, not estimates.

| Suite | Tests | Pass | Fail |
| --- | --- | --- | --- |
| `tests/batch09-devices.test.cjs` | 18 | 18 | 0 |
| `tests/vault-ipc.test.cjs` | 39 | 39 | 0 |
| `tests/preload-contract.test.cjs` | 9 | 9 | 0 |
| Whole suite (`node --test tests/*.test.cjs`) | 376 | 376 | 0 |

`npm run check` (routes, audio, capabilities, dependency triage, tests, build,
Electron lifecycle + runtime) exits `0`.

## Task 33 — Android Autofill preview (`electron/vault/autofill.js`)

- Real, persisted preview toggles (`autofill-preview.json`, mode 0600, atomic
  write). Unknown keys are ignored and values are coerced to booleans, so a
  renderer payload cannot grant a permission.
- The capability report is fixed by the build, not probed, and always states
  `nativeAutofill: false`, `canRegisterProvider: false`, `canOpenSettings:
  false`. The "Open Android Autofill Settings" CTA is rendered `disabled`.
- A corrupt preview file falls back to safe defaults instead of throwing.

## Task 34 — Offline Security Advisor (`electron/vault/posture.js`)

- The review is built from state the app genuinely owns: enrollment, session
  state, the real privacy preferences, the real backup count, the transfer
  listener and armed clipboard leases. Every `OBSERVED` row carries an
  `evidence` string naming the value it read.
- Topics the app cannot see (OS updates, disk encryption, screen lock, account
  integrity, network exposure) are listed as `MANUAL` rows and are never marked
  passed. The report carries a `disclaimer` stating it did not scan the OS.
- Filters (`All`, `Vault`, `Privacy`, `Recovery`, `Device`) are enforced;
  unknown filters are refused with `BAD_INPUT`.

## Task 35 — Multi-Device Pairing (`electron/vault/pairing.js`)

- A real handshake: two ephemeral X25519 key pairs, a genuine Diffie-Hellman
  agreement and an HKDF-SHA256 six-word short authentication string, compared
  in constant time. Private keys never leave the module.
- Loopback only: `transport: "loopback"`, `networkOpened: false`. No socket is
  opened. Sessions are ephemeral and swept on expiry (10 minutes).
- Negative cases: a declined match and a wrong phrase are both refused with
  `AUTH_FAILED`; an unknown session is `NOT_FOUND`.
- Honest label: the card is `PARTIAL`, because both roles run in this process —
  it is not a pairing with a second physical device.

## Task 36 — Password Strength Audit (`electron/vault/passwordaudit.js`)

- A real offline estimator in the spirit of zxcvbn: dictionary, repeat,
  sequence, keyboard and date matchers, a dynamic-programming guess estimate
  and a 0–4 score. The output is deterministic, which is what makes it testable.
- The result carries its own limits as data: `breachChecked: false`,
  `storedInput: false`. No breach database is consulted and the input is not
  stored.
- The activity log records the length and score only — never the audited text.

## Visual evidence

Real browser captures (headless Chromium over the Vite dev server, mobile
390×844 @2x), not static images:

- `qa-evidence/batch09/33_android_autofill.png`
- `qa-evidence/batch09/34_offline_advisor.png`
- `qa-evidence/batch09/35_multi_device_pairing.png`
- `qa-evidence/batch09/36_password_audit.png`

Each screen renders its `REAL SERVICE` label and its capability card. Zero
renderer exceptions were observed across the four routes.

## Scope note

The runtime checks in `scripts/electron-runtime-check.cjs` exercise all four
services across the real IPC boundary inside a real Electron process on Linux.
Windows EXE execution remains unverified in this environment; the browser QA
above is a render check, not a Windows runtime verification.
