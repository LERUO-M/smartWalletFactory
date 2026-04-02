// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@account-abstraction/contracts/core/BasePaymaster.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./interfaces/IKYCRegistry.sol";

/**
 * @title  ZARPaymaster  (ZAR Gas Paymaster)
 * @notice Verifying paymaster that sponsors gas fees for South African users.
 *
 *         Architecture
 *         ─────────────
 *         South African users should NEVER need to hold Sepolia ETH (or mainnet
 *         ETH) just to transact.  The ZARPaymaster achieves this by:
 *
 *         1. Holding an ETH deposit in the EntryPoint on behalf of users.
 *         2. Requiring every UserOperation to carry an off-chain signature
 *            from a trusted `verifyingSigner` (a backend server controlled by
 *            the wallet operator).
 *         3. The backend only signs UserOperations that pass its own checks
 *            (rate limiting, FICA status, fraud detection, etc.).
 *         4. Optionally enforcing an on-chain FICA check via IKYCRegistry before
 *            accepting a UserOperation — providing a defence-in-depth layer.
 *
 *         paymasterAndData layout (96 bytes minimum)
 *         ────────────────────────────────────────────
 *         [  0 : 20]  Paymaster address          (set by bundler/EntryPoint)
 *         [ 20 : 26]  validUntil  (uint48, big-endian unix timestamp)
 *         [ 26 : 32]  validAfter  (uint48, big-endian unix timestamp)
 *         [ 32 : 97]  ECDSA signature (65 bytes) over getHash(userOp,...)
 *
 *         The backend signs getHash() which commits to all UserOp fields +
 *         chainId + paymaster address + validity window.  Replay across chains
 *         or paymasters is therefore impossible.
 *
 * @dev    Extends BasePaymaster from eth-infinitism/account-abstraction v0.6.
 */
