/**
 * KNOUX CIPHERGLYPH registry — one definitive service id -> glyph mapping.
 *
 * Before this file, the icon for an internal service was derived inline:
 *   Mark name={s.art === "key" ? "key" : s.art === "vault" ? "folder" : "shield"}
 * so 41 of the 44 services rendered the same shield, and nothing anywhere could
 * answer the question "does every service have its own mark?" That question is
 * now data, and tests/cipherglyph.test.cjs answers it on every run.
 *
 * Key space: the canonical route ids from src/config/missionRoutes.js, which are
 * locale-independent and already authoritative. The three legacy aliases that
 * src/config/screens.js still uses as SERVICES ids (ENCRYPT, VAULT, INTEGRITY)
 * resolve to the same glyphs, so old call sites keep working without a second
 * naming scheme.
 *
 * Adding a service means adding one line here. If a service id has no entry,
 * KnouxServiceIcon renders a visible UNMAPPED marker and warns — it does not
 * quietly fall back to a shield, because a silent fallback is exactly what made
 * forty-four services look like three.
 */

import { MISSION_ROUTES } from "./missionRoutes";
import { SCREENS } from "./screens";

export const SERVICE_GLYPHS = Object.freeze({
  // shell / entry
  SPLASH_ENTRY: "ignition",
  SECURE_ACCESS_LOGIN: "gate",
  HOME: "hub",

  // encryption workbenches
  FILE_CIPHER: "cipherFile",
  SHADOW_VAULT: "vaultSafe",
  TEXT_CIPHER: "cipherText",
  NOTES: "manuscript",
  NOTES_EDITOR: "quillEdit",

  // encrypted inventory
  COLLECTIONS: "collectionGrid",
  DOCUMENT_VIEWER: "documentEye",

  // credentials
  PASSWORDS: "credentialCard",
  PASSWORD_DETAIL: "credentialDetail",
  PASSWORD_AUDIT: "auditMeter",
  AUTHENTICATOR: "timingRing",
  AUTH_IMPORT: "importSeed",

  // key laboratory
  KEY_FORGE: "forgedKey",
  KEY_DETAILS: "keyPrint",
  KEY_DERIVATION: "derivationLayers",
  VAULT_KEY_ROTATION: "rotationPath",
  PUBLIC_KEY_QR: "qrFrame",

  // integrity / authentication
  HASH_INTEGRITY: "digestFingerprint",
  FILE_INTEGRITY: "fileIntegrity",
  HMAC_AUTHENTICITY: "keyedMark",
  FINGERPRINT_VERIFY: "printCompare",

  // signatures / trust
  SIGNATURE: "signedDoc",
  SIGNATURE_STUDIO: "studioPen",
  CERTIFICATE_INSPECTOR: "trustChain",

  // packaging / inspection
  ARCHIVE: "sealedPackage",
  PACKAGE_INSPECTOR: "layeredContainer",
  METADATA_CLEANER: "strippedDoc",

  // transfer / sharing
  SECURE_SHARE: "transferNetwork",
  LOCAL_TRANSFER: "twoEndpoints",
  TRANSFER_WIZARD: "wizardSteps",
  DEVICE_PAIRING: "handshake",
  SECRET_CAPSULE: "capsuleExpiry",

  // clipboard / entropy
  CLIPBOARD_GUARD: "clipboardTimer",
  SECURE_CLIPBOARD: "clipboardTemp",
  SECURE_RANDOM: "entropyParticles",

  // policy / privacy / audit
  PRIVACY: "privacyVeil",
  SESSION_PRIVACY: "sessionBoundary",
  SECURITY_ACTIVITY: "timeline",
  OFFLINE_ADVISOR: "advisorScan",

  // recovery
  BACKUP: "recoveryLoop",

  // cross-platform preview (Android-owned capability surfaced on Desktop)
  AUTOFILL: "deviceForm",

  // legacy aliases kept so existing SERVICES ids resolve
  ENCRYPT: "cipherFile",
  VAULT: "vaultSafe",
  INTEGRITY: "digestFingerprint",
});

/**
 * Capability-registry ids that differ from the route ids.
 *
 * desktopCapabilities.js keys two cards as PRIVACY_CENTER and ANDROID_AUTOFILL
 * while missionRoutes.js calls those services PRIVACY and AUTOFILL, so
 * capabilityById(routeId) returned null for both and their Tools-directory
 * status chip silently disappeared. The alias lives here, in one place, instead
 * of being re-derived at each call site.
 */
export const CAPABILITY_ALIASES = Object.freeze({
  PRIVACY: "PRIVACY_CENTER",
  AUTOFILL: "ANDROID_AUTOFILL",
});

export function capabilityIdFor(serviceId) {
  return CAPABILITY_ALIASES[serviceId] || serviceId;
}

export function glyphFor(serviceId) {
  if (typeof serviceId !== "string") return null;
  return SERVICE_GLYPHS[serviceId] || null;
}

/** Every canonical route id, including the three non-service entry routes. */
export function canonicalServiceIds() {
  return MISSION_ROUTES.map((route) => route.id);
}

/** Route ids that are services rather than entry/navigation chrome. */
export const CHROME_ROUTE_IDS = Object.freeze(["SPLASH_ENTRY", "SECURE_ACCESS_LOGIN", "HOME"]);

export function serviceRouteIds() {
  return canonicalServiceIds().filter((id) => !CHROME_ROUTE_IDS.includes(id));
}

/**
 * Used by the test suite: which canonical ids have no glyph, and which ids in
 * the registry are not real routes (i.e. stale entries).
 */
export function iconCoverage() {
  const canonical = canonicalServiceIds();
  const aliasIds = Object.keys(SERVICE_GLYPHS).filter((id) => !canonical.includes(id));
  const missing = canonical.filter((id) => !SERVICE_GLYPHS[id]);
  const routed = Object.keys(SERVICE_GLYPHS).filter((id) => !SCREENS[id] && canonical.includes(id));
  return { total: canonical.length, missing, aliases: aliasIds, unmappedRoutes: routed };
}

export default SERVICE_GLYPHS;
