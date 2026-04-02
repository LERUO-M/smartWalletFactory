// scripts/signUserOp.js
// ─────────────────────────────────────────────────────────────────────────────
// Demonstrates how to build, sign, and dispatch a UserOperation for the
// SA Smart Wallet architecture (SAWallet + ZARPaymaster).
//
// The example transfers 1 unit of a ZAR-pegged ERC-20 stablecoin without the
// user holding any ETH – the ZARPaymaster sponsors the gas fees.
//
// Usage:
//   node scripts/signUserOp.js
//
// Required .env variables:
//   SEPOLIA_RPC_URL, BUNDLER_RPC_URL,
//   OWNER_PRIVATE_KEY, PAYMASTER_SIGNER_PRIVATE_KEY,
//   FACTORY_ADDRESS, PAYMASTER_ADDRESS, ZAR_TOKEN_ADDRESS
// ─────────────────────────────────────────────────────────────────────────────

const { ethers } = require("ethers");
require("dotenv").config();

// ── ABI fragments ─────────────────────────────────────────────────────────────

const ENTRY_POINT_ABI = [
  "function getNonce(address sender, uint192 key) view returns (uint256)",
  "function getUserOpHash(tuple(address sender,uint256 nonce,bytes initCode,bytes callData,uint256 callGasLimit,uint256 verificationGasLimit,uint256 preVerificationGas,uint256 maxFeePerGas,uint256 maxPriorityFeePerGas,bytes paymasterAndData,bytes signature)) view returns (bytes32)",
  "function handleOps(tuple(address sender,uint256 nonce,bytes initCode,bytes callData,uint256 callGasLimit,uint256 verificationGasLimit,uint256 preVerificationGas,uint256 maxFeePerGas,uint256 maxPriorityFeePerGas,bytes paymasterAndData,bytes signature)[] ops, address beneficiary) payable",
];

const FACTORY_ABI = [
  "function getAddress(address owner, address[] guardians, uint256 threshold, uint256 salt) view returns (address)",
  "function createAccount(address owner, address[] guardians, uint256 threshold, uint256 salt) returns (address)",
];

const PAYMASTER_ABI = [
  "function getHash(tuple(address sender,uint256 nonce,bytes initCode,bytes callData,uint256 callGasLimit,uint256 verificationGasLimit,uint256 preVerificationGas,uint256 maxFeePerGas,uint256 maxPriorityFeePerGas,bytes paymasterAndData,bytes signature) userOp, uint48 validUntil, uint48 validAfter) view returns (bytes32)",
];

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

// ── Config ────────────────────────────────────────────────────────────────────

const ENTRY_POINT_ADDRESS = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
const CHAIN_ID            = 11155111; // Sepolia

// Validity window: 5 minutes from now.
const VALID_AFTER  = 0;                                 // accept immediately
const VALID_UNTIL  = Math.floor(Date.now() / 1000) + 300; // 5 min

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Encode the initCode field for a not-yet-deployed wallet.
 * If the wallet is already deployed, pass "0x".
 */
function encodeInitCode(factoryAddress, owner, guardians, threshold, salt) {
  const iface = new ethers.Interface(FACTORY_ABI);
  const callData = iface.encodeFunctionData("createAccount", [
    owner, guardians, threshold, salt,
  ]);
  return ethers.concat([factoryAddress, callData]);
}

/**
 * Encode the callData field for an ERC-20 transfer via SAWallet.execute().
 */
function encodeERC20Transfer(tokenAddress, recipient, amount) {
  const tokenIface = new ethers.Interface(ERC20_ABI);
  const innerCalldata = tokenIface.encodeFunctionData("transfer", [recipient, amount]);

  const walletIface = new ethers.Interface([
    "function execute(address dest, uint256 value, bytes calldata func)",
  ]);
  return walletIface.encodeFunctionData("execute", [tokenAddress, 0n, innerCalldata]);
}

/**
 * Build the unsigned (dummy-signature) UserOperation struct.
 * Gas values shown here are reasonable Sepolia estimates; use a bundler's
 * `eth_estimateUserOperationGas` for production-accurate values.
 */
function buildUserOp({ sender, nonce, initCode, callData, paymasterAndData }) {
  return {
    sender,
    nonce,
    initCode:             initCode  ?? "0x",
    callData,
    callGasLimit:         200_000n,
    verificationGasLimit: 150_000n,
    preVerificationGas:   50_000n,
    maxFeePerGas:         ethers.parseUnits("20", "gwei"),
    maxPriorityFeePerGas: ethers.parseUnits("1",  "gwei"),
    paymasterAndData:     paymasterAndData ?? "0x",
    signature:            "0x",  // filled in after signing
  };
}

/**
 * Pack the paymasterAndData bytes:
 *   [0:20]  paymaster address
 *   [20:26] validUntil (uint48, big-endian)
 *   [26:32] validAfter (uint48, big-endian)
 *   [32:97] ECDSA signature from backend signer
 */
