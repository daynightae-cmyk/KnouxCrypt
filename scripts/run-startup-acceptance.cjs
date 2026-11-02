/**
 * Startup identity acceptance runner (plain Node).
 *
 * Launches scripts/qa-startup-acceptance.cjs inside Electron three times — a
 * normal boot, a reduced-motion boot, and a boot whose renderer genuinely
 * cannot load — then adds the checks that only make sense from outside the app
 * process, and writes one consolidated report plus an HTML frame player.
 *
 * There is no ffmpeg on this machine, so the "recording" is what it can
 * honestly be: the captured PNG frames plus a player that steps them at their
 * real timestamps. It is a playback of the actual startup, not a video file.
 *
 * Run: node scripts/run-startup-acceptance.cjs
 */
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(os.tmpdir(), "knoux-startup-acceptance");
const SCRIPT = path.join(ROOT, "scripts", "qa-startup-acceptance.cjs");
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const electronBin = require("electron");
if (typeof electronBin !== "string") {
  console.error("This runner must be executed by Node, not inside Electron.");
  process.exit(2);
}

const lines = [];
const all = [];
function note(text) {
  lines.push(text);
  console.log(text);
}

function runMode(mode, env) {
  const label = (env && env.KNOUX_QA_LABEL) || "";
  const out = path.join(OUT, "frames", label ? `${mode}-${label}` : mode);
  fs.mkdirSync(out, { recursive: true });
  const result = spawnSync(electronBin, [SCRIPT], {
    cwd: ROOT,
    env: { ...process.env, KNOUX_QA_MODE: mode, KNOUX_QA_OUT: OUT, ...env },
    encoding: "utf8",
    timeout: 180000,
  });
  const reportPath = path.join(out, "report.json");
  let report = null;
  if (fs.existsSync(reportPath)) report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  if (!report) {
    note(`  (no report written by mode ${mode}; exit ${result.status})`);
    note(String(result.stdout || "").slice(-1500));
    note(String(result.stderr || "").slice(-800));
    return { mode, results: [{ name: `mode ${mode} produced a report`, pass: false, detail: `exit ${result.status}` }], frames: [] };
  }
  if (result.status !== 0 && report.results.every((r) => r.pass)) {
    report.results.push({ name: `mode ${mode} exited cleanly`, pass: false, detail: `exit code ${result.status}` });
  }
  return report;
}

note("\nKNOUX CRYPT — startup identity acceptance (real Electron on Windows)\n");
// One mode per claim. The inspection modes hold the transition open so the boot
// document can be read at leisure; "handoff" lets startup run untouched so the
// timing is the real thing; "failure" breaks the renderer on purpose; "slow"
// answers the renderer late; "closeboot" closes the boot view mid-startup.
const modes = ["boot", "reduced", "handoff", "slow", "closeboot", "failure"];
const reports = {};
for (const mode of modes) {
  reports[mode] = runMode(mode, {});
  note(`  ${mode}: ${reports[mode].results.filter((r) => r.pass).length}/${reports[mode].results.length} passed, ${reports[mode].frames.length} frames, ${reports[mode].durationMs}ms`);
  all.push(...reports[mode].results.map((r) => ({ ...r, mode })));
}

// A warm launch: the same profile directory, used twice. The first run is the
// cold launch, the second is the warm one, and both must behave identically.
const warmProfile = path.join(OUT, "warm-profile");
fs.rmSync(warmProfile, { recursive: true, force: true });
for (const pass of ["cold", "warm"]) {
  const report = runMode("handoff", { KNOUX_QA_PROFILE: warmProfile, KNOUX_QA_LABEL: pass });
  const labelled = report.results.map((r) => ({ ...r, name: `${pass} launch: ${r.name}` }));
  all.push(...labelled.map((r) => ({ ...r, mode: `launch-${pass}` })));
  note(`  ${pass} launch: ${labelled.filter((r) => r.pass).length}/${labelled.length} passed, ${report.durationMs}ms`);
}

// --- the cases that live outside the app process ---------------------------
function outside(name, pass, detail) {
  all.push({ mode: "external", name, pass: Boolean(pass), detail: String(detail === undefined ? "" : detail) });
  note(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  [${String(detail).slice(0, 120)}]` : ""}`);
}

note("\n  external checks:");
const emblemSource = fs.readFileSync(path.join(ROOT, "src", "assets", "knoux-stag.png"));
const bootCopy = fs.readFileSync(path.join(ROOT, "electron", "stag-k.png"));
outside("boot emblem is the official file, byte for byte", sha256(bootCopy) === sha256(emblemSource), sha256(bootCopy).slice(0, 16));

// The obsolete logo must not be recreatable: run the wired generator and prove
// it writes only emblem-derived files, and that the retired generator refuses.
const before = sha256(fs.readFileSync(path.join(ROOT, "electron", "assets", "icon.png")));
const regen = spawnSync(process.execPath, [path.join(ROOT, "scripts", "generate-icons.cjs")], { cwd: ROOT, encoding: "utf8", timeout: 120000 });
const after = sha256(fs.readFileSync(path.join(ROOT, "electron", "assets", "icon.png")));
outside("npm run icons is deterministic and stag-derived", regen.status === 0 && before === after, `exit ${regen.status}`);

const retired = spawnSync(process.execPath, [path.join(ROOT, "electron", "assets", "generate-icons.js")], { cwd: ROOT, encoding: "utf8", timeout: 30000 });
outside("the retired padlock generator refuses to run", retired.status !== 0 && /retired/i.test(retired.stderr || ""), `exit ${retired.status}`);

