/**
 * Password generation.
 *
 * Kept free of React and Electron imports so it can be tested directly and
 * reused by any caller. Uses the platform CSPRNG with rejection sampling, so no
 * character is more likely than another (a plain `random % pool.length` biases
 * the start of each pool).
 */
export const PASSWORD_POOLS = Object.freeze({
  uppercase: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  lowercase: "abcdefghjkmnpqrstuvwxyz",
  digits: "23456789",
  symbols: "!@#$%&*?-_=+",
});

export const MIN_LENGTH = 8;
export const MAX_LENGTH = 128;

function uniform(max) {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  let value;
  do {
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= limit);
  return value % max;
}

export function generatePassword(length, sets = {}) {
  const enabled = Object.keys(PASSWORD_POOLS).filter((key) => sets[key]);
  if (!enabled.length) return "";

  const size = Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, Math.round(Number(length) || 16)));
  const alphabet = enabled.map((key) => PASSWORD_POOLS[key]).join("");

  // One character from every enabled pool, then fill, then shuffle so the
  // guaranteed characters are not always in the first positions.
  const chars = enabled.map((key) => PASSWORD_POOLS[key][uniform(PASSWORD_POOLS[key].length)]);
  while (chars.length < size) chars.push(alphabet[uniform(alphabet.length)]);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = uniform(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export default generatePassword;
