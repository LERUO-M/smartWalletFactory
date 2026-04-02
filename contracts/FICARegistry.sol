// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IKYCRegistry.sol";

/**
 * @title  FICARegistry
 * @notice Lightweight on-chain FICA / KYC registry for the SA Smart Wallet.
 *
 *         Architecture
 *         ────────────
 *         An off-chain compliance service (run by the wallet operator) performs
 *         the actual FICA identity verification (ID document + selfie + liveness
 *         check).  Once a user passes, the service calls `setKYCStatus` on this
 *         contract from a privileged `operator` address to record the result
 *         on-chain.  Both SAWallet and ZARPaymaster read from this contract via
 *         the IKYCRegistry interface.
 *
 *         Testnet note
 *         ────────────
 *         On Sepolia, wallets and the paymaster ship with `kycEnforced = false`
 *         so that developers can transact freely.  This registry is deployed
 *         purely to demonstrate where the production hook connects.
 *
 * @dev    Access control uses a simple owner + operator model.  In production
 *         replace the operator with a multi-sig or a Chainlink external adapter.
 */
contract FICARegistry is IKYCRegistry {
    // ─── State ────────────────────────────────────────────────────────────────

    address public owner;
    mapping(address => bool) public isOperator;

    struct KYCRecord {
        bool    approved;
        uint256 approvedAt;   // unix timestamp of most recent approval
        uint256 txLimitZAR;   // max single-tx limit in ZAR cents (0 = unlimited)
    }

    mapping(address => KYCRecord) private _records;

    // ─── Events ───────────────────────────────────────────────────────────────

    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);
    event OperatorSet(address indexed operator, bool enabled);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "FICA: not owner");
        _;
    }

    modifier onlyOperator() {
        require(isOperator[msg.sender] || msg.sender == owner, "FICA: not operator");
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
        isOperator[msg.sender] = true;
        emit OwnerTransferred(address(0), msg.sender);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "FICA: zero address");
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setOperator(address operator, bool enabled) external onlyOwner {
        isOperator[operator] = enabled;
        emit OperatorSet(operator, enabled);
    }

    // ─── Operator writes ─────────────────────────────────────────────────────

    /**
     * @notice Record a FICA decision for `user`.
     * @param  user        Wallet / EOA address that completed FICA.
     * @param  approved    True if FICA passed; false if rejected / revoked.
     * @param  txLimitZAR  Maximum single-transaction amount in ZAR cents.
     *                     Pass 0 for unlimited.
     */
    function setKYCStatus(
        address user,
        bool    approved,
        uint256 txLimitZAR
    ) external onlyOperator {
        _records[user] = KYCRecord({
            approved:    approved,
            approvedAt:  approved ? block.timestamp : 0,
            txLimitZAR:  txLimitZAR
        });
        emit KYCStatusUpdated(user, approved, block.timestamp);
        if (txLimitZAR != _records[user].txLimitZAR) {
            emit TxLimitUpdated(user, txLimitZAR);
        }
    }

    /**
     * @notice Batch-approve multiple users in a single transaction (gas optimised
     *         for the post-FICA onboarding flow).
     */
    function batchSetKYCStatus(
        address[] calldata users,
        bool[]    calldata approved,
        uint256[] calldata txLimitsZAR
    ) external onlyOperator {
        require(
            users.length == approved.length && users.length == txLimitsZAR.length,
            "FICA: length mismatch"
        );
        for (uint256 i; i < users.length; ++i) {
            _records[users[i]] = KYCRecord({
                approved:   approved[i],
                approvedAt: approved[i] ? block.timestamp : 0,
                txLimitZAR: txLimitsZAR[i]
            });
            emit KYCStatusUpdated(users[i], approved[i], block.timestamp);
        }
    }

    // ─── IKYCRegistry view functions ─────────────────────────────────────────

    /// @inheritdoc IKYCRegistry
    function isKYCApproved(address user) external view override returns (bool) {
        return _records[user].approved;
    }

    /// @inheritdoc IKYCRegistry
    function isKYCApprovedForAmount(
        address user,
        uint256 amountInZAR
    ) external view override returns (bool) {
        KYCRecord memory r = _records[user];
        if (!r.approved) return false;
        if (r.txLimitZAR == 0) return true;           // 0 = unlimited
        return amountInZAR <= r.txLimitZAR;
    }

    /// @inheritdoc IKYCRegistry
    function approvalTimestamp(address user) external view override returns (uint256) {
        return _records[user].approvedAt;
    }

    /// @notice Returns the full KYC record for `user`.
    function getRecord(address user) external view returns (KYCRecord memory) {
        return _records[user];
    }
}

