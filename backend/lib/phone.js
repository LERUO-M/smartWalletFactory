// backend/lib/phone.js
// Normalise any SA phone input to +27XXXXXXXXX.
"use strict";

function normalizePhone(input) {
  if (!input) return null;
  const digits = String(input).replace(/\D/g, "");
  let local;
  if (digits.startsWith("27") && digits.length === 11) local = "0" + digits.slice(2);
  else if (digits.length === 10 && digits.startsWith("0")) local = digits;
  else return null;
  if (!/^0\d{9}$/.test(local)) return null;
  return "+27" + local.slice(1);
}

module.exports = { normalizePhone };
