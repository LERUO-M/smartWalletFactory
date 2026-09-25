// backend/services/walletService.js
// ─────────────────────────────────────────────────────────────────────────────
// Deterministic wallet address resolution and balance queries.
//
// The core insight: a phone number can be mapped to a CREATE2 wallet address
// BEFORE the wallet is ever deployed on-chain.  Users can receive ZAR
// transfers to their phone number address instantly without any prior setup.
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const { ethers } = require("ethers");

// ── ABI fragments ─────────────────────────────────────────────────────────────

const FACTORY_ABI = [
  "function getWalletAddress(address owner, address[] guardians, uint256 threshold, uint256 salt) external view returns (address)",
  "function createAccount(address owner, address[] guardians, uint256 threshold, uint256 salt) external returns (address)",
  "event AccountCreated(address indexed account, address indexed owner, uint256 salt)",
];

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function faucet(address to, uint256 amount) external",
];

const SAWALLET_ABI = [
  "function execute(address dest, uint256 value, bytes calldata func) external",
  "function owner() external view returns (address)",
];

// ── Module Init ───────────────────────────────────────────────────────────────

let provider;
let factory;
let zarToken;

/**
 * Lazy-initialise provider and contracts from environment variables.
 * Called on first use so the module can be required even if .env is not loaded yet.
 */
function init() {
  if (provider) return; // already initialised

  const rpcUrl         = process.env.RPC_URL;
  const factoryAddress = process.env.FACTORY_ADDRESS;
  const tokenAddress   = process.env.ZAR_TOKEN_ADDRESS;

  if (!rpcUrl)         throw new Error("RPC_URL is not set in .env");
  if (!factoryAddress) throw new Error("FACTORY_ADDRESS is not set in .env");
  if (!tokenAddress)   throw new Error("ZAR_TOKEN_ADDRESS is not set in .env");

  provider  = new ethers.JsonRpcProvider(rpcUrl);
  factory   = new ethers.Contract(factoryAddress, FACTORY_ABI, provider);
  zarToken  = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Derive a deterministic uint256 salt from a normalised phone number string.
 * "+27821234567" → always the same BigInt salt.
 */
function phoneToSalt(phoneNumber) {
  return BigInt(ethers.keccak256(ethers.toUtf8Bytes(phoneNumber)));
}

/**
 * Format a raw ZAR token amount (18-decimal bigint) to a 2-decimal currency string.
 * e.g.  parseEther("25.5") → "R25.50"
 */
function formatZAR(rawAmount) {
  const formatted = ethers.formatUnits(rawAmount, 18);
  const num = parseFloat(formatted);
  return `R${num.toFixed(2)}`;
}

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Compute the CREATE2 wallet address for a given owner EOA and phone number,
 * WITHOUT deploying anything.  The address is stable and receivable before
 * the wallet exists on-chain.
 *
 * @param {string} ownerAddress - The EOA signing key for this user.
 * @param {string} phoneNumber  - Normalised phone number (e.g. "+27821234567").
 * @returns {Promise<string>} Checksummed wallet address.
 */
async function getOrPredictWalletAddress(ownerAddress, phoneNumber) {
  init();
  const salt = phoneToSalt(phoneNumber);
  return factory.getWalletAddress(ownerAddress, [], 1, salt);
}

/**
 * Check whether the user's wallet proxy contract has been deployed on-chain.
 *
 * @param {string} walletAddress - The predicted wallet address.
 * @returns {Promise<boolean>}
 */
async function isWalletDeployed(walletAddress) {
  init();
  const code = await provider.getCode(walletAddress);
  return code !== "0x";
}

/**
 * Query the ZAR token balance for the given address.
 *
 * @param {string} address - Wallet or EOA address.
 * @returns {Promise<{raw: bigint, formatted: string}>} Raw bigint and human-readable string.
 */
async function getBalance(address) {
  init();
  const raw = await zarToken.balanceOf(address);
  return { raw, formatted: formatZAR(raw) };
}

/**
 * Encode the initCode field for a not-yet-deployed wallet.
 * The bundler includes this in the UserOperation; the EntryPoint calls it to
 * deploy the wallet atomically before the first transaction executes.
 *
 * @param {string} ownerAddress - Owner EOA key.
 * @param {string} phoneNumber  - Normalised phone number.
 * @returns {Promise<string>} ABI-encoded factory.createAccount calldata prefixed with factory address.
 */
async function encodeInitCode(ownerAddress, phoneNumber) {
  init();
  const salt      = phoneToSalt(phoneNumber);
  const iface     = new ethers.Interface(FACTORY_ABI);
  const callData  = iface.encodeFunctionData("createAccount", [
    ownerAddress, [], 1, salt,
  ]);
  return ethers.concat([await factory.getAddress(), callData]);
}

/**
 * Encode a ZAR token transfer wrapped in SAWallet.execute() calldata.
 *
 * @param {string} recipientWalletAddress - Recipient's SAWallet proxy address.
 * @param {bigint} amountWei              - Amount in 18-decimal token units.
 * @returns {string} ABI-encoded calldata for SAWallet.execute().
 */
function encodeZARTransfer(recipientWalletAddress, amountWei) {
  init();
  const tokenIface  = new ethers.Interface(ERC20_ABI);
  const innerData   = tokenIface.encodeFunctionData("transfer", [
    recipientWalletAddress, amountWei,
  ]);
  const walletIface = new ethers.Interface(SAWALLET_ABI);
  return walletIface.encodeFunctionData("execute", [
    zarToken.target, 0n, innerData,
  ]);
}

/**
 * Encode a MockZAR faucet() claim wrapped in SAWallet.execute() calldata.
 * Used for the USSD "Claim Demo Funds" menu option.
 *
 * @param {string} walletAddress - The wallet to receive faucet ZAR.
 * @param {bigint} amountWei     - Amount to claim (max 5000 ZAR = 5000e18).
 * @returns {string} ABI-encoded calldata for SAWallet.execute().
 */
function encodeFaucetClaim(walletAddress, amountWei) {
  init();
  const tokenIface  = new ethers.Interface(ERC20_ABI);
  const innerData   = tokenIface.encodeFunctionData("faucet", [
    walletAddress, amountWei,
  ]);
  const walletIface = new ethers.Interface(SAWALLET_ABI);
  return walletIface.encodeFunctionData("execute", [
    zarToken.target, 0n, innerData,
  ]);
}

/**
 * Retrieve the current nonce from the EntryPoint for the given sender.
 *
 * @param {string} senderAddress - The smart wallet address.
 * @returns {Promise<bigint>}
 */
async function getEntryPointNonce(senderAddress) {
  init();
  const entryPointAddress = process.env.ENTRY_POINT_ADDRESS;
  if (!entryPointAddress) throw new Error("ENTRY_POINT_ADDRESS is not set in .env");

  const entryPoint = new ethers.Contract(
    entryPointAddress,
    ["function getNonce(address sender, uint192 key) view returns (uint256)"],
    provider
  );
  return entryPoint.getNonce(senderAddress, 0);
}

module.exports = {
  getOrPredictWalletAddress,
  isWalletDeployed,
  getBalance,
  encodeInitCode,
  encodeZARTransfer,
  encodeFaucetClaim,
  getEntryPointNonce,
  phoneToSalt,
  formatZAR,
};
