// backend/services/kycService.js
// ─────────────────────────────────────────────────────────────────────────────
// Tiered KYC and transaction limits.
//
//   (none)   No ID captured yet (users registered before KYC existed).
//            Can receive and check balance, but cannot send.
//   Level 0  SA ID number captured over USSD (format + checksum validated).
//            Small limits: R500 per day, R10,000 per month (configurable).
//   Level 1  Validated in person at a merchant or online on the website
//            (POST /api/kyc/:phone/verify). Higher limits.
//
// Limits count successful outgoing transfers only (faucet / welcome bonus
// don't count). Days and months are measured in South African time (UTC+2).
//
// Only a keyed hash (to stop one ID being used on many phones) and a masked
// copy of the ID number are stored – never the raw number.
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const crypto = require("crypto");
const db     = require("../db");
const { formatRandShort } = require("../lib/phone");
const { ulid } = require("../lib/ulid");

const envCents = (name, rands) => {
  const v = process.env[name];
  const n = v === undefined || v === "" ? rands : Number(v);
  return Math.round((Number.isFinite(n) ? n : rands) * 100);
};

/** Tier table. Amounts in cents. Override in .env with whole-rand values. */
function getTiers() {
  return {
    0: {
      level: 0,
      name: "Level 0",
      description: "ID number captured on USSD",
      dailyLimitCents:   envCents("KYC_L0_DAILY_LIMIT", 500),
      monthlyLimitCents: envCents("KYC_L0_MONTHLY_LIMIT", 10000),
    },
    1: {
      level: 1,
      name: "Level 1",
      description: "Validated at a merchant or on the website",
      dailyLimitCents:   envCents("KYC_L1_DAILY_LIMIT", 25000),
      monthlyLimitCents: envCents("KYC_L1_MONTHLY_LIMIT", 100000),
    },
  };
}

const MAX_LEVEL = 1;

// ── SA ID number validation ──────────────────────────────────────────────────

/**
 * Validate a 13-digit South African ID number: YYMMDD SSSS C A Z
 * - date of birth must be a real date
 * - C (citizenship) must be 0 or 1
 * - Z is a Luhn check digit
 * @returns {{ ok: boolean, reason?: string }}
 */
