// backend/routes/api.js
// ─────────────────────────────────────────────────────────────────────────────
// REST API routes consumed by the web frontend.
//
// Public routes (no auth required):
//   GET  /api/health
//   GET  /api/wallet/:phone        – wallet state lookup by phone
//   POST /api/auth/register        – create account + return JWT
//   POST /api/auth/login           – verify PIN + return JWT
//
// Protected routes (Bearer JWT required):
//   POST /api/tx/claim             – claim R100 faucet
//   POST /api/tx/send              – send ZAR to another phone (KYC limits apply)
//
// Also:
//   GET  /api/transactions/:phone  – recent transfers in/out
//   /api/kyc/*  (routes/kyc.js)    – tiered KYC / ZAKA validation
//   /api/sms/*  (routes/sms.js)    – SMS log, test send, AT delivery reports
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const express         = require("express");
const { ethers }      = require("ethers");
const router          = express.Router();

const authService     = require("../services/authService");
const walletService   = require("../services/walletService");
const userOpService   = require("../services/userOpService");
const { toE164, isValidE164 } = require("../lib/phone");
const { sign, requireAuth }   = require("../lib/jwt");
const kycService      = require("../services/kycService");
const smsService      = require("../services/smsService");
const ficaSync        = require("../services/ficaSync");

// ── Provider (lazy) ───────────────────────────────────────────────────────────
let _provider;
function getProvider() {
  if (!_provider) {
    if (!process.env.RPC_URL) throw new Error("RPC_URL not set in .env");
    _provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  }
  return _provider;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse, normalise, and validate a phone number from a request.
 * Throws with a 400 response if invalid.
 */
function parsePhone(raw, res) {
  const phone = toE164(raw);
  if (!phone) {
    res.status(400).json({ error: "Invalid phone number — use SA format e.g. 082 123 4567" });
    return null;
  }
  return phone;
}

// ── GET /api/health ───────────────────────────────────────────────────────────

router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    time: new Date().toISOString(),
    env: {
      factorySet:   !!process.env.FACTORY_ADDRESS,
      paymasterSet: !!process.env.PAYMASTER_ADDRESS,
      tokenSet:     !!process.env.ZAR_TOKEN_ADDRESS,
      smsSet:       smsService.config().configured,
      shortCodeSet: !!process.env.SHORT_CODE,
      shortCode:    process.env.SHORT_CODE || null,
      smsMode:      smsService.mode(),           // live | sandbox | simulated
      adminKeySet:  !!process.env.ADMIN_API_KEY,
      ficaSync:     ficaSync.enabled(),
    },
  });
});

// ── GET /api/wallet/:phone ────────────────────────────────────────────────────

