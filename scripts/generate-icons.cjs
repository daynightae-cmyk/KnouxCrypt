/**
 * KNOUX CRYPT identity icon generator.
 *
 * Everything here is derived from one file: src/assets/knoux-stag.png, the
 * official 1254x1254 symmetrical stag with the integrated K. The emblem is
 * copied, trimmed and resampled — never re-drawn, re-posed or recoloured, and
 * never replaced by a generic mark.
 *
 * Why this file was rewritten:
 *   The previous generator did not look at the brand at all. It drew "a gradient
 *   disc with a white padlock" (its own words: "Padlock shackle", "Padlock
 *   body") and that is exactly the icon Windows put in the taskbar, the tray,
 *   the installer and the desktop shortcut. Fixing the boot screen's CSS would
 *   have left the *actual* identity carrier wrong, which is why the generator
 *   is the source of this repair, not a cosmetic layer.
 *
 * Composition:
 *   The source is mostly transparent (about 65% of its pixels are fully clear).
 *   A transparent app icon is unreadable on a light taskbar or in File Explorer,
 *   so the mark is seated on an obsidian rounded plate carrying the product's
 *   own palette (--crypt-obsidian from src/components/shell/shell.css, plus the
 *   violet ramp the emblem's eyes already use). The plate is a mount, not a
 *   redesign: the emblem keeps its geometry, proportions and silhouette.
 *
 * Determinism:
 *   Output pixels depend only on the source file, so a rebuild cannot drift.
 *   tests/startup-identity.test.cjs regenerates the largest size and compares
 *   decoded pixels against the shipped icon; byte comparison is deliberately
 *   not used because zlib output is not stable across Node builds.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const SOURCE = path.join(ROOT, "src", "assets", "knoux-stag.png");
const OUT_DIR = path.join(ROOT, "electron", "assets");

// The ladder electron-builder, the Windows shell and macOS all ask for. The
// shipped icon.ico used PNG entries at 16/32/48/64/128/256; 24 is added because
// Windows uses it for small taskbar and menu surfaces.
const PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512];
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const ICNS_TYPES = { ic11: 32, ic12: 64, ic07: 128, ic08: 256, ic09: 512 };

// Brand palette, taken from the running app rather than invented here.
const PLATE_BASE = [0x08, 0x04, 0x11];   // --crypt-obsidian
const PLATE_GLOW = [0x35, 0x14, 0x5c];   // violet field behind the mark
const PLATE_RIM = [0xb2, 0x5c, 0xff];    // the emblem's own bloom colour
const FILL = 0.84;                       // share of the plate the mark occupies
const RIM_RATIO = 0.018;
const CORNER_RATIO = 0.225;

// --------------------------------------------------------------- PNG I/O ----

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function decodePng(buffer) {
  if (buffer.compare(PNG_SIGNATURE, 0, 8, 0, 8) !== 0) throw new Error("not a PNG");
  let offset = 8;
  let header = null;
  const compressed = [];
  let palette = null;
  let trns = null;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") compressed.push(Buffer.from(data));
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (!header) throw new Error("PNG has no IHDR");
  if (header.bitDepth !== 8) throw new Error(`unsupported bit depth ${header.bitDepth}`);
  if (header.interlace !== 0) throw new Error("interlaced PNG is not supported");
  if (!(header.colorType in CHANNELS)) throw new Error(`unsupported colour type ${header.colorType}`);

  const channels = CHANNELS[header.colorType];
  const { width, height } = header;
  const raw = zlib.inflateSync(Buffer.concat(compressed));
  const stride = width * channels;
  const scanlines = Buffer.alloc(height * stride);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  let cursor = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[cursor++];
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const value = raw[cursor++];
      const a = x >= channels ? scanlines[row + x - channels] : 0;
      const b = y > 0 ? scanlines[row - stride + x] : 0;
      const c = x >= channels && y > 0 ? scanlines[row - stride + x - channels] : 0;
      let out;
      switch (filter) {
        case 0: out = value; break;
        case 1: out = value + a; break;
        case 2: out = value + b; break;
        case 3: out = value + ((a + b) >> 1); break;
        case 4: out = value + paeth(a, b, c); break;
        default: throw new Error(`bad PNG filter ${filter} on row ${y}`);
      }
      scanlines[row + x] = out & 0xff;
    }
  }

  // Normalise every supported colour type to RGBA8.
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, o = 0; i < width * height; i++, o += 4) {
    if (header.colorType === 6) {
      rgba[o] = scanlines[i * 4];
      rgba[o + 1] = scanlines[i * 4 + 1];
      rgba[o + 2] = scanlines[i * 4 + 2];
      rgba[o + 3] = scanlines[i * 4 + 3];
    } else if (header.colorType === 2) {
      rgba[o] = scanlines[i * 3];
      rgba[o + 1] = scanlines[i * 3 + 1];
      rgba[o + 2] = scanlines[i * 3 + 2];
      rgba[o + 3] = trns && scanlines[i * 3] === trns[0] && scanlines[i * 3 + 1] === trns[1] && scanlines[i * 3 + 2] === trns[2] ? 0 : 255;
    } else if (header.colorType === 0) {
      const g = scanlines[i];
      rgba[o] = rgba[o + 1] = rgba[o + 2] = g;
      rgba[o + 3] = 255;
    } else if (header.colorType === 4) {
      const g = scanlines[i * 2];
      rgba[o] = rgba[o + 1] = rgba[o + 2] = g;
      rgba[o + 3] = scanlines[i * 2 + 1];
    } else {
      const index = scanlines[i];
      rgba[o] = palette ? palette[index * 3] : 0;
      rgba[o + 1] = palette ? palette[index * 3 + 1] : 0;
      rgba[o + 2] = palette ? palette[index * 3 + 2] : 0;
      rgba[o + 3] = trns && index < trns.length ? trns[index] : 255;
    }
  }
  return { width, height, data: rgba };
}

function crc32(buffer) {
  let crc = ~0;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Encode straight-alpha RGBA8 as a PNG. Filter 0 per scanline, deflate level 9. */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // truecolour + alpha
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // adaptive filtering
  ihdr[12] = 0;  // no interlace
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ----------------------------------------------------------------- drawing ----

