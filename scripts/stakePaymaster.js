// scripts/stakePaymaster.js
// ─────────────────────────────────────────────────────────────────────────────
// Top up the ZARPaymaster's stake in the EntryPoint to meet bundler minimums.
//
// Run this whenever you see the error:
//   "entity stake/unstake delay too low"
//
// The bundler (Alchemy/Pimlico/Stackup) requires:
//   • Stake   ≥ 0.1 ETH  (0x16345785d8a0000 wei)
//   • Unstake delay ≥ 86,400 seconds (24 hours)
//
// Usage:
//   npx hardhat run scripts/stakePaymaster.js --network sepolia
//
// Requires in .env:
//   SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, PAYMASTER_ADDRESS
// ─────────────────────────────────────────────────────────────────────────────

const { ethers } = require("hardhat");
require("dotenv").config();

// Bundler-enforced minimums
const REQUIRED_STAKE_ETH     = "0.1";   // 0.1 ETH — the bundler rejects anything less
const UNSTAKE_DELAY_SECONDS  = 86400;   // 24 hours

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
  console.log("  ZARPaymaster – Stake Top-Up");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Signer:    ${signer.address}`);
  console.log(`  Paymaster: ${paymasterAddress}`);
  console.log(
    `  Balance:   ${ethers.formatEther(
      await ethers.provider.getBalance(signer.address)
    )} ETH`
  );

  // ── Check current stake ───────────────────────────────────────────────────

  const entryPoint = new ethers.Contract(ENTRY_POINT, ENTRY_POINT_ABI, signer);
  const info = await entryPoint.getDepositInfo(paymasterAddress);

  console.log("\n  Current paymaster state in EntryPoint:");
  console.log(`    deposit:         ${ethers.formatEther(info.deposit)} ETH`);
  console.log(`    staked:          ${info.staked}`);
  console.log(`    stake:           ${ethers.formatEther(info.stake)} ETH`);
  console.log(`    unstakeDelay:    ${info.unstakeDelaySec}s`);
  console.log(`    withdrawTime:    ${info.withdrawTime}`);

  const requiredWei = ethers.parseEther(REQUIRED_STAKE_ETH);
  const alreadyStaked = info.stake;
  const delayOk = info.unstakeDelaySec >= UNSTAKE_DELAY_SECONDS;

  if (alreadyStaked >= requiredWei && delayOk) {
    console.log("\n  ✅ Stake is already sufficient — no action needed.");
    console.log(`     (${ethers.formatEther(alreadyStaked)} ETH ≥ ${REQUIRED_STAKE_ETH} ETH required)`);
    return;
  }

  // ── Top up stake ──────────────────────────────────────────────────────────

  const topUpAmount = alreadyStaked >= requiredWei
    ? 0n
    : requiredWei - alreadyStaked;

  const signerBalance = await ethers.provider.getBalance(signer.address);
  const gasBuffer     = ethers.parseEther("0.005"); // reserve for gas costs

  if (topUpAmount > 0n && signerBalance < topUpAmount + gasBuffer) {
    console.log("\n  ❌ Insufficient ETH in deployer wallet.");
    console.log(`     Have:  ${ethers.formatEther(signerBalance)} ETH`);
    console.log(`     Need:  ${ethers.formatEther(topUpAmount)} ETH for stake + ~0.005 ETH for gas`);
    console.log("\n  Get free Sepolia ETH from one of these faucets:");
    console.log("     • https://sepoliafaucet.com             (Alchemy — 0.5 ETH/day, needs login)");
    console.log("     • https://faucet.quicknode.com/ethereum/sepolia (QuickNode)");
    console.log("     • https://faucets.chain.link/sepolia    (Chainlink — 0.1 ETH/day)");
    console.log(`\n  Then re-run:  npx hardhat run scripts/stakePaymaster.js --network sepolia\n`);
    process.exitCode = 1;
    return;
  }

  if (topUpAmount > 0n) {
    console.log(`\n  ⏳ Adding stake: ${ethers.formatEther(topUpAmount)} ETH (to reach ${REQUIRED_STAKE_ETH} ETH) …`);
  } else {
    console.log(`\n  ⏳ Stake amount OK but delay too short — re-staking with ${UNSTAKE_DELAY_SECONDS}s delay …`);
  }

  const paymaster = new ethers.Contract(paymasterAddress, PAYMASTER_ABI, signer);
  const tx = await paymaster.addStake(UNSTAKE_DELAY_SECONDS, {
    value: topUpAmount,
  });
  const receipt = await tx.wait();
  console.log(`  ✅ Stake updated  (tx: ${receipt.hash}, gas: ${receipt.gasUsed.toLocaleString()})`);

  // ── Verify ────────────────────────────────────────────────────────────────

  const updated = await entryPoint.getDepositInfo(paymasterAddress);
  console.log("\n  Updated paymaster state:");
  console.log(`    deposit:         ${ethers.formatEther(updated.deposit)} ETH`);
  console.log(`    staked:          ${updated.staked}`);
  console.log(`    stake:           ${ethers.formatEther(updated.stake)} ETH  ✅`);
  console.log(`    unstakeDelay:    ${updated.unstakeDelaySec}s  ✅`);

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  Done — restart the backend and retry your transaction.");
  console.log("═══════════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
