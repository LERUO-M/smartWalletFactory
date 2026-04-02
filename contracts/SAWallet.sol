// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@account-abstraction/contracts/core/BaseAccount.sol";
import "@account-abstraction/contracts/samples/callback/TokenCallbackHandler.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "./interfaces/IKYCRegistry.sol";

/**
 * @title  SAWallet  (South African Smart Wallet)
 * @notice ERC-4337 account-abstraction wallet tailored for South African users.
 *
 *         Key features
 *         ─────────────
 *         • ECDSA owner-key signature validation (validateUserOp).
 *         • execute / executeBatch for arbitrary on-chain calls (ZAR stablecoin
 *           transfers, DeFi interactions, etc.).
 *         • Guardian-based social recovery with a 48-hour timelock, so users
 *           never permanently lose access if they lose their signing device.
 *         • FICA / KYC compliance hook: a modifier gates execution through an
 *           IKYCRegistry oracle.  On Sepolia testnet the hook is disabled by
 *           default (kycEnforced = false) so developers can transact freely.
 *         • UUPS-upgradeable: the factory deploys a lightweight ERC1967Proxy
 *           in front of this implementation.
 *
 * @dev    Inherits BaseAccount from eth-infinitism/account-abstraction v0.6.
 */
contract SAWallet is
    BaseAccount,
    TokenCallbackHandler,
    UUPSUpgradeable,
    Initializable
{
    using ECDSA for bytes32;

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    IEntryPoint private immutable _entryPoint;

    /// @notice Primary signing key.  Controls normal operations and guardian mgmt.
    address public owner;

    // ── Guardian / Social Recovery ───────────────────────────────────────────
    mapping(address => bool) public isGuardian;
    uint256 public guardianCount;
    uint256 public recoveryThreshold;

    /// @dev 48-hour mandatory timelock after quorum is reached before the new
    ///      owner can be installed.  Gives the legitimate owner time to cancel.
    uint256 public constant RECOVERY_TIMELOCK = 48 hours;

    struct RecoveryProposal {
        address proposedOwner;
        uint256 approvalCount;
        uint256 readyAt;   // timestamp quorum was reached (0 = not yet)
        bool    executed;
    }

    uint256 public recoveryNonce;
    RecoveryProposal public currentRecovery;

    /// @dev nonce → guardian → has voted.  Indexed by nonce so old votes never
    ///      pollute a new proposal even without explicit cleanup.
    mapping(uint256 => mapping(address => bool)) private _recoveryApprovals;

    // ── FICA / KYC ───────────────────────────────────────────────────────────
    address public kycRegistry;
    /// @notice Set to true in production once the FICA oracle is live.
    ///         Remains false on Sepolia testnet to allow unrestricted testing.
    bool public kycEnforced;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event SAWalletInitialized(address indexed entryPoint, address indexed owner);
    event Executed(address indexed dest, uint256 value, bytes data);
    event GuardianAdded(address indexed guardian);
    event GuardianRemoved(address indexed guardian);
    event RecoveryThresholdUpdated(uint256 threshold);
    event RecoveryInitiated(uint256 indexed nonce, address proposedOwner, address by);
    event RecoveryApproved(uint256 indexed nonce, address by, uint256 totalApprovals);
    event RecoveryExecuted(address indexed oldOwner, address indexed newOwner);
    event RecoveryCancelled(uint256 indexed nonce);
    event KYCRegistrySet(address indexed registry, bool enforced);

    // ─────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(
            msg.sender == owner || msg.sender == address(this),
            "SAW: not owner"
        );
        _;
    }

    modifier onlyGuardian() {
        require(isGuardian[msg.sender], "SAW: not guardian");
        _;
    }

    /**
     * @dev FICA compliance gate.
     *      When kycEnforced is true the wallet owner must hold a valid FICA
     *      clearance on the IKYCRegistry before any execute call succeeds.
     *      This is the integration point for the off-chain FICA oracle.
     */
    modifier ficaCompliant() {
        if (kycEnforced && kycRegistry != address(0)) {
            require(
                IKYCRegistry(kycRegistry).isKYCApproved(owner),
                "SAW: owner not FICA cleared"
            );
        }
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor / Initializer
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev The implementation is non-initializable; proxies call initialize().
    constructor(IEntryPoint anEntryPoint) {
        _entryPoint = anEntryPoint;
        _disableInitializers();
    }

    /**
     * @notice Initialise the proxy instance.  Called once by the factory.
     * @param  anOwner    Primary signing key.
     * @param  guardians  Initial guardian addresses (may be empty for solo wallets).
     * @param  threshold  Number of guardian approvals required for recovery.
     */
    function initialize(
        address          anOwner,
        address[] calldata guardians,
        uint256          threshold
    ) external initializer {
        _setOwner(anOwner);
        for (uint256 i; i < guardians.length; ++i) {
            _addGuardian(guardians[i]);
        }
        recoveryThreshold = (threshold > 0 && threshold <= guardians.length)
            ? threshold
            : 1;
        emit SAWalletInitialized(address(_entryPoint), anOwner);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ERC-4337 Core
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc BaseAccount
    function entryPoint() public view override returns (IEntryPoint) {
        return _entryPoint;
    }

    /**
     * @dev Validates the UserOperation signature.
     *      Recovers the signer from an eth_sign (EIP-191) hash and compares it
     *      to the stored owner.  Returns 0 on success or SIG_VALIDATION_FAILED.
     */
    function _validateSignature(
        UserOperation calldata userOp,
        bytes32                userOpHash
    ) internal view override returns (uint256 validationData) {
        bytes32 hash = userOpHash.toEthSignedMessageHash();
        if (hash.recover(userOp.signature) != owner) {
            return SIG_VALIDATION_FAILED;
        }
        return 0;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Execution
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Execute a single arbitrary call.
     *         The FICA modifier checks the owner's KYC status when enforcement
     *         is enabled, providing the compliance gate for every on-chain action
     *         (ZAR stablecoin transfers, SARB-regulated DeFi, etc.).
     *
     * @param dest   Target contract or EOA address.
     * @param value  ETH (wei) to forward.
     * @param func   ABI-encoded calldata.
     */
    function execute(
        address dest,
        uint256 value,
        bytes calldata func
    ) external ficaCompliant {
        _requireFromEntryPointOrOwner();
        _call(dest, value, func);
        emit Executed(dest, value, func);
    }

    /**
     * @notice Execute a batch of calls atomically.
     *         Useful for approve + transfer patterns on ZAR stablecoins or
     *         multi-step DeFi interactions in a single UserOperation.
     *
     * @param dest    Array of target addresses.
     * @param values  Array of ETH values (pass empty array for 0-value calls).
     * @param funcs   Array of ABI-encoded calldatas.
     */
    function executeBatch(
        address[] calldata dest,
        uint256[] calldata values,
        bytes[]   calldata funcs
    ) external ficaCompliant {
        _requireFromEntryPointOrOwner();
        require(
            dest.length == funcs.length &&
            (values.length == 0 || values.length == dest.length),
            "SAW: length mismatch"
        );
        for (uint256 i; i < dest.length; ++i) {
            _call(dest[i], values.length == 0 ? 0 : values[i], funcs[i]);
            emit Executed(dest[i], values.length == 0 ? 0 : values[i], funcs[i]);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Guardian Management
    // ─────────────────────────────────────────────────────────────────────────

    function addGuardian(address guardian) external onlyOwner {
        _addGuardian(guardian);
    }

    function removeGuardian(address guardian) external onlyOwner {
        require(isGuardian[guardian], "SAW: not a guardian");
        isGuardian[guardian] = false;
        unchecked { --guardianCount; }
        require(guardianCount >= recoveryThreshold, "SAW: would break threshold");
        emit GuardianRemoved(guardian);
    }

    function setRecoveryThreshold(uint256 threshold) external onlyOwner {
        require(threshold > 0 && threshold <= guardianCount, "SAW: invalid threshold");
        recoveryThreshold = threshold;
        emit RecoveryThresholdUpdated(threshold);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Social Recovery (Guardian Quorum + 48-hour Timelock)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Guardian initiates a recovery proposal.
     *         Increments recoveryNonce so all votes for the previous proposal
     *         are atomically invalidated without any storage cleanup.
     *
     * @param newOwner  Proposed replacement signing key.
     */
    function initiateRecovery(address newOwner) external onlyGuardian {
        require(newOwner != address(0), "SAW: zero address");
        uint256 nonce = ++recoveryNonce;
        currentRecovery = RecoveryProposal({
            proposedOwner: newOwner,
            approvalCount: 1,
            readyAt:       recoveryThreshold == 1 ? block.timestamp : 0,
            executed:      false
        });
        _recoveryApprovals[nonce][msg.sender] = true;
        emit RecoveryInitiated(nonce, newOwner, msg.sender);
        emit RecoveryApproved(nonce, msg.sender, 1);
    }

    /**
     * @notice Additional guardians vote to confirm the current proposal.
     *         When the quorum is reached the 48-hour timelock begins.
     */
    function approveRecovery() external onlyGuardian {
        RecoveryProposal storage p = currentRecovery;
        require(p.proposedOwner != address(0), "SAW: no active proposal");
        require(!p.executed, "SAW: already executed");
        require(!_recoveryApprovals[recoveryNonce][msg.sender], "SAW: already approved");
        _recoveryApprovals[recoveryNonce][msg.sender] = true;
        unchecked { ++p.approvalCount; }
        if (p.approvalCount >= recoveryThreshold && p.readyAt == 0) {
            p.readyAt = block.timestamp;
        }
        emit RecoveryApproved(recoveryNonce, msg.sender, p.approvalCount);
    }

    /**
     * @notice Execute the recovery once the timelock has elapsed.
     *         Callable by anyone — the timelock itself is the security boundary.
     */
    function executeRecovery() external {
        RecoveryProposal storage p = currentRecovery;
        require(p.proposedOwner != address(0), "SAW: no active proposal");
        require(!p.executed,   "SAW: already executed");
        require(p.readyAt != 0, "SAW: quorum not reached");
        require(block.timestamp >= p.readyAt + RECOVERY_TIMELOCK, "SAW: timelock active");
        p.executed = true;
        address oldOwner = owner;
        _setOwner(p.proposedOwner);
        emit RecoveryExecuted(oldOwner, owner);
    }

    /**
     * @notice The current owner cancels a pending recovery.
     *         This is the veto mechanism during the 48-hour window.
     */
    function cancelRecovery() external onlyOwner {
        require(currentRecovery.proposedOwner != address(0), "SAW: no proposal");
        require(!currentRecovery.executed, "SAW: already executed");
        uint256 nonce = recoveryNonce;
        currentRecovery.proposedOwner = address(0);
        currentRecovery.executed = true;
        emit RecoveryCancelled(nonce);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FICA / KYC Registry
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Point the wallet at the deployed FICARegistry and toggle enforcement.
     * @param  registry  Address of the IKYCRegistry implementation.
     * @param  enforced  true = FICA gate active; false = open (testnet default).
     */
    function setKYCRegistry(address registry, bool enforced) external onlyOwner {
        kycRegistry = registry;
        kycEnforced  = enforced;
        emit KYCRegistrySet(registry, enforced);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal Helpers
    // ─────────────────────────────────────────────────────────────────────────

    function _requireFromEntryPointOrOwner() internal view {
        require(
            msg.sender == address(entryPoint()) || msg.sender == owner,
            "SAW: not authorised"
        );
    }

    function _addGuardian(address guardian) internal {
        require(guardian != address(0), "SAW: zero address");
        require(!isGuardian[guardian], "SAW: already guardian");
        isGuardian[guardian] = true;
        unchecked { ++guardianCount; }
        emit GuardianAdded(guardian);
    }

    function _setOwner(address newOwner) internal {
        require(newOwner != address(0), "SAW: zero address");
        owner = newOwner;
    }

    function _call(address target, uint256 value, bytes memory data) internal {
        (bool success, bytes memory result) = target.call{value: value}(data);
        if (!success) {
            assembly { revert(add(result, 32), mload(result)) }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UUPS + ETH receiver
    // ─────────────────────────────────────────────────────────────────────────

    function _authorizeUpgrade(address) internal override onlyOwner {}

    receive() external payable {}
}

