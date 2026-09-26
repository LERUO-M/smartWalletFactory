// backend/services/ficaSync.js
// ─────────────────────────────────────────────────────────────────────────────
// OPTIONAL: mirror a Level 1 validation to the on-chain FICARegistry.
//
// Off by default. Enable with FICA_SYNC=true plus FICA_REGISTRY_ADDRESS.
// The transaction is signed by FICA_OPERATOR_PRIVATE_KEY (falls back to
// PAYMASTER_SIGNER_PRIVATE_KEY), which must be an operator on the registry
// (the deployer is by default). Costs Sepolia gas; runs in the background.
// Tier limits are always enforced off-chain by kycService regardless.
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const { ethers } = require("ethers");
const authService   = require("./authService");
const walletService = require("./walletService");

const REGISTRY_ABI = [
  "function setKYCStatus(address user, bool approved, uint256 txLimitZAR) external",
];

function enabled() {
  return process.env.FICA_SYNC === "true" && !!process.env.FICA_REGISTRY_ADDRESS && !!process.env.RPC_URL;
}

/**
 * Fire-and-forget. `txLimitCents` is the per-transaction limit (0 = unlimited).
 */
function syncApproval(phoneNumber, approved, txLimitCents = 0) {
  if (!enabled()) return;
  setImmediate(async () => {
    try {
      const key = process.env.FICA_OPERATOR_PRIVATE_KEY || process.env.PAYMASTER_SIGNER_PRIVATE_KEY;
      if (!key) throw new Error("no operator key configured");
      const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
      const signer   = new ethers.Wallet(key.startsWith("0x") ? key : "0x" + key, provider);
      const registry = new ethers.Contract(process.env.FICA_REGISTRY_ADDRESS, REGISTRY_ABI, signer);

      const owner  = authService.getOwnerAddress(phoneNumber);
      const wallet = await walletService.getOrPredictWalletAddress(owner, phoneNumber);
      const tx = await registry.setKYCStatus(wallet, approved, BigInt(txLimitCents));
      console.log(`[FICA SYNC] ${phoneNumber} approved=${approved} tx=${tx.hash}`);
    } catch (err) {
      console.warn(`[FICA SYNC] Failed for ${phoneNumber}:`, err.message);
    }
  });
}

module.exports = { enabled, syncApproval };
