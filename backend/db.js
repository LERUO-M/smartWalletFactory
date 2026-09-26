// backend/db.js
// ─────────────────────────────────────────────────────────────────────────────
// SQLite database initialisation via better-sqlite3.
// Creates the tables on first boot and adds new columns to older databases.
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

  -- Every value movement we initiate (used for KYC limits and history)
  CREATE TABLE IF NOT EXISTS transfers (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    kind             TEXT    NOT NULL,            -- 'transfer' | 'faucet' | 'welcome'
    sender_phone     TEXT,                        -- NULL for faucet / welcome
    recipient_phone  TEXT    NOT NULL,
    amount_cents     INTEGER NOT NULL,
    status           TEXT    NOT NULL,            -- 'pending' | 'success' | 'failed'
    op_hash          TEXT,                        -- internal reference, never shown to users
    error            TEXT,
    created_at       INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_transfers_sender ON transfers (sender_phone, created_at);
  CREATE INDEX IF NOT EXISTS idx_transfers_recipient ON transfers (recipient_phone, created_at);

  -- Every SMS we send (or would have sent, when Africa's Talking isn't configured)
  CREATE TABLE IF NOT EXISTS sms_outbox (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    to_phone             TEXT    NOT NULL,
    message              TEXT    NOT NULL,
    sender               TEXT,                    -- short code used as "from"
    category             TEXT,                    -- 'received' | 'kyc' | 'welcome' | 'test' …
    provider             TEXT    NOT NULL,        -- 'africastalking' | 'simulated'
    status               TEXT    NOT NULL,        -- 'queued' | 'sent' | 'failed' | 'simulated' | AT delivery status
    status_code          INTEGER,
    provider_message_id  TEXT,
    cost                 TEXT,
    error                TEXT,
    created_at           INTEGER NOT NULL,
    updated_at           INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sms_to ON sms_outbox (to_phone, created_at);
  CREATE INDEX IF NOT EXISTS idx_sms_msgid ON sms_outbox (provider_message_id);
`);

// ── Migrations for databases created before KYC existed ──────────────────────

function addColumnIfMissing(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// KYC tier: NULL = no ID captured yet, 0 = ID number captured (USSD), 1 = validated
addColumnIfMissing("users", "kyc_level", "INTEGER");
// We never store the raw ID number: a keyed hash (for duplicate checks) and a masked copy
addColumnIfMissing("users", "id_number_hash", "TEXT");
addColumnIfMissing("users", "id_number_masked", "TEXT");
addColumnIfMissing("users", "kyc_method", "TEXT");        // 'ussd' | 'merchant' | 'web'
addColumnIfMissing("users", "kyc_reference", "TEXT");
addColumnIfMissing("users", "kyc_updated_at", "INTEGER");

db.exec(`CREATE INDEX IF NOT EXISTS idx_users_id_hash ON users (id_number_hash)`);

// Transfers get a ULID reference that users see (e.g. 01J8ZK3V9Q7W2R5T6Y8B4N1M0C).
// Back-fill any older rows so every transfer has one.
addColumnIfMissing("transfers", "reference", "TEXT");
{
  const { ulid } = require("./lib/ulid");
  const missing = db.prepare("SELECT id, created_at FROM transfers WHERE reference IS NULL").all();
  const setRef = db.prepare("UPDATE transfers SET reference = ? WHERE id = ?");
  for (const row of missing) setRef.run(ulid(Number(row.created_at)), row.id);
}
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_transfers_reference ON transfers (reference)`);

module.exports = db;
