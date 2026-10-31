// Capability-registry gate.
//
// Every service card must expose platformCapability, permissionNeeds,
// requiresNetwork, providerReady, realTestEvidence and displayStatus. A card may
// only claim ACTIVE or VERIFIED if its evidence names files that exist in this
// repository and those files actually contain assertions. This prevents a
// decorative animation from being promoted to a "completed security service".
//
// Run: node scripts/check-capabilities.cjs
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const esbuild = require("esbuild");

const root = path.resolve(__dirname, "..");
const REQUIRED = ["id", "title", "platformCapability", "permissionNeeds", "requiresNetwork", "providerReady", "realTestEvidence", "displayStatus"];
const EVIDENCE_CLAIMING = new Set(["ACTIVE", "VERIFIED"]);

function loadRegistry() {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, "src/config/desktopCapabilities.js")],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "knoux-capabilities-"));
  const file = path.join(dir, "capabilities.cjs");
  fs.writeFileSync(file, result.outputFiles[0].contents);
  try {
    return require(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function referencedFiles(evidence) {
  const found = new Set();
  for (const line of evidence) {
    for (const m of line.matchAll(/((?:tests|scripts)\/[A-Za-z0-9_.-]+)/g)) found.add(m[1]);
  }
  return [...found];
}

const { DESKTOP_CAPABILITIES, DISPLAY_STATUS } = loadRegistry();
const allowed = new Set(Object.values(DISPLAY_STATUS));
const problems = [];
let verified = 0;

assert.ok(Array.isArray(DESKTOP_CAPABILITIES) && DESKTOP_CAPABILITIES.length > 0, "registry must be a non-empty array");

for (const card of DESKTOP_CAPABILITIES) {
  const label = card.id || "(missing id)";
  for (const field of REQUIRED) {
    if (!(field in card)) problems.push(`${label}: missing field ${field}`);
  }
  if (!allowed.has(card.displayStatus)) problems.push(`${label}: invalid displayStatus ${card.displayStatus}`);
  if (typeof card.requiresNetwork !== "boolean") problems.push(`${label}: requiresNetwork must be boolean`);
  if (typeof card.providerReady !== "boolean") problems.push(`${label}: providerReady must be boolean`);
  if (!Array.isArray(card.permissionNeeds)) problems.push(`${label}: permissionNeeds must be an array`);
  if (!Array.isArray(card.realTestEvidence) || card.realTestEvidence.length === 0) {
    problems.push(`${label}: realTestEvidence must be a non-empty array`);
    continue;
  }
  if (EVIDENCE_CLAIMING.has(card.displayStatus)) {
    const files = referencedFiles(card.realTestEvidence);
    if (!files.length) problems.push(`${label}: ${card.displayStatus} requires evidence naming a test or script file`);
    for (const rel of files) {
      const abs = path.join(root, rel);
      if (!fs.existsSync(abs)) {
        problems.push(`${label}: evidence references missing file ${rel}`);
        continue;
      }
      const body = fs.readFileSync(abs, "utf8");
      // Accept node:test suites and the runtime scripts that use a check() helper.
      if (!/\btest\(|\bassert\.|\bcheck\(/.test(body)) {
        problems.push(`${label}: evidence file ${rel} contains no test or assertion`);
      }
    }
    if (!card.displayStatusReason) problems.push(`${label}: ${card.displayStatus} requires a displayStatusReason`);
    verified += 1;
  }
}

console.log("Capability registry gate");
for (const card of DESKTOP_CAPABILITIES) {
  console.log(`  ${card.id.padEnd(20)} ${card.displayStatus.padEnd(10)} network=${String(card.requiresNetwork).padEnd(5)} provider=${String(card.providerReady).padEnd(5)} evidence=${card.realTestEvidence.length}`);
}
console.log(`  evidence-backed (ACTIVE/VERIFIED): ${verified}`);

if (problems.length) {
  console.error("FAIL: " + problems.join("; "));
  process.exitCode = 1;
  return;
}
console.log("PASS: every card exposes the required fields and every ACTIVE/VERIFIED claim is backed by a real test file.");
