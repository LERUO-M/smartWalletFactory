// backend/routes/auth.js
// Session endpoints for the web wallet.
"use strict";

const express = require("express");
const { ethers } = require("ethers");
const router = express.Router();

const authService = require("../services/authService");
const walletService = require("../services/walletService");
const { normalizePhone } = require("../lib/phone");
const { issue } = require("../lib/token");

async function walletContext(phone) {
  const ownerAddress = authService.getOwnerAddress(phone);
  const walletAddress = await walletService.getOrPredictWalletAddress(ownerAddress, phone);
  const deployed = await walletService.isWalletDeployed(walletAddress);
  const { raw, formatted } = await walletService.getBalance(walletAddress);
  return {
    phone,
    ownerAddress,
    walletAddress,
    deployed,
    balance: { raw: raw.toString(), formatted },
  };
}

router.post("/register", async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const pin = String(req.body.pin || "");
    if (!phone) return res.status(400).json({ error: "Invalid phone number" });
    if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: "PIN must be 4-6 digits" });
    if (authService.isRegistered(phone)) {
      return res.status(409).json({ error: "Phone number is already registered" });
    }

    await authService.register(phone, pin);
    const ctx = await walletContext(phone);
    const token = issue(phone);
    res.json({ token, ...ctx });
  } catch (err) {
    console.error("[register]", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const pin = String(req.body.pin || "");
    if (!phone) return res.status(400).json({ error: "Invalid phone number" });
    if (!authService.isRegistered(phone)) {
      return res.status(404).json({ error: "No wallet for this number" });
    }
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const signer = await authService.getSignerForPin(phone, pin, provider);
    if (!signer) return res.status(401).json({ error: "Incorrect PIN" });

    const ctx = await walletContext(phone);
    const token = issue(phone);
    res.json({ token, ...ctx });
  } catch (err) {
    console.error("[login]", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
