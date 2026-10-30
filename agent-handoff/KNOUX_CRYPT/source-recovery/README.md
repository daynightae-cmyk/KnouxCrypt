# Anima screenshot-to-source recovery — INCOMPLETE / REFERENCE-ONLY

These seven TSX/TS files are preliminary manually transcribed snippets from the user's Anima code screenshots (Desktop.zip). They are NOT a complete application, have NOT been proven pixel-identical or built, and MUST NOT replace or be copied wholesale over the current functioning KnouxCrypt src tree.

Recovered files:
- provisional/src/routes.tsx
- provisional/src/screenRegistry.ts
- provisional/src/index.tsx
- provisional/src/sections/MotionControls.tsx
- provisional/src/components/ui/toaster.tsx
- provisional/src/hooks/use-mobile.ts
- provisional/src/lib/utils.ts

Still pending EXACT source transcription from earlier screenshots:
- src/App.tsx; src/index.css (60,641px high screenshot)
- src/sections/StagEmblem.tsx; SecureAccessLogin.tsx; HomePlaceholder.tsx
- src/sections/EntrySensor.tsx; DeferredToolScreen.tsx; BrandIdentity.tsx; AmbientAtmosphere.tsx
- src/hooks/use-toast.ts; src/components/ui/toast.tsx; src/lib/brandAssets.ts
- scripts/build.mjs, workspace notes
- package.json and build/config details, master transparent asset were not in that screen-capture recovery bundle.

The previous recovery bundle was named KNOUX_CRYPT_ANIMA_SOURCE_RECOVERY_V1.zip, containing the screenshot evidence and tracking metadata. The bundle itself has not been copied into this Git commit. Treat these text snippets as optional design/architecture clues only; prioritize the current working Git code, shipped approved reference PNGs and task requirements.

NEVER report these snippets as a completed exact extraction or as passing a build. If the user sends remaining screenshots, incrementally transcribe, review, and compare without guessing missing source.