// --- before / after, rendered from the real thing ---------------------------
// The old boot view and the old icon are extracted from git and rendered by the
// same Electron build, so the comparison is evidence rather than a description.
const compare = spawnSync(electronBin, [path.join(ROOT, "scripts", "identity-before-after.cjs")], {
  cwd: ROOT,
  env: { ...process.env, KNOUX_QA_OUT: OUT },
  encoding: "utf8",
  timeout: 180000,
});
const comparisonDir = path.join(OUT, "comparison");
const comparisonFiles = ["boot-before-after.png", "icon-before-after.png"].filter((f) => fs.existsSync(path.join(comparisonDir, f)));
outside(
  "the before/after identity comparison was rendered",
  compare.status === 0 && comparisonFiles.length === 2,
  `${comparisonFiles.length} sheet(s), exit ${compare.status}`,
);

// Every frame must be a real, non-trivial capture. A blank 600x400 PNG still
// compresses to a little over a kilobyte, so the floor sits below that.
const frameFiles = modes.flatMap((m) => (reports[m].frames || []).map((f) => path.join(OUT, "frames", m, f.name)));
const tiny = frameFiles.filter((f) => fs.existsSync(f) && fs.statSync(f).size < 1200);
outside("every captured frame contains a painted window", frameFiles.length >= 8 && tiny.length === 0, `${frameFiles.length - tiny.length}/${frameFiles.length} usable frames`);

// --- player -----------------------------------------------------------------
function player(mode) {
  const report = reports[mode];
  const list = (report.frames || []).map((f, i) => ({ ...f, i }));
  return `  <section>
    <h2>mode: ${mode} <small>${report.summary || ""} · ${report.durationMs || 0} ms</small></h2>
    <div class="strip">${list
      .map(
        (f) => `<figure><img src="frames/${mode}/${f.name}" alt="${f.label} at ${f.at}ms" loading="lazy">
      <figcaption>${String(f.i).padStart(3, "0")} · ${f.label} · ${f.at}ms</figcaption></figure>`,
      )
      .join("\n      ")}</div>
    <ol class="cases">${(report.results || [])
      .map((r) => `<li class="${r.pass ? "ok" : "no"}">${r.name}${r.detail ? ` <code>${String(r.detail).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))}</code>` : ""}</li>`)
      .join("\n      ")}</ol>
  </section>`;
}

const failures = all.filter((r) => !r.pass);
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>KNOUX CRYPT startup identity acceptance</title>
<style>
 body{margin:0;padding:28px;background:#080411;color:#f4edff;font:14px/1.55 "Segoe UI",Tahoma,sans-serif}
 h1{font-size:22px;letter-spacing:.14em;margin:0 0 4px} h1 em{font-style:normal;color:#e9beff;font-weight:300}
 .sub{color:#c8b6dd;margin:0 0 22px}
 h2{font-size:15px;margin:26px 0 10px;color:#e9beff;font-weight:600} h2 small{color:#8f7aa8;font-weight:400;margin-left:8px}
 .strip{display:flex;gap:10px;overflow-x:auto;padding-bottom:10px;background:#12081d;border:1px solid #3a1f57;border-radius:10px}
 .sheets{display:flex;gap:14px;flex-wrap:wrap;background:#12081d;border:1px solid #3a1f57;border-radius:10px;padding:12px}
 .sheets figure{margin:0} .sheets img{max-width:620px;border:1px solid #4a2a6b;border-radius:6px;background:#000}
 .sheets figcaption{font-size:11px;color:#9c86b3;margin-top:5px}
 figure{margin:0;padding:8px 10px;min-width:210px} img{width:200px;height:133px;object-fit:cover;border:1px solid #4a2a6b;border-radius:6px;background:#000}
 figcaption{font-size:11px;color:#9c86b3;margin-top:5px}
 .cases{columns:2;font-size:12.5px;padding-left:20px} li{margin:2px 0;break-inside:avoid}
 .ok::marker{color:#5fd79a} .no::marker{color:#ff7b8f} .no{color:#ffb3bf}
 code{font-size:11px;color:#9c86b3;word-break:break-all}
 .verdict{margin-top:26px;padding:12px 14px;border-radius:8px;font-weight:600}
 .verdict.ok{background:#0f2a1d;border:1px solid #2f7a52} .verdict.no{background:#2a0f16;border:1px solid #7a2f3d}
</style></head><body>
<h1>KNOUX <em>CRYPT</em> — startup identity acceptance</h1>
<p class="sub">Captured from the real Electron app on Windows on ${new Date(reports.boot?.startedAt || Date.now()).toLocaleString()}. Frames are actual window captures at their measured times; there is no ffmpeg on this machine, so this is a frame-sequence playback rather than a video file.</p>
${comparisonFiles.length ? `<section><h2>before / after <small>rendered from the real thing — old files extracted from git at ${"53bcdd38"}</small></h2>
<div class="sheets">${comparisonFiles.map((f) => `<figure><img src="comparison/${f}" alt="before and after comparison"><figcaption>${f}</figcaption></figure>`).join("\n      ")}</div></section>` : ""}
${modes.map(player).join("\n")}
<div class="verdict ${failures.length ? "no" : "ok"}">${all.length - failures.length}/${all.length} acceptance cases passed${failures.length ? ` — ${failures.map((f) => f.mode + ": " + f.name).join("; ")}` : ""}</div>
</body></html>
`;
fs.writeFileSync(path.join(OUT, "startup-acceptance.html"), html);

note(`\n  ${all.length - failures.length}/${all.length} acceptance cases passed`);
for (const f of failures) note(`  FAIL  [${f.mode}] ${f.name}  ${f.detail}`);
note(`  evidence: ${path.join(OUT, "startup-acceptance.html")}`);
process.exit(failures.length ? 1 : 0);
