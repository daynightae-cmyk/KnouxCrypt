"use strict";

/**
 * Password Strength Audit (task 36).
 *
 * This is a real, offline strength estimator in the spirit of zxcvbn: it finds
 * the cheapest way to describe a password using dictionary, repeat, sequence,
 * keyboard and date patterns, then reports the resulting guess count, entropy
 * and score. Everything runs locally, nothing is stored and nothing is sent
 * anywhere.
 *
 * What it deliberately does NOT do, and says so:
 *   - It does not query a breach database, so it never claims a password was
 *     found in a leak. A password that matches the small embedded list is
 *     reported as "common", which is a statement about this list only.
 *   - It does not measure the strength of a *stored* credential; it audits the
 *     text you type here, which is why the screen tells you not to type a real
 *     password.
 *
 * The estimator is deterministic: the same input always yields the same score,
 * which is what makes it testable.
 */
const { badInput } = require("./errors");

const MAX_INPUT = 256;

// A small list of the passwords that appear at the top of every breach corpus.
// It is intentionally short: the goal is to catch the obvious ones, not to
// pretend to be a full breach index.
const COMMON_PASSWORDS = Object.freeze([
  "password", "123456", "12345678", "qwerty", "abc123", "monkey", "letmein",
  "dragon", "111111", "baseball", "iloveyou", "trustno1", "sunshine", "master",
  "welcome", "shadow", "ashley", "football", "jesus", "michael", "ninja",
  "mustang", "password1", "123456789", "adobe123", "admin", "123123", "flower",
  "passw0rd", "lovely", "zaq12wsx", "654321", "superman", "qazwsx", "batman",
  "hunter2", "secret", "letmein1", "login", "princess", "solo", "starwars",
  "freedom", "whatever", "hello", "charlie", "donald", "qwerty123", "1q2w3e4r",
  "root", "toor", "guest", "test", "demo", "changeme", "default", "temp1234",
]);

const COMMON_WORDS = Object.freeze([
  "apple", "orange", "banana", "summer", "winter", "spring", "autumn", "monday",
  "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "january",
  "february", "march", "april", "june", "july", "august", "september", "october",
  "november", "december", "computer", "internet", "welcome", "freedom", "diamond",
  "silver", "golden", "purple", "yellow", "guitar", "soccer", "hockey", "tennis",
  "coffee", "cookie", "banana", "pepper", "sugar", "honey", "camera", "rocket",
  "planet", "galaxy", "dragon", "wizard", "knight", "castle", "forest", "river",
  "mountain", "ocean", "thunder", "lightning", "phoenix", "falcon", "eagle",
  "tiger", "lion", "panther", "cobra", "viper", "raptor", "matrix", "cyber",
]);

const KEYBOARD_ROWS = ["`1234567890-=", "qwertyuiop[]\\", "asdfghjkl;'", "zxcvbnm,./"];

const KEYBOARD_ADJACENCY = (() => {
  const map = new Map();
  const rows = KEYBOARD_ROWS;
  for (let r = 0; r < rows.length; r += 1) {
    for (let c = 0; c < rows[r].length; c += 1) {
      const ch = rows[r][c];
      const neighbors = new Set();
      const offsets = [
        [0, -1], [0, 1], [1, -1], [1, 0], [1, 1], [-1, -1], [-1, 0], [-1, 1],
      ];
      for (const [dr, dc] of offsets) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < rows.length && nc >= 0 && nc < rows[nr].length) {
          neighbors.add(rows[nr][nc]);
        }
      }
      map.set(ch, neighbors);
    }
  }
  return map;
})();

const BRUTEFORCE_CARDINALITY = 10;
const MIN_GUESSES_BEFORE_GROWING = 10000;
const MIN_SUBMATCH_GUESSES = 10;

function charsetSize(password) {
  let size = 0;
  if (/[a-z]/.test(password)) size += 26;
  if (/[A-Z]/.test(password)) size += 26;
  if (/[0-9]/.test(password)) size += 10;
  if (/[^a-zA-Z0-9]/.test(password)) size += 33;
  return size || 1;
}

// ---- matchers --------------------------------------------------------------

function dictionaryMatches(password) {
  const lower = password.toLowerCase();
  const matches = [];
  const lists = [COMMON_PASSWORDS, COMMON_WORDS];
  for (let i = 0; i < lower.length; i += 1) {
    for (let j = i + 3; j <= lower.length; j += 1) {
      const token = lower.slice(i, j);
      let rank = -1;
      for (const list of lists) {
        const idx = list.indexOf(token);
        if (idx !== -1) {
          rank = idx + 1;
          break;
        }
      }
      if (rank !== -1) {
        matches.push({ pattern: "dictionary", i, j, token: password.slice(i, j), rank });
      }
    }
  }
  return matches;
}

