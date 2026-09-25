// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockZAR
 * @notice Mock South African Rand (ZAR) ERC-20 token for testnet and hackathon environments.
 *
 *         Standard 18 decimals, matching the production ZARP token.
 *         Includes a public faucet allowing users to request test ZAR directly
 *         for testing gasless transfers and USSD banking flows.
 */
contract MockZAR is ERC20, Ownable {
    /// @notice Maximum amount claimable in a single faucet call (5,000 ZAR).
    uint256 public constant FAUCET_LIMIT = 5000 * 10**18;

    event FaucetClaimed(address indexed recipient, uint256 amount);

    constructor() ERC20("Mock South African Rand", "ZAR") {
        // Mint 1,000,000 ZAR initial liquidity to deployer
        _mint(msg.sender, 1_000_000 * 10**18);
    }

    /**
     * @notice Allows anyone to claim test ZAR up to FAUCET_LIMIT for testing and demos.
     * @param to Recipient address.
     * @param amount Amount in token units (1 ZAR = 10^18 wei).
     */
    function faucet(address to, uint256 amount) external {
        require(to != address(0), "MockZAR: zero address");
        require(amount <= FAUCET_LIMIT, "MockZAR: exceeds faucet limit");
        _mint(to, amount);
        emit FaucetClaimed(to, amount);
    }

    /**
     * @notice Administrative mint function for testing.
     * @param to Recipient address.
     * @param amount Amount in token units.
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
