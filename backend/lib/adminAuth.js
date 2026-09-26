// backend/lib/adminAuth.js
// Guards merchant / back-office endpoints.
// When ADMIN_API_KEY is set, callers must send `x-admin-key: <ADMIN_API_KEY>`.
// When it isn't set (local development) the routes are open – the server warns at startup.
"use strict";

function requireAdmin(req, res, next) {
  const key = process.env.ADMIN_API_KEY;
  if (!key) return next();
  if (req.get("x-admin-key") === key) return next();
  return res.status(401).json({ error: "Missing or invalid x-admin-key" });
}

module.exports = { requireAdmin };