function alphaBoundingBox(image) {
  const { width, height, data } = image;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error("the official emblem is fully transparent");
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Optical profile per size class. */
function profileFor(size) {
  // At 16 and 24 px the emblem's thin bright strokes average away into mud
  // against the dark interior. Real app icons get a tighter crop and a little
  // alpha gain at small sizes; without it the 16 px entry reads as a smudge.
  if (size <= 24) return { fill: 0.9, alphaGain: 1.5 };
  return { fill: FILL, alphaGain: 1 };
}

/**
 * Render one icon size.
 *
 * Both layers are accumulated in premultiplied float space. Averaging straight
 * alpha over a downsampling window darkens every edge that meets transparency,
 * which is exactly the halo that makes an icon look pasted-on; premultiplied
 * averaging is what a correct resampler does.
 */
function renderIcon(size, mark, bbox, profile) {
  const { fill, alphaGain } = profile || profileFor(size);
  const cells = size * size;
  const canvas = new Float64Array(cells * 4); // premultiplied r,g,b,a
  const radius = size * CORNER_RATIO;
  const rim = Math.max(0.55, size * RIM_RATIO);

  // Pre-compute the mark's target footprint and its source-pixel scale.
  const box = Math.round(size * fill);
  const left = Math.floor((size - box) / 2);
  const top = Math.floor((size - box) / 2);
  const scale = Math.max(bbox.width, bbox.height) / box;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      // Sample four sub-points so the plate's rounded corners stay smooth at
      // 16 and 24 px instead of turning into staircases.
      let cover = 0;
      let rimCover = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const x = px + (sx + 0.5) / 4;
          const y = py + (sy + 0.5) / 4;
          const inset = radius;
          const cx = Math.min(Math.max(x, inset), size - inset);
          const cy = Math.min(Math.max(y, inset), size - inset);
          const dist = Math.hypot(x - cx, y - cy);
          if (dist <= radius) {
            cover += 0.0625;
            if (dist > radius - rim) rimCover += 0.0625;
          }
        }
      }
      if (cover <= 0) continue;

      // Radial field: violet at the centre, obsidian at the edges, so the icon
      // has depth instead of reading as a flat dark square.
      const nx = (px + 0.5) / size - 0.5;
      const ny = (py + 0.5) / size - 0.5;
      const t = Math.min(1, Math.hypot(nx, ny) / 0.62);
      const blend = 1 - t * t;
      let r = PLATE_BASE[0] + (PLATE_GLOW[0] - PLATE_BASE[0]) * blend;
      let g = PLATE_BASE[1] + (PLATE_GLOW[1] - PLATE_BASE[1]) * blend;
      let b = PLATE_BASE[2] + (PLATE_GLOW[2] - PLATE_BASE[2]) * blend;
      if (rimCover > 0) {
        const mix = Math.min(1, rimCover / cover) * 0.5;
        r += (PLATE_RIM[0] - r) * mix;
        g += (PLATE_RIM[1] - g) * mix;
        b += (PLATE_RIM[2] - b) * mix;
      }
      const index = (py * size + px) * 4;
      // Colours are kept in 0..1 units here so the emblem's premultiplied
      // contribution and the plate's share the same scale.
      canvas[index] = (r / 255) * cover;
      canvas[index + 1] = (g / 255) * cover;
      canvas[index + 2] = (b / 255) * cover;
      canvas[index + 3] = cover;
    }
  }

  // Composite the emblem, area-averaged over each pixel's footprint.
  const invScaleSq = 1 / (scale * scale);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const tx0 = px - left;
      if (tx0 < 0 || tx0 >= box) continue;
      const ty0 = py - top;
      if (ty0 < 0 || ty0 >= box) continue;

      // Portion of this target pixel that the mark's box actually covers.
      const sxEnd = Math.min(box, tx0 + 1);
      const syEnd = Math.min(box, ty0 + 1);

      // The same rectangle in source pixels.
      const srcX0 = bbox.minX + tx0 * scale;
      const srcX1 = bbox.minX + sxEnd * scale;
      const srcY0 = bbox.minY + ty0 * scale;
      const srcY1 = bbox.minY + syEnd * scale;
      const xFrom = Math.max(0, Math.floor(srcX0));
      const xTo = Math.min(mark.width, Math.ceil(srcX1));
      const yFrom = Math.max(0, Math.floor(srcY0));
      const yTo = Math.min(mark.height, Math.ceil(srcY1));

      let pr = 0, pg = 0, pb = 0, pa = 0;
      for (let sy = yFrom; sy < yTo; sy++) {
        const wy = Math.min(sy + 1, srcY1) - Math.max(sy, srcY0);
        if (wy <= 0) continue;
        const rowOffset = sy * mark.width;
        for (let sx = xFrom; sx < xTo; sx++) {
          const wx = Math.min(sx + 1, srcX1) - Math.max(sx, srcX0);
          if (wx <= 0) continue;
          const w = wx * wy;
          const i = (rowOffset + sx) * 4;
          const a = Math.min(1, (mark.data[i + 3] / 255) * alphaGain);
          if (a === 0) continue;
          // Accumulated premultiplied, weighted by source-pixel overlap.
          pr += (mark.data[i] / 255) * a * w;
          pg += (mark.data[i + 1] / 255) * a * w;
          pb += (mark.data[i + 2] / 255) * a * w;
          pa += a * w;
        }
      }
      if (pa <= 0) continue;

      // Source units -> target units, which makes these ready-to-add
      // premultiplied contributions for the whole target pixel.
      const index = (py * size + px) * 4;
      const alpha = pa * invScaleSq;
      const oneMinus = 1 - alpha;
      canvas[index] = pr * invScaleSq + canvas[index] * oneMinus;
      canvas[index + 1] = pg * invScaleSq + canvas[index + 1] * oneMinus;
      canvas[index + 2] = pb * invScaleSq + canvas[index + 2] * oneMinus;
      canvas[index + 3] = alpha + canvas[index + 3] * oneMinus;
    }
  }

  const out = Buffer.alloc(cells * 4);
  for (let i = 0; i < cells; i++) {
    const a = canvas[i * 4 + 3];
    if (a <= 0.0001) continue;
    out[i * 4] = Math.max(0, Math.min(255, Math.round((canvas[i * 4] / a) * 255)));
    out[i * 4 + 1] = Math.max(0, Math.min(255, Math.round((canvas[i * 4 + 1] / a) * 255)));
    out[i * 4 + 2] = Math.max(0, Math.min(255, Math.round((canvas[i * 4 + 2] / a) * 255)));
    out[i * 4 + 3] = Math.max(0, Math.min(255, Math.round(a * 255)));
  }
  return out;
}

