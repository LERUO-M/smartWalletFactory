// backend/routes/ussd.js
// ─────────────────────────────────────────────────────────────────────────────
// Africa's Talking-compatible USSD webhook handler for ZAKA.
//
// Africa's Talking (and most African USSD gateways) POST to this endpoint with:
//   sessionId   – unique identifier for this USSD session
//   serviceCode – the shortcode dialled (e.g. *384*XXXX#)
//   phoneNumber – calling party number (e.g. +27821234567)
//   text        – accumulated user input separated by * (e.g. "2*0821234567*50")
//
// Responses MUST be plain text prefixed with:
//   "CON " – keep session alive, show prompt and input box
//   "END " – close session and show final message (no input)
//
// User-facing copy never mentions blockchains, addresses or gas: users only
// see ZAKA, Rand amounts and phone numbers.
//
// REGISTRATION (new users):
//   PIN → confirm PIN → SA ID number (KYC Level 0) → wallet created + welcome bonus
//
// SESSIONS: dropped "Send ZAKA" sessions can be resumed, and menus can be
// skipped with shortcut codes like *384*123*2*0831234567*50#
// (services/ussdSessionService.js).
//
// MAIN MENU:
//   1. Check Balance
//   2. Send ZAKA            recipient → amount (limit check) → PIN → reply at once;
//                           the transfer is submitted in the background and both
//                           people get an SMS (services/transferService.js)
//   3. Claim R100 Demo ZAKA PIN
//   4. My Account           level, limits, add ID / how to unlock more
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const express     = require("express");
const { ethers }  = require("ethers");
const router      = express.Router();

const authService   = require("../services/authService");
const walletService = require("../services/walletService");
const userOpService = require("../services/userOpService");
const kycService    = require("../services/kycService");
const smsService    = require("../services/smsService");
const transferService = require("../services/transferService");
const ussdSessions    = require("../services/ussdSessionService");
const db            = require("../db");
const { toE164, isValidE164, formatRand, formatRandShort } = require("../lib/phone");

// Africa's Talking delivers numbers already in +27... format; toE164 also
// handles 082... typed inside USSD menus. Unknown formats pass through as-is.
const normalisePhone = (p) => toE164(p) || String(p || "").trim();
const isValidPhone   = isValidE164;

// ── Provider (read-only, for signer attachment) ───────────────────────────────

let _provider;
function getProvider() {
  if (!_provider) {
    if (!process.env.RPC_URL) throw new Error("RPC_URL not set");
    _provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  }
  return _provider;
}

/** ZAKA has 18 decimals on-chain; we work in cents everywhere else */
const centsToWei = (cents) => BigInt(cents) * 10n ** 16n;
const weiToCents = (wei) => Number(BigInt(wei) / 10n ** 16n);

const WELCOME_BONUS_CENTS = 10_000; // R100
const FAUCET_CENTS        = 10_000; // R100

/** "50" | "50.5" | "50.50" → 5050 cents, else null */
function parseAmountCents(s) {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(String(s || ""))) return null;
  const cents = Math.round(parseFloat(s) * 100);
  return cents > 0 ? cents : null;
}

/** Don't spam the "unlock more" SMS: at most once an hour per phone */
function sendKycUnlockSms(phone) {
  const recent = db.prepare(
    "SELECT 1 FROM sms_outbox WHERE to_phone = ? AND category = 'kyc' AND created_at > ?"
  ).get(phone, Date.now() - 60 * 60 * 1000);
  if (!recent) smsService.sendInBackground(phone, smsService.templates.kycUnlock(), { category: "kyc" });
}

// ── Main webhook handler ──────────────────────────────────────────────────────

/**
 * POST /ussd
 * Africa's Talking sends application/x-www-form-urlencoded body.
 */
router.post("/", async (req, res) => {
  // Africa's Talking sends urlencoded; also support JSON for the simulator
  const sessionId   = req.body.sessionId   || req.body.session_id   || "sim-" + Date.now();
  const serviceCode = req.body.serviceCode || req.body.service_code || "*384#";
  const rawPhone    = req.body.phoneNumber || req.body.phone_number  || "+27000000000";
  const text        = req.body.text        || "";

  const phoneNumber = normalisePhone(rawPhone);

  // Split accumulated inputs: "2*0821234567*50*1234" → ["2","0821234567","50","1234"]
  const rawInputs = text === "" ? [] : text.split("*");

  let response = "";

  try {
    const registered = authService.isRegistered(phoneNumber);
    const kyc = registered ? kycService.getStatus(phoneNumber) : null;

    // Resume dropped sessions + shortcut dialling (services/ussdSessionService.js)
    const resolved = ussdSessions.resolve({
      sessionId, phoneNumber, serviceCode, rawInputs, registered, canResume: !!kyc?.canSend,
    });
    const inputs = resolved.inputs;
    const ctx = { phoneNumber, serviceCode: baseServiceCode(serviceCode), inputs };

    if (resolved.response) {
      response = resolved.response;
    } else if (!registered) {
      response = await handleRegistration(ctx);
    } else {
      response = await handleMainMenu(ctx);
      ussdSessions.afterResponse({ sessionId, phoneNumber, inputs, response });
    }
  } catch (err) {
    console.error(`[USSD ERROR] session=${sessionId} phone=${phoneNumber}`, err);
    response = "END Sorry, something went wrong. Please try again later.";
  }

  // Africa's Talking expects plain text response
  res.set("Content-Type", "text/plain");
  res.send(response);
});

