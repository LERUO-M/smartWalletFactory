// scripts/stakePaymaster.js
// ─────────────────────────────────────────────────────────────────────────────
// Top up the ZARPaymaster's stake and gas deposit in the EntryPoint.
//
// Solves:
//   1. "entity stake/unstake delay too low" (ERC-4337 bundler reputation check)
//      • Requires Stake ≥ 0.1 ETH
//      • Requires Unstake delay ≥ 86,400s (24 hours)
//   2. "paymaster deposit too low" / gas sponsorship depletion
//      • Deposits 0.1 ETH into the EntryPoint for user gas sponsorship
//
// Usage:
//   npx hardhat run scripts/stakePaymaster.js --network sepolia
//
// Requires in .env:
//   SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, PAYMASTER_ADDRESS
// ─────────────────────────────────────────────────────────────────────────────

const { ethers } = require("hardhat");
require("dotenv").config();

// Bundler-enforced minimums & deposit configuration
const REQUIRED_STAKE_ETH     = "0.1";   // 0.1 ETH — bundler minimum stake
const UNSTAKE_DELAY_SECONDS  = 86400;   // 24 hours — bundler minimum delay
const DEPOSIT_AMOUNT_ETH     = process.env.DEPOSIT_AMOUNT_ETH || "0.1"; // Default 0.1 ETH deposit


const PAYMASTER_ABI = [
  "function getDeposit() view returns (uint256)",
  "function addStake(uint32 unstakeDelaySec) external payable",
  "function unlockStake() external",
  "function withdrawStake(address payable withdrawAddress) external",
  "function deposit() external payable",
];

const ENTRY_POINT_ABI = [
  "function getDepositInfo(address account) view returns (uint112 deposit, bool staked, uint112 stake, uint32 unstakeDelaySec, uint48 withdrawTime)",
];

const ENTRY_POINT = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

async function main() {
  const [signer] = await ethers.getSigners();
  const paymasterAddress = process.env.PAYMASTER_ADDRESS;

  if (!paymasterAddress) {
    throw new Error("PAYMASTER_ADDRESS is not set in .env");
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  ZARPaymaster – Stake & Deposit Management");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Signer:    ${signer.address}`);
  console.log(`  Paymaster: ${paymasterAddress}`);

  const signerBalance = await ethers.provider.getBalance(signer.address);
  console.log(`  Balance:   ${ethers.formatEther(signerBalance)} ETH`);

  // ── Check current paymaster state in EntryPoint ───────────────────────────

  const entryPoint = new ethers.Contract(ENTRY_POINT, ENTRY_POINT_ABI, signer);
  const info = await entryPoint.getDepositInfo(paymasterAddress);

  console.log("\n  Current paymaster state in EntryPoint:");
  console.log(`    Deposit:         ${ethers.formatEther(info.deposit)} ETH (for user gas sponsorship)`);
  console.log(`    Staked:          ${info.staked}`);
  console.log(`    Stake:           ${ethers.formatEther(info.stake)} ETH`);
  console.log(`    Unstake delay:   ${info.unstakeDelaySec}s`);
  console.log(`    Withdraw time:   ${info.withdrawTime}`);

  const requiredStakeWei = ethers.parseEther(REQUIRED_STAKE_ETH);
  const alreadyStaked    = info.stake;
  const delayOk          = info.unstakeDelaySec >= UNSTAKE_DELAY_SECONDS;
  const needsStakeUpdate = alreadyStaked < requiredStakeWei || !delayOk;

  const stakeTopUpAmount = alreadyStaked >= requiredStakeWei
    ? 0n
    : requiredStakeWei - alreadyStaked;

  const depositAmountWei = ethers.parseEther(DEPOSIT_AMOUNT_ETH);
  const totalEthNeeded   = stakeTopUpAmount + depositAmountWei;
  const gasBuffer        = ethers.parseEther("0.005");

  console.log("\n  Plan:");
  if (needsStakeUpdate) {
    if (stakeTopUpAmount > 0n) {
      console.log(`    • Top up stake:     +${ethers.formatEther(stakeTopUpAmount)} ETH (to reach ${REQUIRED_STAKE_ETH} ETH)`);
    } else {
      console.log(`    • Update unstake delay to ${UNSTAKE_DELAY_SECONDS}s`);
    }
  } else {
    console.log(`    • Stake:            Already sufficient (${ethers.formatEther(alreadyStaked)} ETH ≥ ${REQUIRED_STAKE_ETH} ETH)`);
  }
  console.log(`    • Add gas deposit:  +${DEPOSIT_AMOUNT_ETH} ETH`);
  console.log(`    • Total ETH needed:  ${ethers.formatEther(totalEthNeeded)} ETH (+ ~0.005 ETH for gas)`);

  // ── Balance check ─────────────────────────────────────────────────────────

  if (signerBalance < totalEthNeeded + gasBuffer) {
    console.log("\n  ❌ Insufficient ETH in deployer wallet.");
    console.log(`     Available: ${ethers.formatEther(signerBalance)} ETH`);
    console.log(`     Required:  ${ethers.formatEther(totalEthNeeded + gasBuffer)} ETH (${ethers.formatEther(totalEthNeeded)} ETH actions + ~0.005 ETH gas)`);
    console.log("\n  Get free Sepolia ETH from faucets:");
    console.log("     • https://sepoliafaucet.com             (Alchemy — 0.5 ETH/day)");
    console.log("     • https://faucet.quicknode.com/ethereum/sepolia (QuickNode)");
    console.log("     • https://faucets.chain.link/sepolia    (Chainlink — 0.1 ETH/day)");
    console.log(`\n  Then re-run:  npx hardhat run scripts/stakePaymaster.js --network sepolia\n`);
    process.exitCode = 1;
    return;
  }

  const paymaster = new ethers.Contract(paymasterAddress, PAYMASTER_ABI, signer);

  // ── 1. Top up stake (if needed) ───────────────────────────────────────────

  if (needsStakeUpdate) {
    console.log(`\n  ⏳ [1/2] Updating stake: adding ${ethers.formatEther(stakeTopUpAmount)} ETH stake …`);
    const stakeTx = await paymaster.addStake(UNSTAKE_DELAY_SECONDS, {
      value: stakeTopUpAmount,
    });
    const receipt = await stakeTx.wait();
    console.log(`  ✓ Stake updated! (tx: ${receipt.hash}, gas: ${receipt.gasUsed.toLocaleString()})`);
  } else {
    console.log("\n  ✓ [1/2] Stake already meets bundler requirements (skipping stake tx).");
  }

  // ── 2. Deposit 0.1 ETH for gas sponsorship ────────────────────────────────

  console.log(`\n  ⏳ [2/2] Depositing ${DEPOSIT_AMOUNT_ETH} ETH to EntryPoint for gas sponsorship …`);
  const depositTx = await paymaster.deposit({
    value: depositAmountWei,
  });
  const depReceipt = await depositTx.wait();
  console.log(`  ✓ Deposit confirmed! (tx: ${depReceipt.hash}, gas: ${depReceipt.gasUsed.toLocaleString()})`);

  // ── Verify final state ────────────────────────────────────────────────────

  const updated = await entryPoint.getDepositInfo(paymasterAddress);
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  Updated Paymaster Status");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`    Deposit:       ${ethers.formatEther(updated.deposit)} ETH  ✓`);
  console.log(`    Staked:        ${updated.staked}  ✓`);
  console.log(`    Stake:         ${ethers.formatEther(updated.stake)} ETH  ✓`);
  console.log(`    Unstake delay: ${updated.unstakeDelaySec}s  ✓`);
  console.log("═══════════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exitCode = 1;
});
