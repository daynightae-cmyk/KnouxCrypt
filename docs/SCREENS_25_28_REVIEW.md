# Round 25–28 — real privacy-lab services

## Applied changes
The four screens were previously demo-only. They are now wired to the vault's real
services through `useVault` and the `vault:*` IPC channels. Existing app, visuals,
routes, Arabic catalogue and cross-links are preserved.
- 25 `/tools/clipboard-guard`: real time-limited clipboard leases over the Electron
  clipboard (`electron/vault/clipboard.js`). Copy requires explicit consent, the
  service clears only the exact value it wrote, and it skips (and reports) when the
  clipboard changed. Verify returns booleans and a length, never the text. Timer
  choices 15/30/60/120s. It states plainly that it cannot promise global erasure.
- 26 `/tools/random`: real CSPRNG output (`crypto.randomBytes`) for hex, URL-safe
  base64, passphrase and password, with unbiased rejection sampling and reported
  entropy labelled as theoretical.
- 27 `/tools/hmac`: real HMAC-SHA-256/384/512 over text or a streamed file (1 MiB
  chunks, bounded memory), constant-time comparison, and a UI that distinguishes
  integrity + key knowledge from sender identity.
- 28 `/key-forge/public-qr`: real scannable QR matrix via `qrcode`, rendered as an
  SVG with a white quiet zone, decodable back to the payload. Private key material
  is refused. Fingerprint is shown so it can be verified out of band.

Capability cards `CLIPBOARD_GUARD`, `SECURE_RANDOM`, `HMAC_AUTHENTICITY` and
`PUBLIC_KEY_QR` were added to `src/config/desktopCapabilities.js` with the required
fields and real test evidence; `scripts/check-capabilities.cjs` enforces the claim.

## Checks (real command output)
- `node --test tests/batch07-privacy-labs.test.cjs` — 32/32 pass (RFC 4231 vectors,
  lease ownership/skip/expiry/revocation, streamed-vs-memory HMAC equality,
  rejection sampling, QR round-trip through an independent reader, negative tests).
- `node --test tests/vault-ipc.test.cjs` — 31/31 pass (channel contract, consent at
  the boundary, fail-closed without an adapter).
- `npm test` — 317/317 pass.
- `npm run check` — routes, audio, capabilities, dependency security, Electron
  lifecycle and Electron runtime all PASS (exit 0).
- `npm run check:electron:runtime` — real `file://` renderer + sandboxed preload;
  batch 07 probes pass over IPC (secure random, streamed HMAC, QR matrix, clipboard
  status/consent/clear).
- `npm run check:security` — 15 findings, 0 critical, 0 high, 0 runtime-reachable;
  14 packaging-toolchain only, 1 documented acceptance (`minimatch`).

## Reference / screenshot status
Browser QA and Windows runtime verification are distinct from these headless
checks. The runtime check exercises the real Electron stack but cannot prove a
scannable QR on a physical camera or a real Windows EXE. Exact RTL wrapping,
typography, responsive geometry and motion still need rendered comparison when a
browser/Windows host is available.

Next round: 29 Vault Collections, 30 Document Viewer, 31 Key Rotation, 32 Ciphertext Package Inspector.
