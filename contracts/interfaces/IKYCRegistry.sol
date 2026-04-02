// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title  IKYCRegistry
 * @notice Minimal interface for the FICA / KYC compliance oracle.
 *
 *         Both SAWallet and ZARPaymaster query this interface.  The concrete
 *         implementation (FICARegistry.sol) can be replaced with a production
 *         oracle that reads from an off-chain FICA verification service without
 *         changing any wallet or paymaster logic.
 *
 * @dev    South African FICA (Financial Intelligence Centre Act) requires
 *         identity verification for financial-services customers.  This
 *         interface exposes the minimum surface needed for on-chain enforcement
 *         while keeping the verification logic off-chain.
 */
interface IKYCRegistry {
    // ─── Events ──────────────────────────────────────────────────────────────

    /// @notice Emitted when an address's FICA status is changed.
    event KYCStatusUpdated(address indexed user, bool approved, uint256 timestamp);

    /// @notice Emitted when the per-address transaction limit is updated.
    event TxLimitUpdated(address indexed user, uint256 limitInZAR);

    // ─── View functions ───────────────────────────────────────────────────────

    /**
     * @notice Returns true if `user` has completed FICA verification.
     * @param  user  The wallet or EOA address to check.
     */
    function isKYCApproved(address user) external view returns (bool);

    /**
     * @notice Returns true if `user` is FICA-cleared AND the amount is within
     *         their approved ZAR transaction limit.
     * @param  user        The wallet or EOA address to check.
     * @param  amountInZAR The transaction amount expressed in ZAR cents (×100).
     */
    function isKYCApprovedForAmount(
        address user,
        uint256 amountInZAR
    ) external view returns (bool);

    /**
     * @notice Returns the ISO 8601 timestamp of the most recent FICA approval.
     * @param  user  The wallet or EOA address to query.
     */
    function approvalTimestamp(address user) external view returns (uint256);
}