function sequenceMatches(password) {
  const matches = [];
  for (let i = 0; i < password.length; i += 1) {
    let j = i + 1;
    let delta = null;
    for (; j < password.length; j += 1) {
      const a = password.charCodeAt(j - 1);
      const b = password.charCodeAt(j);
      const d = b - a;
      if (d === 0 || Math.abs(d) > 1) break;
      if (delta === null) delta = d;
      else if (d !== delta) break;
    }
    if (j - i >= 3 && delta !== null) {
      matches.push({ pattern: "sequence", i, j, token: password.slice(i, j), ascending: delta > 0 });
    }
  }
  return matches;
}

function repeatMatches(password) {
  const matches = [];
  for (let i = 0; i < password.length; i += 1) {
    for (let len = 1; len <= (password.length - i) / 2; len += 1) {
      const base = password.slice(i, i + len);
      let repeats = 1;
      let j = i + len;
      while (j + len <= password.length && password.slice(j, j + len) === base) {
        repeats += 1;
        j += len;
      }
      if (repeats >= 2) {
        matches.push({
          pattern: "repeat",
          i,
          j: i + len * repeats,
          token: password.slice(i, i + len * repeats),
          base,
          repeats,
        });
      }
    }
  }
  return matches;
}

function keyboardMatches(password) {
  const lower = password.toLowerCase();
  const matches = [];
  for (let i = 0; i < lower.length; i += 1) {
    let j = i + 1;
    let lastDir = null;
    for (; j < lower.length; j += 1) {
      const prev = lower[j - 1];
      const cur = lower[j];
      const neighbors = KEYBOARD_ADJACENCY.get(prev);
      if (!neighbors || !neighbors.has(cur)) break;
      const rowOf = (ch) => KEYBOARD_ROWS.findIndex((row) => row.includes(ch));
      const dir = [rowOf(cur) - rowOf(prev), KEYBOARD_ROWS[rowOf(cur)].indexOf(cur) - KEYBOARD_ROWS[rowOf(prev)].indexOf(prev)];
      if (lastDir === null) lastDir = dir;
      else if (dir[0] !== lastDir[0] || dir[1] !== lastDir[1]) break;
    }
    if (j - i >= 3) {
      matches.push({ pattern: "keyboard", i, j, token: password.slice(i, j) });
    }
  }
  return matches;
}

function dateMatches(password) {
  const matches = [];
  const re = /(\d{1,4})/g;
  let m;
  while ((m = re.exec(password)) !== null) {
    const digits = m[1];
    if (digits.length < 4 || digits.length > 8) continue;
    const year = Number(digits.slice(0, 4));
    const plausible = year >= 1900 && year <= 2099;
    const dayMonth = digits.length >= 6;
    if (plausible || dayMonth) {
      matches.push({ pattern: "date", i: m.index, j: m.index + digits.length, token: digits, year });
    }
  }
  return matches;
}

// ---- scoring ---------------------------------------------------------------

function guessesForMatch(match) {
  switch (match.pattern) {
    case "dictionary":
      return match.rank * (match.token.length >= 4 ? 1 : 10);
    case "sequence":
      return match.ascending ? 10 : 20;
    case "repeat": {
      const baseGuesses = Math.max(estimateGuesses(match.base), 1);
      return baseGuesses * match.repeats;
    }
    case "keyboard":
      return 10 * Math.pow(2, Math.max(0, match.token.length - 2));
    case "date":
      return 365 * 100;
    default:
      return MIN_SUBMATCH_GUESSES;
  }
}

