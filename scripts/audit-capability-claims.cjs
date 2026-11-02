/**
 * Audit the claims a user can actually read.
 *
 * The startup repair removed the military-grade wording from the identity
 * surfaces, but the same claim and a few capability claims live in component
 * copy. This walks every user-visible string in src/ and reports the ones that
 * assert something the product does not do, so the list is data rather than
 * something a reviewer has to remember.
 *
 * Run: node scripts/audit-capability-claims.cjs
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SKIP = new Set(["node_modules", ".git", "dist", "dist-new", "build", "coverage", "visuals", "desktop-evidence", "docs"]);
const EXTS = new Set([".jsx", ".js", ".tsx", ".ts", ".css", ".html", ".json"]);

// Each pattern is a claim plus the reason it is not supported.
const CLAIMS = [
  {
    id: "military-grade",
    label: "Claims a military-grade / certified system",
    patterns: [/عسكري/, /عسكرية/, /Military-Grade/i, /Military Grade/i, /\bmilitary\b/i],
    why: "no certification or independent audit exists; the suite uses published primitives",
  },
  {
    id: "disk-encryption",
    label: "Claims whole-disk or USB encryption",
    patterns: [/تشفير.{0,18}(الأقراص|القرص|USB)/i, /Disk Encryption/i, /إدارة الأقراص/i, /BitLocker/i, /VeraCrypt/i],
    why: "the product encrypts files, vaults, notes, credentials and keys locally; it has no disk or volume layer",
  },
  {
    id: "threat-detection",
    label: "Claims live threat detection",
    patterns: [/كشف التهديدات/, /Threat Detection/i, /threat-detection/],
    why: "no detection engine exists in the codebase",
  },
  {
    id: "server-side-ai",
    label: "Claims a server-side AI capability",
    patterns: [/SERVER_SIDE_GEMINI/i, /Gemini/i],
    why: "the assistant is local-only",
  },
];

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name) || entry.name.startsWith("audit-capability-claims")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (EXTS.has(path.extname(entry.name))) yield full;
  }
}

const findings = [];
for (const file of walk(path.join(ROOT, "src"))) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const claim of CLAIMS) {
      if (claim.patterns.some((re) => re.test(line))) {
        findings.push({ file: rel, line: i + 1, id: claim.id, text: line.trim().slice(0, 110) });
      }
    }
  });
}

const byClaim = new Map();
for (const f of findings) {
  if (!byClaim.has(f.id)) byClaim.set(f.id, []);
  byClaim.get(f.id).push(f);
}

console.log("KNOUX capability-claim audit\n");
for (const claim of CLAIMS) {
  const list = byClaim.get(claim.id) || [];
  console.log(`${String(list.length).padStart(3)}  ${claim.label}`);
  console.log(`     why: ${claim.why}`);
  const files = new Map();
  for (const f of list) files.set(f.file, (files.get(f.file) || 0) + 1);
  for (const [file, count] of [...files].sort((a, b) => b[1] - a[1])) console.log(`       ${count}  ${file}`);
  console.log("");
}
console.log(`total: ${findings.length} occurrences across ${new Set(findings.map((f) => f.file)).size} files`);

if (process.argv.includes("--json")) {
  fs.writeFileSync(path.join(ROOT, "capability-claims.json"), JSON.stringify(findings, null, 2));
  console.log("written: capability-claims.json");
}
