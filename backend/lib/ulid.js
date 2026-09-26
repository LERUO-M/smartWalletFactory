// backend/lib/ulid.js
// ─────────────────────────────────────────────────────────────────────────────
// Minimal ULID generator (https://github.com/ulid/spec), no dependencies.
//   01J8ZK3V9Q7W2R5T6Y8B4N1M0C  ← 26 chars, Crockford base32
//   └ 10 chars: ms timestamp ┘└ 16 chars: 80 random bits ┘
// Sortable by creation time, unique, and safe to read out over the phone
// (no I, L, O or U).
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const crypto = require("crypto");

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32

function encodeTime(ms) {
  let out = "";
  let t = Math.floor(ms);
  for (let i = 0; i < 10; i++) {
    out = ALPHABET[t % 32] + out;
    t = Math.floor(t / 32);
  }
  return out;
}

function encodeRandom() {
  const bytes = crypto.randomBytes(16);
  let out = "";
  for (let i = 0; i < 16; i++) out += ALPHABET[bytes[i] % 32];
  return out;
}

/** New ULID. Pass a timestamp (ms) to back-date one, e.g. for old rows. */
function ulid(ms = Date.now()) {
  return encodeTime(ms) + encodeRandom();
}

const isUlid = (s) => /^[0-9A-HJKMNP-TV-Z]{26}$/.test(String(s || ""));

module.exports = { ulid, isUlid };