/** "*384*123*2*083…#" → "*384*123#" when USSD_SERVICE_CODE is set (for "dial … to join" copy) */
function baseServiceCode(serviceCode) {
  return ussdSessions.extrasFromServiceCode(serviceCode).length ? process.env.USSD_SERVICE_CODE : serviceCode;
}

// ── Registration handler ──────────────────────────────────────────────────────

/**
 * Walks through every input so a user can retry an invalid PIN or ID number
 * in the same session (each retry adds another "*" segment to `text`).
 */
async function handleRegistration({ phoneNumber, inputs }) {
  const WELCOME = `CON Hello from ZAKA!

Enter 4 digit pin to create your wallet for instant transfers!`;

  let step = "pin";
  let pin = null;
  let lastError = null;

  for (const input of inputs) {
    lastError = null;
    if (step === "pin") {
      if (/^\d{4}$/.test(input)) {
        pin = input;
        step = "confirm";
      } else {
        lastError = "pin";
      }
    } else if (step === "confirm") {
      if (input !== pin) return `END PINs do not match.\nPlease dial again to try again.`;
      step = "id";
    } else if (step === "id") {
      const v = kycService.validateSaId(input);
      if (!v.ok) {
        lastError = "id";
        continue;
      }
      return await completeRegistration(phoneNumber, pin, input);
    }
  }

  if (step === "pin") return lastError ? `CON Invalid PIN. Please enter 4 digits:` : WELCOME;
  if (step === "confirm") return `CON Confirm your PIN:\n(Enter the same 4 digits again)`;
  return lastError
    ? `CON That ID number is not valid.\nPlease enter your 13-digit SA ID number:`
    : `CON Enter your 13-digit SA ID number:\n(Needed to keep your money safe)`;
}

async function completeRegistration(phoneNumber, pin, idNumber) {
  if (kycService.idInUse(idNumber)) {
    return `END This ID number is already linked to another phone.\nPlease visit a ZAKA merchant for help.`;
  }

  const { walletKeyAddress } = await authService.register(phoneNumber, pin);
  authService.setOwnerAddress(phoneNumber, walletKeyAddress);
  kycService.setIdNumber(phoneNumber, idNumber, "ussd");

  const walletAddress = await walletService.getOrPredictWalletAddress(walletKeyAddress, phoneNumber);

  // Background welcome bonus – the user sees the END screen immediately
  queueWelcomeBonus(phoneNumber, walletKeyAddress, walletAddress, pin);

  // Let them know how to unlock higher limits
  sendKycUnlockSms(phoneNumber);

  return `END Wallet created for ${phoneNumber}!

We have sent you some ZAKA as a welcome bonus! Check your balance!`;
}

// ── Main menu handler ─────────────────────────────────────────────────────────

async function handleMainMenu(ctx) {
  const { phoneNumber, inputs } = ctx;

  if (inputs.length === 0) {
    return `CON ZAKA
1. Check Balance
2. Send ZAKA
3. Claim R100 Demo ZAKA
4. My Account`;
  }

  switch (inputs[0]) {
    case "1": return await handleBalance(phoneNumber);
    case "2": return await handleSend(ctx);
    case "3": return await handleFaucetClaim(ctx);
    case "4": return handleAccount(ctx);
    default:  return `END Invalid option. Please dial again.`;
  }
}

// ── 1. Balance ────────────────────────────────────────────────────────────────

async function getBalanceCents(phoneNumber) {
  const ownerAddress  = authService.getOwnerAddress(phoneNumber);
  const walletAddress = await walletService.getOrPredictWalletAddress(ownerAddress, phoneNumber);
  const { raw } = await walletService.getBalance(walletAddress);
  return weiToCents(raw);
}

async function handleBalance(phoneNumber) {
  const cents = await getBalanceCents(phoneNumber);
  const kyc = kycService.getStatus(phoneNumber);
  const usage = kyc && kyc.canSend
    ? `\n\nSent today: ${formatRand(kyc.used.todayCents)} of ${formatRandShort(kyc.limits.dailyCents)}`
    : "";
  return `END Your ZAKA balance: ${formatRand(cents)}${usage}`;
}

