// Verify the generated containers decode back to exactly what was rendered:
// PNG round-trip, ICO directory payloads, and ICNS entries.
const fs = require("fs");
const path = require("path");
const { decodePng } = require("./generate-icons.cjs");

const dir = process.argv[2] || path.join("electron", "assets");
let failures = 0;
const ok = (label, pass, extra = "") => {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${extra ? `  ${extra}` : ""}`);
  if (!pass) failures++;
};

for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) {
  const file = path.join(dir, `icon-${size}.png`);
  const img = decodePng(fs.readFileSync(file));
  ok(`icon-${size}.png`, img.width === size && img.height === size, `${img.width}x${img.height}`);
}

const big = decodePng(fs.readFileSync(path.join(dir, "icon.png")));
const s512 = decodePng(fs.readFileSync(path.join(dir, "icon-512.png")));
ok("icon.png === icon-512.png", big.data.equals(s512.data));

const ico = fs.readFileSync(path.join(dir, "icon.ico"));
const count = ico.readUInt16LE(4);
ok("ico entry count", count === 7, `${count}`);
for (let i = 0; i < count; i++) {
  const o = 6 + i * 16;
  const size = ico[o] === 0 ? 256 : ico[o];
  const len = ico.readUInt32LE(o + 8);
  const offset = ico.readUInt32LE(o + 12);
  const payload = ico.subarray(offset, offset + len);
  const isPng = payload.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
  const img = isPng ? decodePng(payload) : null;
  const expected = fs.readFileSync(path.join(dir, `icon-${size}.png`));
  ok(
    `ico ${size}x${size}`,
    isPng && img.width === size && img.data.equals(decodePng(expected).data),
    isPng ? `${len} bytes` : "not PNG",
  );
}

const icns = fs.readFileSync(path.join(dir, "icon.icns"));
ok("icns magic", icns.subarray(0, 4).toString("ascii") === "icns");
let cursor = 8;
const seen = [];
while (cursor + 8 <= icns.length) {
  const type = icns.subarray(cursor, cursor + 4).toString("ascii");
  const len = icns.readUInt32BE(cursor + 4);
  if (len < 8) break;
  const img = decodePng(icns.subarray(cursor + 8, cursor + len));
  seen.push(`${type}:${img.width}`);
  cursor += len;
}
ok("icns entries", seen.length === 5, seen.join(" "));

// Every icon must actually contain the emblem: a fully transparent or flat
// single-colour file would pass the container checks and still be a broken icon.
for (const size of [16, 32, 512]) {
  const img = decodePng(fs.readFileSync(path.join(dir, `icon-${size}.png`)));
  let opaque = 0;
  const total = img.width * img.height;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 200) opaque++;
  ok(`icon-${size}.png is painted`, opaque / total > 0.6, `${((opaque / total) * 100).toFixed(1)}% opaque`);
}

console.log(failures ? `\n${failures} failure(s)` : "\nall container checks passed");
process.exit(failures ? 1 : 0);
