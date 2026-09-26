// scripts/verify.js
// ─────────────────────────────────────────────────────────────────────────────
// Etherscan verification script for SA Smart Wallet contracts on Sepolia.
//
// Verifies:
//   1. FICARegistry
//   2. SAWalletFactory
//   3. SAWallet (account implementation deployed by SAWalletFactory)
//   4. ZARPaymaster (dynamically resolves verifyingSigner from on-chain state)
//   5. MockZAR
//
// Usage:
//   npx hardhat run scripts/verify.js --network sepolia
//
// Prerequisites in .env:
//   ETHERSCAN_API_KEY, SEPOLIA_RPC_URL, ENTRY_POINT_ADDRESS,
//   FICA_REGISTRY_ADDRESS, FACTORY_ADDRESS, PAYMASTER_ADDRESS, ZAR_TOKEN_ADDRESS
// ─────────────────────────────────────────────────────────────────────────────

const hre = require("hardhat");
require("dotenv").config();

const ENTRY_POINT_DEFAULT = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function verifyContract(name, address, constructorArguments = [], contractPath = null, maxRetries = 3) {
  console.log(`\n⏳ Verifying ${name} at ${address} …`);

  const params = {
    address,
    constructorArguments,
  };

  if (contractPath) {
    params.contract = contractPath;
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await hre.run("verify:verify", params);
      console.log(`  ✓ ${name} verified successfully!`);
      console.log(`    Explorer: https://sepolia.etherscan.io/address/${address}#code`);
      await sleep(3000); // polite pause for Etherscan rate limits
      return { name, address, status: "Verified" };
    } catch (err) {
      const msg = err.message || "";
      if (
        msg.toLowerCase().includes("already verified") ||
        msg.toLowerCase().includes("contract source code already verified")
      ) {
        console.log(`  ✓ ${name} is already verified.`);
        console.log(`    Explorer: https://sepolia.etherscan.io/address/${address}#code`);
        return { name, address, status: "Already verified" };
      }

      if (attempt < maxRetries && (msg.includes("Timeout") || msg.includes("network request failed"))) {
        console.warn(`  ⚠️ Attempt ${attempt} timed out, retrying in 5s …`);
        await sleep(5000);
        continue;
      }

      console.error(`  ✗ Verification failed for ${name}:`, msg);
      return { name, address, status: "Failed", error: msg };
    }
  }
}

async function main() {
  const network = await hre.ethers.provider.getNetwork();

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  SA Smart Wallet – Etherscan Contract Verification");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Network:  ${network.name} (chainId: ${network.chainId})`);

  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    throw new Error("ETHERSCAN_API_KEY is missing from .env");
  }

  const entryPointAddress = process.env.ENTRY_POINT_ADDRESS || ENTRY_POINT_DEFAULT;
  const ficaAddress       = process.env.FICA_REGISTRY_ADDRESS;
  const factoryAddress    = process.env.FACTORY_ADDRESS;
  const paymasterAddress  = process.env.PAYMASTER_ADDRESS;
  const zarTokenAddress   = process.env.ZAR_TOKEN_ADDRESS;

  console.log("  Configuration:");
  console.log(`    EntryPoint:    ${entryPointAddress}`);
  console.log(`    FICARegistry:  ${ficaAddress || "NOT SET"}`);
  console.log(`    Factory:       ${factoryAddress || "NOT SET"}`);
  console.log(`    Paymaster:     ${paymasterAddress || "NOT SET"}`);
  console.log(`    MockZAR:       ${zarTokenAddress || "NOT SET"}`);
  console.log("───────────────────────────────────────────────────────────");

  const results = [];

  // ── 1. FICARegistry ────────────────────────────────────────────────────────
  if (ficaAddress) {
    const res = await verifyContract(
      "FICARegistry",
      ficaAddress,
      [],
      "contracts/FICARegistry.sol:FICARegistry"
    );
    results.push(res);
  } else {
    console.warn("\n⚠️  Skipping FICARegistry: FICA_REGISTRY_ADDRESS not set in .env");
  }

  // ── 2. SAWalletFactory & SAWallet Implementation ───────────────────────────
  let implementationAddress = null;
  if (factoryAddress) {
    const res = await verifyContract(
      "SAWalletFactory",
      factoryAddress,
      [entryPointAddress],
      "contracts/SAWalletFactory.sol:SAWalletFactory"
    );
    results.push(res);

    // Query on-chain accountImplementation
    try {
      const factory = await hre.ethers.getContractAt("SAWalletFactory", factoryAddress);
      implementationAddress = await factory.accountImplementation();
      console.log(`\n  Discovered SAWallet implementation: ${implementationAddress}`);
      
      const implRes = await verifyContract(
        "SAWallet (Implementation)",
        implementationAddress,
        [entryPointAddress],
        "contracts/SAWallet.sol:SAWallet"
      );
      results.push(implRes);
    } catch (err) {
      console.warn(`  ⚠️ Could not query accountImplementation from factory: ${err.message}`);
    }
  } else {
    console.warn("\n⚠️  Skipping SAWalletFactory: FACTORY_ADDRESS not set in .env");
  }

  // ── 3. ZARPaymaster ────────────────────────────────────────────────────────
  if (paymasterAddress) {
    let verifyingSigner = null;
    try {
      const paymaster = await hre.ethers.getContractAt("ZARPaymaster", paymasterAddress);
      verifyingSigner = await paymaster.verifyingSigner();
      console.log(`  Resolved verifyingSigner on-chain: ${verifyingSigner}`);
    } catch (err) {
      console.warn(`  ⚠️ Could not read verifyingSigner on-chain: ${err.message}`);
      if (process.env.PAYMASTER_SIGNER_PRIVATE_KEY) {
        const wallet = new hre.ethers.Wallet(process.env.PAYMASTER_SIGNER_PRIVATE_KEY);
        verifyingSigner = wallet.address;
        console.log(`  Falling back to signer address from private key: ${verifyingSigner}`);
      }
    }

    if (verifyingSigner) {
      const res = await verifyContract(
        "ZARPaymaster",
        paymasterAddress,
        [entryPointAddress, verifyingSigner],
        "contracts/ZARPaymaster.sol:ZARPaymaster"
      );
      results.push(res);
    } else {
      console.error("  ✗ Cannot verify ZARPaymaster: verifyingSigner could not be determined.");
      results.push({ name: "ZARPaymaster", address: paymasterAddress, status: "Skipped (no signer)" });
    }
  } else {
    console.warn("\n⚠️  Skipping ZARPaymaster: PAYMASTER_ADDRESS not set in .env");
  }

  // ── 4. MockZAR ─────────────────────────────────────────────────────────────
  if (zarTokenAddress) {
    const res = await verifyContract(
      "MockZAR",
      zarTokenAddress,
      [],
      "contracts/MockZAR.sol:MockZAR"
    );
    results.push(res);
  } else {
    console.warn("\n⚠️  Skipping MockZAR: ZAR_TOKEN_ADDRESS not set in .env");
  }

  // ── Summary Table ──────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  Verification Summary");
  console.log("═══════════════════════════════════════════════════════════");
  for (const r of results) {
    const icon = r.status.includes("Verif") ? "✓" : "✗";
    console.log(`  ${icon} ${r.name.padEnd(26)} ${r.status.padEnd(18)} ${r.address}`);
  }
  console.log("═══════════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exitCode = 1;
});
