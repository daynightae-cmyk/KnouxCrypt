# KNOUX CRYPT — SINGLE-SCREEN IMAGE GENERATION SPECIFICATION

**Image stage:** NOT GENERATED; this file is a future one-image prompt and implementation reference.
**Output:** one distinct independent Android portrait PNG, 1080x2400 target, no split panels, no collage, no contact sheet.
**Style reference:** `visuals/VISUAL_SYSTEM.md`; approved existing assets take precedence if owner provides them.

## Art direction shared constraints
Original premium KNOUX identity, cinematic cryptographic mystery: matte #05070D background, #070912 near-black, #7556FF controlled violet spectral light, #65F0E8 electric cyan accents, polished obsidian metallic geometry, fine encryption seal engravings, subtle realistic depth. NOT generic sci-fi hacker stock art. Sophisticated, powerful, trustworthy defensive-security app, no copied logos or brand marks from Offensive Security, Kali Linux, etc. Clear readable English labels in artwork mockup; actual app must support Arabic RTL and English LTR. App safe areas, legible system icons, honest accessibility contrast and touch sizes. No real user secrets. Generate only this one screen.

## SLOT 10 — RECOVERY CHAMBER — Security Settings
**File name:** `visuals/generated/screen_10_settings.png`
**Main screen title:** RECOVERY & CONTROL

### EXACT visual composition
A meticulous futuristic settings screen anchored by a giant physically split vault seal (two halves signify encryption key and separately stored recovery package), header PROTECT YOUR ACCESS. Under it a strongly defined RECOVERY STATUS card labeled BACKUP NOT YET VERIFIED sample state; primary CREATE ENCRYPTED BACKUP. Secondary personalized settings list: LOCK TIMEOUT, BIOMETRIC SETTINGS, LANGUAGE عربي / EN, LOCAL STORAGE, PERMISSIONS, SERVICE CATALOG, ABOUT KNOUX, all with distinct subtle geometric toggle treatments. Bottom nav with Settings active.

### Spatial hierarchy / visual details
Proportion hero 28%, actions 30%, settings 42%. Black chrome + violet seam; avoid fake 100% status. Clear vertical scrolling hierarchy; Android 9:20 portrait.

### Interaction-to-implementation contract
Recovery card unfolds two independent layers with a review checkpoint; settings controls reflect actual Android state and preserve safety. Native Android Compose should implement live controls, not render an image-only prototype. Include states: idle, ready, loading, verified, failed, locked, accessibility reduced-motion. Motion and progress are conceptual until implementation.

### Strong negatives
No recovery phrase or real personal identifiers on art, no contradictory backup verified badge, no fake cloud sync. No multiple screens in this image, no collage, no contact sheet, no duplicate screen, no out-of-frame phone mockup, no watermarks or unrelated company branding. Must have a distinct layout from the other nine screens, while matching the KNOUX app shell and tokens.

### Quality and handoff gate
Output one full-edge 9:20 portrait screen, photorealistic premium UI, crisp text, precise subtle icons. Review icon alignment, spacing, readable contrast, truthful status, Android gestures, no clipped text. On approval, copy this exact file name into `visuals/approved/` and wire the asset mapping; preserve any previous version.
