// backend/routes/transactions.js
// Gasless ERC-4337 send + faucet claim endpoints for the web wallet.
"use strict";

const express = require("express");
const { ethers } = require("ethers");
const router = express.Router();

const authService = require("../services/authService");
const walletService = require("../services/walletService");
const userOpService = require("../services/userOpService");
const { normalizePhone } = require("../lib/phone");
const { requireAuth } = require("../lib/token");

// All /tx endpoints require a valid session token AND the PIN in the body
// (PIN is needed to decrypt the signing key — the token alone is not enough
// to move funds).

router.post("/send", requireAuth, async (req, res) => {
  try {
    const senderPhone = req.auth.phone;
    const recipientPhone = normalizePhone(req.body.recipientPhone);
    const pin = String(req.body.pin || "");
    const amountZAR = Number(req.body.amountZAR);

    if (!recipientPhone) return res.status(400).json({ error: "Invalid recipient phone" });
    if (recipientPhone === senderPhone) return res.status(400).json({ error: "Cannot send to yourself" });
    if (!(amountZAR > 0)) return res.status(400).json({ error: "Amount must be greater than zero" });
    if (!authService.isRegistered(recipientPhone)) {
      return res.status(404).json({ error: "Recipient has no wallet yet" });
    }

    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const signer = await authService.getSignerForPin(senderPhone, pin, provider);
    if (!signer) return res.status(401).json({ error: "Incorrect PIN" });

    const senderOwner = authService.getOwnerAddress(senderPhone);
    const senderWallet = await walletService.getOrPredictWalletAddress(senderOwner, senderPhone);

    const recipientOwner = authService.getOwnerAddress(recipientPhone);
    const recipientWallet = await walletService.getOrPredictWalletAddress(recipientOwner, recipientPhone);

    const amountWei = ethers.parseEther(String(amountZAR));
    const callData = walletService.encodeZARTransfer(recipientWallet, amountWei);

    const opHash = await userOpService.sendUserOperation({
      senderWalletAddress: senderWallet,
      senderPhoneNumber: senderPhone,
      senderOwnerAddress: senderOwner,
      senderSigner: signer,
      callData,
    });

    res.json({ userOpHash: opHash });
  } catch (err) {
    console.error("[tx/send]", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/claim", requireAuth, async (req, res) => {
  try {
    const phone = req.auth.phone;
    const pin = String(req.body.pin || "");
    const amountZAR = Number(req.body.amountZAR || 100);

    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const signer = await authService.getSignerForPin(phone, pin, provider);
    if (!signer) return res.status(401).json({ error: "Incorrect PIN" });

    const owner = authService.getOwnerAddress(phone);
    const wallet = await walletService.getOrPredictWalletAddress(owner, phone);
    const amountWei = ethers.parseEther(String(amountZAR));
    const callData = walletService.encodeFaucetClaim(wallet, amountWei);

    const opHash = await userOpService.sendUserOperation({
      senderWalletAddress: wallet,
      senderPhoneNumber: phone,
      senderOwnerAddress: owner,
      senderSigner: signer,
      callData,
    });

    res.json({ userOpHash: opHash });
  } catch (err) {
    console.error("[tx/claim]", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
