"use strict";

/**
 * Task 08 — password generation.
 *
 * The renderer module is bundled with esbuild so the test exercises the exact
 * function the UI calls, against Node's real webcrypto, not a re-implementation.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { webcrypto } = require("node:crypto");
const esbuild = require("esbuild");

// generatePassword reads the global CSPRNG, which browsers expose as `crypto`.
// Node already provides the same WebCrypto global, so only fill it in if absent.
if (!globalThis.crypto?.getRandomValues) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}

const root = path.resolve(__dirname, "..");

function loadGenerator() {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, "src/lib/passwordGenerator.js")],
    bundle: true,
    write: false,
    platform: "browser",
    format: "cjs",
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "knoux-gen-"));
  const file = path.join(dir, "gen.cjs");
  fs.writeFileSync(file, result.outputFiles[0].contents);
  try {
    return require(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const ALL = { uppercase: true, lowercase: true, digits: true, symbols: true };
const { generatePassword } = loadGenerator();

test("the generator honours the requested length", () => {
  for (const length of [8, 12, 20, 32, 64, 128]) {
    assert.equal(generatePassword(length, ALL).length, length, `length ${length}`);
  }
});

test("the length is clamped into the supported range", () => {
  assert.equal(generatePassword(2, ALL).length, 8);
  assert.equal(generatePassword(9999, ALL).length, 128);
});

test("an empty character-set selection produces nothing", () => {
  assert.equal(generatePassword(20, { uppercase: false, lowercase: false, digits: false, symbols: false }), "");
});

test("every enabled pool is represented in the output", () => {
  const pools = {
    uppercase: /[A-Z]/,
    lowercase: /[a-z]/,
    digits: /[0-9]/,
    symbols: /[!@#$%&*?\-_=+]/,
  };
  for (let i = 0; i < 200; i += 1) {
    const value = generatePassword(20, ALL);
    for (const [name, re] of Object.entries(pools)) {
      assert.match(value, re, `run ${i} must contain a ${name} character`);
    }
  }
});

test("disabled pools never appear", () => {
  const digitsOnly = { uppercase: false, lowercase: false, digits: true, symbols: false };
  for (let i = 0; i < 100; i += 1) {
    assert.match(generatePassword(16, digitsOnly), /^[0-9]+$/);
  }
});

test("successive values are not repeated", () => {
  const seen = new Set();
  for (let i = 0; i < 500; i += 1) seen.add(generatePassword(24, ALL));
  assert.equal(seen.size, 500, "500 generations must produce 500 distinct values");
});

test("characters within a pool are uniformly distributed", () => {
  // A naive `random % pool.length` generator visibly over-represents the first
  // characters of each pool. Rejection sampling keeps them even. Pool-level
  // totals differ by design (every enabled pool gets one guaranteed character),
  // so uniformity is measured inside each pool.
  const pools = {
    uppercase: "ABCDEFGHJKLMNPQRSTUVWXYZ",
    lowercase: "abcdefghjkmnpqrstuvwxyz",
    digits: "23456789",
    symbols: "!@#$%&*?-_=+",
  };
  const counts = new Map();
  const runs = 4000;
  for (let i = 0; i < runs; i += 1) {
    for (const ch of generatePassword(20, ALL)) counts.set(ch, (counts.get(ch) || 0) + 1);
  }
  for (const [name, chars] of Object.entries(pools)) {
    const values = [...chars].map((ch) => counts.get(ch) || 0);
    const total = values.reduce((a, b) => a + b, 0);
    const expected = total / values.length;
    const maxDeviation = Math.max(...values.map((v) => Math.abs(v - expected) / expected));
    assert.ok(maxDeviation < 0.15, `${name} max deviation ${(maxDeviation * 100).toFixed(1)}% suggests biased sampling`);
  }
});

test("the generated value is never the public demo fixture", () => {
  for (let i = 0; i < 50; i += 1) assert.notEqual(generatePassword(20, ALL), "Public-Demo-Only!23");
});
