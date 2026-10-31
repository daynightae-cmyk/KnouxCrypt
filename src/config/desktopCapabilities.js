// Desktop service capability registry.
//
// Every card must expose platformCapability, permissionNeeds, requiresNetwork,
// providerReady, realTestEvidence and displayStatus. displayStatus may only be
// ACTIVE/VERIFIED when the evidence names a test that actually runs in this
// repository (see scripts/check-capabilities.cjs, which enforces this).

export const DISPLAY_STATUS = Object.freeze({
  PLANNED: "PLANNED",
  PARTIAL: "PARTIAL",
  ACTIVE: "ACTIVE",
  VERIFIED: "VERIFIED",
  UNAVAILABLE: "UNAVAILABLE",
});

export const DESKTOP_CAPABILITIES = Object.freeze([
  {
    id: "SPLASH_ENTRY",
    title: "Splash & Entry Sequence",
    platformCapability: "Electron BrowserWindow with frameless cinematic splash, 3s timed hand-off to the main window, sandboxed renderer.",
    permissionNeeds: [],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "scripts/electron-lifecycle-check.cjs (boots the real main.js, observes splash -> main window hand-off, built renderer mount, sandboxed preload)",
      "tests/electron-hardening.test.cjs (CSP, navigation denial, no admin requirement, packaging files)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "The splash-to-main hand-off, built-renderer loading and sandboxed preload are verified by a real Electron process run on Linux. Windows EXE execution is still unverified in this environment.",
  },
  {
    id: "SECURE_ACCESS_LOGIN",
    title: "Secure Access",
    platformCapability:
      "Real local vault enrollment and unlock. PBKDF2-HMAC-SHA256 (600k iterations) wraps a random 256-bit vault key; the key is held only in the Electron main process.",
    permissionNeeds: [],
    requiresNetwork: false,
    providerReady: false,
    realTestEvidence: [
      "tests/vault-session.test.cjs (enroll, unlock, lockout, revocation, idle lock, guest isolation)",
      "tests/vault-ipc.test.cjs (channel registration, payload validation, typed errors)",
      "tests/preload-contract.test.cjs (bridge surface, fail-closed legacy invoke, allow-listed events)",
      "scripts/electron-runtime-check.cjs (real Electron process: enroll and unlock across the IPC boundary)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Password enrollment/unlock, session revocation and lockout are implemented and covered by automated tests. Biometrics, GitHub OAuth and Passkey are explicitly NOT configured and are labelled as such in the UI.",
  },
  {
    id: "HOME",
    title: "Command Home",
    platformCapability: "Dashboard reads live vault status (enrolled/locked/unlocked/guest) and the real main-process activity log over IPC.",
    permissionNeeds: [],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/vault-service.test.cjs (status reflects real enrollment and session state)",
      "scripts/check-all-routes.cjs (Home renders in ar and en)",
      "tests/electron-hardening.test.cjs (legacy disk surface fails closed so no fabricated drive status is shown)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Status text is derived from the vault service. The legacy disk/volume provider is absent, so those screens report unavailable instead of fabricated 'protected' statuses.",
  },
  {
    id: "FILE_CIPHER",
    title: "File Cipher",
    platformCapability:
      "Streaming authenticated file encryption with AES-256-GCM in 1 MiB chunks, HKDF-SHA256 key separation, plaintext SHA-256 digest, trailing HMAC-SHA256, atomic temp-file commit and cancellation.",
    permissionNeeds: [],
    requiresNetwork: false,
    providerReady: true,
    realTestEvidence: [
      "tests/vault-engine.test.cjs (corruption, truncation, chunk reorder, wrong key, path conflict, abort cleanup)",
      "tests/vault-service.test.cjs (end-to-end file encrypt/decrypt, cancellation, revoked session)",
      "tests/vault-ipc.test.cjs (file operation IPC validation)",
      "scripts/electron-runtime-check.cjs (real Electron process: encrypt/decrypt round trip, tamper and truncation rejection)",
    ],
    displayStatus: DISPLAY_STATUS.ACTIVE,
    displayStatusReason:
      "Real authenticated encryption with negative tests for corrupted files, wrong passwords, aborted writes, revoked sessions and path conflicts, exercised in a real Electron process. Windows EXE runtime verification is still pending.",
  },
]);

export function capabilityById(id) {
  return DESKTOP_CAPABILITIES.find((card) => card.id === id) || null;
}

export default DESKTOP_CAPABILITIES;
