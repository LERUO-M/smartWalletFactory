// scripts/deploy.js
// ─────────────────────────────────────────────────────────────────────────────
// Hardhat deployment script for the SA Smart Wallet Factory system.
//
// Usage:
//   npx hardhat run scripts/deploy.js --network sepolia
//
// Required .env variables:
//   SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY,
//   PAYMASTER_SIGNER_PRIVATE_KEY (or a separate signer address)
// ─────────────────────────────────────────────────────────────────────────────

const { ethers } = require("hardhat");
require("dotenv").config();

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Canonical ERC-4337 EntryPoint v0.6.0 address.
 * Deployed at the same address on Ethereum, Sepolia, Polygon, Optimism, etc.
 * Source: https://github.com/eth-infinitism/account-abstraction/releases/tag/v0.6.0
 */
const ENTRY_POINT_ADDRESS = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

/** Amount of ETH deposited into the EntryPoint for gas sponsorship (Sepolia). */
const PAYMASTER_DEPOSIT_ETH  = "0.05";

/** Paymaster stake amount (required by ERC-4337 for paymasters). */
const PAYMASTER_STAKE_ETH    = "0.01";

/** Minimum delay before the stake can be withdrawn (seconds). */
const PAYMASTER_UNSTAKE_DELAY = 86400; // 1 day

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(label, address) {
  console.log(`  ✓ ${label.padEnd(28)} ${address}`);
}

async function waitFor(tx, label) {
  process.stdout.write(`  ⏳ ${label} …`);
  const receipt = await tx.wait();
  console.log(` ✓  (gas: ${receipt.gasUsed.toLocaleString()})`);
  return receipt;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const [deployer] = await ethers.getSigners();
  const network    = await ethers.provider.getNetwork();

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  SA Smart Wallet Factory – Deployment");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Network:   ${network.name} (chainId: ${network.chainId})`);
  console.log(`  Deployer:  ${deployer.address}`);
  console.log(
    `  Balance:   ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`
  );
  console.log("───────────────────────────────────────────────────────────\n");

  // ── 1. FICARegistry ──────────────────────────────────────────────────────

  console.log("1/5  Deploying FICARegistry …");
  const FICARegistry = await ethers.getContractFactory("FICARegistry");
  const ficaRegistry  = await FICARegistry.deploy();
  await ficaRegistry.waitForDeployment();
  log("FICARegistry", await ficaRegistry.getAddress());

  // ── 2. SAWalletFactory ───────────────────────────────────────────────────

  console.log("\n2/5  Deploying SAWalletFactory …");
  const SAWalletFactory = await ethers.getContractFactory("SAWalletFactory");
  const factory          = await SAWalletFactory.deploy(ENTRY_POINT_ADDRESS);
  await factory.waitForDeployment();
  log("SAWalletFactory", await factory.getAddress());
  log("SAWallet (impl)", await factory.accountImplementation());

  // ── 3. ZARPaymaster ──────────────────────────────────────────────────────

  console.log("\n3/5  Deploying ZARPaymaster …");

  // In production this comes from a secure HSM; on testnet we reuse the deployer.
  const paymasterSigner = process.env.PAYMASTER_SIGNER_PRIVATE_KEY
    ? new ethers.Wallet(process.env.PAYMASTER_SIGNER_PRIVATE_KEY, ethers.provider)
    : deployer;

  const ZARPaymaster = await ethers.getContractFactory("ZARPaymaster");
  const paymaster     = await ZARPaymaster.deploy(
    ENTRY_POINT_ADDRESS,
    paymasterSigner.address
  );
  await paymaster.waitForDeployment();
  log("ZARPaymaster", await paymaster.getAddress());
  log("Verifying signer", paymasterSigner.address);

  // ── 4. Fund & stake the paymaster ────────────────────────────────────────

  console.log("\n4/5  Funding & staking ZARPaymaster …");

  // Deposit ETH for gas sponsorship.
  const depositTx = await paymaster.deposit({
    value: ethers.parseEther(PAYMASTER_DEPOSIT_ETH),
  });
  await waitFor(depositTx, `Depositing ${PAYMASTER_DEPOSIT_ETH} ETH`);

  // Add stake (required by the EntryPoint for paymasters).
  const stakeTx = await paymaster.addStake(PAYMASTER_UNSTAKE_DELAY, {
    value: ethers.parseEther(PAYMASTER_STAKE_ETH),
  });
  await waitFor(stakeTx, `Staking ${PAYMASTER_STAKE_ETH} ETH`);

  // Wire up the FICARegistry (enforcement off by default on testnet).
  const ficaTx = await paymaster.setKYCRegistry(
    await ficaRegistry.getAddress(),
    false // kycEnforced = false on testnet
  );
  await waitFor(ficaTx, "Setting FICA registry on paymaster");

  // ── 5. MockZAR Token ────────────────────────────────────────────────────

  console.log("\n5/5  Deploying MockZAR stablecoin …");
  const MockZAR = await ethers.getContractFactory("MockZAR");
  const mockZar  = await MockZAR.deploy();
  await mockZar.waitForDeployment();
  log("MockZAR (ZAR)", await mockZar.getAddress());

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  Deployment complete.  Copy these into your .env:");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`ENTRY_POINT_ADDRESS=${ENTRY_POINT_ADDRESS}`);
  console.log(`FICA_REGISTRY_ADDRESS=${await ficaRegistry.getAddress()}`);
  console.log(`FACTORY_ADDRESS=${await factory.getAddress()}`);
  console.log(`PAYMASTER_ADDRESS=${await paymaster.getAddress()}`);
  console.log(`ZAR_TOKEN_ADDRESS=${await mockZar.getAddress()}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── Optional: compute an example wallet address ───────────────────────────

  const exampleOwner     = deployer.address;
  const exampleGuardians = [];
  const exampleThreshold = 1;
  const exampleSalt      = 0;

  const predictedAddress = await factory.getWalletAddress(
    exampleOwner,
    exampleGuardians,
    exampleThreshold,
    exampleSalt
  );
  console.log(
    `  Example wallet address for deployer (not yet deployed):\n  ${predictedAddress}\n`
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

