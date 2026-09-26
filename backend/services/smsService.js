// backend/services/smsService.js
// ─────────────────────────────────────────────────────────────────────────────
// Outbound SMS via Africa's Talking, sent from our short code (SHORT_CODE).
//
//   POST https://api.africastalking.com/version1/messaging          (live)
//   POST https://api.sandbox.africastalking.com/version1/messaging  (AT_USERNAME=sandbox)
//   Headers: apiKey, Accept: application/json
//   Form:    username, to, message, from=<SHORT_CODE>, bulkSMSMode=0
//            [keyword, linkId, retryDurationInHours]  (premium options)
//
// Every message is written to the sms_outbox table first. If Africa's Talking
// isn't configured (no AT_API_KEY / AT_USERNAME) the message is kept with
// status "simulated" so the web simulator can still show it on the phone.
//
// Sending never throws and never blocks a USSD reply: callers fire-and-forget.
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const db = require("../db");
const { formatRand } = require("../lib/phone");

const REQUEST_TIMEOUT_MS = 15_000;

function config() {
  const username = process.env.AT_USERNAME || "";
  const apiKey   = process.env.AT_API_KEY || "";
  const shortCode = process.env.SHORT_CODE || "";
  const sandbox  = username === "sandbox";
  const baseUrl  =
    process.env.AT_API_BASE_URL ||
    (sandbox ? "https://api.sandbox.africastalking.com" : "https://api.africastalking.com");
  return {
    username,
    apiKey,
    shortCode,
    sandbox,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    configured: !!(username && apiKey),
    // Premium SMS options (optional)
    keyword: process.env.AT_SMS_KEYWORD || "",
    bulkSMSMode: process.env.AT_SMS_BULK_MODE ?? "0",
    retryDurationInHours: process.env.AT_SMS_RETRY_HOURS || "",
  };
}

/** "live" | "sandbox" | "simulated" */
function mode() {
  const c = config();
  if (!c.configured) return "simulated";
  return c.sandbox ? "sandbox" : "live";
}

function insertOutbox({ to, message, sender, category, provider, status }) {
  const now = Date.now();
  const info = db.prepare(`
    INSERT INTO sms_outbox (to_phone, message, sender, category, provider, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(to, message, sender || null, category || null, provider, status, now, now);
  return Number(info.lastInsertRowid);
}

function updateOutbox(id, fields) {
  db.prepare(`
    UPDATE sms_outbox SET
      status = COALESCE(?, status),
      status_code = COALESCE(?, status_code),
      provider_message_id = COALESCE(?, provider_message_id),
      cost = COALESCE(?, cost),
      error = COALESCE(?, error),
      updated_at = ?
    WHERE id = ?
  `).run(
    fields.status ?? null,
    fields.statusCode ?? null,
    fields.messageId ?? null,
    fields.cost ?? null,
    fields.error ?? null,
    Date.now(),
    id
  );
}

/**
 * Send one SMS.
 * @param {string} to        E.164 number
 * @param {string} message   text
 * @param {object} [opts]    { category, linkId }
 * @returns {Promise<object>} the outbox row
 */
async function send(to, message, opts = {}) {
  const c = config();
  const provider = c.configured ? "africastalking" : "simulated";
  const id = insertOutbox({
    to,
    message,
    sender: c.shortCode,
    category: opts.category,
    provider,
    status: c.configured ? "queued" : "simulated",
  });

  if (!c.configured) {
    console.log(`[SMS simulated] → ${to}: ${message}`);
    return getById(id);
  }

  const form = new URLSearchParams({ username: c.username, to, message });
  if (c.shortCode) form.set("from", c.shortCode);
  if (c.bulkSMSMode !== "") form.set("bulkSMSMode", c.bulkSMSMode);
  if (c.keyword) form.set("keyword", c.keyword);
  if (opts.linkId) form.set("linkId", opts.linkId);
  if (c.retryDurationInHours) form.set("retryDurationInHours", c.retryDurationInHours);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${c.baseUrl}/version1/messaging`, {
      method: "POST",
      headers: {
        apiKey: c.apiKey,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      signal: ctrl.signal,
    });
    const body = await res.text();
    let json = null;
    try {
      json = JSON.parse(body);
    } catch {
      /* AT returns plain text on some errors */
    }

    const recipient = json?.SMSMessageData?.Recipients?.[0];
    if (!res.ok || !recipient) {
      const error = json?.SMSMessageData?.Message || body.slice(0, 200) || `HTTP ${res.status}`;
      updateOutbox(id, { status: "failed", error });
      console.warn(`[SMS] Africa's Talking rejected message to ${to}: ${error}`);
      return getById(id);
    }

    // statusCode 100 Processed, 101 Sent, 102 Queued – anything else is a failure
    const okCodes = [100, 101, 102];
    const sent = okCodes.includes(Number(recipient.statusCode));
    updateOutbox(id, {
      status: sent ? "sent" : "failed",
      statusCode: Number(recipient.statusCode),
      messageId: recipient.messageId,
      cost: recipient.cost,
      error: sent ? null : recipient.status,
    });
    if (!sent) console.warn(`[SMS] ${to}: ${recipient.status} (${recipient.statusCode})`);
    return getById(id);
  } catch (err) {
    const error = ctrl.signal.aborted ? "Timed out" : err.message;
    updateOutbox(id, { status: "failed", error });
    console.warn(`[SMS] Failed to reach Africa's Talking for ${to}: ${error}`);
    return getById(id);
  } finally {
    clearTimeout(timer);
  }
}

