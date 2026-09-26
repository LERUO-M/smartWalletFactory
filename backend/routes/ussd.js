// backend/routes/ussd.js
// ─────────────────────────────────────────────────────────────────────────────
// Africa's Talking-compatible USSD webhook handler.
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
// MENU TREE:
//   Root
//   ├── 1. Check Balance
//   ├── 2. Send Money
//   │   ├── Enter recipient phone number
//   │   ├── Enter amount (ZAR)
//   │   └── Enter PIN → submit UserOp
//   ├── 3. Claim R100 Demo Funds
//   │   └── Enter PIN → faucet UserOp
//   └── 4. My Wallet Address
//
// REGISTRATION FLOW (new users):
//   On first dial → prompt to create a 4-digit PIN → auto-register & welcome bonus
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const express     = require("express");
const { ethers }  = require("ethers");
const router      = express.Router();

const authService   = require("../services/authService");
const walletService = require("../services/walletService");
const userOpService = require("../services/userOpService");

// ── Provider (read-only, for signer attachment) ───────────────────────────────

let _provider;
function getProvider() {
  if (!_provider) {
    if (!process.env.RPC_URL) throw new Error("RPC_URL not set");
    _provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  }
  return _provider;
}

const { toE164 } = require("../lib/phone");

// ── Alias for USSD module ─────────────────────────────────────────────────────
// Africa's Talking delivers numbers already in +27... format; toE164 handles
// the cases where users type 082... inside USSD menus.
const normalisePhone = toE164;


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
  const inputs = text === "" ? [] : text.split("*");

  let response = "";

  try {
    // ── REGISTRATION FLOW ───────────────────────────────────────────────────
    if (!authService.isRegistered(phoneNumber)) {
      response = await handleRegistration(phoneNumber, inputs);
    } else {
      // ── MAIN MENU FLOW ─────────────────────────────────────────────────────
      response = await handleMainMenu(phoneNumber, inputs);
    }
  } catch (err) {
    console.error(`[USSD ERROR] session=${sessionId} phone=${phoneNumber}`, err);
    response = "END Sorry, something went wrong. Please try again later.";
  }

  // Africa's Talking expects plain text response
  res.set("Content-Type", "text/plain");
  res.send(response);
});

// ── Registration handler ──────────────────────────────────────────────────────

async function handleRegistration(phoneNumber, inputs) {
  if (inputs.length === 0) {
    return `CON Welcome to ZAR Smart Wallet!
No bank account needed. You only need this phone.

Create a 4-digit PIN to secure your wallet:`;
  }

  if (inputs.length === 1) {
    const pin = inputs[0];
    if (!/^\d{4,6}$/.test(pin)) {
      return `CON Invalid PIN. Please enter 4-6 digits:`;
    }
    return `CON Confirm your PIN:
(Enter the same PIN again)`;
  }

  if (inputs.length === 2) {
    const pin        = inputs[0];
    const pinConfirm = inputs[1];

    if (pin !== pinConfirm) {
      return `END PINs do not match.
Please dial again to try again.`;
    }

    // Register the user
    const { walletKeyAddress } = await authService.register(phoneNumber, pin);
    authService.setOwnerAddress(phoneNumber, walletKeyAddress);

    // Derive wallet address
    const walletAddress = await walletService.getOrPredictWalletAddress(
      walletKeyAddress,
      phoneNumber
    );

    // Queue a background welcome bonus faucet claim
    // (non-blocking – the user sees the END screen immediately)
    queueWelcomeBonus(phoneNumber, walletKeyAddress, walletAddress, pin);

    return `END Wallet created!
Your wallet: ${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}

We are sending you a R100 welcome bonus.
Dial again to check your balance!`;
  }

  return "END Invalid input. Please dial again.";
}

// ── Main menu handler ─────────────────────────────────────────────────────────