function estimateGuesses(password) {
  if (!password) return 1;
  const matches = [
    ...dictionaryMatches(password),
    ...sequenceMatches(password),
    ...repeatMatches(password),
    ...keyboardMatches(password),
    ...dateMatches(password),
  ];

  // Dynamic programming over the cheapest covering sequence, zxcvbn style.
  const n = password.length;
  const best = new Array(n + 1).fill(Infinity);
  const choice = new Array(n + 1).fill(null);
  best[0] = 1;

  for (let k = 1; k <= n; k += 1) {
    // Brute-force a single character at the end.
    const brute = best[k - 1] * BRUTEFORCE_CARDINALITY;
    if (brute < best[k]) {
      best[k] = brute;
      choice[k] = { pattern: "bruteforce", i: k - 1, j: k };
    }
    // Extend by any match ending at k.
    for (const match of matches) {
      if (match.j !== k) continue;
      const guesses = guessesForMatch(match);
      const candidate = Math.max(best[match.i] * guesses, MIN_SUBMATCH_GUESSES);
      if (candidate < best[k]) {
        best[k] = candidate;
        choice[k] = match;
      }
    }
  }

  // Guard the growth factor so a long random string does not overflow.
  let guesses = best[n];
  if (!Number.isFinite(guesses)) guesses = Math.pow(BRUTEFORCE_CARDINALITY, n);
  if (n > 0) guesses = Math.max(guesses, Math.pow(MIN_GUESSES_BEFORE_GROWING, 0) * 1);
  return guesses;
}

function scoreFromGuesses(guesses) {
  const log10 = Math.log10(Math.max(guesses, 1));
  if (log10 < 4) return 0;
  if (log10 < 8) return 1;
  if (log10 < 11) return 2;
  if (log10 < 14) return 3;
  return 4;
}

const SCORE_LABELS = Object.freeze(["Very weak", "Weak", "Fair", "Strong", "Very strong"]);

function feedbackFor(password, matches, score) {
  const warnings = [];
  const suggestions = [];
  if (matches.some((m) => m.pattern === "dictionary")) {
    warnings.push("Contains a common password or word.");
    suggestions.push("Avoid common words and known passwords.");
  }
  if (matches.some((m) => m.pattern === "repeat")) {
    warnings.push("Contains repeated characters or blocks.");
    suggestions.push("Avoid repeated patterns like 'aaa' or 'abcabc'.");
  }
  if (matches.some((m) => m.pattern === "sequence")) {
    warnings.push("Contains a straight sequence.");
    suggestions.push("Avoid runs like 'abcdef' or '123456'.");
  }
  if (matches.some((m) => m.pattern === "keyboard")) {
    warnings.push("Contains a keyboard pattern.");
    suggestions.push("Avoid keyboard walks like 'qwerty' or 'asdf'.");
  }
  if (matches.some((m) => m.pattern === "date")) {
    warnings.push("Contains something that looks like a date or year.");
    suggestions.push("Avoid years and dates.");
  }
  if (password.length < 12) suggestions.push("Use at least 12 characters.");
  if (score < 3) suggestions.push("Longer passphrases are easier to remember and harder to guess.");
  return { warnings, suggestions };
}

/**
 * Audit one string. Returns the estimate plus explicit, machine-readable limits
 * so the caller can render honest copy without inventing it.
 */
function audit(input) {
  if (typeof input !== "string") throw badInput("A password string is required");
  if (input.length > MAX_INPUT) throw badInput(`The input must be at most ${MAX_INPUT} characters`);
  if (input.length === 0) throw badInput("Enter some text to audit");

  const matches = [
    ...dictionaryMatches(input),
    ...sequenceMatches(input),
    ...repeatMatches(input),
    ...keyboardMatches(input),
    ...dateMatches(input),
  ];
  const guesses = estimateGuesses(input);
  const score = scoreFromGuesses(guesses);
  const entropyBits = Math.round(Math.log2(Math.max(guesses, 1)));

  const classCount =
    (/[a-z]/.test(input) ? 1 : 0) +
    (/[A-Z]/.test(input) ? 1 : 0) +
    (/[0-9]/.test(input) ? 1 : 0) +
    (/[^a-zA-Z0-9]/.test(input) ? 1 : 0);

  return {
    length: input.length,
    classCount,
    charsetSize: charsetSize(input),
    guesses: Math.round(guesses),
    guessesLog10: Math.round(Math.log10(Math.max(guesses, 1)) * 100) / 100,
    entropyBits,
    score,
    scoreLabel: SCORE_LABELS[score],
    patterns: matches
      .map((m) => ({ pattern: m.pattern, token: m.pattern === "bruteforce" ? "" : m.token, i: m.i, j: m.j }))
      .sort((a, b) => a.i - b.i || a.j - b.j),
    feedback: feedbackFor(input, matches, score),
    // Hard limits, stated as data so the UI cannot overstate the result.
    limits: {
      breachChecked: false,
      storedInput: false,
      note: "Offline heuristic estimate only. No breach database is consulted and the input is not stored.",
    },
  };
}

module.exports = {
  audit,
  estimateGuesses,
  scoreFromGuesses,
  SCORE_LABELS,
  COMMON_PASSWORDS,
  COMMON_WORDS,
  MAX_INPUT,
};
