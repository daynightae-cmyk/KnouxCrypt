# Round 21–24 — implementation and deferred visual acceptance

References: all four numbered TASK.md/REFERENCE.png pairs inspected. Contact sheet is approved reference material, not a running-app screenshot.

## Applied code
`src/components/workflows/WorkflowScreens.jsx`, `workflows.css`: four local React screens; App route wiring, shared registry, Tools links, File Cipher archive link, sharing/key fingerprint links and Arabic catalogue.

- 21 `/tools/archive`: three fictional files, add/remove, compression switch, passphrase explanation and target/output preview; no archive written or crypto.
- 22 `/tools/secure-share/local-transfer`: static device labels, consent accept/reject, file/permission explanations and transfer-wizard holding link; no networking/discovery or delivered state.
- 23 `/key-forge/fingerprint`: shared stag, two public sample fingerprints, full monospaced sheet/copy, text comparison gated by manual words checkbox; match is not identity verification. Parent Back allowlists Key Details, otherwise sharing.
- 24 `/tools/metadata-cleaner`: fictional IMG label, four metadata switches, formats explanation and selected-field output preview; original untouched, no image reads/writes/removal.

## Tests actually run
`npm run build` passes with existing module-type warning. No standalone lint/typecheck script.
Temporary jsdom round test passes: archive add/remove guards and no-created-archive sheet; device choice/consent reset/no-send notice; fingerprint input/confirmation guard and text-only comparison; metadata selection, empty-selection guard and preview list. Native dialog mocked, not real browser/device test.
`git diff --check` passes. Prior existing source preserved. No dependency change or billing mutation.

## Motion and limits
Configuration-only package sealing, single device pulse, comparison highlight and metadata-dust animation with reduced-motion override. Persistent atmosphere remains shared outside routes.
No actual screenshots/rendered comparison: known Vercel account/billing restriction and no localhost browser tool. Owner requested continued source progress with later visual review. Artwork/vector glyphs/layout are first-pass approximations, not visual PASS. Responsive geometry, Arabic wrapping, eye alignment, native focus, clipboard permission on device and motion timing remain unverified.

Next round: 25 Clipboard Guard, 26 Secure Random, 27 HMAC Authenticity, 28 Public Key QR.
