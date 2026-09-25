// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/Create2.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "./SAWallet.sol";

/**
 * @title  SAWalletFactory
 * @notice CREATE2 factory for SAWallet proxy instances.
 *
 *         Deterministic Addresses
 *         ────────────────────────
 *         Because the factory uses CREATE2, a user's wallet address is fully
 *         determined by (owner, guardians, threshold, salt) BEFORE the contract
 *         is deployed.  The JS helper `getAddress()` mirrors this computation
 *         off-chain so the front-end can display the wallet address instantly,
 *         accept incoming ZAR stablecoin deposits, and only deploy on first use.
 *
 *         Proxy Pattern
 *         ─────────────
 *         Each wallet is a thin ERC1967Proxy pointing to a shared SAWallet
 *         implementation.  This keeps deployment gas minimal (~150k gas) while
 *         still allowing per-wallet storage and optional UUPS upgrades.
 *
 * @dev    Mirrors the SimpleAccountFactory pattern from eth-infinitism/account-
 *         abstraction v0.6 with extensions for social-recovery initialisation.
 */
contract SAWalletFactory {
    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice The shared SAWallet logic contract.  All proxies delegatecall here.
    SAWallet public immutable accountImplementation;

    // ─── Events ───────────────────────────────────────────────────────────────

    event AccountCreated(
        address indexed account,
        address indexed owner,
        uint256         salt
    );

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param entryPoint  The canonical ERC-4337 EntryPoint address.
     *                    On Sepolia: 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789
     */
    constructor(IEntryPoint entryPoint) {
        accountImplementation = new SAWallet(entryPoint);
    }

    // ─── Factory ──────────────────────────────────────────────────────────────

    /**
     * @notice Deploy (or return existing) wallet for the given parameters.
     *
     *         Idempotent: if the wallet already exists at the CREATE2 address
     *         the call succeeds and returns the existing instance.  This means
     *         the bundler can include the factory call in `initCode` without
     *         worrying about double-deployment reverts.
     *
     * @param  owner      Primary signing key for the new wallet.
     * @param  guardians  Initial guardian set (may be empty).
     * @param  threshold  Guardian approval threshold for social recovery.
     * @param  salt       Arbitrary salt; allows one owner to have multiple wallets.
     * @return ret        The (possibly newly deployed) SAWallet proxy.
     */
    function createAccount(
        address          owner,
        address[] calldata guardians,
        uint256          threshold,
        uint256          salt
    ) external returns (SAWallet ret) {
        address addr = getAddress(owner, guardians, threshold, salt);

        // Already deployed – return it without re-deploying.
        if (addr.code.length > 0) {
            return SAWallet(payable(addr));
        }

        bytes memory initData = abi.encodeCall(
            SAWallet.initialize,
            (owner, guardians, threshold)
        );

        ret = SAWallet(
            payable(
                new ERC1967Proxy{salt: bytes32(salt)}(
                    address(accountImplementation),
                    initData
                )
            )
        );

        emit AccountCreated(address(ret), owner, salt);
    }

    /**
     * @notice Compute the deterministic wallet address for the given parameters.
     *
     *         Off-chain use: call this view function (or replicate the CREATE2
     *         formula in JS using `getCreate2Address` from ethers.js) to display
     *         the wallet address before deployment.  Users can receive ZAR
     *         stablecoin transfers to this address immediately.
     *
     * @param  owner      Signing key.
     * @param  guardians  Initial guardian set.
     * @param  threshold  Guardian approval threshold.
     * @param  salt       Arbitrary salt.
     * @return            The pre-computed wallet address.
     */
    function getAddress(
        address          owner,
        address[] calldata guardians,
        uint256          threshold,
        uint256          salt
    ) public view returns (address) {
        bytes memory initData = abi.encodeCall(
            SAWallet.initialize,
            (owner, guardians, threshold)
        );

        bytes32 initCodeHash = keccak256(
            abi.encodePacked(
                type(ERC1967Proxy).creationCode,
                abi.encode(address(accountImplementation), initData)
            )
        );

        return Create2.computeAddress(bytes32(salt), initCodeHash);
    }

    /**
     * @notice Alias for getAddress to prevent naming collision with ethers.js v6 `contract.getAddress()`.
     */
    function getWalletAddress(
        address          owner,
        address[] calldata guardians,
        uint256          threshold,
        uint256          salt
    ) external view returns (address) {
        return getAddress(owner, guardians, threshold, salt);
    }
}

