# Screens 06–11: implementation and deferred visual review

The owner requested continued repository work while payment/preview availability is handled separately. These screens are implemented and locally checked, **not visually accepted**. No reference image is presented as a screenshot of this implementation.

## Active routes

| Mission | Route | Parent |
| --- | --- | --- |
| 06 Secure Notes | `/notes` | Home |
| 07 Notes Editor | `/notes/editor/project` (or selected in-memory draft ID) | Notes |
| 08 Passwords | `/passwords` | Home |
| 09 Password Detail | `/passwords/detail/sample-1` | Passwords |
| 10 Authenticator | `/authenticator` | Home |
| 11 Auth Import | `/authenticator/import` | Authenticator |

All routes reuse the existing Router, persistent AppShell, descending cipher atmosphere, transparent stag, shared language provider, local Arabic font and existing sound controls. Notes list uses the shared anchored primary navigation; child screens preserve their parent Back links.

## Local checks performed

- `npm run build` passes. Repository has no standalone lint/typecheck scripts.
- Focused jsdom reproductions for Notes: initial three samples, Arabic search/empty result/category filters, list-to-editor routing, title/body edits, whole-body formatting toggles, checklist editing/toggling, visual lock switch, nonpersistent save confirmation, parent Back retains memory, new draft and empty-title save guard, reload resets state, unknown-draft fallback.
- Passwords: six masked fictional records, reveal, public-sample clipboard text, categories, Arabic search, detail routing/edit state, read-only public sample password, generator length bounds 8–64 and all-character-sets-disabled guard. Generator is deterministic/public and explicitly unsuitable for real credentials.
- Authenticator: four masked sample accounts, disabled copy controls, 30-second demo countdown and wrap, interval cleanup, camera-free scan panel, disabled seed entry, manual-setup explanatory feedback. Import source selection, unsupported-format panel, fake export selection, account checkboxes, disabled CTA guards, non-completion preview and return to unchanged accounts.
- Source checks: six explicit routes; reduced-motion overrides in all three screen stylesheets; no persistence/network/camera/crypto API calls in new state/workflow modules.
- The DOM tests use a temporary external jsdom harness, not a newly added repository test framework. Timer test controls Date/interval callbacks; it is not a real-device timer accuracy test.

## Owner review checklist when preview is available

1. Set English and compare each route with its own `agent-handoff/KNOUX_CRYPT/**/REFERENCE.png`, then test Arabic/RTL at 360×800, 390×844, 412×915 and desktop. Capture actual screenshots. Compare typography, logo clearance, spacing, gradients and clipping; refine before visual acceptance.
2. Notes: filter/search, select a card, edit fictional text, checklist and category, Save -> read explicit memory-only notice. Back must retain edited draft; reload must reset. Unknown draft links must explain missing in-memory data.
3. Passwords: no real credentials. Reveal the public sample, select categories, open details, adjust public generator 8–64, disable all character sets. Copy may require a secure browser context and permission; error feedback must not claim success.
4. Authenticator: codes stay masked and copy disabled. Watch demo countdown; inspect Scan and Manual panels. Import must never open a device/camera picker or accept real seeds. Review sample account selection; final action must never claim import completed.
5. Keyboard/focus, Arabic line wrapping, physical keyboard, safe-area/footer clearance, reduced-motion visual behavior and foreground animation timing still need browser/device review.

## Limits

- No current running-app screenshot is attached: visual review is deferred as explicitly requested by the owner after Vercel's prior 402 overdue-balance restriction.
- These are first-pass reference-guided React layouts, not claimed pixel-identical. Foreground illustration/icon details and exact reference geometry remain unverified until rendered comparison.
- Notes and account labels live only in page memory; they are not secure storage. Never type private notes or credentials. Generated samples are not cryptographically random. OTP generation/verification, real scanning, imports, seed storage, encryption and autofill are not implemented.
- Formatting applies to the entire textarea; it is not a selection-based rich-text engine.
- “Add Secret” is explicitly a fictional sample-draft preview, not a functioning credential store.
- Autofill and Password Audit remain labeled holding destinations for their later numbered missions.

## Remaining sequence

12 Key Forge, 13 Key Details, 14 Privacy, 15 Recovery, 16 Secure Share, then the remaining numbered child services. Earlier screens 01–05 and global motion retain deferred visual-review items from their prior reports. Do not label the whole 44-screen queue complete.