// ----------------------------------------------------------- containers ----

/**
 * ICO with PNG-compressed entries. The shipped icon.ico already used PNG
 * entries and electron-builder accepted them, so the container format is
 * unchanged — only its contents are.
 */
function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // reserved
  header.writeUInt16LE(1, 2);      // 1 = icon
  header.writeUInt16LE(images.length, 4);
  const directory = Buffer.alloc(images.length * 16);
  let payloadSize = 0;
  images.forEach((image, i) => {
    const o = i * 16;
    directory[o] = image.width >= 256 ? 0 : image.width;
    directory[o + 1] = image.height >= 256 ? 0 : image.height;
    directory[o + 2] = 0;                       // no palette
    directory[o + 3] = 0;                       // reserved
    directory.writeUInt16LE(1, o + 4);          // planes
    directory.writeUInt16LE(32, o + 6);         // bits per pixel
    directory.writeUInt32LE(image.png.length, o + 8);
    directory.writeUInt32LE(6 + images.length * 16 + payloadSize, o + 12);
    payloadSize += image.png.length;
  });
  return Buffer.concat([header, directory, ...images.map((image) => image.png)]);
}

function encodeIcns(entries) {
  const body = Buffer.concat(
    entries.map((entry) => {
      const header = Buffer.alloc(8);
      header.write(entry.type, 0, 4, "ascii");
      header.writeUInt32BE(8 + entry.png.length, 4);
      return Buffer.concat([header, entry.png]);
    }),
  );
  const total = Buffer.alloc(8);
  total.write("icns", 0, 4, "ascii");
  total.writeUInt32BE(8 + body.length, 4);
  return Buffer.concat([total, body]);
}