async function handleMainMenu(phoneNumber, inputs) {
  // Root menu
  if (inputs.length === 0) {
    return `CON ZAR Smart Wallet
1. Check Balance
2. Send Money
3. Claim R100 Demo Funds
4. My Wallet Address`;
  }

  const choice = inputs[0];

  // ── 1. Check Balance ────────────────────────────────────────────────────────
  if (choice === "1") {
    const ownerAddress  = authService.getOwnerAddress(phoneNumber);
    const walletAddress = await walletService.getOrPredictWalletAddress(
      ownerAddress,
      phoneNumber
    );
    const { formatted } = await walletService.getBalance(walletAddress);
    const deployed      = await walletService.isWalletDeployed(walletAddress);

    return `END ZAR Wallet Balance: ${formatted}
${deployed ? "Wallet is active on-chain." : "Wallet activates on first transaction."}
Addr: ${walletAddress.slice(0, 8)}...`;
  }

  // ── 2. Send Money ───────────────────────────────────────────────────────────
  if (choice === "2") {
    return await handleSendMoney(phoneNumber, inputs);
  }

  // ── 3. Claim Faucet ─────────────────────────────────────────────────────────
  if (choice === "3") {
    return await handleFaucetClaim(phoneNumber, inputs);
  }

  // ── 4. Wallet Address ───────────────────────────────────────────────────────
  if (choice === "4") {
    const ownerAddress  = authService.getOwnerAddress(phoneNumber);
    const walletAddress = await walletService.getOrPredictWalletAddress(
      ownerAddress,
      phoneNumber
    );
    return `END Your ZAR Wallet Address:
${walletAddress}

Share this address or your phone number to receive ZAR.`;
  }

  return `END Invalid option. Please dial again.`;
}

// ── Send Money sub-handler ────────────────────────────────────────────────────

async function handleSendMoney(senderPhone, inputs) {
  // inputs[0] = "2" (choice)
  if (inputs.length === 1) {
    return `CON Enter recipient phone number:
(e.g. 0821234567 or +27821234567)`;
  }

  if (inputs.length === 2) {
    return `CON Enter amount in ZAR (whole number):
(e.g. 25)`;
  }

  if (inputs.length === 3) {
    const recipientRaw = inputs[1];
    const amountStr    = inputs[2];
    const amountNum    = parseFloat(amountStr);

    if (isNaN(amountNum) || amountNum <= 0) {
      return `END Invalid amount. Please dial again.`;
    }

    return `CON Send R${amountNum.toFixed(2)} to ${recipientRaw}?

Enter your 4-digit PIN to confirm:`;
  }

  if (inputs.length === 4) {
    const recipientRaw = normalisePhone(inputs[1]);
    const amountStr    = inputs[2];
    const pin          = inputs[3];
    const amountNum    = parseFloat(amountStr);

    if (isNaN(amountNum) || amountNum <= 0) {
      return `END Invalid amount. Please dial again.`;
    }

    // Authenticate sender
    const senderSigner = await authService.getSignerForPin(
      senderPhone,
      pin,
      getProvider()
    );
    if (!senderSigner) {
      return `END Incorrect PIN. Transaction cancelled.`;
    }

    const senderOwnerAddress = senderSigner.address;
    const senderWalletAddress = await walletService.getOrPredictWalletAddress(
      senderOwnerAddress,
      senderPhone
    );

    // Check sender balance
    const { raw: senderBalance } = await walletService.getBalance(senderWalletAddress);
    const amountWei = ethers.parseEther(amountNum.toString());
    if (senderBalance < amountWei) {
      return `END Insufficient balance.
Your balance: ${walletService.formatZAR(senderBalance)}
You tried to send: ${walletService.formatZAR(amountWei)}`;
    }

    // Resolve recipient wallet address
    let recipientWalletAddress;
    if (authService.isRegistered(recipientRaw)) {
      // Recipient is a registered user – send to their wallet
      const recipientOwner = authService.getOwnerAddress(recipientRaw);
      recipientWalletAddress = await walletService.getOrPredictWalletAddress(
        recipientOwner,
        recipientRaw
      );
    } else {
      // Recipient not registered – still compute their counterfactual address
      // so the funds land there when they eventually sign up
      const tempKey = ethers.Wallet.createRandom();
      recipientWalletAddress = ethers.getAddress(
        "0x" + ethers.keccak256(ethers.toUtf8Bytes(recipientRaw)).slice(-40)
      );
      // NOTE: In production, use a deterministic approach tied to the
      // recipient's prospective owner key once they register.
      // For the hackathon demo, use the registered-user path only.
      return `END Recipient ${recipientRaw} has not registered yet.
Ask them to dial *384# to create their wallet first.`;
    }

    // Build and submit UserOp
    const callData = walletService.encodeZARTransfer(recipientWalletAddress, amountWei);

    let opHash;
    try {
      opHash = await userOpService.sendUserOperation({
        senderWalletAddress,
        senderPhoneNumber:  senderPhone,
        senderOwnerAddress,
        senderSigner,
        callData,
      });
    } catch (err) {
      console.error("[USSD] sendUserOperation failed:", err.message);
      return `END Transaction failed. Please try again.
Error: ${err.message.slice(0, 50)}`;
    }

    return `END Sent R${amountNum.toFixed(2)} to ${inputs[1]}!

Gas sponsored by ZARPaymaster.
Tx: ${opHash.slice(0, 12)}...
Track: jiffyscan.xyz/userOpHash/${opHash}`;
  }

  return "END Invalid input. Please dial again.";
}