// ── 2. Send ZAKA ─────────────────────────────────────────────────────────────

function limitMessage(check) {
  const s = check.status;
  const left = s.remaining.todayCents;
  const which = check.reason === "monthly" ? "monthly" : "daily";
  return `END Sorry, this is over your ${which} limit.
${s.tierName} limit: ${kycService.limitSummary(s)}.
You can still send ${formatRand(left)} today.

We have sent you an SMS on how to unlock more.`;
}

async function handleSend({ phoneNumber: senderPhone, serviceCode, inputs }) {
  // inputs[0] = "2"
  const kyc = kycService.getStatus(senderPhone);
  if (!kyc || !kyc.canSend) {
    return `END Please add your ID number before sending.\nChoose 4. My Account.`;
  }

  if (inputs.length === 1) {
    return `CON Enter recipient phone number:\n(e.g. 0821234567)`;
  }

  const recipientRaw   = inputs[1];
  const recipientPhone = normalisePhone(recipientRaw);
  if (!isValidPhone(recipientPhone)) return `END Invalid phone number. Please dial again.`;
  if (recipientPhone === senderPhone) return `END You cannot send ZAKA to yourself.`;

  if (inputs.length === 2) {
    return `CON Enter amount in Rand:\n(e.g. 25)`;
  }

  const amountCents = parseAmountCents(inputs[2]);
  if (amountCents === null) return `END Invalid amount. Please dial again.`;

  // Check limits before asking for the PIN
  const pre = kycService.checkSend(senderPhone, amountCents);
  if (!pre.ok) {
    sendKycUnlockSms(senderPhone);
    return limitMessage(pre);
  }

  if (inputs.length === 3) {
    return `CON Send ${formatRand(amountCents)} to ${recipientRaw}?

Enter your 4-digit PIN to confirm:`;
  }

  if (inputs.length !== 4) return "END Invalid input. Please dial again.";

  const pin = inputs[3];
  const senderSigner = await authService.getSignerForPin(senderPhone, pin, getProvider());
  if (!senderSigner) return `END Incorrect PIN. Transaction cancelled.`;

  if (!authService.isRegistered(recipientPhone)) {
    return `END ${recipientRaw} is not on ZAKA yet.\nAsk them to dial ${serviceCode} to join.`;
  }

  // Re-check limits (another session may have sent in the meantime)
  const check = kycService.checkSend(senderPhone, amountCents);
  if (!check.ok) {
    sendKycUnlockSms(senderPhone);
    return limitMessage(check);
  }

  const senderOwnerAddress  = senderSigner.address;
  const senderWalletAddress = await walletService.getOrPredictWalletAddress(senderOwnerAddress, senderPhone);

  const amountWei = centsToWei(amountCents);
  // Available = on-chain balance minus transfers still being processed
  const { raw: senderBalance } = await walletService.getBalance(senderWalletAddress);
  const availableCents = weiToCents(senderBalance) - kycService.pendingOutgoingCents(senderPhone);
  if (availableCents < amountCents) {
    return `END Insufficient balance.
Your balance: ${formatRand(Math.max(0, availableCents))}
You tried to send: ${formatRand(amountCents)}`;
  }

  const recipientOwner = authService.getOwnerAddress(recipientPhone);
  const recipientWalletAddress = await walletService.getOrPredictWalletAddress(recipientOwner, recipientPhone);

  // Record as pending (counts toward limits and balance while in flight),
  // reply now, and submit in the background – USSD sessions time out fast.
  const { id: transferId, reference } = kycService.recordTransfer({
    kind: "transfer",
    senderPhone,
    recipientPhone,
    amountCents,
    status: "pending",
  });

  transferService.submitInBackground({
    transferId,
    reference,
    senderPhone,
    recipientPhone,
    recipientDisplay: recipientRaw,
    amountCents,
    amountWei,
    senderWalletAddress,
    senderOwnerAddress,
    senderSigner,
    recipientWalletAddress,
  });

  const smsFrom = process.env.SHORT_CODE ? ` from ${process.env.SHORT_CODE}` : "";
  return `END Sending ${formatRand(amountCents)} to ${recipientRaw}.
You will receive an SMS${smsFrom} when funds are sent.

Ref: ${reference}`;
}

// ── 3. Claim demo ZAKA ────────────────────────────────────────────────────────