// ------------------------------------------------------------------ main ----

function generate(options) {
  const opts = options || {};
  const outDir = opts.outDir || OUT_DIR;
  const source = opts.source || SOURCE;
  const mark = decodePng(fs.readFileSync(source));
  const bbox = alphaBoundingBox(mark);
  const sourceSha256 = crypto.createHash("sha256").update(fs.readFileSync(source)).digest("hex");

  const bySize = new Map();
  for (const size of PNG_SIZES) {
    bySize.set(size, encodePng(size, size, renderIcon(size, mark, bbox, profileFor(size))));
  }

  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  const write = (name, buffer) => {
    fs.writeFileSync(path.join(outDir, name), buffer);
    written.push([name, buffer.length]);
  };

  for (const [size, png] of bySize) write(`icon-${size}.png`, png);
  write("icon.png", bySize.get(512));
  write(
    "icon.ico",
    encodeIco(
      ICO_SIZES.map((size) => ({
        width: size,
        height: size,
        png: bySize.get(size),
      })),
    ),
  );
  write(
    "icon.icns",
    encodeIcns(
      Object.entries(ICNS_TYPES).map(([type, size]) => ({ type, png: bySize.get(size) })),
    ),
  );

  // A vector wrapper for web favours: the plate is real geometry, the emblem is
  // the official raster, embedded so the file stays self-contained.
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by scripts/generate-icons.cjs. The emblem inside is the official
     src/assets/knoux-stag.png (${sourceSha256.slice(0, 12)}...), seated on the
     product's obsidian plate. Do not hand-edit: regenerate. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="115" fill="rgb(${PLATE_BASE.join(",")})"/>
  <image href="data:image/png;base64,${bySize.get(256).toString("base64")}" x="0" y="0" width="512" height="512"/>
</svg>
`;
  write("icon.svg", Buffer.from(svg, "utf8"));

  if (opts.publicDir) {
    // index.html points the web build at /favicon.ico and no public directory
    // existed, so every browser tab showed the default globe. Same emblem, same
    // plate, in the sizes a favicon wants.
    fs.mkdirSync(opts.publicDir, { recursive: true });
    const favicon = encodeIco([
      { width: 16, height: 16, png: bySize.get(16) },
      { width: 32, height: 32, png: bySize.get(32) },
      { width: 48, height: 48, png: bySize.get(48) },
    ]);
    fs.writeFileSync(path.join(opts.publicDir, "favicon.ico"), favicon);
    fs.writeFileSync(path.join(opts.publicDir, "icon-128.png"), bySize.get(128));
    written.push(["public/favicon.ico", favicon.length]);
  }

  return { written, bbox, sourceSha256, sizes: PNG_SIZES };
}

function main() {
  const publicDir = path.join(ROOT, "public");
  const { written, bbox, sourceSha256 } = generate({ publicDir });
  console.log(`official emblem ${SOURCE}`);
  console.log(`  sha256 ${sourceSha256}`);
  console.log(`  ink bounding box ${bbox.width}x${bbox.height} at (${bbox.minX}, ${bbox.minY}) of 1254x1254`);
  for (const [name, size] of written) console.log(`  ${name.padEnd(14)} ${size.toLocaleString("en-US")} bytes`);
  console.log(`\n${written.length} identity files written from the official emblem.`);
}

if (require.main === module) main();

module.exports = { generate, decodePng, encodePng, renderIcon, alphaBoundingBox, SOURCE, OUT_DIR };
