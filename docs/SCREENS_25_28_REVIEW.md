# Round 25–28 — implemented demo screens, visual acceptance deferred

## Applied changes
New LabScreens.jsx/labs.css, App routes, shared registry, Arabic catalogue, Tools links and QR/random cross-links from key/share/password UI. Existing app and work preserved.
- 25 `/tools/clipboard-guard`: local timer choices, mask/notification previews, fixed public-sample copy and explanatory Enable action. Never reads/monitors/clears clipboard or requests silent permissions. Secure Clipboard remains holding route for mission 44.
- 26 `/tools/random`: Hex/Base64/passphrase sample modes, size slider, deterministic read-only DEMO result and public copy. No secure RNG/entropy claim; not real bytes/encoding.
- 27 `/tools/hmac`: fictional message, read-only masked public key, algorithm/display labels and static DEMO-HMAC result, string-only compare with no authenticity conclusion.
- 28 `/key-forge/public-qr`: display/scanner modes, geometric decorative QR-like artwork and shared original stag, fictional public identity/fingerprint and Save explanation. Explicitly not a functioning QR encoder; no camera, key storage/export or trust.

## Checks
`npm run build` passes (existing module-type warning); no configured lint/typecheck scripts.
Temporary jsdom test: PASS 25 mask/public-copy and no-protection notice; PASS 26 deterministic readonly sample/size/type reset; PASS 27 read-only key/empty guard/placeholder compare/reset; PASS 28 simulated scanner and no-export Save notice. Clipboard mocked to check only public sample writes; native dialog mocked. Not a device/browser screenshot test.
`git diff --check` passes. Reduced-motion CSS included; no physical keyboard/native focus/clipboard permission visual test.

## Reference / screenshot status
All four canonical TASK/PNG references inspected. Contact sheet explicitly contains approved references, not runtime screenshots. Illustrations/QR glyphs/proportions are first-pass approximations, not pixel acceptance. Known preview billing/account restriction and no localhost browser tool prevent new running screenshots; owner requested continued source progress with later review. Exact RTL wrapping, typography, responsive geometry, lighting and motion require actual rendered comparisons when available.

Next round: 29 Vault Collections, 30 Document Viewer, 31 Key Rotation, 32 Ciphertext Package Inspector. No production/billing mutation or automatic merge.
