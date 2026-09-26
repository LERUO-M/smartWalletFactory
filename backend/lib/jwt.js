// backend/lib/jwt.js
// ─────────────────────────────────────────────────────────────────────────────
// Thin wrapper around jsonwebtoken for issuing and verifying session tokens.
//
// The token payload contains: { phone, ownerAddress }
// The frontend stores it in localStorage and sends it as "Authorization: Bearer <token>"
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const jwt = require("jsonwebtoken");

const SECRET  = () => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set in .env");
  return s;
};
const EXPIRES = "7d";

/**
 * Issue a signed JWT for an authenticated user.
 * @param {string} phone        - E.164 phone number.
 * @param {string} ownerAddress - Ethereum owner EOA address.
 * @returns {string} Signed JWT.
 */
function sign(phone, ownerAddress) {
  return jwt.sign({ phone, ownerAddress }, SECRET(), { expiresIn: EXPIRES });
}

/**
 * Verify a JWT and return its payload.
 * @param {string} token
 * @returns {{ phone: string, ownerAddress: string }} Decoded payload.
 * @throws If the token is invalid or expired.
 */
function verify(token) {
  return jwt.verify(token, SECRET());
}

/**
 * Express middleware that enforces a valid Bearer token.
 * Attaches `req.user = { phone, ownerAddress }` on success.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Authentication required" });

  try {
    req.user = verify(token);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session — please log in again" });
  }
}

module.exports = { sign, verify, requireAuth };
