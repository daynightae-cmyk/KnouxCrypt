# Round: missions 17–20 — four source implementations, visual acceptance pending

## Applied source and integration
`src/components/inspectors/InspectionScreens.jsx` and `inspectors.css` provide four actual React screens and common scoped primitives. `src/App.jsx` registers them; `src/config/screens.js` defines routes; Home's Tools index links to them; Arabic catalogue covers labels and security disclaimers. Earlier 01–16 source retained.

| Mission | Active route | Before -> after |
| --- | --- | --- |
| 17 Hash & Integrity | `/tools/integrity` | holding -> sample algorithm/compare/metadata workflow |
| 18 Text Cipher | `/tools/text-cipher` | missing -> input/output/mode/swap/policy workflow |
| 19 Digital Signature | `/key-forge/signature` | holding -> Sign/Verify/sample-key workflow |
| 20 Certificate Inspector | `/tools/certificates` | missing -> sample metadata/chain/inspection workflow |

File Integrity (43) and Signature Studio (38) remain explicit holding routes; not claimed completed.

## Commands and actual checks
- `npm run build`: passes with existing module-type warning. No repository lint/typecheck scripts configured.
- Temporary jsdom round harness: PASS 17 sample output/reset on algorithm change and explicitly non-security comparison; PASS 18 input guard, static placeholder output, swap and alternate mode; PASS 19 sample/key action guards, no-signature-result sheet and mode reset; PASS 20 chooser/action guards, metadata expanded state, scanner class while inspect sheet open, removal of scanner class on close and no-install import notice.
- Static Babel binding check: all capitalized App JSX route components have defined/imported bindings. A Vite build alone does not catch undefined JSX component identifiers; integration was corrected before commit.
- `git diff --check`: passes.
- Dialog API mocked in jsdom; no real-device/native-focus validation.

## Security boundaries
17 shows labelled public DEMO strings, not actual file digests. Compare only compares the two demo strings; no integrity PASS. Clipboard is limited to the fixed public result.
18 accepts fictional preview text in React memory, outputs a constant labelled placeholder, invokes no cryptography and collects no key/password. Do not enter sensitive text.
19 selects fictional file/key labels; never signs or verifies, reads no private keys/files, and never reports verification success.
20 presents fictional X.509 fields/chain, does not parse certificates, install trust, perform network checks or infer validity.
All use the unchanged persistent global background/audio/language shell; local checksum ripple, output wipe, seal tilt and inspect-only scanner respect reduced motion.

## Reference / visual gaps
All four canonical TASK.md/REFERENCE.png pairs inspected. Combined approved-reference image shared only for reference, **not** as runtime screenshot. Foreground artwork/vector glyphs/layout are first-pass approximations; exact reference typography, matrix artwork, glow, proportions, RTL wrapping and responsive clearance still need real browser screenshots and refinement.
No new actual screenshot: Vercel preview is blocked by known overdue-balance/account restriction, and available browser opens Vercel Preview only, not localhost. Owner explicitly asked continued source work while preview review is deferred. Build/jsdom/source checks are not visual PASS. Screens remain implemented/tested locally, not visually accepted.

Next round: 21 Encrypted Archive, 22 Local Transfer, 23 Fingerprint Verify, 24 Metadata Cleaner. No billing/production mutation or automatic merge.
