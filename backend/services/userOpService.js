// backend/services/userOpService.js
// ─────────────────────────────────────────────────────────────────────────────
// ERC-4337 UserOperation builder, paymaster signer, and bundler dispatcher.
//
// This service adapts the logic from scripts/signUserOp.js into an async
// module usable by the USSD session handler for real-time on-chain execution.
//
// Flow:
//   1. Build a partial UserOp (no paymasterAndData or signature).
//   2. Attach a dummy paymasterAndData for gas estimation.
//   3. Sign the paymaster hash with the backend's PAYMASTER_SIGNER_PRIVATE_KEY.
//   4. Sign the full UserOpHash with the user's ephemeral wallet signer.
//   5. Send to the bundler via eth_sendUserOperation JSON-RPC.
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const { ethers } = require("ethers");
const walletService = require("./walletService");

// ── ABI fragments ─────────────────────────────────────────────────────────────

const ENTRY_POINT_ABI = [
  "function getNonce(address sender, uint192 key) view returns (uint256)",
  "function getUserOpHash(tuple(address sender,uint256 nonce,bytes initCode,bytes callData,uint256 callGasLimit,uint256 verificationGasLimit,uint256 preVerificationGas,uint256 maxFeePerGas,uint256 maxPriorityFeePerGas,bytes paymasterAndData,bytes signature) userOp) view returns (bytes32)",
];

const PAYMASTER_ABI = [
  "function getHash(tuple(address sender,uint256 nonce,bytes initCode,bytes callData,uint256 callGasLimit,uint256 verificationGasLimit,uint256 preVerificationGas,uint256 maxFeePerGas,uint256 maxPriorityFeePerGas,bytes paymasterAndData,bytes signature) userOp, uint48 validUntil, uint48 validAfter) view returns (bytes32)",
];

// ── Constants ─────────────────────────────────────────────────────────────────

// Conservative gas estimates (Sepolia).  In production, call
// eth_estimateUserOperationGas on the bundler for accurate values.
const GAS_LIMITS = {
  callGasLimit:         300_000n,
  verificationGasLimit: 400_000n,  // higher for first-deployment ops with initCode
  preVerificationGas:    80_000n,
};

// Paymaster signature validity window: 5 minutes
const VALID_WINDOW_SECONDS = 300;

// ── Module Init ───────────────────────────────────────────────────────────────

let rpcProvider;
let bundlerProvider;
let paymasterSigner;
let entryPoint;
let paymaster;

