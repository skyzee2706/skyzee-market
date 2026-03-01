// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./PredictionMarket.sol";

/**
 * @title MarketFactory
 * @notice Deploys and tracks PredictionMarket instances.
 *         Holds references to the swappable oracle and SkyUSDT token.
 */
contract MarketFactory is Ownable {
    address public oracle;       // BTC/USD — settlement
    address public ethUsdOracle; // ETH/USD — fee calculation
    address public token;        // SkyUSDT

    address[] public markets;

    event MarketCreated(
        address indexed market,
        string  question,
        uint256 strikePrice,
        uint256 endTime
    );
    event OracleUpdated(address newOracle);
    event TokenUpdated(address newToken);

    constructor(address _oracle, address _ethUsdOracle, address _token, address initialOwner) Ownable(initialOwner) {
        oracle       = _oracle;
        ethUsdOracle = _ethUsdOracle;
        token        = _token;
    }

    // ── Market Creation ───────────────────────────────────────────────────

    function createMarket(
        string  memory question,
        uint256 strikePrice,
        uint256 endTime,
        uint256 bettingEndTime
    ) external onlyOwner returns (address) {
        PredictionMarket market = new PredictionMarket(
            token,
            oracle,
            ethUsdOracle,
            question,
            strikePrice,
            endTime,
            bettingEndTime,
            owner(),       // market owner = factory owner
            owner()        // fee wallet = factory owner
        );
        markets.push(address(market));
        emit MarketCreated(address(market), question, strikePrice, endTime);
        return address(market);
    }

    // ── Admin ─────────────────────────────────────────────────────────────

    function setOracle(address _oracle) external onlyOwner {
        oracle = _oracle;
        emit OracleUpdated(_oracle);
    }

    function setToken(address _token) external onlyOwner {
        token = _token;
        emit TokenUpdated(_token);
    }

    // ── Views ─────────────────────────────────────────────────────────────

    function getAllMarkets() external view returns (address[] memory) {
        return markets;
    }

    function marketCount() external view returns (uint256) {
        return markets.length;
    }
}