function validateSaId(raw) {
  const id = String(raw || "").replace(/\s+/g, "");
  if (!/^\d{13}$/.test(id)) return { ok: false, reason: "must be 13 digits" };

  const yy = Number(id.slice(0, 2));
  const mm = Number(id.slice(2, 4));
  const dd = Number(id.slice(4, 6));
  const nowYY = new Date().getUTCFullYear() % 100;
  const year  = yy <= nowYY ? 2000 + yy : 1900 + yy;
  const date  = new Date(Date.UTC(year, mm - 1, dd));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== mm - 1 || date.getUTCDate() !== dd) {
    return { ok: false, reason: "invalid date of birth" };
  }

  if (!["0", "1"].includes(id[10])) return { ok: false, reason: "invalid citizenship digit" };

  // Luhn
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let d = Number(id[12 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  if (sum % 10 !== 0) return { ok: false, reason: "checksum failed" };
  return { ok: true };
}

function hashId(id) {
  const secret = process.env.KEY_ENCRYPTION_SECRET || "dev-only-secret";
  return crypto.createHmac("sha256", secret).update("sa-id:" + id).digest("hex");
}

const maskId = (id) => id.slice(0, 6) + "•••••" + id.slice(-2);

// ── Time windows (South African Standard Time, UTC+2, no DST) ────────────────

const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;

function windowStarts(now = Date.now()) {
  const local = new Date(now + SAST_OFFSET_MS);
  const dayStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - SAST_OFFSET_MS;
  const monthStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - SAST_OFFSET_MS;
  return { dayStart, monthStart };
}

function sentSince(phone, since) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(amount_cents), 0) AS total FROM transfers
    WHERE sender_phone = ? AND kind = 'transfer' AND status IN ('success', 'pending') AND created_at >= ?
  `).get(phone, since);
  return Number(row.total);
}

/** Is this ID number already linked to a phone (other than `exceptPhone`)? */
function idInUse(rawId, exceptPhone = "") {
  const id = String(rawId || "").replace(/\s+/g, "");
  return !!db.prepare("SELECT 1 FROM users WHERE id_number_hash = ? AND phone != ?").get(hashId(id), exceptPhone);
}

// ── Public API ────────────────────────────────────────────────────────────────

function getUserRow(phone) {
  return db.prepare(
    "SELECT phone, kyc_level, id_number_masked, kyc_method, kyc_reference, kyc_updated_at FROM users WHERE phone = ?"
  ).get(phone);
}

/**
 * Full KYC + limit status for a phone number.
 * @returns {object|null} null if the phone is not registered
 */
function getStatus(phone) {
  const row = getUserRow(phone);
  if (!row) return null;

  const level = row.kyc_level === null || row.kyc_level === undefined ? null : Number(row.kyc_level);
  const tier  = level === null ? null : getTiers()[level];
  const { dayStart, monthStart } = windowStarts();
  const usedTodayCents = sentSince(phone, dayStart);
  const usedMonthCents = sentSince(phone, monthStart);

  return {
    level,
    tierName: tier ? tier.name : "Not verified",
    canSend: level !== null,
    canUpgrade: level !== null && level < MAX_LEVEL,
    idNumberMasked: row.id_number_masked || null,
    method: row.kyc_method || null,
    reference: row.kyc_reference || null,
    updatedAt: row.kyc_updated_at || null,
    limits: tier
      ? { dailyCents: tier.dailyLimitCents, monthlyCents: tier.monthlyLimitCents }
      : { dailyCents: 0, monthlyCents: 0 },
    used: { todayCents: usedTodayCents, monthCents: usedMonthCents },
    remaining: tier
      ? {
          todayCents: Math.max(0, Math.min(tier.dailyLimitCents - usedTodayCents, tier.monthlyLimitCents - usedMonthCents)),
          monthCents: Math.max(0, tier.monthlyLimitCents - usedMonthCents),
        }
      : { todayCents: 0, monthCents: 0 },
  };
}

/**
 * Can `phone` send `amountCents` right now?
 * @returns {{ ok: true } | { ok: false, reason: 'no_kyc'|'daily'|'monthly', status }}
 */
function checkSend(phone, amountCents) {
  const status = getStatus(phone);
  if (!status || !status.canSend) return { ok: false, reason: "no_kyc", status };
  if (status.used.todayCents + amountCents > status.limits.dailyCents) return { ok: false, reason: "daily", status };
  if (status.used.monthCents + amountCents > status.limits.monthlyCents) return { ok: false, reason: "monthly", status };
  return { ok: true, status };
}

/**
 * Capture an ID number (Level 0). Won't downgrade someone already at Level 1.
 * @returns {{ ok: boolean, reason?: string, status?: object }}
 */
function setIdNumber(phone, rawId, method = "ussd") {
  const id = String(rawId || "").replace(/\s+/g, "");
  const v = validateSaId(id);
  if (!v.ok) return { ok: false, reason: "invalid", detail: v.reason };

  const row = getUserRow(phone);
  if (!row) return { ok: false, reason: "not_registered" };

  const hash = hashId(id);
  const other = db.prepare("SELECT phone FROM users WHERE id_number_hash = ? AND phone != ?").get(hash, phone);
  if (other) return { ok: false, reason: "id_in_use" };

  const level = row.kyc_level === null || row.kyc_level === undefined ? 0 : Math.max(0, Number(row.kyc_level));
  db.prepare(`
    UPDATE users SET id_number_hash = ?, id_number_masked = ?, kyc_level = ?,
      kyc_method = COALESCE(kyc_method, ?), kyc_updated_at = ?
    WHERE phone = ?
  `).run(hash, maskId(id), level, method, Date.now(), phone);
  return { ok: true, status: getStatus(phone) };
}

/**
 * Upgrade (or set) a user's level after merchant / website validation.
 * An ID number must already be on file.
 */
function setLevel(phone, level, method, reference) {
  const row = getUserRow(phone);
  if (!row) return { ok: false, reason: "not_registered" };
  if (!row.id_number_masked) return { ok: false, reason: "no_id" };
  if (!Number.isInteger(level) || level < 0 || level > MAX_LEVEL) return { ok: false, reason: "invalid_level" };
  db.prepare(`
    UPDATE users SET kyc_level = ?, kyc_method = ?, kyc_reference = ?, kyc_updated_at = ? WHERE phone = ?
  `).run(level, method || null, reference || null, Date.now(), phone);
  return { ok: true, status: getStatus(phone) };
}

// ── Transfer records ─────────────────────────────────────────────────────────

/**
 * Insert a transfer row.
 * @returns {{ id: number, reference: string }} reference is a ULID shown to users
 */
function recordTransfer({ kind, senderPhone = null, recipientPhone, amountCents, status = "pending" }) {
  const now = Date.now();
  const reference = ulid(now);
  const info = db.prepare(`
    INSERT INTO transfers (kind, sender_phone, recipient_phone, amount_cents, status, reference, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(kind, senderPhone, recipientPhone, amountCents, status, reference, now);
  return { id: Number(info.lastInsertRowid), reference };
}

/** Sum of this phone's outgoing transfers still being processed (not yet on-chain) */
function pendingOutgoingCents(phone) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(amount_cents), 0) AS total FROM transfers
    WHERE sender_phone = ? AND kind = 'transfer' AND status = 'pending'
  `).get(phone);
  return Number(row.total);
}

function updateTransfer(id, { status, opHash, error }) {
  db.prepare(`
    UPDATE transfers SET status = COALESCE(?, status), op_hash = COALESCE(?, op_hash), error = COALESCE(?, error) WHERE id = ?
  `).run(status || null, opHash || null, error || null, id);
}

function listTransfers(phone, limit = 20) {
  return db.prepare(`
    SELECT id, reference, kind, sender_phone AS senderPhone, recipient_phone AS recipientPhone,
           amount_cents AS amountCents, status, created_at AS createdAt
    FROM transfers
    WHERE sender_phone = ? OR recipient_phone = ?
    ORDER BY id DESC LIMIT ?
  `).all(phone, phone, limit).map((t) => ({
    ...t,
    direction: t.senderPhone === phone ? "out" : "in",
  }));
}

/** One-line limit summary for USSD, e.g. "R500/day, R10,000/month" */
function limitSummary(status) {
  return `${formatRandShort(status.limits.dailyCents)}/day, ${formatRandShort(status.limits.monthlyCents)}/month`;
}

module.exports = {
  getTiers,
  validateSaId,
  idInUse,
  getStatus,
  checkSend,
  setIdNumber,
  setLevel,
  recordTransfer,
  updateTransfer,
  listTransfers,
  pendingOutgoingCents,
  limitSummary,
  MAX_LEVEL,
};
