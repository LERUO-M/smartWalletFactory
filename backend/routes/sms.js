// backend/routes/sms.js
// ─────────────────────────────────────────────────────────────────────────────
// SMS endpoints. Mounted at /api/sms.
//
//   GET  /api/sms?phone=&sinceId=&limit=   outbound SMS log, newest first
//   POST /api/sms/send  { to, message }    send a one-off SMS            [admin]
//   POST /api/sms/delivery                 Africa's Talking delivery reports
//
// Set the delivery report callback in the Africa's Talking dashboard to
//   https://<your-host>/api/sms/delivery
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const express    = require("express");
const router     = express.Router();
const smsService = require("../services/smsService");
const { toE164 } = require("../lib/phone");
const { requireAdmin } = require("../lib/adminAuth");

router.get("/", (req, res) => {
  const phone = req.query.phone ? toE164(req.query.phone) : undefined;
  if (req.query.phone && !phone) return res.status(400).json({ error: "Invalid phone number" });
  const sinceId = Number(req.query.sinceId) || 0;
  const limit   = Math.min(200, Number(req.query.limit) || 50);
  res.json({ mode: smsService.mode(), messages: smsService.list({ phone, sinceId, limit }) });
});

router.post("/send", requireAdmin, async (req, res) => {
  const to = toE164(req.body.to);
  const message = String(req.body.message || "").trim();
  if (!to || !message) return res.status(400).json({ error: "to (SA number) and message are required" });
  const sms = await smsService.send(to, message, { category: "manual" });
  res.status(sms.status === "failed" ? 502 : 200).json(sms);
});

router.post("/delivery", (req, res) => {
  smsService.applyDeliveryReport(req.body);
  res.sendStatus(200);
});

module.exports = router;
