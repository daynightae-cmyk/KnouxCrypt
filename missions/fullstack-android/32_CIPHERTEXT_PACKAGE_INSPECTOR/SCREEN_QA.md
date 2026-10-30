# 32_CIPHERTEXT_PACKAGE_INSPECTOR / Native visual QA

State: REFERENCE_MATCHED; VISUAL_RUNTIME_NOT_TESTED; ANDROID_NOT_IMPLEMENTED.
Canonical reference: agent-handoff/KNOUX_CRYPT/03_HOME/01_ENCRYPT_FILES/SERVICES/32_CIPHERTEXT_PACKAGE_INSPECTOR/REFERENCE.png
Anima UI interaction prompt: visuals/ANIMA_MISSIONS_01-44/32_CIPHERTEXT_PACKAGE_INSPECTOR/32_CIPHERTEXT_PACKAGE_INSPECTOR.txt
Reference reconciliation: SHA256_IDENTICAL
Local reference SHA256: c0596761dd91da8bdf7b29a03235f8a8435887708c27bf3246d1fcf30b20b4f9

Required before implementing: read TASK.md, 00_VISUAL_QA_HANDOFF.md, actual merged React source for this mission and the two reference files.

## Acceptance
- Preserve the approved stag-K asset, typography, panel order, padding, violet-on-obsidian identity, icons and bottom navigation. The screenshot is only a design reference; build native Compose components.
- Confirm top/bottom safe-area balance and no overlapping logo, headings, cards or footer. Center the whole Auth group only when its reference requires it, not every page.
- Provide all reference-visible controls with local and native states: pressed, selected, loading, disabled, sheet, navigation, error and clear Back behavior.
- Use meaningful screen-specific purple cinematic motion and restrained embers behind controls. Limit particle count and disable animations for reduced-motion; no sound on first paint.
- Match Arabic RTL and English LTR with correct text wrap, 360x800, 390x844 and 412x915 mobile viewports and large text.
- Check Back from the screen, modal dismissal, child-to-parent route and deep-link auth gating using native Navigation Compose. Demo Guest never unlocks real vault data.
- Never call a simulated crypto/OTP/biometric/backup result VERIFIED. Real service is separately gated by TASK.md acceptance tests and platform capability.

## Evidence needed
- Source baseline SHA, implemented Android SHA, device model/API, screenshot paths for the reference and actual runtime, measured differences and approved exceptions.
- Automated Compose preview/screenshot and instrumented navigation/gestures/accessibility tests, plus functional domain positive/negative results from TASK.md.
- Record acceptance in EVIDENCE.md when actually performed. Until then keep state NOT_TESTED.

<!-- PR15_VISUAL_BASELINE_V1 -->
## PR #15 visual baseline overlay (2026-10-31)
- Visual code baseline: main merge 'de01b23f9a010cb3743bc117bb3b78c2bb5ee86c' from PR #15 head 'f836a5c8e7c2e03a94f06fa8dc22a3cb5c702f55'.
- Shared current acceptance, provenance and unresolved visual exceptions: 'missions/fullstack-android/POST_PR15_VISUAL_BASELINE.md'. This addendum supersedes any older source SHA or browser NOT_TESTED statement above; the original task's native/device verification remains untested until actually executed.
- Apply screen-specific canonical reference and actual merged React UI, with independent Compose screenshot and interaction checks. No screenshot-backed interactive UI.
- Preserve cross-screen Tools inventory of 34 unique destinations, AR/EN search, categorized default and anchored navigation; compare the screen against its canonical PNG. Record any approved mismatch in this task's eventual EVIDENCE.md.
- React browser checks do NOT make native Android/crypto tests pass; status remains PLANNED unless independently implemented and evidenced.
