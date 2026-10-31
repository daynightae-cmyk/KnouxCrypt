"use strict";

/**
 * RFC 4226 / RFC 6238 conformance tests.
 *
 * The vectors are copied from the published RFCs, so a passing run means the
 * implementation agrees with the standard rather than with itself.
 *   RFC 4226 Appendix D  — HOTP, SHA-1
 *   RFC 6238 Appendix B  — TOTP, SHA-1 / SHA-256 / SHA-512
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  hotp,
  totp,
  verify,
  remainingSeconds,
  decodeSecret,
  encodeSecret,
  generateSecret,
  parseOtpauthUri,
} = require("../electron/vault/totp");

test("HOTP matches the RFC 4226 Appendix D vectors", () => {
  // The RFC publishes the secret as ASCII "12345678901234567890".
  const secret = encodeSecret(Buffer.from("12345678901234567890", "ascii"));
  const expected = [
    "755224", "287082", "359152", "969429", "338314", "254676",
    "287922", "162583", "399871", "520489",
  ];
  expected.forEach((value, counter) => {
    assert.equal(hotp(secret, counter), value, `counter ${counter}`);
  });
});

test("TOTP matches the RFC 6238 Appendix B SHA-1 vectors", () => {
  const secret = encodeSecret(Buffer.from("12345678901234567890", "ascii"));
  const vectors = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];
  for (const [seconds, expected] of vectors) {
    assert.equal(totp(secret, seconds * 1000, { digits: 8 }), expected, `t=${seconds}`);
  }
});

test("TOTP matches the RFC 6238 Appendix B SHA-256 vectors", () => {
  // RFC 6238 uses a 32-byte seed for SHA-256: "12345678901234567890123456789012".
  const secret = encodeSecret(Buffer.from("12345678901234567890123456789012", "ascii"));
  const vectors = [
    [59, "46119246"],
    [1111111109, "68084774"],
    [1111111111, "67062674"],
    [1234567890, "91819424"],
    [2000000000, "90698825"],
    [20000000000, "77737706"],
  ];
  for (const [seconds, expected] of vectors) {
    assert.equal(totp(secret, seconds * 1000, { digits: 8, algorithm: "SHA256" }), expected, `t=${seconds}`);
  }
});

test("TOTP matches the RFC 6238 Appendix B SHA-512 vectors", () => {
  const seed = "1234567890123456789012345678901234567890123456789012345678901234";
  const secret = encodeSecret(Buffer.from(seed, "ascii"));
  const vectors = [
    [59, "90693936"],
    [1111111109, "25091201"],
    [1111111111, "99943326"],
    [1234567890, "93441116"],
    [2000000000, "38618901"],
    [20000000000, "47863826"],
  ];
  for (const [seconds, expected] of vectors) {
    assert.equal(totp(secret, seconds * 1000, { digits: 8, algorithm: "SHA512" }), expected, `t=${seconds}`);
  }
});

test("a code stays valid for its whole step and changes on the next one", () => {
  const secret = generateSecret();
  const code = totp(secret, 30_000);
  assert.equal(totp(secret, 30_000), code);
  assert.equal(totp(secret, 59_999), code);
  assert.notEqual(totp(secret, 60_000), code);
});

test("verify accepts the current code and one step of clock drift", () => {
  const secret = generateSecret();
  const now = 1_700_000_000_000;
  assert.equal(verify(secret, totp(secret, now), now).ok, true);
  assert.equal(verify(secret, totp(secret, now - 30_000), now).ok, true);
  assert.equal(verify(secret, totp(secret, now + 30_000), now).ok, true);
});

test("verify rejects a code from far outside the drift window", () => {
  const secret = generateSecret();
  const now = 1_700_000_000_000;
  assert.equal(verify(secret, totp(secret, now - 120_000), now).ok, false);
  assert.equal(verify(secret, totp(secret, now + 120_000), now).ok, false);
});

test("verify rejects a wrong code, a short code and a non-numeric code", () => {
  const secret = generateSecret();
  const now = 1_700_000_000_000;
  const real = totp(secret, now);
  const wrong = real === "000000" ? "111111" : "000000";
  assert.equal(verify(secret, wrong, now).ok, false);
  assert.equal(verify(secret, real.slice(0, 5), now).ok, false);
  assert.equal(verify(secret, "abcdef", now).ok, false);
  assert.equal(verify(secret, "", now).ok, false);
});

test("verify reports the matched counter so a replay can be refused", () => {
  const secret = generateSecret();
  const now = 1_700_000_000_000;
  const result = verify(secret, totp(secret, now), now);
  assert.equal(result.ok, true);
  assert.equal(result.counter, Math.floor(now / 30_000));
});

test("remainingSeconds counts down and never reports zero", () => {
  assert.equal(remainingSeconds(0), 30);
  assert.equal(remainingSeconds(1_000), 29);
  assert.equal(remainingSeconds(29_000), 1);
  assert.equal(remainingSeconds(30_000), 30);
});

test("Base32 secrets round-trip and accept lowercase, spaces and padding", () => {
  const raw = Buffer.from("12345678901234567890", "ascii");
  const encoded = encodeSecret(raw);
  assert.deepEqual(decodeSecret(encoded), raw);
  assert.deepEqual(decodeSecret(encoded.toLowerCase()), raw);
  assert.deepEqual(decodeSecret(`${encoded.slice(0, 8)} ${encoded.slice(8)}`), raw);
  assert.deepEqual(decodeSecret(`${encoded}======`), raw);
});

test("weak or malformed secrets are refused", () => {
  assert.throws(() => decodeSecret(""), /Base32/);
  assert.throws(() => decodeSecret("not-base32!"), /Base32/);
  // 8 bytes decodes below the 10-byte floor.
  assert.throws(() => decodeSecret(encodeSecret(Buffer.alloc(8, 1))), /at least/);
  assert.throws(() => generateSecret(4), /between/);
});

test("unsupported digits and periods are refused", () => {
  const secret = generateSecret();
  assert.throws(() => totp(secret, 0, { digits: 5 }), /Digits/);
  assert.throws(() => totp(secret, 0, { digits: 9 }), /Digits/);
  assert.throws(() => totp(secret, 0, { period: 0 }), /Period/);
  assert.throws(() => totp(secret, 0, { period: 10_000 }), /Period/);
  assert.throws(() => totp(secret, 0, { algorithm: "MD5" }), /algorithm/);
});

test("generateSecret produces a distinct, correctly sized secret each call", () => {
  const a = generateSecret();
  const b = generateSecret();
  assert.notEqual(a, b);
  assert.equal(decodeSecret(a).length, 20);
  assert.equal(decodeSecret(generateSecret(32)).length, 32);
});

test("8-digit codes are padded, never truncated to a shorter string", () => {
  const secret = generateSecret();
  for (let step = 0; step < 200; step += 1) {
    assert.match(totp(secret, step * 30_000, { digits: 8 }), /^\d{8}$/);
  }
});

// ---- otpauth:// URI parsing (task 11) --------------------------------------

test("a standard otpauth:// URI parses into a stored-shape account", () => {
  const parsed = parseOtpauthUri(
    "otpauth://totp/Example:alice@example.invalid?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Example",
  );
  assert.equal(parsed.type, "totp");
  assert.equal(parsed.name, "alice@example.invalid");
  assert.equal(parsed.issuer, "Example");
  assert.equal(parsed.secret, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.equal(parsed.digits, 6);
  assert.equal(parsed.period, 30);
  assert.equal(parsed.algorithm, "SHA1");
});

test("URI parameters override the defaults and are normalised", () => {
  const parsed = parseOtpauthUri(
    "otpauth://totp/Acct?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&algorithm=sha256&digits=8&period=60",
  );
  assert.equal(parsed.algorithm, "SHA256");
  assert.equal(parsed.digits, 8);
  assert.equal(parsed.period, 60);
  // No issuer in the query and no "Issuer:" prefix in the label.
  assert.equal(parsed.issuer, "");
  assert.equal(parsed.name, "Acct");
});

test("the issuer falls back to the label prefix", () => {
  const parsed = parseOtpauthUri(
    "otpauth://totp/Knoux:alice?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
  );
  assert.equal(parsed.issuer, "Knoux");
  assert.equal(parsed.name, "alice");
});

test("a percent-encoded label is decoded", () => {
  const parsed = parseOtpauthUri(
    "otpauth://totp/Example%3Aalice%40example.invalid?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
  );
  assert.equal(parsed.name, "alice@example.invalid");
  assert.equal(parsed.issuer, "Example");
});

test("an hotp URI requires and carries its counter", () => {
  const parsed = parseOtpauthUri(
    "otpauth://hotp/Acct?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&counter=7",
  );
  assert.equal(parsed.type, "hotp");
  assert.equal(parsed.counter, 7);
  assert.throws(
    () => parseOtpauthUri("otpauth://hotp/Acct?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"),
    /counter/,
  );
});

test("non-otpauth and malformed URIs are refused", () => {
  assert.throws(() => parseOtpauthUri("https://example.invalid/secret"), /otpauth/);
  assert.throws(() => parseOtpauthUri(""), /required/);
  assert.throws(() => parseOtpauthUri("otpauth://steam/Acct?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"), /Unsupported/);
  assert.throws(() => parseOtpauthUri("otpauth://totp/Acct"), /secret/);
  assert.throws(() => parseOtpauthUri("otpauth://totp/?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"), /label/);
  assert.throws(() => parseOtpauthUri("otpauth://totp/Acct?secret=short"), /at least|Base32/);
});
