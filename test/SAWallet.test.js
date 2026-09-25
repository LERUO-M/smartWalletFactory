const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SA Smart Wallet System", function () {
  let deployer, userOwner, newOwner, guardian1, guardian2, paymasterSigner, attacker;
  let ficaRegistry, mockZar, factory, paymaster;
  let entryPointSigner;

  const SALT = 12345n;
  const ONE_ZAR = ethers.parseEther("1");
  const HUNDRED_ZAR = ethers.parseEther("100");

  beforeEach(async function () {
    [deployer, userOwner, newOwner, guardian1, guardian2, paymasterSigner, attacker] =
      await ethers.getSigners();

    // Use deployer as simulated EntryPoint for unit testing
    entryPointSigner = deployer;

    // 1. Deploy FICARegistry
    const FICARegistry = await ethers.getContractFactory("FICARegistry");
    ficaRegistry = await FICARegistry.deploy();
    await ficaRegistry.waitForDeployment();

    // 2. Deploy MockZAR
    const MockZAR = await ethers.getContractFactory("MockZAR");
    mockZar = await MockZAR.deploy();
    await mockZar.waitForDeployment();

    // 3. Deploy SAWalletFactory
    const SAWalletFactory = await ethers.getContractFactory("SAWalletFactory");
    factory = await SAWalletFactory.deploy(entryPointSigner.address);
    await factory.waitForDeployment();

    // 4. Deploy ZARPaymaster
    const ZARPaymaster = await ethers.getContractFactory("ZARPaymaster");
    paymaster = await ZARPaymaster.deploy(
      entryPointSigner.address,
      paymasterSigner.address
    );
    await paymaster.waitForDeployment();

    // Link FICARegistry to Paymaster
    await paymaster.setKYCRegistry(await ficaRegistry.getAddress(), false);
  });

  describe("MockZAR Token", function () {
    it("should deploy with 1,000,000 initial liquidity to deployer", async function () {
      const balance = await mockZar.balanceOf(deployer.address);
      expect(balance).to.equal(ethers.parseEther("1000000"));
      expect(await mockZar.decimals()).to.equal(18);
    });

    it("should allow claiming from the public faucet up to FAUCET_LIMIT", async function () {
      const claimAmount = ethers.parseEther("500");
      await mockZar.connect(userOwner).faucet(userOwner.address, claimAmount);
      expect(await mockZar.balanceOf(userOwner.address)).to.equal(claimAmount);
    });

    it("should reject faucet requests exceeding FAUCET_LIMIT", async function () {
      const tooMuch = ethers.parseEther("5001");
      await expect(
        mockZar.connect(userOwner).faucet(userOwner.address, tooMuch)
      ).to.be.revertedWith("MockZAR: exceeds faucet limit");
    });
  });

  describe("SAWalletFactory & Deterministic CREATE2", function () {
    it("should compute deterministic address before deployment", async function () {
      const guardians = [guardian1.address];
      const threshold = 1;

      const predicted = await factory.getWalletAddress(
        userOwner.address,
        guardians,
        threshold,
        SALT
      );

      // Code at predicted address should initially be empty
      expect(await ethers.provider.getCode(predicted)).to.equal("0x");

      // Deploy wallet
      const tx = await factory.createAccount(
        userOwner.address,
        guardians,
        threshold,
        SALT
      );
      await tx.wait();

      // Deployed address must match predicted address
      expect(await ethers.provider.getCode(predicted)).to.not.equal("0x");

      // Factory createAccount is idempotent
      const tx2 = await factory.createAccount(
        userOwner.address,
        guardians,
        threshold,
        SALT
      );
      await tx2.wait();
      expect(await factory.getWalletAddress(userOwner.address, guardians, threshold, SALT)).to.equal(predicted);
    });
  });

  describe("SAWallet & Dual FICA Verification", function () {
    let walletAddress, wallet;

    beforeEach(async function () {
      const guardians = [guardian1.address];
      walletAddress = await factory.getWalletAddress(userOwner.address, guardians, 1, SALT);
      await factory.createAccount(userOwner.address, guardians, 1, SALT);
      wallet = await ethers.getContractAt("SAWallet", walletAddress);

      // Fund wallet with MockZAR
      await mockZar.faucet(walletAddress, HUNDRED_ZAR);
    });

    it("should allow owner to execute MockZAR transfer when KYC is disabled", async function () {
      const transferCalldata = mockZar.interface.encodeFunctionData("transfer", [
        newOwner.address,
        ONE_ZAR,
      ]);

      await wallet.connect(userOwner).execute(await mockZar.getAddress(), 0, transferCalldata);
      expect(await mockZar.balanceOf(newOwner.address)).to.equal(ONE_ZAR);
    });

    it("should revert execution when kycEnforced is true and neither wallet nor owner is approved", async function () {
      await wallet.connect(userOwner).setKYCRegistry(await ficaRegistry.getAddress(), true);

      const transferCalldata = mockZar.interface.encodeFunctionData("transfer", [
        newOwner.address,
        ONE_ZAR,
      ]);

      await expect(
        wallet.connect(userOwner).execute(await mockZar.getAddress(), 0, transferCalldata)
      ).to.be.revertedWith("SAW: not FICA cleared");
    });

    it("should allow execution when the owner EOA is KYC approved", async function () {
      await wallet.connect(userOwner).setKYCRegistry(await ficaRegistry.getAddress(), true);

      // Approve owner EOA in FICARegistry
      await ficaRegistry.setKYCStatus(userOwner.address, true, 0);

      const transferCalldata = mockZar.interface.encodeFunctionData("transfer", [
        newOwner.address,
        ONE_ZAR,
      ]);

      await wallet.connect(userOwner).execute(await mockZar.getAddress(), 0, transferCalldata);
      expect(await mockZar.balanceOf(newOwner.address)).to.equal(ONE_ZAR);
    });

    it("should allow execution when the wallet proxy address is KYC approved", async function () {
      await wallet.connect(userOwner).setKYCRegistry(await ficaRegistry.getAddress(), true);

      // Approve wallet contract address in FICARegistry
      await ficaRegistry.setKYCStatus(walletAddress, true, 0);

      const transferCalldata = mockZar.interface.encodeFunctionData("transfer", [
        newOwner.address,
        ONE_ZAR,
      ]);

      await wallet.connect(userOwner).execute(await mockZar.getAddress(), 0, transferCalldata);
      expect(await mockZar.balanceOf(newOwner.address)).to.equal(ONE_ZAR);
    });
  });

  describe("ZARPaymaster Dual FICA & Signature Verification", function () {
    let walletAddress, userOp, validUntil, validAfter;

    beforeEach(async function () {
      const guardians = [];
      walletAddress = await factory.getWalletAddress(userOwner.address, guardians, 1, SALT);
      await factory.createAccount(userOwner.address, guardians, 1, SALT);

      validAfter = 0;
      validUntil = Math.floor(Date.now() / 1000) + 3600;

      userOp = {
        sender: walletAddress,
        nonce: 0,
        initCode: "0x",
        callData: "0x",
        callGasLimit: 200000,
        verificationGasLimit: 150000,
        preVerificationGas: 50000,
        maxFeePerGas: ethers.parseUnits("20", "gwei"),
        maxPriorityFeePerGas: ethers.parseUnits("1", "gwei"),
        paymasterAndData: "0x",
        signature: "0x",
      };
    });

    function packPaymasterData(paymasterAddress, vUntil, vAfter, sig) {
      const untilHex = vUntil.toString(16).padStart(12, "0");
      const afterHex = vAfter.toString(16).padStart(12, "0");
      return ethers.concat([paymasterAddress, "0x" + untilHex + afterHex, sig]);
    }

    it("should validate paymaster signature and return valid context when KYC is not enforced", async function () {
      const pmAddress = await paymaster.getAddress();
      const dummySig = "0x" + "00".repeat(65);
      userOp.paymasterAndData = packPaymasterData(pmAddress, validUntil, validAfter, dummySig);

      const hash = await paymaster.getHash(userOp, validUntil, validAfter);
      const sig = await paymasterSigner.signMessage(ethers.getBytes(hash));
      userOp.paymasterAndData = packPaymasterData(pmAddress, validUntil, validAfter, sig);

      // Call validatePaymasterUserOp from the simulated EntryPoint
      const [context, validationData] = await paymaster
        .connect(entryPointSigner)
        .validatePaymasterUserOp.staticCall(userOp, ethers.ZeroHash, 0);

      // In ERC-4337, sigFailed is bit 0 of validationData
      const sigFailed = validationData & 1n;
      expect(sigFailed).to.equal(0n);
    });

    it("should flag sigFailed when kycEnforced is true and neither wallet nor owner is approved", async function () {
      await paymaster.setKYCRegistry(await ficaRegistry.getAddress(), true);

      const pmAddress = await paymaster.getAddress();
      const dummySig = "0x" + "00".repeat(65);
      userOp.paymasterAndData = packPaymasterData(pmAddress, validUntil, validAfter, dummySig);

      const hash = await paymaster.getHash(userOp, validUntil, validAfter);
      const sig = await paymasterSigner.signMessage(ethers.getBytes(hash));
      userOp.paymasterAndData = packPaymasterData(pmAddress, validUntil, validAfter, sig);

      const [context, validationData] = await paymaster
        .connect(entryPointSigner)
        .validatePaymasterUserOp.staticCall(userOp, ethers.ZeroHash, 0);

      // sigFailed is 1 when FICA fails
      const sigFailed = validationData & 1n;
      expect(sigFailed).to.equal(1n);
    });

    it("should pass when kycEnforced is true and owner EOA is approved in FICARegistry", async function () {
      await paymaster.setKYCRegistry(await ficaRegistry.getAddress(), true);
      // Approve owner EOA
      await ficaRegistry.setKYCStatus(userOwner.address, true, 0);

      const pmAddress = await paymaster.getAddress();
      const dummySig = "0x" + "00".repeat(65);
      userOp.paymasterAndData = packPaymasterData(pmAddress, validUntil, validAfter, dummySig);

      const hash = await paymaster.getHash(userOp, validUntil, validAfter);
      const sig = await paymasterSigner.signMessage(ethers.getBytes(hash));
      userOp.paymasterAndData = packPaymasterData(pmAddress, validUntil, validAfter, sig);

      const [context, validationData] = await paymaster
        .connect(entryPointSigner)
        .validatePaymasterUserOp.staticCall(userOp, ethers.ZeroHash, 0);

      const sigFailed = validationData & 1n;
      expect(sigFailed).to.equal(0n);
    });

    it("should pass when kycEnforced is true and wallet proxy address is approved in FICARegistry", async function () {
      await paymaster.setKYCRegistry(await ficaRegistry.getAddress(), true);
      // Approve wallet contract
      await ficaRegistry.setKYCStatus(walletAddress, true, 0);

      const pmAddress = await paymaster.getAddress();
      const dummySig = "0x" + "00".repeat(65);
      userOp.paymasterAndData = packPaymasterData(pmAddress, validUntil, validAfter, dummySig);

      const hash = await paymaster.getHash(userOp, validUntil, validAfter);
      const sig = await paymasterSigner.signMessage(ethers.getBytes(hash));
      userOp.paymasterAndData = packPaymasterData(pmAddress, validUntil, validAfter, sig);

      const [context, validationData] = await paymaster
        .connect(entryPointSigner)
        .validatePaymasterUserOp.staticCall(userOp, ethers.ZeroHash, 0);

      const sigFailed = validationData & 1n;
      expect(sigFailed).to.equal(0n);
    });
  });

  describe("Social Recovery & Timelock", function () {
    let wallet;

    beforeEach(async function () {
      const guardians = [guardian1.address];
      const walletAddress = await factory.getWalletAddress(userOwner.address, guardians, 1, SALT);
      await factory.createAccount(userOwner.address, guardians, 1, SALT);
      wallet = await ethers.getContractAt("SAWallet", walletAddress);
    });

    it("should allow a guardian to initiate recovery", async function () {
      await expect(wallet.connect(guardian1).initiateRecovery(newOwner.address))
        .to.emit(wallet, "RecoveryInitiated")
        .withArgs(1, newOwner.address, guardian1.address);

      const proposal = await wallet.currentRecovery();
      expect(proposal.proposedOwner).to.equal(newOwner.address);
      expect(proposal.approvalCount).to.equal(1);
    });

    it("should reject non-guardians from initiating recovery", async function () {
      await expect(
        wallet.connect(attacker).initiateRecovery(attacker.address)
      ).to.be.revertedWith("SAW: not guardian");
    });

    it("should allow the current owner to veto/cancel a pending recovery", async function () {
      await wallet.connect(guardian1).initiateRecovery(newOwner.address);
      await expect(wallet.connect(userOwner).cancelRecovery())
        .to.emit(wallet, "RecoveryCancelled")
        .withArgs(1);

      const proposal = await wallet.currentRecovery();
      expect(proposal.proposedOwner).to.equal(ethers.ZeroAddress);
    });
  });
});
