# NATIVE EXPERIENCE EVIDENCE — Living Stag, Audio, Launcher — 2026-11-01

Branch `android/native-implementation-20261031` · baseline `8b36d8d` · status **IMPLEMENTED_UNVERIFIED on device** (visual/audio behaviour not observed this pass).

## Living stag (TASK B)

- `LivingStag.kt` (designsystem) draws additive overlays over the untouched 480×480 RGBA PNG
  (verified: real alpha, 151,065 transparent pixels, opaque bbox x42–437 / y6–473): independent
  eye halos + tilted slits at measured centres (0.386/0.648 × 0.553), two antler ridges with a
  travelling light and trail, ≤10 motes and one short spark every ~6.8 s.
- Eye intensity is two `Animatable`s on independent random cycles (ignite → irregular flicker →
  dim to ~0.10 → surge), so the eyes never pulse in lockstep. The old whole-logo breathing halo is
  kept underneath. All geometry is normalised to the fitted square, so it scales with any size.
- Lifecycle: animation runs only while the lifecycle is ≥ STARTED and the view is attached;
  `LocalReducedMotion` freezes both eyes at a soft 0.32 with no motes or sparks. Only frame-time
  arithmetic and small draws run per frame; no bitmaps are allocated in the draw loop.

## Cinematic audio (TASK C)

- Original assets synthesised for this project (no third-party material): 19.5 s seamless ambient
  bed (layered 55/82.5/110/164.8 Hz drones, 41.2 Hz sub pulses, band-limited “encrypted signal”
  texture, metallic shimmer, half-second seam crossfade, 839 KiB) plus tap/copy/confirm/unlock/error
  one-shots (total ~83 KiB) in `res/raw`.
- `AudioController`: looping `MediaPlayer` with 0.9 s fades, `SoundPool` for interface sounds,
  `AUDIOFOCUS_GAIN` request with pause-on-loss/resume-on-gain, foreground/background hooks from
  `MainActivity`, release on destroy, and a silent fallback if an asset cannot be prepared.
- `AudioPolicy` + persisted `AppSettings` (DataStore, nonsecret): master switch default **off**,
  ambient 55 %, interface 70 %, both clamped and validated. Privacy Center gained the controls plus
  an honest preview (“sound check only”). Unlock/gate-rotation confirmations play only after the
  domain call succeeded; failures never play a success sound.

## Launcher icon (TASK D)

`mipmap-anydpi-v26/ic_launcher(.round)` use the approved stag as an inset (20 %) foreground over a
`#05070D` obsidian background, with a monochrome layer for themed icons. No white plate, no
redesign; the manifest now points at the adaptive icon. Launcher masking is system-controlled and
not claimed as pixel-exact.

## Verification

- Compiles in `:core:designsystem` and `:app`; full JVM suite 196 tests green afterwards.
- APK installed and cold-started on the itel S686LN with an empty crash buffer; audio stays silent
  until enabled by design.
- **Not verified:** eyes/particles/sparks appearance, reduced-motion frame, audio character,
  focus-steal behaviour by a real call, and launcher rendering on the home screen. These need the
  owner present (unlock only where relevant; audio and launcher need no biometric).
