// backend/db.js
// ─────────────────────────────────────────────────────────────────────────────
// SQLite database initialisation via better-sqlite3.
// Creates the local users table on first boot if it does not exist.
//
// The database file is stored at ./data/users.db  (relative to the backend/ dir).
// In production, swap this for a proper cloud-hosted DB or KMS.
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const Database = require("better-sqlite3");
const path     = require("path");
const fs       = require("fs");

const DATA_DIR = path.join(__dirname, "data");
const DB_PATH  = path.join(DATA_DIR, "users.db");

// Ensure the data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Optimise SQLite for a low-concurrency server scenario
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    phone                       TEXT    NOT NULL UNIQUE,
    pin_hash                    TEXT    NOT NULL,

    -- The public Ethereum address derived from the user's generated keypair.
    -- Set immediately after registration; used for wallet address prediction.
    owner_address               TEXT,

    -- AES-256-GCM encrypted private key components
    encrypted_key_iv            TEXT    NOT NULL,
    encrypted_key_tag           TEXT    NOT NULL,
    encrypted_key_ciphertext    TEXT    NOT NULL,

    -- Welcome bonus tracking (prevent double-claim)
    welcome_bonus_claimed       INTEGER NOT NULL DEFAULT 0,

    created_at                  INTEGER NOT NULL
  );
`);

module.exports = db;
