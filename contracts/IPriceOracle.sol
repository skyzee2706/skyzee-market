// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IPriceOracle
/// @notice Abstract price oracle interface.
/// @dev Implement this to plug in any price feed (Chainlink, Rialo, etc.)
///      PredictionMarket ONLY calls oracle.getPrice() — never the concrete impl directly.
interface IPriceOracle {
    /// @return price Latest asset price scaled to 8 decimals (same as Chainlink standard)
    function getPrice() external view returns (uint256 price);
}
