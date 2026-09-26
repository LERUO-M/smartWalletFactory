// backend/server.js
// ─────────────────────────────────────────────────────────────────────────────
// Entry point for the SA Smart Wallet USSD backend server.
//
// Exposes two endpoint groups:
//   POST /ussd   – Africa's Talking-compatible USSD webhook
//   GET  /api/*  – REST API for the web-based Nokia simulator
//
// Quick start:
//   1. cp .env.example .env && fill in your values
//   2. npm install
//   3. npm start          (production)
//      npm run dev        (development with auto-restart)
//
// To expose to the internet for Africa's Talking / a real phone:
//   ngrok http 3000
//   → paste the https://xxxx.ngrok-free.app/ussd URL into your AT dashboard
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

require("dotenv").config({ path: __dirname + "/.env" });

const express = require("express");
const morgan  = require("morgan");
const cors    = require("cors");
const path    = require("path");

// ── Routes ────────────────────────────────────────────────────────────────────
const ussdRoute = require("./routes/ussd");
const apiRoute  = require("./routes/api");
const authRoute = require("./routes/auth");
const txRoute   = require("./routes/transactions");

// ── App Setup ─────────────────────────────────────────────────────────────────
const app = express();

// USSD gateways send application/x-www-form-urlencoded
// The web simulator sends application/json
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Logging (concise format in production, detailed in development)
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Allow CORS from the web simulator (useful during local development)
app.use(cors({ origin: "*" }));

// ── Static Files (web simulator) ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ── Route Mounting ────────────────────────────────────────────────────────────

// USSD webhook – Africa's Talking posts here
app.use("/ussd", ussdRoute);

// REST API for the web simulator + wallet UI
app.use("/api", apiRoute);
app.use("/api/auth", authRoute);
app.use("/api/tx", txRoute);

// ── Health & Root ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send(`
    <h2>SA ZAR Smart Wallet – USSD Backend</h2>
    <ul>
      <li><b>POST /ussd</b> – Africa's Talking USSD webhook</li>
      <li><b>GET /api/health</b> – Server health check</li>
      <li><b>GET /api/wallet/:phone</b> – Wallet info for a phone number</li>
      <li><b>GET /</b> (static) – Feature-phone web simulator</li>
    </ul>
    <p>Status: <b style="color:green">Running</b> | ${new Date().toISOString()}</p>
  `);
});

// ── 404 & Error Handlers ──────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, _next) => {
  console.error("[SERVER ERROR]", err);
  res.status(500).json({ error: "Internal server error" });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? "3000", 10);
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║   SA ZAR Smart Wallet – USSD Backend                    ║
╠══════════════════════════════════════════════════════════╣
║   Server running at:  http://localhost:${PORT}            ║
║                                                          ║
║   USSD webhook:       POST http://localhost:${PORT}/ussd  ║
║   API health:         GET  http://localhost:${PORT}/api/health ║
║   Simulator UI:       http://localhost:${PORT}            ║
╠══════════════════════════════════════════════════════════╣
║   To expose publicly for Africa's Talking / real phones: ║
║     npx ngrok http ${PORT}                               ║
║   Then paste the https URL + /ussd into your AT dashboard║
╚══════════════════════════════════════════════════════════╝
  `);

  // Warn about missing config at startup
  const required = [
    "RPC_URL", "BUNDLER_RPC_URL", "FACTORY_ADDRESS",
    "PAYMASTER_ADDRESS", "ZAR_TOKEN_ADDRESS",
    "PAYMASTER_SIGNER_PRIVATE_KEY", "KEY_ENCRYPTION_SECRET",
    "ENTRY_POINT_ADDRESS", "JWT_SECRET",
  ];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.warn(`\n⚠️  Missing .env variables: ${missing.join(", ")}`);
    console.warn("   Copy backend/.env.example → backend/.env and fill in values.\n");
  }
});

module.exports = app; // for testing