async function handleFaucetClaim({ phoneNumber, inputs }) {
  // inputs[0] = "3"
  if (inputs.length === 1) {
    return `CON Claim R100 demo ZAKA.

Enter your 4-digit PIN to confirm:`;
  }

  if (inputs.length !== 2) return "END Invalid input. Please dial again.";

  const senderSigner = await authService.getSignerForPin(phoneNumber, inputs[1], getProvider());
  if (!senderSigner) return `END Incorrect PIN. Please dial again.`;

  const senderOwnerAddress  = senderSigner.address;
  const senderWalletAddress = await walletService.getOrPredictWalletAddress(senderOwnerAddress, phoneNumber);

  const { id: transferId } = kycService.recordTransfer({
    kind: "faucet", recipientPhone: phoneNumber, amountCents: FAUCET_CENTS, status: "pending",
  });

  try {
    const callData = walletService.encodeFaucetClaim(senderWalletAddress, centsToWei(FAUCET_CENTS));
    const opHash = await userOpService.sendUserOperation({
      senderWalletAddress,
      senderPhoneNumber:  phoneNumber,
      senderOwnerAddress,
      senderSigner,
      callData,
    });
    kycService.updateTransfer(transferId, { status: "success", opHash });
  } catch (err) {
    console.error("[USSD] faucet claim failed:", err.message);
    kycService.updateTransfer(transferId, { status: "failed", error: err.message.slice(0, 500) });
    return `END Sorry, we could not add demo ZAKA right now. Please try again.`;
  }

  return `END R100 demo ZAKA added!

Dial again to check your balance.`;
}

// ── 4. My Account ─────────────────────────────────────────────────────────────

function handleAccount({ phoneNumber, inputs }) {
  const kyc = kycService.getStatus(phoneNumber);

  // No ID on file (registered before KYC existed): capture it here
  if (!kyc.canSend) {
    if (inputs.length === 1) {
      return `CON My ZAKA account
${phoneNumber}
Not verified – you can't send yet.

1. Add ID number`;
    }
    if (inputs[1] !== "1") return `END Invalid option. Please dial again.`;
    if (inputs.length === 2) return `CON Enter your 13-digit SA ID number:`;

    const result = kycService.setIdNumber(phoneNumber, inputs[inputs.length - 1], "ussd");
    if (!result.ok) {
      if (result.reason === "id_in_use") return `END This ID number is already linked to another phone.\nPlease visit a ZAKA merchant for help.`;
      return `CON That ID number is not valid.\nPlease enter your 13-digit SA ID number:`;
    }
    sendKycUnlockSms(phoneNumber);
    return `END Thank you! You can now send ZAKA.
Your limit: ${kycService.limitSummary(result.status)}.`;
  }

  const summary = `My ZAKA account
${phoneNumber}
${kyc.tierName}: ${kycService.limitSummary(kyc)}
Sent today: ${formatRand(kyc.used.todayCents)}
This month: ${formatRand(kyc.used.monthCents)}`;

  if (!kyc.canUpgrade) return `END ${summary}`;

  if (inputs.length === 1) return `CON ${summary}\n\n1. Send more ZAKA`;
  if (inputs[1] !== "1") return `END Invalid option. Please dial again.`;

  sendKycUnlockSms(phoneNumber);
  return `END To send more ZAKA, visit any ZAKA merchant or our website to complete your ZAKA validation.

We have sent you an SMS with the details.`;
}

// ── Welcome Bonus (background) ────────────────────────────────────────────────

/**
 * Queue a welcome bonus faucet claim in the background.
 * Fires-and-forgets so the registration response is instant.
 */
function queueWelcomeBonus(phoneNumber, ownerAddress, walletAddress, pin) {
  setImmediate(async () => {
    const { id: transferId } = kycService.recordTransfer({
      kind: "welcome", recipientPhone: phoneNumber, amountCents: WELCOME_BONUS_CENTS, status: "pending",
    });
    try {
      const provider     = getProvider();
      const senderSigner = await authService.getSignerForPin(phoneNumber, pin, provider);
      if (!senderSigner) throw new Error("signer unavailable");

      const callData = walletService.encodeFaucetClaim(walletAddress, centsToWei(WELCOME_BONUS_CENTS));
      const opHash = await userOpService.sendUserOperation({
        senderWalletAddress:  walletAddress,
        senderPhoneNumber:    phoneNumber,
        senderOwnerAddress:   ownerAddress,
        senderSigner,
        callData,
      });
      kycService.updateTransfer(transferId, { status: "success", opHash });
      console.log(`[WELCOME BONUS] ${phoneNumber} → opHash: ${opHash}`);
    } catch (err) {
      // Don't fail registration if bonus fails – user can manually claim via menu
      kycService.updateTransfer(transferId, { status: "failed", error: err.message.slice(0, 500) });
      console.warn(`[WELCOME BONUS] Failed for ${phoneNumber}:`, err.message);
    }
  });
}

module.exports = router;
