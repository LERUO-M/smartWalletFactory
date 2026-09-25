// backend/routes/api.js
// ─────────────────────────────────────────────────────────────────────────────
// REST API routes for the web-based feature-phone simulator.
// These endpoints are NOT part of the USSD gateway protocol – they exist only
// to let the browser-based simulator check state without a full USSD session.
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const express       = require("express");
const { ethers }    = require("ethers");
const router        = express.Router();
const authService   = require("../services/authService");
const walletService = require("../services/walletService");

/**
 * GET /api/health
 * Liveness check for ngrok / load-balancer health probes.
 */
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    time:   new Date().toISOString(),
    env: {
      factorySet:  !!process.env.FACTORY_ADDRESS,
      paymasterSet: !!process.env.PAYMASTER_ADDRESS,
      tokenSet:    !!process.env.ZAR_TOKEN_ADDRESS,
    },
  });
});

/**
 * GET /api/wallet/:phone
 * Return the predicted wallet address and current ZAR balance for a phone number.
 * Useful for displaying wallet state in the web simulator sidebar.
 */
router.get("/wallet/:phone", async (req, res) => {
  try {
    const phoneNumber = "+" + req.params.phone.replace(/\D/g, "");

    if (!authService.isRegistered(phoneNumber)) {
      return res.json({ registered: false, phoneNumber });
    }

    const ownerAddress  = authService.getOwnerAddress(phoneNumber);
    const walletAddress = await walletService.getOrPredictWalletAddress(
      ownerAddress,
      phoneNumber
    );
    const { raw, formatted } = await walletService.getBalance(walletAddress);
    const deployed           = await walletService.isWalletDeployed(walletAddress);

    res.json({
      registered:    true,
      phoneNumber,
      ownerAddress,
      walletAddress,
      balance:       { raw: raw.toString(), formatted },
      deployed,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
