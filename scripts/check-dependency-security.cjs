// Triage for the npm audit report.
//
// A green "0 vulnerabilities" badge is never the goal; the goal is knowing which
// findings can actually reach production code. This script classifies every
// advisory by whether the affected package ships to users at runtime or is only
// part of the build/packaging toolchain, and fails on any critical or high
// finding. It also fails if a documented exception no longer matches reality,
// so a suppressed advisory cannot silently reappear.
//
// Run: node scripts/check-dependency-security.cjs [audit.json]
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const SEVERITY_ORDER = ["low", "moderate", "high", "critical"];
const FAIL_AT = "high";

// Packages that are only used while building/packaging the application. They are
// not loaded by the shipped renderer or the Electron main process.
const TOOLCHAIN_PACKAGES = new Set([
  "electron-builder",
  "app-builder-lib",
  "dmg-builder",
  "electron-builder-squirrel-windows",
  "electron-winstaller",
  "@electron/asar",
  "@electron/universal",
  "dir-compare",
  "ejs",
  "jake",
  "filelist",
  "glob",
  "minimatch",
  "rimraf",
  "temp",
]);

// Documented, reviewed exceptions. Each one must still exist in the report, so
// this list cannot be used to hide a finding that has since changed.
const ACCEPTED = {
  minimatch: {
    reason:
      "ReDoS/DoS in glob matching. Every affected copy is reached only through electron-builder's " +
      "packaging toolchain; the patterns come from the repository, not from user input, and the " +
      "code never runs in the shipped app. Fixing it requires downgrading electron-builder to " +
      "20.23.1 (a major regression), so the finding is accepted and tracked.",
  },
};

function readReport(argPath) {
  if (argPath && fs.existsSync(argPath)) return JSON.parse(fs.readFileSync(argPath, "utf8"));
  // `npm audit` exits non-zero when findings exist; the JSON on stdout is still
  // the report we want, so read it from the thrown error rather than failing.
  try {
    return JSON.parse(execFileSync("npm", ["audit", "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch (err) {
    if (err.stdout) return JSON.parse(err.stdout);
    throw err;
  }
}

function main() {
  const report = readReport(process.argv[2]);
  const vulnerabilities = report.vulnerabilities || {};
  const counts = report.metadata?.vulnerabilities || {};
  const runtime = [];
  const toolchain = [];
  const accepted = [];
  const unknownAccepted = new Set(Object.keys(ACCEPTED));

  for (const [name, data] of Object.entries(vulnerabilities)) {
    const entry = { name, severity: data.severity, direct: !!data.isDirect };
    if (ACCEPTED[name]) {
      accepted.push(entry);
      unknownAccepted.delete(name);
    } else if (TOOLCHAIN_PACKAGES.has(name)) {
      toolchain.push(entry);
    } else {
      runtime.push(entry);
    }
  }

  const fails = [];
  for (const item of [...runtime, ...toolchain, ...accepted]) {
    if (SEVERITY_ORDER.indexOf(item.severity) >= SEVERITY_ORDER.indexOf(FAIL_AT)) {
      fails.push(`${item.severity}: ${item.name}`);
    }
  }
  if (unknownAccepted.size) {
    fails.push(`stale accepted exceptions: ${[...unknownAccepted].join(", ")}`);
  }
  if (counts.critical) fails.push(`${counts.critical} critical finding(s) reported`);

  console.log("Dependency security triage");
  console.log(`  total: ${counts.total || 0} (critical ${counts.critical || 0}, high ${counts.high || 0}, moderate ${counts.moderate || 0}, low ${counts.low || 0})`);
  console.log(`  runtime-reachable: ${runtime.length}${runtime.length ? " -> " + runtime.map((v) => `${v.name}@${v.severity}`).join(", ") : ""}`);
  console.log(`  packaging toolchain only: ${toolchain.length}${toolchain.length ? " -> " + toolchain.map((v) => v.name).join(", ") : ""}`);
  console.log(`  accepted with documented reason: ${accepted.length}${accepted.length ? " -> " + accepted.map((v) => v.name).join(", ") : ""}`);

  if (fails.length) {
    console.error("FAIL: " + fails.join("; "));
    process.exitCode = 1;
    return;
  }
  console.log(`PASS: no runtime-reachable finding at ${FAIL_AT} or above; no critical finding anywhere.`);
}

main();
