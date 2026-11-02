import React from "react";

/**
 * KNOUX CIPHERGLYPH — the semantic glyph library for the desktop service set.
 *
 * Why this exists: the internal service screens resolved their icon with
 * `Mark name={s.art === "key" ? "key" : s.art === "vault" ? "folder" : "shield"}`,
 * which means every service that was neither Key Forge nor Vault rendered the
 * same generic shield, and the Tools inspector hardcoded `name="shield"` as
 * well. Forty-four distinct services rendered as three shapes, so the icon
 * carried no information.
 *
 * Rules this library holds itself to:
 *   - one glyph per canonical service, chosen for what the service *does*;
 *   - no glyph is reused across services (enforced by tests);
 *   - 24-unit grid, stroke-based duotone, so a glyph reads at 24px in the
 *     sidebar and at 64px on a card without a second asset;
 *   - the primary mark is stroked in `currentColor` and the secondary mark is
 *     filled at low opacity, which is what makes the selected state glow
 *     without changing shape.
 *
 * The eight official `service-*.webp` illustrations are untouched and remain the
 * Home card artwork; these glyphs are the navigation/identity layer, not a
 * replacement for approved brand artwork.
 */

const S = { fill: "none", stroke: "currentColor" };

export const CIPHER_GLYPHS = Object.freeze({
  // ---- shell / entry -------------------------------------------------------
  ignition: (
    <>
      <path d="M12 3v5M12 3 9.5 8.5h5L12 3Z" {...S} />
      <circle cx="12" cy="14" r="5" {...S} />
      <path d="M12 11.5v5" {...S} />
    </>
  ),
  gate: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" {...S} />
      <circle cx="12" cy="11" r="2.5" {...S} />
      <path d="M12 13.5V17" {...S} />
    </>
  ),
  hub: (
    <>
      <circle cx="12" cy="12" r="3" {...S} />
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" {...S} />
      <circle cx="12" cy="12" r="9" {...S} strokeDasharray="2 3" />
    </>
  ),

  // ---- file + text cipher --------------------------------------------------
  cipherFile: (
    <>
      <path d="M6 2h8l4 4v16H6Z" {...S} />
      <path d="M14 2v4h4" {...S} />
      <path d="M9 12h6M9 16h3" {...S} />
      <path d="M9 8.5h3" fill="currentColor" stroke="none" opacity=".35" />
    </>
  ),
  cipherText: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" {...S} />
      <path d="M7 10h10M7 14h6" {...S} />
      <path d="M15 14h2v3h-2z" fill="currentColor" stroke="none" opacity=".35" />
    </>
  ),
  vaultSafe: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" {...S} />
      <circle cx="11" cy="12" r="4" {...S} />
      <path d="M11 8v8M7 12h8" {...S} />
      <path d="M17 8v8" {...S} />
      <circle cx="11" cy="12" r="1.4" fill="currentColor" stroke="none" opacity=".4" />
    </>
  ),
  collectionGrid: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="1.5" {...S} />
      <rect x="13" y="3" width="8" height="8" rx="1.5" {...S} />
      <rect x="3" y="13" width="8" height="8" rx="1.5" {...S} />
      <path d="M14 17h6M17 14v6" {...S} />
    </>
  ),
  documentEye: (
    <>
      <path d="M5 2h9l5 5v15H5Z" {...S} />
      <path d="M14 2v5h5" {...S} />
      <path d="M8.5 14c1.5-2 5.5-2 7 0-1.5 2-5.5 2-7 0Z" {...S} />
      <circle cx="12" cy="14" r="1" fill="currentColor" stroke="none" />
    </>
  ),

  // ---- notes ---------------------------------------------------------------
  manuscript: (
    <>
      <path d="M5 3h14v18H5Z" {...S} />
      <path d="M9 3v18" {...S} />
      <path d="M12 8h4M12 12h4M12 16h3" {...S} />
      <path d="M6 3h1v18H6z" fill="currentColor" stroke="none" opacity=".3" />
    </>
  ),
  quillEdit: (
    <>
      <path d="M4 20l3-1 11-11-2-2L5 17l-1 3Z" {...S} />
      <path d="M14 5l2 2" {...S} />
      <path d="M17 3l4 4-2 2-4-4 2-2Z" {...S} />
      <path d="M4 20l1-3 2 2-3 1Z" fill="currentColor" stroke="none" opacity=".35" />
    </>
  ),

  // ---- credentials ---------------------------------------------------------
  credentialCard: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" {...S} />
      <path d="M2 10h20" {...S} />
      <path d="M6 14h5" {...S} />
      <circle cx="17.5" cy="14" r="1.8" fill="currentColor" stroke="none" opacity=".35" />
    </>
  ),
  credentialDetail: (
    <>
      <rect x="3" y="4" width="18" height="7" rx="1.5" {...S} />
      <rect x="3" y="14" width="18" height="6" rx="1.5" {...S} />
      <path d="M7 17h6" {...S} />
      <path d="M7 7.5h4" fill="currentColor" stroke="none" opacity=".4" />
    </>
  ),
  auditMeter: (
    <>
      <path d="M4 18a8 8 0 1 1 16 0" {...S} />
      <path d="M12 18 8.5 11" {...S} />
      <circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none" />
      <path d="M4 18h2M18 18h2M12 8v2" {...S} />
    </>
  ),
  timingRing: (
    <>
      <circle cx="12" cy="12" r="8.5" {...S} strokeDasharray="40 14" />
      <circle cx="12" cy="12" r="4" {...S} />
      <path d="M12 8v4l2.5 2" {...S} />
      <circle cx="12" cy="3.5" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  importSeed: (
    <>
      <path d="M12 3v10M9 10l3 3 3-3" {...S} />
      <rect x="4" y="15" width="16" height="6" rx="1.5" {...S} />
      <path d="M7 18h3" fill="currentColor" stroke="none" opacity=".4" />
    </>
  ),

  // ---- keys ----------------------------------------------------------------
  forgedKey: (
    <>
      <circle cx="8" cy="8" r="4" {...S} />
      <path d="M11 11l8 8M16 16l2-2M19 19l1.5-1.5" {...S} />
      <path d="M8 6.5v3M6.5 8h3" fill="currentColor" stroke="none" opacity=".45" />
    </>
  ),
  keyPrint: (
    <>
      <path d="M4 14c2-6 14-6 16 0" {...S} />
      <path d="M7 13v4M11 12v6M15 13v4" {...S} />
      <circle cx="12" cy="6" r="2.5" {...S} />
      <path d="M18 15c1 1 2 1 3 0" fill="currentColor" stroke="none" opacity=".35" />
    </>
  ),
  rotationPath: (
    <>
      <path d="M20 12a8 8 0 1 1-3-6" {...S} />
      <path d="M20 4v5h-5" {...S} />
      <circle cx="9" cy="12" r="2.2" {...S} />
      <circle cx="15" cy="12" r="2.2" {...S} />
      <path d="M11 12h2" fill="currentColor" stroke="none" opacity=".4" />
    </>
  ),
  derivationLayers: (
    <>
      <path d="M12 3 3 8l9 5 9-5-9-5Z" {...S} />
      <path d="M3 13l9 5 9-5" {...S} />
      <path d="M3 18l9 3 9-3" {...S} opacity=".55" />
      <circle cx="12" cy="8" r="1.6" fill="currentColor" stroke="none" opacity=".4" />
    </>
  ),
  qrFrame: (
    <>
      <path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" {...S} />
      <rect x="8" y="8" width="3" height="3" {...S} />
      <rect x="13" y="13" width="3" height="3" {...S} />
      <rect x="13" y="8" width="3" height="3" fill="currentColor" stroke="none" opacity=".4" />
    </>
  ),
  studioPen: (
    <>
      <path d="M3 21c4-1 6-3 8-7l6-9 3 2-5 8c-3 5-7 6-12 6Z" {...S} />
      <path d="M14 5l3 2" {...S} />
      <circle cx="6" cy="20" r="1.4" fill="currentColor" stroke="none" opacity=".4" />
    </>
  ),

  // ---- integrity / hashing -------------------------------------------------
  digestFingerprint: (
    <>
      <path d="M12 3a9 9 0 0 0-9 9v3" {...S} />
      <path d="M21 12a9 9 0 0 0-4.5-7.8" {...S} />
      <path d="M7 12a5 5 0 0 1 10 0v4" {...S} />
      <path d="M12 12v6M16 16v3M8 16v2" {...S} />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" opacity=".45" />
    </>
  ),
  fileIntegrity: (
    <>
      <path d="M6 2h8l4 4v16H6Z" {...S} />
      <path d="M14 2v4h4" {...S} />
      <path d="M9.5 13l2 2 4-4" {...S} />
      <path d="M9 18h6" fill="currentColor" stroke="none" opacity=".35" />
    </>
  ),
  keyedMark: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" {...S} />
      <path d="M7 10h4M7 14h7" {...S} />
      <circle cx="17" cy="10" r="2" {...S} />
      <path d="M17 12v3" {...S} />
    </>
  ),
  printCompare: (
    <>
      <path d="M6 12a6 6 0 0 1 12 0v3" {...S} />
      <path d="M9 12a3 3 0 0 1 6 0v5" {...S} />
      <path d="M3 15c0-5 4-8 9-8s9 3 9 8" {...S} opacity=".5" />
      <path d="M12 12v6" fill="currentColor" stroke="none" opacity=".4" />
    </>
  ),
  recoveryLoop: (
    <>
      <path d="M20 12a8 8 0 1 1-2.3-5.7" {...S} />
      <path d="M20 3v5h-5" {...S} />
      <path d="M12 8v4l3 2" {...S} />
      <path d="M4 12h3" fill="currentColor" stroke="none" opacity=".4" />
    </>
  ),

  // ---- signatures / certificates ------------------------------------------
  signedDoc: (
    <>
      <path d="M6 2h9l4 4v10H6Z" {...S} />
      <path d="M15 2v4h4" {...S} />
      <path d="M8 17c2-3 5-3 6 0s4 3 5 0" {...S} />
      <path d="M9 8h5" fill="currentColor" stroke="none" opacity=".35" />
    </>
  ),
  trustChain: (
    <>
      <circle cx="7" cy="7" r="3.5" {...S} />
      <circle cx="17" cy="17" r="3.5" {...S} />
      <path d="M9.5 9.5l5 5" {...S} />
      <path d="M17 4v3M20 7h-3" {...S} />
      <circle cx="7" cy="7" r="1.2" fill="currentColor" stroke="none" opacity=".45" />
    </>
  ),

  // ---- share / transfer ----------------------------------------------------
  transferNetwork: (
    <>
      <circle cx="5" cy="12" r="2.5" {...S} />
      <circle cx="19" cy="6" r="2.5" {...S} />
      <circle cx="19" cy="18" r="2.5" {...S} />
      <path d="M7.3 11l9.4-4M7.3 13l9.4 4" {...S} />
      <path d="M4 10.5h2v3H4z" fill="currentColor" stroke="none" opacity=".4" />
    </>
  ),
  twoEndpoints: (
    <>
      <rect x="2" y="8" width="7" height="9" rx="1.5" {...S} />
      <rect x="15" y="8" width="7" height="9" rx="1.5" {...S} />
      <path d="M9.5 12.5h5" {...S} />
      <path d="M13 10.5l2 2-2 2" {...S} />
      <path d="M4 11h3" fill="currentColor" stroke="none" opacity=".4" />
    </>
  ),
  wizardSteps: (
    <>
      <path d="M4 19h4v-4H4zM10 14h4v-4h-4zM16 9h4V5h-4z" {...S} />
      <path d="M8 17l2-2M14 12l2-2" {...S} />
      <rect x="16" y="5" width="4" height="4" fill="currentColor" stroke="none" opacity=".35" />
    </>
  ),
  handshake: (
    <>
      <path d="M3 10l4-3 5 3 5-3 4 3v5l-4 3-5-3-5 3-4-3v-5Z" {...S} />
      <path d="M12 10v5" {...S} />
      <path d="M7 12l2 1M17 12l-2 1" fill="currentColor" stroke="none" opacity=".4" />
    </>
  ),
  capsuleExpiry: (
    <>
      <path d="M8 4h8v3a4 4 0 0 1 0 8v3H8v-3a4 4 0 0 1 0-8V4Z" {...S} />
      <path d="M12 8v6" {...S} />
      <circle cx="12" cy="11" r="2" fill="currentColor" stroke="none" opacity=".35" />
    </>
  ),

  // ---- clipboard -----------------------------------------------------------
  clipboardTimer: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" {...S} />
      <path d="M9 4V2h6v2" {...S} />
      <path d="M12 9v4l2 1.5" {...S} />
      <circle cx="12" cy="13" r="3.5" {...S} opacity=".6" />
    </>
  ),
  clipboardTemp: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" {...S} />
      <path d="M9 4V2h6v2" {...S} />
      <path d="M9 11h6M9 15h4" {...S} />
      <path d="M14 18l3-3" stroke="currentColor" strokeWidth="2" opacity=".5" />
    </>
  ),

  // ---- random / entropy ----------------------------------------------------
  entropyParticles: (
    <>
      <circle cx="12" cy="12" r="2" {...S} />
      <circle cx="5" cy="6" r="1.3" fill="currentColor" stroke="none" opacity=".55" />
      <circle cx="19" cy="7" r="1.3" fill="currentColor" stroke="none" opacity=".4" />
      <circle cx="6" cy="18" r="1.3" fill="currentColor" stroke="none" opacity=".45" />
      <circle cx="18" cy="17" r="1.3" fill="currentColor" stroke="none" opacity=".6" />
      <path d="M12 4v3M12 17v3M4 12h3M17 12h3" {...S} />
    </>
  ),

  // ---- privacy / policy / activity ----------------------------------------
  privacyVeil: (
    <>
      <path d="M12 3c4 3 7 4 7 4v6c0 5-3.5 7.5-7 8.5C8.5 20.5 5 18 5 13V7s3-1 7-4Z" {...S} />
      <circle cx="12" cy="11" r="2.2" {...S} />
      <path d="M12 13.2V16" {...S} />
    </>
  ),
  sessionBoundary: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" {...S} />
      <path d="M3 10h18" {...S} />
      <path d="M8 14h8" strokeDasharray="2 2" {...S} />
      <rect x="3" y="6" width="18" height="4" fill="currentColor" stroke="none" opacity=".28" />
    </>
  ),
  timeline: (
    <>
      <path d="M4 5h16M4 12h16M4 19h10" {...S} />
      <circle cx="8" cy="5" r="1.8" fill="currentColor" stroke="none" opacity=".5" />
      <circle cx="16" cy="12" r="1.8" fill="currentColor" stroke="none" opacity=".5" />
      <circle cx="10" cy="19" r="1.8" fill="currentColor" stroke="none" opacity=".5" />
    </>
  ),
  advisorScan: (
    <>
      <circle cx="11" cy="11" r="6" {...S} />
      <path d="M15.5 15.5 21 21" {...S} />
      <path d="M11 8v6M8 11h6" {...S} />
      <path d="M11 5v2M11 15v2" fill="currentColor" stroke="none" opacity=".4" />
    </>
  ),

  // ---- archive / packages / metadata --------------------------------------
  sealedPackage: (
    <>
      <path d="M3 8l9-5 9 5v8l-9 5-9-5V8Z" {...S} />
      <path d="M3 8l9 5 9-5M12 13v8" {...S} />
      <path d="M9 5.5l9 5" {...S} opacity=".5" />
      <rect x="10.5" y="10" width="3" height="3" fill="currentColor" stroke="none" opacity=".4" />
    </>
  ),
  layeredContainer: (
    <>
      <path d="M12 3 4 7l8 4 8-4-8-4Z" {...S} />
      <path d="M4 12l8 4 8-4" {...S} />
      <path d="M4 17l8 4 8-4" {...S} />
      <path d="M12 3 4 7l8 4 8-4-8-4Z" fill="currentColor" stroke="none" opacity=".28" />
    </>
  ),
  strippedDoc: (
    <>
      <path d="M6 2h9l4 4v16H6Z" {...S} />
      <path d="M14 2v4h4" {...S} />
      <path d="M8 11h8M8 15h5" strokeDasharray="2 2" {...S} />
      <path d="M16 14l4 4M20 14l-4 4" {...S} />
    </>
  ),

  // ---- device / platform ---------------------------------------------------
  deviceForm: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="2" {...S} />
      <path d="M10 18h4" {...S} />
      <rect x="9" y="6" width="6" height="3" fill="currentColor" stroke="none" opacity=".35" />
      <path d="M9 12h6" {...S} />
    </>
  ),
} );

export function glyphKeys() {
  return Object.keys(CIPHER_GLYPHS);
}

export default CIPHER_GLYPHS;
