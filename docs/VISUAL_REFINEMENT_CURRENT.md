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

# Follow-up: final-reference correction round (baseline c42f26f)

Owner rejected prior fidelity despite P0 navigation repair. This round is VISUAL ONLY, no merge/native/PR14 changes.

## Targeted presentation changes
- Home: replace single faint ellipse with locally rendered curved violet light ribbons (SVG strokes with core/bloom/thread),12 deterministic hero sparks and stronger haze, not a screenshot background. Original transparent stag PNG and path geometry remain unchanged. Hero reserves140–168px at tested mobile sizes instead of ~219px square +padding; tighten brand/divider/caption/status spacing without shrinking entire app or scaling text. Card minimum title12px and description10px; richer inset glass/highlight/shadow. Natural scrolling remains allowed for constrained screens or larger text.
- Tools: category-first entry (eight Essentials). Four meaningful groups use canonical service IDs: Essentials, Files & Vault, Keys & Identity, Privacy & Sharing; All tools exposes all34 on demand. Search always crosses groups, including labels in both languages. Category buttons wrap in a grid, not a scrolling horizontal strip. Header and categories stay sticky within existing vertical scroll region; primary footer unchanged. First browser pass caught category/header overlap on wide screens; bounded Tools header controls to44px and type22/10px, sticky category offset60px fixes measured overlap at all five widths.
- Logo: add two soft white-violet reflective glints, clipped to exact existing eye-light contours, each separately delayed, opening flare then restrained breathing. Bloom remains outside as lighting only; artwork pixels untouched. Clipping and original contours do not prove anatomical approval; original video timing/perceptual flare still subject to visual review.
- Global rain: layered depth opacity .045/.075 → .11/.16 to make cybersecurity terms perceptible; deterministic12 columns/positive-Y paths/durations/persistent host retained. Foreground controls unchanged. Reduced motion remains enforced.

## Current actual local browser evidence
Source-serving Vite on loopback, supported Chromium156/Playwright. Before source c42f26f served separately at4175; after4174. No account restriction bypass, billing or external publish by these servers.

At actual441×784 (Home reference aspect ratio), with local fonts loaded:
| Measure | Before EN | After EN | Before AR | After AR |
|--|--:|--:|--:|--:|
| First card top |477.98|357.81|486.63|366.70|
| Last card bottom |785.61|662.50|811.88|683.95|
| Footer top |692|692|692|692|
| Hero total height |384.41|274.23|393.05|283.13|
Thus all eight cards clear the initial footer at the reference ratio in both locales (not by unreadable global scaling). At360px English longer labels may require ordinary scrolling; do not force-fit by reducing type below floors. Actual comparison PNG presents reference/before/after, not an approval or an asserted percentage match.

Default Tools390×844: measured scrollHeight816/client816 in AR and EN, replacing previous~1739/816 all34 list. Optional All tools intentionally permits longer vertical content; no destination is removed. Each category stays short, and union of four categories is exactly34 distinct existing paths, verified.

Commands:
- `npm run check`: exit0, raw `qa-evidence/pr15-fidelity/npm-check.txt`; existing module-type warning, no visual approval inferred.
- `NODE_PATH=<external playwright> QA_OUTPUT=<evidence> node scripts/check-tools-categories.cjs`: exit0,10 width/locale combinations, category union34, search outside selected group, active-state, sticky header/category clearance and compact default390 height. Raw category-report.json.
- `NODE_PATH=<external playwright> node scripts/check-tools-search.cjs`: exit0,136 cross-language real input queries +header HMAC search/empty/Escape; clicks All tools when intentionally inventory-checking.
- `NODE_PATH=<external playwright> node scripts/check-visual-browser.cjs`: full real browser suite retaining68 destination clicks, all five representative primary-screen viewport/locale combinations,88 detailed route captures at390, positive-Y persistent rain, separate eye timing and reduced-motion checks. This suite now explicitly selects All tools for full-inventory tests, not falsely treating default8 as loss of destinations.
- `git diff --check`: exit0.

Tracked comparisons: Home approved/before/after at reference aspect; Splash/eye frames; Login, FileCipher and Vault approved/runtime pairings preserve each image aspect (actual viewport may naturally require scrolling, unlike full reference). Category controls AR/EN/mobile/desktop captures and raw logs in evidence directory; complete capture archive delivered separately. No transcribed bitmap controls.

## Remaining differences / not final handoff
Reference ribbons/particles are bespoke artwork; the current live SVG/particle reconstruction is not byte/pixel-identical to them. Typography, icon/artwork fidelity and full reference density across services remain imperfect; no screen-by-screen44 visual approval claimed. Eye glints are now bounded and animated, but exact visible anatomical match and subjective cinematic quality/timing need owner/video review. Low-opacity rain visibility/foreground balance has screenshots and transform checks, not physical-device performance certification. Native device keyboard/safe areas/audio listening remain unverified. No new service-specific foreground layout redesign in this round beyond Home/Tools/shared atmosphere. Full44 route captures are QA evidence, not proof every detailed control state matched the reference.

No merge or final visual-completion declaration. PR14/native branch untouched. Vercel deployment status must be read for updated publication SHA; never infer deploy success from local QA.

### Cold-load regression caught and corrected before publication
The first frozen full-browser pass returned eight inner-Home overflow warnings even though its route/interaction assertions passed. The report was not accepted as visual PASS. On cold load, `width:auto;height:100%` inside the fixed-height grid resolved the aspect-ratio logo span from the full parent width (297–349px), not its reserved140–168px. This protruded into the content below and ribbon edges expanded scrollWidth. HMR-only captures had masked this.

Correction: explicit shared hero-size custom property sets BOTH width and height on `.hub-stag-hero > .hub-final-stag`, with higher specificity than the base logo rule; image gets matching dimensions. Local hero decor is contained inside its actual region, ribbons/sparks no longer use negative horizontal insets. The original artwork remains unchanged. `check-visual-browser.cjs` now hard-fails any main inner overflow instead of only collecting warnings. The failed-warning report is preserved as `cold-load-warning-before-fix.json`; only the subsequent repaired-source report represents final checks. No claim that the first frozen run had zero warnings.