/** Fire-and-forget wrapper: never throws, never awaited by USSD handlers */
function sendInBackground(to, message, opts) {
  send(to, message, opts).catch((err) => console.warn("[SMS] unexpected error:", err.message));
}

// ── Message templates ────────────────────────────────────────────────────────

const templates = {
  received: (amountCents, fromPhone) =>
    `ZAKA notification: you have received ${formatRand(amountCents)} from ${fromPhone}.`,
  sent: (amountCents, toDisplay, reference) =>
    `ZAKA: you have sent ${formatRand(amountCents)} to ${toDisplay}. Ref: ${reference}`,
  sendFailed: (amountCents, toDisplay, reference) =>
    `ZAKA: your transfer of ${formatRand(amountCents)} to ${toDisplay} could not be completed. No money was sent. Ref: ${reference}`,
  kycUnlock: () =>
    "From ZAKA: to unlock sending more ZAKA, report to any merchant or head to our website to complete your ZAKA validation.",
  kycComplete: (limitText) =>
    `From ZAKA: your ZAKA validation is complete. You can now send up to ${limitText}.`,
  welcome: () =>
    "From ZAKA: we have sent you some ZAKA as a welcome bonus! Check your balance!",
};

// ── Delivery reports (Africa's Talking callback) ─────────────────────────────

/** Apply an AT delivery report ({ id, status, failureReason, ... }) */
function applyDeliveryReport(report) {
  if (!report || !report.id) return false;
  const info = db.prepare(`
    UPDATE sms_outbox SET status = ?, error = COALESCE(?, error), updated_at = ? WHERE provider_message_id = ?
  `).run(String(report.status || "unknown").toLowerCase(), report.failureReason || null, Date.now(), report.id);
  return info.changes > 0;
}

// ── Queries ──────────────────────────────────────────────────────────────────

function rowToJson(r) {
  return r && {
    id: r.id,
    to: r.to_phone,
    from: r.sender,
    message: r.message,
    category: r.category,
    provider: r.provider,
    status: r.status,
    statusCode: r.status_code,
    messageId: r.provider_message_id,
    cost: r.cost,
    error: r.error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function getById(id) {
  return rowToJson(db.prepare("SELECT * FROM sms_outbox WHERE id = ?").get(id));
}

/** Newest first. `phone` optional; `sinceId` returns only newer messages */
function list({ phone, sinceId = 0, limit = 50 } = {}) {
  const rows = phone
    ? db.prepare("SELECT * FROM sms_outbox WHERE to_phone = ? AND id > ? ORDER BY id DESC LIMIT ?").all(phone, sinceId, limit)
    : db.prepare("SELECT * FROM sms_outbox WHERE id > ? ORDER BY id DESC LIMIT ?").all(sinceId, limit);
  return rows.map(rowToJson);
}

module.exports = { send, sendInBackground, templates, applyDeliveryReport, list, mode, config };
