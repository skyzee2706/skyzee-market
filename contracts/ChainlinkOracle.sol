// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IPriceOracle.sol";

/// @dev Minimal Chainlink AggregatorV3 interface — only what we need.
interface AggregatorV3Interface {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

/// @title ChainlinkOracle
/// @notice IPriceOracle implementation using Chainlink price feeds on Sepolia.
/// @dev Feed address on Sepolia BTC/USD: 0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43
///      To upgrade to Rialo: deploy RialoOracle.sol implementing IPriceOracle,
///      then call MarketFactory.setOracle(newOracleAddress). No contract rewrite needed.
contract ChainlinkOracle is IPriceOracle {
    AggregatorV3Interface public immutable priceFeed;

    constructor(address _priceFeed) {
        require(_priceFeed != address(0), "ChainlinkOracle: zero address");
        priceFeed = AggregatorV3Interface(_priceFeed);
    }

    /// @inheritdoc IPriceOracle
    function getPrice() external view override returns (uint256) {
        (, int256 answer, , uint256 updatedAt, ) = priceFeed.latestRoundData();
        require(answer > 0, "ChainlinkOracle: invalid price");
        require(block.timestamp - updatedAt < 3600, "ChainlinkOracle: stale price");
        return uint256(answer); // 8 decimals (Chainlink standard)
    }
}
