// backend/lib/phone.js
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for phone number normalisation.
// Both the USSD routes and the REST API routes import from here so the format
// stored in the DB is always consistent.
//
// All phone numbers are stored and looked up in E.164 format: +27XXXXXXXXX
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

/**
 * Convert any South African phone number format to E.164 (+27XXXXXXXXX).
 *
 * Accepted inputs:
 *   "0821234567"       → "+27821234567"
 *   "27821234567"      → "+27821234567"
 *   "+27821234567"     → "+27821234567"  (already correct)
 *   "082 123 4567"     → "+27821234567"  (spaces stripped)
 *
 * @param {string} phone - Raw phone number from any source.
 * @returns {string|null} E.164 number, or null if the input is invalid.
 */
function toE164(phone) {
  if (!phone) return null;

  // Strip all whitespace and any characters that aren't digits or a leading +
  let p = String(phone).replace(/\s+/g, "").replace(/[^\d+]/g, "");

  // Local SA format: 0XXXXXXXXX (10 digits starting with 0)
  if (/^0\d{9}$/.test(p)) return "+27" + p.slice(1);

  // Without country code prefix: 27XXXXXXXXX (11 digits starting with 27)
  if (/^27\d{9}$/.test(p)) return "+" + p;

  // Already E.164: +27XXXXXXXXX
  if (/^\+27\d{9}$/.test(p)) return p;

  return null; // unrecognised format
}

/**
 * Validate that a string is a properly normalised E.164 SA number.
 * @param {string} phone
 * @returns {boolean}
 */
function isValidE164(phone) {
  return /^\+27\d{9}$/.test(phone);
}

// ── Money formatting for SMS / USSD copy ─────────────────────────────────────

/** Cents → "R1,234.50" */
function formatRand(cents) {
  const n = Number(cents) / 100;
  return "R" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Cents → "R500" / "R10,000" when whole, else "R12.50" */
function formatRandShort(cents) {
  const n = Number(cents) / 100;
  return Number.isInteger(n) ? "R" + n.toLocaleString("en-US") : formatRand(cents);
}

module.exports = {
  toE164,
  isValidE164,
  // routes/auth.js and routes/transactions.js import this name
  normalizePhone: toE164,
  formatRand,
  formatRandShort,
};
