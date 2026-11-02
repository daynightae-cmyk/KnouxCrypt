// Find the lock emoji and other generic-icon residue across the source tree.
// ripgrep in this shell mangles astral-plane characters, so this walks files
// itself and reports code points instead of relying on a pattern match.
const fs = require("fs");
const path = require("path");

const ROOT = process.argv[2] || "src";
const NEEDLES = {
  "U+1F510 lock": "\u{1F510}",
  "U+1F50F lock-with-pen": "\u{1F50F}",
  "U+1F6E1 shield": "\u{1F6E1}",
  "U+1F512 padlock": "\u{1F512}",
  "U+1F513 open padlock": "\u{1F513}",
  "U+26E8 black cross": "\u{26E8}",
};

const EXTS = new Set([".js", ".jsx", ".ts", ".tsx", ".css", ".html", ".json", ".nsh", ".cjs"]);
const SKIP = new Set(["node_modules", ".git", "dist", "build", "coverage", "visuals"]);

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (EXTS.has(path.extname(entry.name))) yield full;
  }
}

let hits = 0;
for (const file of walk(ROOT)) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    for (const [label, ch] of Object.entries(NEEDLES)) {
      if (line.includes(ch)) {
        console.log(`${file}:${i + 1}  ${label}  ${line.trim().slice(0, 90)}`);
        hits++;
      }
    }
  });
}
console.log(hits ? `\n${hits} occurrence(s)` : "\nnone found");
