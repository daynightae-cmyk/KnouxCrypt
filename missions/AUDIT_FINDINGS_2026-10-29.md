# Repo Review — Evidence Snapshot (2026-10-29)

**Source**: public linked GitHub repo `daynightae-cmyk/KnouxCrypt`; cloned to `D:\KnouxCrypt` (clean initial checkout). SHA `21879a318402fe2429f304a0a9f6f991c66af548`, 120 tracked files. Remote branches `main`, `ai_main_4146f3426998`, `ai_main_e5af1ed16422` were found. `git rev-list --count main..branch` returned 0 for each AI branch on checked clone: no commits ahead of main. New planning branch was created from main. No original repo or worktree was deleted.

## Real architecture and routes
- `package.json`: React 18, Vite 4, Framer Motion, react-router-dom 7, Electron 32, Electron Builder; scripts use Vite `dev/build/preview`.
- `src/App.jsx` renders `ModernApp`; `src/components/modern/ModernApp.tsx` contains real routing for `/`, `/analytics`, `/encrypt`, `/disk-manager`, `/system-encryption`, `/algorithms`, `/quantum`, `/ai-assistant`, `/crypto-test`, `/live-preview`, `/vmware`, `/settings`, `/logs`.
- Desktop-specific code includes `electron/`, `electron_main/` and Windows BitLocker/VeraCrypt integration, not Android equivalents.
- UI prototypes and older variants are in `src/components/pages`, `src/components/modern`, `src/components/UI` and `.storage`.
- Some `ModernApp.tsx` pages are explicitly called Placeholder. `src/services/EncryptionService.ts` calls a mock BitLocker flow if `window.electronAPI` is not present.
- `electron_main/core/diskManager.js` contains a mock disk data comment and the Python disk analyzer documents placeholder detection.

## Critical finding — unsafe legacy cipher
`src/core/crypto/AESCipher.ts` lines approx. 98–119 apply PKCS7 padding and independently encrypt each AES block; lines approx. 131–156 reverse the process. No per-message unique nonce or IV, no authenticated mode, no integrity tag shown in that routine; confidential patterns can leak and tampered ciphertext is not reliably detected. **Do not use this encryption implementation in a new vault.** Legacy Serpent/Twofish/cascade implementations are unreviewed. Require external test vectors, reviewed authenticated primitives and security testing before customer trust.

## Claims not yet substantiated
Current README says complete local system encryption, AI protection and offline guarantees, but source review alone does not prove real behavior, complete end-to-end recoverability, crypto audit, Android compatibility, production signing, Play release or independent security assessment. README points to another old repo `Knouxai/KnouxCrypt-`; current authoritative repo is the one above. README includes placeholder banner links.

## Evidence limitations
No `node_modules` existed in fresh clone. No actual `npm build`, Gradle build, tests, CI run, APK install, key management tests, device run or screenshots were performed in this planning stage. Device free space on D was ~2.76 GB on inspection; check again later.

## Prioritized gaps
1. Authenticated encryption, key lifecycle, verified recovery and non-secret telemetry.
2. Native Android Kotlin Compose shell, navigation and local auth.
3. User-first encrypted file flow that actually encrypts/decrypts verified data.
4. Real service registry distinguishing availability from mock/demo.
5. Independent visual identity and ten clean screen reference images generated later.
6. Security tests (OWASP MASVS), Android target SDK 36, release signing and Play policy.