router.get("/wallet/:phone", async (req, res) => {
  try {
    // Accept any SA format from URL: /api/wallet/0821234567 or /api/wallet/%2B27821234567
    const raw   = decodeURIComponent(req.params.phone);
    const phone = toE164(raw);

    if (!phone) {
      return res.status(400).json({ error: "Invalid phone number" });
    }

    if (!authService.isRegistered(phone)) {
      return res.json({ registered: false, phoneNumber: phone });
    }

    const ownerAddress  = authService.getOwnerAddress(phone);
    const walletAddress = await walletService.getOrPredictWalletAddress(ownerAddress, phone);
    const { raw: rawBal, formatted } = await walletService.getBalance(walletAddress);
    const deployed = await walletService.isWalletDeployed(walletAddress);

    res.json({
      registered:   true,
      phone,              // always returned as E.164
      phoneNumber:  phone,
      ownerAddress,
      walletAddress,
      balance: { raw: rawBal.toString(), formatted },
      deployed,
      kyc: kycService.getStatus(phone),
    });
  } catch (err) {
    console.error("[API /wallet]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/auth/register ───────────────────────────────────────────────────

router.post("/auth/register", async (req, res) => {
  try {
    const phone = parsePhone(req.body.phone, res);
    if (!phone) return;

    const { pin } = req.body;
    if (!pin || !/^\d{4,6}$/.test(String(pin))) {
      return res.status(400).json({ error: "PIN must be 4–6 digits" });
    }

    if (authService.isRegistered(phone)) {
      return res.status(409).json({ error: "A wallet already exists for this phone number" });
    }

    // Optional SA ID number → KYC Level 0 (without it the user can't send yet)
    const idNumber = req.body.idNumber ? String(req.body.idNumber).replace(/\s+/g, "") : null;
    if (idNumber) {
      if (!kycService.validateSaId(idNumber).ok) {
        return res.status(400).json({ error: "Invalid SA ID number" });
      }
      if (kycService.idInUse(idNumber)) {
        return res.status(409).json({ error: "This ID number is already linked to another phone" });
      }
    }

    // Register: generates keypair, hashes PIN, encrypts key, stores to DB
    const { walletKeyAddress } = await authService.register(phone, String(pin));

    if (idNumber) {
      kycService.setIdNumber(phone, idNumber, "web");
      smsService.sendInBackground(phone, smsService.templates.kycUnlock(), { category: "kyc" });
    }

    // Derive the counterfactual wallet address (no deploy needed)
    const walletAddress = await walletService.getOrPredictWalletAddress(walletKeyAddress, phone);

    // Issue session token
    const token = sign(phone, walletKeyAddress);

    // Fire-and-forget welcome bonus
    queueWelcomeBonus(phone, walletKeyAddress, walletAddress, String(pin));

    res.status(201).json({
      token,
      phone,
      ownerAddress:  walletKeyAddress,
      walletAddress,
      balance:       { raw: "0", formatted: "R0.00" },
      deployed:      false,
      kyc:           kycService.getStatus(phone),
    });
  } catch (err) {
    console.error("[API /auth/register]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────

router.post("/auth/login", async (req, res) => {
  try {
    const phone = parsePhone(req.body.phone, res);
    if (!phone) return;

    const { pin } = req.body;
    if (!pin) return res.status(400).json({ error: "PIN is required" });

    if (!authService.isRegistered(phone)) {
      return res.status(404).json({ error: "No wallet found for this phone number" });
    }

    // Verify PIN — returns a live signer or null
    const signer = await authService.getSignerForPin(phone, String(pin), getProvider());
    if (!signer) {
      return res.status(401).json({ error: "Incorrect PIN" });
    }

    const ownerAddress  = signer.address;
    const walletAddress = await walletService.getOrPredictWalletAddress(ownerAddress, phone);
    const { raw, formatted } = await walletService.getBalance(walletAddress);
    const deployed = await walletService.isWalletDeployed(walletAddress);

    const token = sign(phone, ownerAddress);

    res.json({
      token,
      phone,
      ownerAddress,
      walletAddress,
      balance: { raw: raw.toString(), formatted },
      deployed,
    });
  } catch (err) {
    console.error("[API /auth/login]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/tx/claim  (protected) ──────────────────────────────────────────

router.post("/tx/claim", requireAuth, async (req, res) => {
  try {
    const { phone, ownerAddress } = req.user;
    const { pin, amountZAR = 100 } = req.body;

    if (!pin) return res.status(400).json({ error: "PIN is required" });

    // Re-authenticate to decrypt the key (token just proves identity, not key access)
    const signer = await authService.getSignerForPin(phone, String(pin), getProvider());
    if (!signer) return res.status(401).json({ error: "Incorrect PIN" });

    const walletAddress = await walletService.getOrPredictWalletAddress(ownerAddress, phone);
    const amountWei     = ethers.parseEther(String(amountZAR));
    const callData      = walletService.encodeFaucetClaim(walletAddress, amountWei);

    const { id: transferId, reference } = kycService.recordTransfer({
      kind: "faucet", recipientPhone: phone, amountCents: Math.round(Number(amountZAR) * 100), status: "pending",
    });
    let userOpHash;
    try {
      userOpHash = await userOpService.sendUserOperation({
        senderWalletAddress:  walletAddress,
        senderPhoneNumber:    phone,
        senderOwnerAddress:   ownerAddress,
        senderSigner:         signer,
        callData,
      });
    } catch (err) {
      kycService.updateTransfer(transferId, { status: "failed", error: err.message.slice(0, 500) });
      throw err;
    }
    kycService.updateTransfer(transferId, { status: "success", opHash: userOpHash });

    res.json({ userOpHash, walletAddress, reference });
  } catch (err) {
    console.error("[API /tx/claim]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/tx/send  (protected) ───────────────────────────────────────────

router.post("/tx/send", requireAuth, async (req, res) => {
  try {
    const { phone, ownerAddress } = req.user;
    const { recipientPhone: rawRecipient, amountZAR, pin } = req.body;

    if (!pin)          return res.status(400).json({ error: "PIN is required" });
    if (!amountZAR)    return res.status(400).json({ error: "amountZAR is required" });
    if (!rawRecipient) return res.status(400).json({ error: "recipientPhone is required" });

    const recipientPhone = toE164(rawRecipient);
    if (!recipientPhone) {
      return res.status(400).json({ error: "Invalid recipient phone number" });
    }
    if (recipientPhone === phone) {
      return res.status(400).json({ error: "You cannot send to yourself" });
    }

    const amountCents = Math.round(Number(amountZAR) * 100);
    if (!(amountCents > 0)) return res.status(400).json({ error: "Invalid amount" });

    // The web app requires full identity verification (Level 1) before sending.
    // (USSD users can send small amounts at Level 0.)
    const kycNow = kycService.getStatus(phone);
    if (!kycNow || kycNow.level === null || kycNow.level < 1) {
      return res.status(403).json({
        error: "Verify your identity before sending money",
        code: "kyc_level1_required",
        kyc: kycNow,
      });
    }

    // Tiered KYC limits
    const limit = kycService.checkSend(phone, amountCents);
    if (!limit.ok) {
      if (limit.reason !== "no_kyc") {
        smsService.sendInBackground(phone, smsService.templates.kycUnlock(), { category: "kyc" });
      }
      return res.status(403).json({
        error: limit.reason === "no_kyc"
          ? "Add your ID number before sending (POST /api/kyc/:phone/id)"
          : `Over your ${limit.reason} limit (${kycService.limitSummary(limit.status)})`,
        code: limit.reason === "no_kyc" ? "kyc_required" : "limit_exceeded",
        kyc: limit.status,
      });
    }

    if (!authService.isRegistered(recipientPhone)) {
      return res.status(404).json({
        error: `Recipient ${rawRecipient} has not registered a wallet yet`,
      });
    }

    // Authenticate sender
    const signer = await authService.getSignerForPin(phone, String(pin), getProvider());
    if (!signer) return res.status(401).json({ error: "Incorrect PIN" });

    const senderWalletAddress    = await walletService.getOrPredictWalletAddress(ownerAddress, phone);
    const recipientOwnerAddress  = authService.getOwnerAddress(recipientPhone);
    const recipientWalletAddress = await walletService.getOrPredictWalletAddress(
      recipientOwnerAddress, recipientPhone
    );

    // Check balance
    const { raw: balance } = await walletService.getBalance(senderWalletAddress);
    const amountWei = ethers.parseEther(String(amountZAR));
    // Transfers still being processed (e.g. from USSD) are already spoken for
    const pendingWei = BigInt(kycService.pendingOutgoingCents(phone)) * 10n ** 16n;
    if (balance - pendingWei < amountWei) {
      return res.status(400).json({
        error: `Insufficient balance. Have ${walletService.formatZAR(balance)}, need ${walletService.formatZAR(amountWei)}`,
      });
    }

    const { id: transferId, reference } = kycService.recordTransfer({
      kind: "transfer", senderPhone: phone, recipientPhone, amountCents, status: "pending",
    });

    let userOpHash;
    try {
      const callData = walletService.encodeZARTransfer(recipientWalletAddress, amountWei);
      userOpHash = await userOpService.sendUserOperation({
        senderWalletAddress,
        senderPhoneNumber:  phone,
        senderOwnerAddress: ownerAddress,
        senderSigner:       signer,
        callData,
      });
    } catch (err) {
      kycService.updateTransfer(transferId, { status: "failed", error: err.message.slice(0, 500) });
      throw err;
    }
    kycService.updateTransfer(transferId, { status: "success", opHash: userOpHash });

    smsService.sendInBackground(
      recipientPhone,
      smsService.templates.received(amountCents, phone),
      { category: "received" }
    );

    res.json({
      userOpHash,
      recipientPhone,
      recipientWalletAddress,
      reference,
      kyc: kycService.getStatus(phone),
    });
  } catch (err) {
    console.error("[API /tx/send]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/transactions/:phone ─────────────────────────────────────────────

router.get("/transactions/:phone", (req, res) => {
  const phone = toE164(decodeURIComponent(req.params.phone));
  if (!phone) return res.status(400).json({ error: "Invalid phone number" });
  const limit = Math.min(100, Number(req.query.limit) || 20);
  res.json({ phoneNumber: phone, transactions: kycService.listTransfers(phone, limit) });
});

// ── Welcome bonus helper ──────────────────────────────────────────────────────

function queueWelcomeBonus(phone, ownerAddress, walletAddress, pin) {
  setImmediate(async () => {
    try {
      const signer = await authService.getSignerForPin(phone, pin, getProvider());
      if (!signer) return;
      const callData   = walletService.encodeFaucetClaim(walletAddress, ethers.parseEther("100"));
      const userOpHash = await userOpService.sendUserOperation({
        senderWalletAddress:  walletAddress,
        senderPhoneNumber:    phone,
        senderOwnerAddress:   ownerAddress,
        senderSigner:         signer,
        callData,
      });
      console.log(`[WELCOME BONUS] ${phone} → ${userOpHash}`);
    } catch (err) {
      console.warn(`[WELCOME BONUS] Failed for ${phone}:`, err.message);
    }
  });
}

module.exports = router;
