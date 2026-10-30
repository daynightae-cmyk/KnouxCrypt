# PR15 regression repair and visual evidence

## Boundaries / preservation
Reviewed live PR head db55af9e587ee4ecc855592774634d4a7d77083e, open/unmerged on visual/refine-home-tools-rain. Clean worktree before edits; review regression confirmed. No Android, PR14/integration branch, backend, crypto engine, services or mission packs touched. No merge/force push/history rewrite.

## Root cause / inventory
Removing Home ServiceGrid from Tools removed 7 unique destinations. Main originally exposed 35 links (34 unique); reviewed PR15 showed only 27. Repair composes existing SERVICES with existing additional Tools shortcuts, dedupes by SCREENS[id] path, uses stable canonical IDs; no new competing route registry. Home ServiceGrid stays eight cards.

Restored:
- Encrypt Files → `/file-cipher`
- Vault → `/vault`
- Secure Notes → `/notes`
- Passwords → `/passwords`
- Authenticator → `/authenticator`
- Privacy Center → `/privacy`
- Recovery → `/backup`

### Exact pre-repair inventory (27)
- Key Forge → `/key-forge`
- Signature Verification → `/key-forge/signature`
- Secure Share → `/tools/secure-share`
- Hash & Integrity → `/tools/integrity`
- Text Cipher → `/tools/text-cipher`
- Certificate Inspector → `/tools/certificates`
- Archive → `/tools/archive`
- Local Transfer → `/tools/secure-share/local-transfer`
- Fingerprint Verify → `/key-forge/fingerprint`
- Metadata Cleaner → `/tools/metadata-cleaner`
- Clipboard Guard → `/tools/clipboard-guard`
- Secure Random Studio → `/tools/random`
- HMAC Authenticity Lab → `/tools/hmac`
- Public Key QR → `/key-forge/public-qr`
- Collections → `/vault/collections`
- Document viewer → `/vault/documents`
- Package Inspector → `/tools/package-inspector`
- Autofill → `/passwords/autofill`
- Offline Security Advisor → `/tools/security-advisor`
- Key Derivation → `/key-forge/derivation`
- Security Activity → `/privacy/activity`
- Expiring Secret Capsule → `/tools/secure-share/capsule`
- Session Privacy → `/privacy/session`
- File integrity → `/tools/file-integrity`
- Secure Clipboard → `/tools/secure-clipboard`
- Device Pairing → `/tools/secure-share/pairing`
- Password audit → `/passwords/audit`

### Exact post-repair inventory (34)
All 27 above plus the seven restored destinations, with Key Forge represented once. Full AR/EN display inventories in `qa-evidence/pr15/inventory-*.json`.

## Applied files / changes
- Home.jsx: canonical deduped ToolsDirectory, normalized AR/EN index independent of active locale, diacritics-insensitive typing, Backup search alias, live result count, translated empty state, aria-controls. Header search now shares the full directory rather than only eight cards, with separate result IDs. Browser testing found Escape was consumed by the search input before closing the modal; explicit dialog Escape handling now closes it in one keypress, verified.
- home.css: consistent directory title/demo-label presentation and live count/empty state styling. Prior responsive 2/3-column grid, hero max220px and eight Home cards retained.
- StagEmblem.jsx/stag.css: gradients on exact existing eye paths, stronger bounded violet-white falloff, separate .22s right-eye ignition and idle timing; original PNG and SVG path geometry unchanged. Antler trace retained. Do not claim exact-video timing/contour acceptance solely from SVG bounds.
- ar.js: result count translation.
- scripts/check-all-routes.cjs additionally asserts every canonical Home destination exists in Tools in both locales, so the normal npm check now catches the original regression.
- scripts/check-tools-search.cjs and check-visual-browser.cjs: reproducible actual Chromium regression/search/viewport/motion/screenshot checks with optional external Playwright installation. No app dependency/lockfile change.

## Actual browser execution
Playwright/Chromium 156 downloaded from supported package/CDN hosts this turn. Local Vite servers (127.0.0.1 only) serve archived reviewed PR head for BEFORE and changed source for AFTER. This is not a Vercel deploy or workaround for account restrictions. Browser tests use real components, assets, fonts and routes, not jsdom or reference bitmaps.

Commands/results:
- `npm run check`: exit 0; 44 AR/EN SSR components, 45 routes, eight Home cards, 166 links, audio mock tests and Vite build. Existing module-type warning remains. Raw npm output in qa-evidence/pr15/npm-check.txt.
- `NODE_PATH=<external playwright node_modules> node scripts/check-visual-browser.cjs`: final exit 0. Reproduced missing Secure Notes on BEFORE. Real search inputs and zero-results state, 34 unique tools, all 68 AR/EN clicked destinations; footer stable and final tool clears footer at 360x800,390x844,412x915,768x1024,1440x900 both locales. Screenshot Splash/Auth/Home/Tools at each size/locale. Opened/captured all 44 mission routes at390x844 AR/EN (88 route captures); document/main width checks found no horizontal overflow. No page JavaScript errors in this run.
- `NODE_PATH=<external playwright node_modules> node scripts/check-tools-search.cjs`: exit 0; 136 actual query-input interactions plus header HMAC search, unique result IDs, empty-state, one-key Escape close and preserved main directory: every displayed EN and AR title in both UI locales returns its existing destination. Real translated title is المصادِق; an initial test incorrectly used المصادقة and was corrected to the actual product string before successful run.
- `git diff --check`: exit 0 before commit.

## Motion evidence / measurements
- Two rain screenshots one second apart plus transforms/Y/opacity in report.json: positive-Y movement asserted; same atmosphere DOM instance survives Home→Tools navigation.
- Eye captures at animation times300ms/1700ms; computed left-eye opacity .04→.813676. Independent ignition delays0/.22s. SVG/image bounding boxes exactly coincide (304.1875-square in Splash390x844). These assertions establish alignment of coordinate systems, NOT pixel-accurate anatomical contour or owner approval.
- Real Home logo widths172.25/189.66/202.41/220/220px at the five widths respectively. Footer/scroll and overflow measurements saved in report.json.
- Reduced-motion emulation disables rain animation; screenshot included. No audio quality/listening claim.

## Images / remaining acceptance
Screenshots are actual local Chromium captures. tools-before-after.png and eye-animation-frames.png are labelled side-by-side composites of those captures, not mockups or reference images. Full capture bundle provided separately; representative PNGs tracked. Home comparison also pairs the941×1672 approved PNG (resized) with an actual441×784 viewport at the same aspect ratio; this is a comparison aid, not pixel-match approval. Open image comparisons and raw metrics for owner review; absence of horizontal overflow is not full geometric or reference match proof.

Remaining: reference-by-reference visual acceptance for all44, exact original-eye contour/video timing, full brightness/legibility judgement, physical mobile safe areas/keyboard/Back, perceptual performance and audible quality. Tools search/footer and Home footer/card-title assertions ran at all five sizes; all44 detailed screenshots/overflow were at390x844. No claim pixel-perfect or final visual handoff. Prior service artwork caps are sizing constraints, not proof all card designs match references.

Vercel status will be rechecked on published repair SHA; billing unchanged. PR15 must stay unmerged. PR14 untouched. Deployment availability and local source QA are distinct.
