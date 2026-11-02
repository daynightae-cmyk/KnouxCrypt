"use strict";

/**
 * Capability-claim tests.
 *
 * The mission forbids fake security. This treats the copy as data: it runs the
 * same audit the gate runs, and fails if a claim that was removed comes back,
 * or if a new one appears anywhere in the source.
 *
 * The allowlist is deliberate. Some remaining occurrences are legitimate:
 *   - internal identifiers (`encryptionLevel: "military"`, the `threatModel`
 *     enum). Renaming them would invalidate stored preferences and change no
 *     screen;
 *   - use-case descriptions that name the *data* an algorithm is reputed to
 *     suit ("military and government communications"), which is a statement
 *     about AES/Serpent/Twofish, not about this product;
 *   - comments that explain why a claim was removed.
 * What is not legitimate is the product describing itself as military-grade,
 * fully protecting a system, or encrypting volumes it cannot touch.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");

function auditJson() {
  const out = execFileSync(process.execPath, [path.join(root, "scripts", "audit-capability-claims.cjs"), "--json"], {
    cwd: root,
    encoding: "utf8",
  });
  const file = path.join(root, "capability-claims.json");
  const data = JSON.parse(require("node:fs").readFileSync(file, "utf8"));
  require("node:fs").rmSync(file, { force: true });
  return data;
}

const ALLOWED_PRODUCT_CLAIMS = new Set([
  // internal identifiers, enum members and explanatory comments
  "src/config/AppConfig.ts",
  "src/core/crypto/CipherFactory.ts",
  "src/core/crypto/AESCipher.ts",
  "src/core/crypto/SerpentCipher.ts",
  "src/core/crypto/TripleCipher.ts",
  "src/components/dashboard/AIRecommendationsCard.tsx",
  // use-case wording about the algorithms, not about this product
  "src/components/pages/Algorithms.tsx",
  "src/components/UI/LocalAIAssistant.tsx",
]);

test("no screen claims the product itself is military grade", () => {
  const findings = auditJson().filter((f) => f.id === "military-grade");
  const offenders = findings.filter((f) => !ALLOWED_PRODUCT_CLAIMS.has(f.file));
  assert.deepEqual(
    offenders.map((f) => `${f.file}:${f.line} ${f.text}`),
    [],
    "these lines describe the product as military-grade; say what it uses instead",
  );
});

test("the legacy dashboard no longer asserts a protection state it cannot know", () => {
  const dashboard = require("node:fs").readFileSync(path.join(root, "src/components/pages/Dashboard.tsx"), "utf8");
  assert.doesNotMatch(dashboard, /نظام محمي بالكامل/, "the app cannot verify that the whole system is protected");
  assert.doesNotMatch(dashboard, /مستوى الأمان: عسكري/, "no security level is measured, and none is certified");
  assert.doesNotMatch(dashboard, /value:\s*"98%"/, "a protection percentage was invented");
  assert.doesNotMatch(dashboard, /value:\s*"5",?\s*\n\s*}\s*,?\s*\n\s*\{\s*title:\s*"تشفير/, "disk counts were invented");
});

test("capabilities the suite does not implement are not shown as active", () => {
  const dashboard = require("node:fs").readFileSync(path.join(root, "src/components/pages/Dashboard.tsx"), "utf8");
  const cards = [...dashboard.matchAll(/title:\s*"([^"]+)"[\s\S]*?status:\s*"(\w+)"/g)].map((m) => ({ title: m[1], status: m[2] }));
  const unimplemented = ["إدارة الأقراص الذكية", "تشفير النظام الكامل"];
  for (const title of unimplemented) {
    const card = cards.find((c) => c.title === title);
    assert.ok(card, `the ${title} card should still be described honestly`);
    assert.notEqual(card.status, "active", `"${title}" is not implemented and must not read as active`);
  }
});

test("the audit script itself stays honest about what it counts", () => {
  const findings = auditJson();
  // A claim class that has been fully removed must not silently reappear.
  const serverSide = findings.filter((f) => f.id === "server-side-ai");
  assert.deepEqual(serverSide, [], "the assistant is local-only; no server-side AI claim may ship");
});
