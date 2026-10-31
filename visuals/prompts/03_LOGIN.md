# KNOUX CRYPT — SINGLE-SCREEN IMAGE GENERATION SPECIFICATION

**Image stage:** NOT GENERATED; this file is a future one-image prompt and implementation reference.
**Output:** one distinct independent Android portrait PNG, 1080x2400 target, no split panels, no collage, no contact sheet.
**Style reference:** `visuals/VISUAL_SYSTEM.md`; approved existing assets take precedence if owner provides them.

## Art direction shared constraints
Original premium KNOUX identity, cinematic cryptographic mystery: matte #05070D background, #070912 near-black, #7556FF controlled violet spectral light, #65F0E8 electric cyan accents, polished obsidian metallic geometry, fine encryption seal engravings, subtle realistic depth. NOT generic sci-fi hacker stock art. Sophisticated, powerful, trustworthy defensive-security app, no copied logos or brand marks from Offensive Security, Kali Linux, etc. Clear readable English labels in artwork mockup; actual app must support Arabic RTL and English LTR. App safe areas, legible system icons, honest accessibility contrast and touch sizes. No real user secrets. Generate only this one screen.

## SLOT 03 — GATE ZERO — Unlock Portal
**File name:** `visuals/generated/screen_03_login.png`
**Main screen title:** UNLOCK YOUR VAULT

### EXACT visual composition
A single native mobile identity gate. Dark portal with segmented metallic circular key lock, luminous K engraved in core, subtle violet and icy cyan half-ring on black. Top company wordmark. Beneath large portal: lock status DEVICE LOCKED, then biometric action UNLOCK WITH BIOMETRICS and alternate USE PASSPHRASE. Small local-only assurance. Perfect visual hierarchy and empty private background.

### Spatial hierarchy / visual details
Central gate ring at 37% height, title/action below, bottom secondary alternative. Body symmetrically framed without generic neon cards.

### Interaction-to-implementation contract
Biometric ring brightens only as OS BiometricPrompt starts; actual unlock awaits Keystore authorization. Cancel, denied and fallback states described. Native Android Compose should implement live controls, not render an image-only prototype. Include states: idle, ready, loading, verified, failed, locked, accessibility reduced-motion. Motion and progress are conceptual until implementation.

### Strong negatives
No facial recognition illustration implying proprietary biometric, no generic login email/password when account isn't needed, no fake timer. No multiple screens in this image, no collage, no contact sheet, no duplicate screen, no out-of-frame phone mockup, no watermarks or unrelated company branding. Must have a distinct layout from the other nine screens, while matching the KNOUX app shell and tokens.

### Quality and handoff gate
Output one full-edge 9:20 portrait screen, photorealistic premium UI, crisp text, precise subtle icons. Review icon alignment, spacing, readable contrast, truthful status, Android gestures, no clipped text. On approval, copy this exact file name into `visuals/approved/` and wire the asset mapping; preserve any previous version.
