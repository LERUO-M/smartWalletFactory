// backend/routes/kyc.js
// ─────────────────────────────────────────────────────────────────────────────
// Tiered KYC ("ZAKA validation") endpoints. Mounted at /api/kyc.
//
//   GET  /api/kyc/tiers              tier table and limits
//   GET  /api/kyc/:phone             level, limits, usage today / this month
//   POST /api/kyc/:phone/id          { idNumber }                    → Level 0  [admin]
//   POST /api/kyc/:phone/verify      { level?, method, reference? }  → Level 1  [admin]
//   POST /api/kyc/me/smile-id        { idNumber }  → Level 1 for the signed-in web user
//                                    (MOCK of Smile ID Biometric KYC – see below)
//
// /verify is what a merchant app or the website calls after checking the
// person's ID in person / online. It texts the user their new limits.
// [admin] = requires `x-admin-key` when ADMIN_API_KEY is set.
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const express    = require("express");
const router     = express.Router();
const kycService = require("../services/kycService");
const smsService = require("../services/smsService");
const ficaSync   = require("../services/ficaSync");
const { toE164 } = require("../lib/phone");
const { requireAdmin } = require("../lib/adminAuth");
const { requireAuth }  = require("../lib/jwt");
const { ulid }         = require("../lib/ulid");

function phoneOr400(req, res) {
  const phone = toE164(decodeURIComponent(req.params.phone));
  if (!phone) res.status(400).json({ error: "Invalid phone number" });
  return phone;
}

/**
 * Web app identity verification – MOCK of Smile ID Biometric KYC.
 *
 * The web app collects the SA ID number and a selfie. In production you would
 * send both to Smile ID (their web SDK / Biometric KYC job), and upgrade the
 * user from Smile ID's result callback. For the hackathon we validate the ID
 * number (format, date of birth, checksum, not used by another phone) and
 * approve immediately. The selfie is never uploaded.
 */
router.post("/me/smile-id", requireAuth, (req, res) => {
  const phoneNumber = req.user.phone;
  const idNumber = String(req.body.idNumber || "").replace(/\s+/g, "");

  if (!kycService.validateSaId(idNumber).ok) return res.status(400).json({ error: "invalid" });
  if (kycService.idInUse(idNumber, phoneNumber)) return res.status(409).json({ error: "id_in_use" });

  const idResult = kycService.setIdNumber(phoneNumber, idNumber, "smile_id");
  if (!idResult.ok) return res.status(400).json({ error: idResult.reason });

  const reference = "SMILE-MOCK-" + ulid();
  const result = kycService.setLevel(phoneNumber, 1, "smile_id", reference);
  if (!result.ok) return res.status(400).json({ error: result.reason });

  smsService.sendInBackground(
    phoneNumber,
    smsService.templates.kycComplete(kycService.limitSummary(result.status)),
    { category: "kyc" }
  );
  ficaSync.syncApproval(phoneNumber, true, 0);
  res.json({ phoneNumber, provider: "smile_id (mock)", ...result.status });
});

router.get("/tiers", (req, res) => {
  res.json({ tiers: Object.values(kycService.getTiers()) });
});

router.get("/:phone", (req, res) => {
  const phoneNumber = phoneOr400(req, res);
  if (!phoneNumber) return;
  const status = kycService.getStatus(phoneNumber);
  if (!status) return res.status(404).json({ error: "Not registered", phoneNumber });
  res.json({ phoneNumber, ...status });
});

router.post("/:phone/id", requireAdmin, (req, res) => {
  const phoneNumber = phoneOr400(req, res);
  if (!phoneNumber) return;
  const result = kycService.setIdNumber(phoneNumber, req.body.idNumber, req.body.method || "web");
  if (!result.ok) {
    const code = result.reason === "not_registered" ? 404 : result.reason === "id_in_use" ? 409 : 400;
    return res.status(code).json({ error: result.reason, detail: result.detail });
  }
  res.json({ phoneNumber, ...result.status });
});

router.post("/:phone/verify", requireAdmin, (req, res) => {
  const phoneNumber = phoneOr400(req, res);
  if (!phoneNumber) return;
  const level  = req.body.level === undefined ? 1 : Number(req.body.level);
  const method = ["merchant", "web", "admin"].includes(req.body.method) ? req.body.method : "merchant";

  const result = kycService.setLevel(phoneNumber, level, method, req.body.reference);
  if (!result.ok) {
    const code = result.reason === "not_registered" ? 404 : 400;
    const detail = result.reason === "no_id" ? "An ID number must be captured first (Level 0)" : undefined;
    return res.status(code).json({ error: result.reason, detail });
  }

  if (level >= 1) {
    smsService.sendInBackground(
      phoneNumber,
      smsService.templates.kycComplete(kycService.limitSummary(result.status)),
      { category: "kyc" }
    );
    ficaSync.syncApproval(phoneNumber, true, 0);
  }
  res.json({ phoneNumber, ...result.status });
});

module.exports = router;
