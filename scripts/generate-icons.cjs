// Generates the real packaging icons (PNG, ICO, ICNS) from the KnouxCrypt mark.
//
// electron-builder fails on Windows when `electron/assets/icon.ico` is missing,
// and the repository previously shipped only the SVG source plus a README
// telling a human to convert it by hand. That is a packaging defect: the build
// must be reproducible from the checkout. This script rasterises the mark with
// plain arithmetic (no native image dependency) and writes PNG/ICO/ICNS.
//
// Run: node scripts/generate-icons.cjs
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const OUT_DIR = path.resolve(__dirname, "..", "electron/assets");
const SS = 2; // supersampling factor for antialiasing

const STOPS = [
  { t: 0, rgb: [0x3b, 0x82, 0xf6] },
  { t: 0.5, rgb: [0x8b, 0x5c, 0xf6] },
  { t: 1, rgb: [0x06, 0xb6, 0xd4] },
];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function gradientColor(t) {
  const clamped = Math.min(1, Math.max(0, t));
  for (let i = 0; i < STOPS.length - 1; i += 1) {
    const a = STOPS[i];
    const b = STOPS[i + 1];
    if (clamped <= b.t) {
      const local = (clamped - a.t) / (b.t - a.t);
      return [0, 1, 2].map((k) => Math.round(lerp(a.rgb[k], b.rgb[k], local)));
    }
  }
  return STOPS[STOPS.length - 1].rgb;
}

/** Signed distance helpers, all in unit coordinates (0..1). */
function insideCircle(x, y, cx, cy, r) {
  return Math.hypot(x - cx, y - cy) <= r;
}

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  if (x < left || x > right || y < top || y > bottom) return false;
  const dx = Math.max(left + radius - x, 0, x - (right - radius));
  const dy = Math.max(top + radius - y, 0, y - (bottom - radius));
  return Math.hypot(dx, dy) <= radius;
}

function insideRing(x, y, cx, cy, outer, inner, yMax) {
  if (y > yMax) return false;
  const d = Math.hypot(x - cx, y - cy);
  return d <= outer && d >= inner;
}

/**
 * Render the mark at `size` px. Returns RGBA bytes.
 * The drawing is the approved brand mark: a gradient disc with a white padlock.
 */
function render(size) {
  const w = size * SS;
  const h = size * SS;
  const pixels = new Float32Array(w * h * 4);

  for (let py = 0; py < h; py += 1) {
    for (let px = 0; px < w; px += 1) {
      const x = (px + 0.5) / w;
      const y = (py + 0.5) / h;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      // Disc with a diagonal gradient.
      if (insideCircle(x, y, 0.5, 0.5, 0.469)) {
        const t = (x + y) / 2;
        [r, g, b] = gradientColor(t);
        a = 255;
      }

      // Padlock shackle.
      if (insideRing(x, y, 0.5, 0.42, 0.145, 0.085, 0.46)) {
        r = 255;
        g = 255;
        b = 255;
        a = 255;
      }

      // Padlock body.
      if (insideRoundedRect(x, y, 0.3, 0.46, 0.7, 0.78, 0.075)) {
        r = 255;
        g = 255;
        b = 255;
        a = 255;
      }

      // Keyhole punched back out of the body.
      if (insideCircle(x, y, 0.5, 0.595, 0.045) || insideRoundedRect(x, y, 0.485, 0.595, 0.515, 0.7, 0.014)) {
        const t = (x + y) / 2;
        [r, g, b] = gradientColor(t);
        a = 255;
      }

      const idx = (py * w + px) * 4;
      pixels[idx] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
      pixels[idx + 3] = a;
    }
  }

  // Downsample (box filter) back to the target size.
  const out = Buffer.alloc(size * size * 4);
  const samples = SS * SS;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const idx = ((y * SS + sy) * w + (x * SS + sx)) * 4;
          r += pixels[idx];
          g += pixels[idx + 1];
          b += pixels[idx + 2];
          a += pixels[idx + 3];
        }
      }
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / samples);
      out[o + 1] = Math.round(g / samples);
      out[o + 2] = Math.round(b / samples);
      out[o + 3] = Math.round(a / samples);
    }
  }
  return out;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(size) {
  const rgba = render(size);
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function encodeIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + pngs.length * 16;
  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

function encodeIcns(pngs) {
  // PNG payloads are valid in ic07 and above.
  const TYPES = { 128: "ic07", 256: "ic08", 512: "ic09", 32: "ic11", 64: "ic12" };
  const chunks = [];
  for (const { size, data } of pngs) {
    const type = TYPES[size];
    if (!type) continue;
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, "ascii");
    header.writeUInt32BE(data.length + 8, 4);
    chunks.push(header, data);
  }
  const total = 8 + chunks.reduce((sum, c) => sum + c.length, 0);
  const header = Buffer.alloc(8);
  header.write("icns", 0, 4, "ascii");
  header.writeUInt32BE(total, 4);
  return Buffer.concat([header, ...chunks]);
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const sizes = [16, 32, 48, 64, 128, 256, 512];
  const pngs = sizes.map((size) => ({ size, data: encodePng(size) }));

  for (const { size, data } of pngs) {
    fs.writeFileSync(path.join(OUT_DIR, `icon-${size}.png`), data);
  }
  fs.writeFileSync(path.join(OUT_DIR, "icon.png"), pngs.find((p) => p.size === 512).data);
  fs.writeFileSync(path.join(OUT_DIR, "icon.ico"), encodeIco(pngs.filter((p) => p.size <= 256)));
  fs.writeFileSync(path.join(OUT_DIR, "icon.icns"), encodeIcns(pngs));

  console.log("Generated packaging icons in electron/assets:");
  for (const name of ["icon.png", "icon.ico", "icon.icns"]) {
    console.log(`  ${name} (${fs.statSync(path.join(OUT_DIR, name)).size} bytes)`);
  }
}

main();
