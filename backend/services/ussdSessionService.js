// backend/services/ussdSessionService.js
// ─────────────────────────────────────────────────────────────────────────────
// Makes USSD sessions survive timeouts and saves keystrokes.
//
// 1. RESUME DROPPED SESSIONS
//    While someone is part-way through "Send ZAKA" (recipient / amount entered,
//    before the PIN), their progress is saved against their phone number. If the
//    session drops and they redial within USSD_RESUME_MINUTES (default 5):
//        CON Continue sending R50.00 to 0831234567?
//        1. Yes
//        2. No
//    "1" puts them straight back on the PIN screen, "2" shows the main menu.
//    PINs are never saved.
//
// 2. SHORTCUT DIALLING
//    *384*123*2*0831234567*50#  → straight to the PIN screen.
//    *384*123*1#                → balance.
//    Africa's Talking passes the extra segments in `text` on the first request;
//    gateways that put them in serviceCode instead are handled too (set
//    USSD_SERVICE_CODE to your base code, e.g. *384*123#).
//    For safety a PIN in the dial string is refused (it would sit in the
//    phone's call log).
//
// How: every USSD session gets a row in ussd_sessions that says how to turn
// the gateway's raw inputs into the "effective" inputs the menu handlers see:
//     effective = prefix + rawInputs.slice(drop)
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const db = require("../db");
const { formatRand } = require("../lib/phone");

db.exec(`
  CREATE TABLE IF NOT EXISTS ussd_progress (
    phone       TEXT PRIMARY KEY,
    inputs      TEXT NOT NULL,          -- JSON array, never contains a PIN
    session_id  TEXT NOT NULL,
    updated_at  INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ussd_sessions (
    session_id    TEXT PRIMARY KEY,
    phone         TEXT NOT NULL,
    offer_inputs  TEXT,                 -- JSON: progress offered for resuming (null = no offer)
    decided       INTEGER NOT NULL DEFAULT 0,
    prefix        TEXT NOT NULL DEFAULT '[]',
    drop_count    INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
  );
`);

const resumeMs = () => Math.max(0, Number(process.env.USSD_RESUME_MINUTES ?? 5)) * 60_000;

// ── Progress (per phone) ─────────────────────────────────────────────────────

function saveProgress(phone, sessionId, inputs) {
  db.prepare(`
    INSERT INTO ussd_progress (phone, inputs, session_id, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(phone) DO UPDATE SET inputs = excluded.inputs, session_id = excluded.session_id, updated_at = excluded.updated_at
  `).run(phone, JSON.stringify(inputs), sessionId, Date.now());
}

function clearProgress(phone) {
  db.prepare("DELETE FROM ussd_progress WHERE phone = ?").run(phone);
}

function freshProgress(phone) {
  const row = db.prepare("SELECT * FROM ussd_progress WHERE phone = ?").get(phone);
  if (!row) return null;
  if (Date.now() - Number(row.updated_at) > resumeMs()) {
    clearProgress(phone);
    return null;
  }
  return JSON.parse(row.inputs);
}

// ── Sessions ─────────────────────────────────────────────────────────────────

function getSession(sessionId) {
  const r = db.prepare("SELECT * FROM ussd_sessions WHERE session_id = ?").get(sessionId);
  return r && {
    offerInputs: r.offer_inputs ? JSON.parse(r.offer_inputs) : null,
    decided: !!r.decided,
    prefix: JSON.parse(r.prefix),
    drop: Number(r.drop_count),
  };
}

function saveSession(sessionId, phone, s) {
  db.prepare(`
    INSERT INTO ussd_sessions (session_id, phone, offer_inputs, decided, prefix, drop_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET offer_inputs = excluded.offer_inputs, decided = excluded.decided,
      prefix = excluded.prefix, drop_count = excluded.drop_count
  `).run(sessionId, phone, s.offerInputs ? JSON.stringify(s.offerInputs) : null, s.decided ? 1 : 0,
    JSON.stringify(s.prefix), s.drop, Date.now());
}

let lastPrune = 0;
function prune() {
  if (Date.now() - lastPrune < 10 * 60_000) return;
  lastPrune = Date.now();
  db.prepare("DELETE FROM ussd_sessions WHERE created_at < ?").run(Date.now() - 60 * 60_000);
}

