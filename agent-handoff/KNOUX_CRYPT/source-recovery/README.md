# Anima screenshot-derived source recovery — PROVISIONAL ONLY

The user provided 9 additional screenshot images of Anima project configuration/code. They are supplemental implementation clues, NOT a build-tested export of Anima, and MUST NOT overwrite any working files in the KnouxCrypt repository.

Prior 7 provisional text files:
- src/index.tsx, src/routes.tsx, src/screenRegistry.ts
- src/sections/MotionControls.tsx
- src/components/ui/toaster.tsx
- src/hooks/use-mobile.ts, src/lib/utils.ts

This batch adds:
- package.json
- postcss.config.js
- tailwind.config.js
- tsconfig.json
- tsconfig.app.json
- tsconfig.node.json
- vite.config.ts (recovered as an approximation; compare with screenshot 126)
- README.md (template instructions, distinct from live repo README)

Screenshot 127 shows src/index.tsx that is already present in provisional/src; DO NOT DUPLICATE. The screenshot 126 is vite.config.ts, NOT scripts/build.mjs. The custom scripts/build.mjs file is still NOT supplied. The screenshots DO NOT include full source of App.tsx, index.css or the detailed Splash/Login/Home UI components; do not falsely mark them recovered.

CAUTION: The screenshot's package.json, vite.config.ts and Tailwind settings may have subtle OCR/transcription ambiguity. Verify version numbers/imports against the screenshot and package compatibility before any implementation. No production build is claimed from these isolated provisional files.

Current priority: latest owner design overrides > same-screen up-to-date PNG > existing verified running React components > provisional Anima snippets.

Key visual requirements: preserve original stag-K, one shared viewport and dark-purple theme, persistent vertically FALLING code glyph background from top to bottom, functional Guest, appropriate per-screen motion, and screenshot evidence after every completed mission.
