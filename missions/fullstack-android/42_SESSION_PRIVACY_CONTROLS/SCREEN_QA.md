# 42_SESSION_PRIVACY_CONTROLS / Native visual QA

State: REFERENCE_MATCHED; VISUAL_RUNTIME_NOT_TESTED; ANDROID_NOT_IMPLEMENTED.
Canonical reference: agent-handoff/KNOUX_CRYPT/03_HOME/07_PRIVACY_CENTER/SERVICES/42_SESSION_PRIVACY_CONTROLS/REFERENCE.png
Anima UI interaction prompt: visuals/ANIMA_MISSIONS_01-44/42_SESSION_PRIVACY_CONTROLS/42_SESSION_PRIVACY_CONTROLS.txt
Reference reconciliation: SHA256_IDENTICAL
Local reference SHA256: d438cc84d521cc21072d8de94267a3b22664eafa32e17a4a334759931e53114f

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