contract ZARPaymaster is BasePaymaster {
    using ECDSA for bytes32;

    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 private constant VALID_UNTIL_OFFSET = 20; // bytes in paymasterAndData
    uint256 private constant VALID_AFTER_OFFSET  = 26;
    uint256 private constant SIG_OFFSET          = 32;

    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice Backend address that signs UserOperations for gas sponsorship.
    address public verifyingSigner;

    /// @notice Optional FICA oracle.  Set to address(0) to disable on-chain KYC.
    address public kycRegistry;

    /// @notice When true, the paymaster will reject UserOps from wallets whose
    ///         owner has not cleared the IKYCRegistry.
    bool public kycEnforced;

    // ─── Events ───────────────────────────────────────────────────────────────

    event VerifyingSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event KYCRegistrySet(address indexed registry, bool enforced);
    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param entryPoint_       Canonical ERC-4337 EntryPoint.
     * @param verifyingSigner_  Backend wallet that signs UserOperations.
     */
    constructor(
        IEntryPoint entryPoint_,
        address     verifyingSigner_
    ) BasePaymaster(entryPoint_) {
        require(verifyingSigner_ != address(0), "ZAR: zero signer");
        verifyingSigner = verifyingSigner_;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ERC-4337 Paymaster Core
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @dev Validates a UserOperation for gas sponsorship.
     *
     *      Steps
     *      ──────
     *      1. Parse the validity window and signature from paymasterAndData.
     *      2. Recompute getHash() and recover the signer from the ECDSA sig.
     *      3. If kycEnforced, check the wallet sender against the FICA registry.
     *      4. Return packed validation data (sigFailed flag + validity window).
     *
     *      NOTE: The EntryPoint validates that block.timestamp is inside the
     *      [validAfter, validUntil] window; we only need to return the window.
     */
    function _validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32                /*userOpHash*/,
        uint256                /*maxCost*/
    ) internal view override returns (bytes memory context, uint256 validationData) {
        (uint48 validUntil, uint48 validAfter, bytes memory sig) =
            _parsePaymasterData(userOp.paymasterAndData);

        // Recover signer from the paymaster-specific hash (not the generic userOpHash,
        // which includes paymasterAndData itself and would be circular).
        bytes32 hash = getHash(userOp, validUntil, validAfter).toEthSignedMessageHash();
        address recovered = hash.recover(sig);
        bool sigFailed = (recovered != verifyingSigner);

        // FICA / KYC on-chain defence-in-depth
        if (!sigFailed && kycEnforced && kycRegistry != address(0)) {
            if (!IKYCRegistry(kycRegistry).isKYCApproved(userOp.sender)) {
                sigFailed = true;
            }
        }

        // context is forwarded to _postOp; encode sender for analytics / refunds.
        context = abi.encode(userOp.sender, validUntil, validAfter);
        validationData = _packValidationData(sigFailed, validUntil, validAfter);
    }

    /**
     * @dev Post-operation hook.  Called by the EntryPoint after execution.
     *      Extend this to implement ZAR-denominated fee collection, cashback
     *      programmes, or usage analytics.
     */
    function _postOp(
        PostOpMode             /* mode */,
        bytes calldata         context,
        uint256                actualGasCost
    ) internal override {
        // Decode context for future use (analytics, per-user gas accounting, etc.)
        (address sender, , ) = abi.decode(context, (address, uint48, uint48));
        // mode == PostOpMode.opSucceeded  → transaction executed successfully
        // mode == PostOpMode.opReverted   → transaction reverted; gas still spent
        // mode == PostOpMode.postOpReverted → should not happen with this impl
        emit Deposited(sender, actualGasCost); // re-purposing event for gas tracking
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Hash & Parsing Helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Computes the hash the backend must sign to authorise a UserOperation.
     *
     *         The hash commits to every UserOp field EXCEPT paymasterAndData
     *         (which would be circular), plus the chainId, paymaster address, and
     *         the validity window.  This prevents:
     *           • Replay on a different chain (chainId).
     *           • Replay through a different paymaster (address(this)).
     *           • Replay after expiry (validUntil / validAfter).
     *
     * @param  userOp      The UserOperation being validated.
     * @param  validUntil  Unix timestamp after which the signature expires.
     * @param  validAfter  Unix timestamp before which the signature is invalid.
     */
    function getHash(
        UserOperation calldata userOp,
        uint48 validUntil,
        uint48 validAfter
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                userOp.sender,
                userOp.nonce,
                keccak256(userOp.initCode),
                keccak256(userOp.callData),
                userOp.callGasLimit,
                userOp.verificationGasLimit,
                userOp.preVerificationGas,
                userOp.maxFeePerGas,
                userOp.maxPriorityFeePerGas,
                block.chainid,
                address(this),
                validUntil,
                validAfter
            )
        );
    }

    /**
     * @notice Parse the validity window and signature from `paymasterAndData`.
     * @param  paymasterAndData  Raw bytes from UserOperation.paymasterAndData.
     */
    function parsePaymasterAndData(
        bytes calldata paymasterAndData
    ) external pure returns (uint48 validUntil, uint48 validAfter, bytes memory sig) {
        return _parsePaymasterData(paymasterAndData);
    }

    function _parsePaymasterData(
        bytes calldata data
    ) internal pure returns (uint48 validUntil, uint48 validAfter, bytes memory sig) {
        require(data.length >= 97, "ZAR: paymasterAndData too short");
        validUntil = uint48(bytes6(data[VALID_UNTIL_OFFSET : VALID_AFTER_OFFSET]));
        validAfter = uint48(bytes6(data[VALID_AFTER_OFFSET : SIG_OFFSET]));
        sig        = data[SIG_OFFSET:];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Owner Administration
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Update the backend signing key (e.g., after a key rotation).
     * @param  newSigner  New backend wallet address.
     */
    function setVerifyingSigner(address newSigner) external onlyOwner {
        require(newSigner != address(0), "ZAR: zero signer");
        emit VerifyingSignerUpdated(verifyingSigner, newSigner);
        verifyingSigner = newSigner;
    }

    /**
     * @notice Configure the FICA oracle.
     * @param  registry  Deployed FICARegistry address (or address(0) to disable).
     * @param  enforced  true = on-chain KYC check active.
     */
    function setKYCRegistry(address registry, bool enforced) external onlyOwner {
        kycRegistry = registry;
        kycEnforced  = enforced;
        emit KYCRegistrySet(registry, enforced);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ETH Funding Helpers
    // ─────────────────────────────────────────────────────────────────────────
    //
    // BasePaymaster already exposes:
    //   deposit()                               – deposits msg.value to EntryPoint
    //   withdrawTo(address payable, uint256)    – withdraws from EntryPoint (onlyOwner)
    //   addStake(uint32)                        – stakes ETH (onlyOwner)
    //   unlockStake() / withdrawStake(address)  – stake management
    //
    // These are inherited and do not need to be redeclared here.
    // The `Deposited` and `Withdrawn` events above can be emitted from the
    // deploy script or a subgraph listener tracking EntryPoint events.

    receive() external payable {
        // Allow direct ETH sends; forward to EntryPoint deposit.
        entryPoint.depositTo{value: msg.value}(address(this));
    }
}