/**
 * Extra segments dialled after the base code, when the gateway put them in
 * serviceCode (e.g. "*384*123*2*0831234567*50#" with USSD_SERVICE_CODE="*384*123#").
 */
function extrasFromServiceCode(serviceCode) {
  const base = (process.env.USSD_SERVICE_CODE || "").trim();
  if (!base || !serviceCode || serviceCode === base) return [];
  const stem = base.replace(/#$/, "") + "*";
  if (!serviceCode.startsWith(stem)) return [];
  return serviceCode.slice(stem.length).replace(/#$/, "").split("*").filter(Boolean);
}

/** Would these (shortcut) inputs include a PIN? */
function containsPin(inputs) {
  if (inputs[0] === "2") return inputs.length > 3;
  if (inputs[0] === "3") return inputs.length > 1;
  if (inputs[0] === "4") return inputs.length > 2; // 4*1*<ID number> – keep ID numbers out of call logs too
  return false;
}

/** "Continue sending R50.00 to 0831234567?" */
function offerText(saved) {
  const [, to, amount] = saved;
  const cents = amount ? Math.round(parseFloat(amount) * 100) : null;
  const what = cents ? `sending ${formatRand(cents)} to ${to}` : `sending to ${to}`;
  return `CON Continue ${what}?\n1. Yes\n2. No`;
}

/**
 * Work out what the menu handlers should see for this request.
 * @returns {{ response?: string, inputs: string[] }}
 *   `response` set = reply with it directly (resume offer / safety message)
 */
function resolve({ sessionId, phoneNumber, serviceCode, rawInputs, registered, canResume }) {
  prune();
  let s = getSession(sessionId);
  const extras = extrasFromServiceCode(serviceCode);

  if (!s) {
    // ── First request of this session ──
    s = { offerInputs: null, decided: false, prefix: extras, drop: 0 };
    const firstInputs = [...extras, ...rawInputs];

    if (firstInputs.length > 0) {
      // Shortcut dial
      if (!registered) {
        s.prefix = [];
        s.drop = rawInputs.length; // ignore the shortcut; start registration normally
      } else if (containsPin(firstInputs)) {
        saveSession(sessionId, phoneNumber, s);
        return {
          inputs: [],
          response: `END For your safety, don't put your PIN in the code you dial.\nDial the code and enter your PIN when asked.`,
        };
      }
      clearProgress(phoneNumber);
      saveSession(sessionId, phoneNumber, s);
      return { inputs: s.prefix.concat(rawInputs.slice(s.drop)) };
    }

    const saved = registered && canResume ? freshProgress(phoneNumber) : null;
    if (saved) {
      s.offerInputs = saved;
      saveSession(sessionId, phoneNumber, s);
      return { inputs: [], response: offerText(saved) };
    }
    saveSession(sessionId, phoneNumber, s);
    return { inputs: s.prefix.concat(rawInputs) };
  }

  // ── Answer to the resume offer ──
  if (s.offerInputs && !s.decided) {
    if (rawInputs.length === 0) return { inputs: [], response: offerText(s.offerInputs) };
    s.decided = true;
    s.drop = 1;
    if (rawInputs[0] === "1") {
      s.prefix = s.offerInputs;
    } else if (rawInputs[0] === "2") {
      s.prefix = [];
      clearProgress(phoneNumber);
    } else {
      saveSession(sessionId, phoneNumber, s);
      return { inputs: [], response: `END Invalid option. Please dial again.` };
    }
    saveSession(sessionId, phoneNumber, s);
  }

  return { inputs: s.prefix.concat(rawInputs.slice(s.drop)) };
}

/**
 * Remember or forget progress after replying.
 * Saved only while in "Send ZAKA" before the PIN; cleared when the session ends.
 */
function afterResponse({ sessionId, phoneNumber, inputs, response }) {
  if (response.startsWith("END")) {
    clearProgress(phoneNumber);
    return;
  }
  if (inputs[0] === "2" && (inputs.length === 2 || inputs.length === 3)) {
    saveProgress(phoneNumber, sessionId, inputs.slice(0, 3));
  }
}

module.exports = { resolve, afterResponse, clearProgress, containsPin, extrasFromServiceCode };
