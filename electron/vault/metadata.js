"use strict";

/**
 * File metadata inspection (task 24).
 *
 * Only JPEG is rewritten, and it is rewritten byte-exactly by filtering whole
 * segments out of the file. No image data is re-encoded, so a cleaned copy is
 * pixel-identical to the original apart from the removed metadata.
 *
 * One honest limitation is baked into the model: GPS, capture dates and camera
 * details all live in the single EXIF (APP1) segment, so removing any one of
 * them removes all three. The caller is told which groups were actually
 * removed, not merely which were requested.
 */

const GROUP_OF_MARKER = {
  0xe1: ["exif", "xmp"], // APP1: EXIF or XMP, decided by the payload signature
  0xe2: ["icc"], // APP2: ICC_PROFILE
  0xed: ["photoshop"], // APP13: Photoshop IRB (dates, sometimes camera)
  0xfe: ["comment"], // COM
};

// Which user-facing checkbox each internal group belongs to.
const USER_GROUPS = {
  exif: ["gps", "dates", "camera"],
  xmp: ["xmp"],
  icc: ["icc"],
  photoshop: ["dates"],
  comment: [],
};

const SOI = 0xffd8;
const MARKER_SOS = 0xda;
const MARKER_EOI = 0xd9;

function readUInt16BE(buffer, at) {
  return (buffer[at] << 8) | buffer[at + 1];
}

/** Which format the leading bytes describe. */
function sniffKind(head) {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (head.length >= 4 && head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  if (head.length >= 4 && head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) return "pdf";
  if (head.length >= 4 && head.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return "zip";
  return "unknown";
}

/** Human name for a JPEG marker. */
function markerName(marker) {
  if (marker === 0xe0) return "JFIF";
  if (marker === 0xe1) return "APP1";
  if (marker === 0xe2) return "APP2";
  if (marker === 0xed) return "APP13";
  if (marker === 0xfe) return "COM";
  if (marker === 0xdb) return "DQT";
  if (marker === 0xc0 || marker === 0xc2) return "SOF";
  if (marker === 0xda) return "SOS";
  return `0x${marker.toString(16)}`;
}

/**
 * Walk the JPEG segment structure up to the start of scan. Returns the list of
 * metadata-bearing segments. Entropy-coded data after SOS is never scanned, so
 * a byte sequence that looks like a marker inside the image cannot confuse us.
 */
function jpegSegments(buffer) {
  if (buffer.length < 4 || readUInt16BE(buffer, 0) !== SOI) return null;
  const segments = [];
  let at = 2;
  while (at + 4 <= buffer.length) {
    if (buffer[at] !== 0xff) return null;
    const marker = buffer[at + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      at += 2;
      continue;
    }
    if (marker === MARKER_SOS || marker === MARKER_EOI) break;
    const length = readUInt16BE(buffer, at + 2);
    if (length < 2 || at + 2 + length > buffer.length) return null;
    const payload = buffer.subarray(at + 4, at + 2 + length);
    const candidates = GROUP_OF_MARKER[marker] || [];
    let groups = [];
    if (marker === 0xe1) {
      const sig = payload.subarray(0, 29).toString("latin1");
      if (sig.startsWith("Exif")) groups = ["exif"];
      else if (sig.startsWith("http://ns.adobe.com/xap/1.0/")) groups = ["xmp"];
      else groups = [];
    } else {
      groups = candidates;
    }
    segments.push({
      marker,
      name: markerName(marker),
      offset: at,
      length: length + 2,
      groups,
      payloadSize: payload.length,
    });
    at += 2 + length;
  }
  return segments;
}

/** User-facing metadata inventory for a JPEG. */
function readJpegTags(buffer) {
  const segments = jpegSegments(buffer);
  if (!segments) return [];
  const tags = [];
  for (const seg of segments) {
    for (const group of seg.groups) {
      tags.push({
        group: group.toUpperCase(),
        name: `${seg.name} · ${group}`,
        size: seg.payloadSize,
      });
    }
  }
  return tags;
}

/** Does the EXIF segment carry a GPS IFD? */
function jpegHasGps(buffer) {
  const segments = jpegSegments(buffer);
  if (!segments) return false;
  const exif = segments.find((s) => s.groups.includes("exif"));
  if (!exif) return false;
  // The EXIF payload begins with "Exif\0\0" then a TIFF header whose first IFD
  // offset leads to the IFD0; a GPS IFD is referenced by tag 0x8825. A byte
  // scan for that tag inside the segment is sufficient to answer "present".
  const payload = buffer.subarray(exif.offset + 4, exif.offset + exif.length);
  for (let i = 0; i + 1 < payload.length; i += 2) {
    if (readUInt16BE(payload, i) === 0x8825) return true;
  }
  return false;
}

/**
 * Remove every segment whose internal group maps to a requested user group.
 * Returns the new buffer, or null when the structure is not safely walkable.
 */
function stripJpegSegments(buffer, requested) {
  const segments = jpegSegments(buffer);
  if (!segments) return null;

  const wanted = new Set();
  for (const [internal, users] of Object.entries(USER_GROUPS)) {
    if (users.some((u) => requested.has(u))) wanted.add(internal);
  }

  const parts = [buffer.subarray(0, 2)]; // SOI
  let cursor = 2;
  for (const seg of segments) {
    if (wanted.has("exif") && seg.groups.includes("exif")) {
      cursor = seg.offset + seg.length;
      continue;
    }
    if (seg.groups.some((g) => wanted.has(g))) {
      cursor = seg.offset + seg.length;
      continue;
    }
    parts.push(buffer.subarray(cursor, seg.offset + seg.length));
    cursor = seg.offset + seg.length;
  }
  // Everything from the first non-metadata byte onwards (quant tables, frame
  // header, scan data, EOI) is copied verbatim.
  parts.push(buffer.subarray(cursor));
  return Buffer.concat(parts);
}

/**
 * Which user-facing groups are present in a JPEG. This is the single source of
 * truth for both the inspection report and the "what was actually removed"
 * result, so the two can never disagree.
 */
function presentGroups(buffer) {
  const segments = jpegSegments(buffer);
  const present = new Set();
  if (!segments) return present;
  const internal = new Set();
  for (const seg of segments) for (const g of seg.groups) internal.add(g);
  for (const [name, users] of Object.entries(USER_GROUPS)) {
    if (internal.has(name)) for (const u of users) present.add(u);
  }
  return present;
}

module.exports = {
  sniffKind,
  jpegSegments,
  readJpegTags,
  jpegHasGps,
  stripJpegSegments,
  presentGroups,
};