// ── Faucet Claim sub-handler ──────────────────────────────────────────────────

async function handleFaucetClaim(phoneNumber, inputs) {
  // inputs[0] = "3"
  if (inputs.length === 1) {
    return `CON Claim R100 demo ZAR to your wallet.

Enter your 4-digit PIN to confirm:`;
  }

  if (inputs.length === 2) {
    const pin = inputs[1];

    const senderSigner = await authService.getSignerForPin(
      phoneNumber,
      pin,
      getProvider()
    );
    if (!senderSigner) {
      return `END Incorrect PIN. Please dial again.`;
    }

    const senderOwnerAddress  = senderSigner.address;
    const senderWalletAddress = await walletService.getOrPredictWalletAddress(
      senderOwnerAddress,
      phoneNumber
    );

    const CLAIM_AMOUNT = ethers.parseEther("100");
    const callData = walletService.encodeFaucetClaim(senderWalletAddress, CLAIM_AMOUNT);

    let opHash;
    try {
      opHash = await userOpService.sendUserOperation({
        senderWalletAddress,
        senderPhoneNumber:  phoneNumber,
        senderOwnerAddress,
        senderSigner,
        callData,
      });
    } catch (err) {
      console.error("[USSD] faucet claim failed:", err.message);
      return `END Faucet claim failed. Please try again.`;
    }

    return `END R100 ZAR claimed!

Gas sponsored by ZARPaymaster.
Tx: ${opHash.slice(0, 12)}...
Check balance by dialing *384# again.`;
  }

  return "END Invalid input. Please dial again.";
}

// ── Welcome Bonus (background) ────────────────────────────────────────────────

/**
 * Queue a welcome bonus faucet claim in the background.
 * Fires-and-forgets so the registration response is instant.
 */
function queueWelcomeBonus(phoneNumber, ownerAddress, walletAddress, pin) {
  setImmediate(async () => {
    try {
      const provider     = getProvider();
      const senderSigner = await authService.getSignerForPin(phoneNumber, pin, provider);
      if (!senderSigner) return;

      const WELCOME = ethers.parseEther("100");
      const callData = walletService.encodeFaucetClaim(walletAddress, WELCOME);

      const opHash = await userOpService.sendUserOperation({
        senderWalletAddress:  walletAddress,
        senderPhoneNumber:    phoneNumber,
        senderOwnerAddress:   ownerAddress,
        senderSigner,
        callData,
      });
      console.log(`[WELCOME BONUS] ${phoneNumber} → opHash: ${opHash}`);
    } catch (err) {
      // Don't fail registration if bonus fails – user can manually claim via menu
      console.warn(`[WELCOME BONUS] Failed for ${phoneNumber}:`, err.message);
    }
  });
}

module.exports = router;
