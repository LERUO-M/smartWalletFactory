// backend/services/transferService.js
// ─────────────────────────────────────────────────────────────────────────────
// Submits a ZAKA transfer in the background, after the USSD session has ended.
//
// USSD sessions time out quickly, so the handler only validates, records the
// transfer as "pending" and replies straight away. This service then submits
// the transaction and texts both people:
//   success → recipient: "ZAKA notification: you have received …"
//             sender:    "ZAKA: you have sent … Ref: <ULID>"
//   failure → sender:    "ZAKA: your transfer … could not be completed …"
// Pending transfers count toward KYC limits and the sender's available balance,
// so a second send can't overspend while the first is still in flight.
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const walletService = require("./walletService");
const userOpService = require("./userOpService");
const kycService    = require("./kycService");
const smsService    = require("./smsService");

/**
 * Fire-and-forget. Never throws.
 * @param {object} t
 * @param {number} t.transferId
 * @param {string} t.reference            ULID shown to users
 * @param {string} t.senderPhone
 * @param {string} t.recipientPhone
 * @param {string} t.recipientDisplay     what the sender typed, e.g. "0831234567"
 * @param {number} t.amountCents
 * @param {bigint} t.amountWei
 * @param {string} t.senderWalletAddress
 * @param {string} t.senderOwnerAddress
 * @param {object} t.senderSigner         ethers.Wallet (already PIN-verified)
 * @param {string} t.recipientWalletAddress
 */
function submitInBackground(t) {
  setImmediate(async () => {
    try {
      const callData = walletService.encodeZARTransfer(t.recipientWalletAddress, t.amountWei);
      const opHash = await userOpService.sendUserOperation({
        senderWalletAddress: t.senderWalletAddress,
        senderPhoneNumber:   t.senderPhone,
        senderOwnerAddress:  t.senderOwnerAddress,
        senderSigner:        t.senderSigner,
        callData,
      });
      kycService.updateTransfer(t.transferId, { status: "success", opHash });
      console.log(`[TRANSFER] ${t.reference} ${t.senderPhone} → ${t.recipientPhone} ${t.amountCents}c opHash=${opHash}`);

      smsService.sendInBackground(
        t.recipientPhone,
        smsService.templates.received(t.amountCents, t.senderPhone),
        { category: "received" }
      );
      smsService.sendInBackground(
        t.senderPhone,
        smsService.templates.sent(t.amountCents, t.recipientDisplay, t.reference),
        { category: "sent" }
      );
    } catch (err) {
      console.error(`[TRANSFER] ${t.reference} failed:`, err.message);
      kycService.updateTransfer(t.transferId, { status: "failed", error: String(err.message).slice(0, 500) });
      smsService.sendInBackground(
        t.senderPhone,
        smsService.templates.sendFailed(t.amountCents, t.recipientDisplay, t.reference),
        { category: "failed" }
      );
    }
  });
}

module.exports = { submitInBackground };