function packPaymasterAndData(paymasterAddress, validUntil, validAfter, sig) {
  const validUntilHex = validUntil.toString(16).padStart(12, "0"); // 6 bytes
  const validAfterHex = validAfter.toString(16).padStart(12, "0");
  return ethers.concat([
    paymasterAddress,
    "0x" + validUntilHex + validAfterHex,
    sig,
  ]);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // ── Providers & signers ────────────────────────────────────────────────────
  const rpcProvider     = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const bundlerProvider = new ethers.JsonRpcProvider(process.env.BUNDLER_RPC_URL);

  const ownerWallet     = new ethers.Wallet(process.env.OWNER_PRIVATE_KEY,            rpcProvider);
  const paymasterSigner = new ethers.Wallet(process.env.PAYMASTER_SIGNER_PRIVATE_KEY, rpcProvider);

  const entryPoint = new ethers.Contract(ENTRY_POINT_ADDRESS, ENTRY_POINT_ABI, rpcProvider);
  const factory    = new ethers.Contract(process.env.FACTORY_ADDRESS, FACTORY_ABI, rpcProvider);
  const paymaster  = new ethers.Contract(process.env.PAYMASTER_ADDRESS, PAYMASTER_ABI, rpcProvider);
  const zarToken   = new ethers.Contract(process.env.ZAR_TOKEN_ADDRESS, ERC20_ABI, rpcProvider);

  // ── Step 1: Determine wallet address ──────────────────────────────────────
  const owner     = ownerWallet.address;
  const guardians = [];   // Solo wallet; guardians can be added later.
  const threshold = 1;
  const salt      = 0;

  const walletAddress = await factory.getAddress(owner, guardians, threshold, salt);
  const isDeployed    = (await rpcProvider.getCode(walletAddress)) !== "0x";
  console.log(`\nWallet address : ${walletAddress}`);
  console.log(`Deployed       : ${isDeployed}`);

  // ── Step 2: Build callData (transfer 1 ZAR stablecoin to a recipient) ─────
  const decimals   = await zarToken.decimals();
  const recipient  = "0xRecipientAddressHere"; // replace with actual recipient
  const amount     = ethers.parseUnits("1", decimals);
  const callData   = encodeERC20Transfer(process.env.ZAR_TOKEN_ADDRESS, recipient, amount);

  // ── Step 3: Determine initCode (only needed for first UserOp) ─────────────
  const initCode = isDeployed
    ? "0x"
    : encodeInitCode(process.env.FACTORY_ADDRESS, owner, guardians, threshold, salt);

  // ── Step 4: Fetch on-chain nonce from EntryPoint ──────────────────────────
  const nonce = await entryPoint.getNonce(walletAddress, 0);
  console.log(`Nonce          : ${nonce}`);

  // ── Step 5: Assemble UserOp with a dummy signature for gas estimation ─────
  //   The paymaster field is initially empty so the bundler can estimate gas
  //   without needing a valid signature.
  let userOp = buildUserOp({ sender: walletAddress, nonce, initCode, callData });

  // ── Step 6: Get the paymaster signature from the backend ──────────────────
  //   In production this is an HTTP call to your signing service.
  //   Here we sign locally with PAYMASTER_SIGNER_PRIVATE_KEY.

  // First, build partial paymasterAndData with a dummy sig to pass to getHash().
  const dummySig = "0x" + "00".repeat(65);
  userOp.paymasterAndData = packPaymasterAndData(
    process.env.PAYMASTER_ADDRESS,
    VALID_UNTIL,
    VALID_AFTER,
    dummySig
  );

  const paymasterHash    = await paymaster.getHash(userOp, VALID_UNTIL, VALID_AFTER);
  const paymasterSig     = await paymasterSigner.signMessage(ethers.getBytes(paymasterHash));

  // Replace dummy sig with the real one.
  userOp.paymasterAndData = packPaymasterAndData(
    process.env.PAYMASTER_ADDRESS,
    VALID_UNTIL,
    VALID_AFTER,
    paymasterSig
  );

  // ── Step 7: Sign the UserOperation hash with the wallet owner key ─────────
  const userOpHash = await entryPoint.getUserOpHash(userOp);
  console.log(`UserOpHash     : ${userOpHash}`);

  // ethers.signMessage prepends the EIP-191 prefix – exactly what _validateSignature expects.
  userOp.signature = await ownerWallet.signMessage(ethers.getBytes(userOpHash));
  console.log(`Owner sig      : ${userOp.signature.slice(0, 20)}…`);
  console.log(`Paymaster sig  : ${paymasterSig.slice(0, 20)}…`);

  // ── Step 8: Send via the bundler RPC ─────────────────────────────────────
  //   The bundler exposes the standard `eth_sendUserOperation` JSON-RPC method.
  console.log("\nSending UserOperation to bundler …");
  const result = await bundlerProvider.send("eth_sendUserOperation", [
    userOp,
    ENTRY_POINT_ADDRESS,
  ]);
  console.log(`\n  ✓ Bundler accepted UserOperation`);
  console.log(`  UserOp hash: ${result}`);
  console.log(
    `  Track it at: https://www.jiffyscan.xyz/userOpHash/${result}?network=sepolia\n`
  );

  // Return the final signed UserOp for programmatic use.
  return userOp;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