function init() {
  if (rpcProvider) return;

  const rpcUrl     = process.env.RPC_URL;
  const bundlerUrl = process.env.BUNDLER_RPC_URL;
  const pmKey      = process.env.PAYMASTER_SIGNER_PRIVATE_KEY;
  const epAddress  = process.env.ENTRY_POINT_ADDRESS;
  const pmAddress  = process.env.PAYMASTER_ADDRESS;

  if (!rpcUrl)     throw new Error("RPC_URL is not set in .env");
  if (!bundlerUrl) throw new Error("BUNDLER_RPC_URL is not set in .env");
  if (!pmKey)      throw new Error("PAYMASTER_SIGNER_PRIVATE_KEY is not set in .env");
  if (!epAddress)  throw new Error("ENTRY_POINT_ADDRESS is not set in .env");
  if (!pmAddress)  throw new Error("PAYMASTER_ADDRESS is not set in .env");

  rpcProvider     = new ethers.JsonRpcProvider(rpcUrl);
  bundlerProvider = new ethers.JsonRpcProvider(bundlerUrl);
  paymasterSigner = new ethers.Wallet(pmKey, rpcProvider);
  entryPoint      = new ethers.Contract(epAddress, ENTRY_POINT_ABI, rpcProvider);
  paymaster       = new ethers.Contract(pmAddress, PAYMASTER_ABI, rpcProvider);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Pack the paymasterAndData bytes:
 *   [0:20]  paymaster address
 *   [20:26] validUntil (uint48, big-endian)
 *   [26:32] validAfter (uint48, big-endian)
 *   [32:97] ECDSA signature (65 bytes) from backend signer
 */
function packPaymasterAndData(paymasterAddress, validUntil, validAfter, sig) {
  const untilHex = validUntil.toString(16).padStart(12, "0"); // 6 bytes = 12 hex
  const afterHex = validAfter.toString(16).padStart(12, "0");
  return ethers.concat([
    paymasterAddress,
    "0x" + untilHex + afterHex,
    sig,
  ]);
}

/**
 * Fetch current gas prices from the RPC provider and clamp to bundler minimums.
 *
 * Sepolia's RPC routinely returns maxPriorityFeePerGas as low as 1,000,000 wei
 * (0.001 gwei) because validators don't need tips on a free testnet.  ERC-4337
 * bundlers (Alchemy, Pimlico, Stackup) enforce their own floors, typically
 * 0.1 gwei (100,000,000 wei) for priority and 1.5–2× that for maxFee.
 * We take whichever is larger: what the network reports vs. the bundler floor.
 */
async function getGasFees() {
  // Bundler-enforced minimums (conservative — works with Alchemy, Pimlico, Stackup)
  const MIN_PRIORITY = ethers.parseUnits("0.1",  "gwei"); // 100_000_000 wei
  const MIN_MAX_FEE  = ethers.parseUnits("0.15", "gwei"); // 150_000_000 wei

  const feeData = await rpcProvider.getFeeData();

  // Use the larger of (network value, minimum floor) so we never go below the floor
  // but also don't overpay when the network is congested
  const maxPriorityFeePerGas = bigMax(
    feeData.maxPriorityFeePerGas ?? MIN_PRIORITY,
    MIN_PRIORITY
  );
  const maxFeePerGas = bigMax(
    feeData.maxFeePerGas ?? MIN_MAX_FEE,
    MIN_MAX_FEE,
    maxPriorityFeePerGas  // maxFee must be >= priority fee
  );

  return { maxFeePerGas, maxPriorityFeePerGas };
}

/** Return the largest of the provided BigInt values. */
function bigMax(...vals) {
  return vals.reduce((a, b) => (b > a ? b : a));
}


// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build, sign, and submit a gasless ERC-4337 UserOperation.
 *
 * This is the central function called by the USSD handler whenever the user
 * confirms a transfer.  It handles both first-time wallet deployments (via
 * initCode) and subsequent transactions transparently.
 *
 * @param {object}         opts
 * @param {string}         opts.senderWalletAddress  - The SAWallet proxy address.
 * @param {string}         opts.senderPhoneNumber    - Used to build initCode if needed.
 * @param {string}         opts.senderOwnerAddress   - The owner EOA address.
 * @param {ethers.Wallet}  opts.senderSigner         - Live signer to sign the UserOp.
 * @param {string}         opts.callData             - Encoded SAWallet.execute() calldata.
 *
 * @returns {Promise<string>} The UserOperation hash returned by the bundler.
 */
async function sendUserOperation({
  senderWalletAddress,
  senderPhoneNumber,
  senderOwnerAddress,
  senderSigner,
  callData,
}) {
  init();

  const paymasterAddress = process.env.PAYMASTER_ADDRESS;
  const deployed = await walletService.isWalletDeployed(senderWalletAddress);
  const initCode = deployed
    ? "0x"
    : await walletService.encodeInitCode(senderOwnerAddress, senderPhoneNumber);

  // ── 1. Fetch nonce ─────────────────────────────────────────────────────────
  const nonce = await walletService.getEntryPointNonce(senderWalletAddress);

  // ── 2. Fetch gas fees ──────────────────────────────────────────────────────
  const { maxFeePerGas, maxPriorityFeePerGas } = await getGasFees();

  // ── 3. Gas Limits ──────────────────────────────────────────────────────────
  // Bundlers (like Alchemy) enforce strict verification gas efficiency:
  // actualVerificationGas / verificationGasLimit >= 0.20
  // Setting an oversized verificationGasLimit (e.g. 400,000 when actual usage is ~24k)
  // causes the bundler to reject with:
  //   "Verification gas limit efficiency too low. Required: 0.2, Actual: 0.0601..."
  let verificationGasLimit = deployed
    ? 80_000n     // ~24k actual / 80k = 30% efficiency (satisfies ≥ 20% rule)
    : 250_000n;   // counterfactual first-deploy requires ~160k / 250k = 64% efficiency

  let callGasLimit       = 120_000n; // ERC-20 transfer / faucet takes ~35k-55k gas
  let preVerificationGas = 50_000n;

  // ── 4. Sign and Dispatch (with self-healing efficiency retry) ──────────────
  for (let attempt = 0; attempt < 2; attempt++) {
    const validAfter = 0;
    const validUntil = Math.floor(Date.now() / 1000) + VALID_WINDOW_SECONDS;

    const dummySig = "0x" + "00".repeat(65);
    const dummyPaymasterData = packPaymasterAndData(
      paymasterAddress, validUntil, validAfter, dummySig
    );

    const userOp = {
      sender:               senderWalletAddress,
      nonce,
      initCode,
      callData,
      callGasLimit,
      verificationGasLimit,
      preVerificationGas,
      maxFeePerGas,
      maxPriorityFeePerGas,
      paymasterAndData:     dummyPaymasterData,
      signature:            "0x",
    };

    // Sign paymaster hash
    const paymasterHash = await paymaster.getHash(userOp, validUntil, validAfter);
    const paymasterSig  = await paymasterSigner.signMessage(
      ethers.getBytes(paymasterHash)
    );
    userOp.paymasterAndData = packPaymasterAndData(
      paymasterAddress, validUntil, validAfter, paymasterSig
    );

    // Sign userOp hash
    const userOpHash = await entryPoint.getUserOpHash(userOp);
    userOp.signature = await senderSigner.signMessage(ethers.getBytes(userOpHash));

    // Serialise BigInts to hex strings
    const userOpForBundler = Object.fromEntries(
      Object.entries(userOp).map(([k, v]) => [
        k,
        typeof v === "bigint" ? ethers.toBeHex(v) : v,
      ])
    );

    try {
      const opHash = await bundlerProvider.send("eth_sendUserOperation", [
        userOpForBundler,
        process.env.ENTRY_POINT_ADDRESS,
      ]);
      return opHash;
    } catch (err) {
      const msg = err.message || JSON.stringify(err);
      if (attempt === 0 && msg.includes("Verification gas limit efficiency too low")) {
        const match = msg.match(/Actual:\s*([0-9.]+)/i);
        if (match) {
          const ratio = parseFloat(match[1]);
          const actualGas = Number(verificationGasLimit) * ratio;
          // Target ~30% efficiency (well above 20% required minimum)
          verificationGasLimit = BigInt(Math.ceil(actualGas / 0.30));
          console.log(
            `[userOpService] Auto-adjusting verificationGasLimit based on bundler simulation: actual=${actualGas.toFixed(0)} gas → new limit=${verificationGasLimit}`
          );
          continue;
        }
      }
      throw err;
    }
  }
}

/**
 * Claim R100 welcome bonus from the MockZAR faucet for a new user.
 * This call is itself an ERC-4337 UserOperation – gas is sponsored so the
 * brand-new wallet does not need any ETH to claim its first tokens.
 *
 * @param {object} opts - Same shape as sendUserOperation opts.
 * @returns {Promise<string>} UserOp hash.
 */
async function claimWelcomeBonus(opts) {
  const amountWei = walletService.encodeFaucetClaim
    ? walletService.encodeFaucetClaim
    : null;

  const WELCOME_AMOUNT = ethers.parseEther("100");
  const callData = walletService.encodeFaucetClaim(
    opts.senderWalletAddress,
    WELCOME_AMOUNT
  );

  return sendUserOperation({ ...opts, callData });
}

module.exports = {
  sendUserOperation,
  claimWelcomeBonus,
};
