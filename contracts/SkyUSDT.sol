// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SkyUSDT
 * @notice Test USDT token for Sky Market on Sepolia.
 *         Anyone can call faucet() to receive 1,000 USDT (once per 24h per recipient).
 *         Owner can mint any amount anytime.
 */
contract SkyUSDT is ERC20, Ownable {
    uint8  private constant DECIMALS        = 6;
    uint256 public constant FAUCET_AMOUNT   = 1_000 * 10 ** 6; // 1,000 USDT
    uint256 public constant FAUCET_COOLDOWN = 24 hours;

    // recipient => last claim timestamp
    mapping(address => uint256) public lastClaim;

    event FaucetClaimed(address indexed by, address indexed recipient, uint256 amount);

    constructor(address initialOwner) ERC20("Sky USD Tether", "USDT") Ownable(initialOwner) {
        // Mint 1,000,000 USDT to deployer
        _mint(initialOwner, 1_000_000 * 10 ** DECIMALS);
    }

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /**
     * @notice Claim 1,000 USDT to `recipient`.
     *         Each recipient can only receive once per 24 hours.
     *         Claimer pays their own gas fee.
     * @param recipient The address to receive the USDT (can be caller or any other address)
     */
    function faucet(address recipient) external {
        require(recipient != address(0), "Invalid recipient");
        require(
            block.timestamp >= lastClaim[recipient] + FAUCET_COOLDOWN,
            "Cooldown: wait 24h between claims"
        );
        lastClaim[recipient] = block.timestamp;
        _mint(recipient, FAUCET_AMOUNT);
        emit FaucetClaimed(msg.sender, recipient, FAUCET_AMOUNT);
    }

    /**
     * @notice Owner can mint any amount to any address.
     */
    function ownerMint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @notice Returns seconds remaining before `recipient` can claim again. 0 = can claim now.
     */
    function cooldownRemaining(address recipient) external view returns (uint256) {
        uint256 next = lastClaim[recipient] + FAUCET_COOLDOWN;
        if (block.timestamp >= next) return 0;
        return next - block.timestamp;
    }
}
