# Oracle Interface

SKY Market uses a **swappable oracle interface** (`IPriceOracle`) that fully decouples payment settlement from any specific price feed provider.

---

## Interface

```solidity
interface IPriceOracle {
    function getPrice() external view returns (uint256);
}
```

Returns price with **8 decimal precision** (same format as Chainlink BTC/USD).

---

## Current Implementation: Custom Median Oracle

In production, the factory uses a **custom resolution mechanism** instead of a purely on-chain oracle:

- The bot (`auto-market.ts`) fetches the price off-chain from the Vercel `/api/history` endpoint
- The price is the **median of up to 10 CEX exchanges** (CCXT: Binance, Bybit, MEXC, etc.)
- The bot submits this price via `resolveWithCustomPrice(price)` directly to the market contract

This hybrid approach enables accurate settlement without paying Chainlink oracle fees on testnet.

---

## Chainlink Fallback (`ChainlinkOracle.sol`)

A `ChainlinkOracle` contract implementing `IPriceOracle` is also included:

```solidity
contract ChainlinkOracle is IPriceOracle {
    AggregatorV3Interface internal feed;

    constructor(address _feed) {
        feed = AggregatorV3Interface(_feed);
    }

    function getPrice() external view override returns (uint256) {
        (, int256 price,,,) = feed.latestRoundData();
        return uint256(price);
    }
}
```

Sepolia BTC/USD Chainlink feed: `0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43`

---

## Upgrade Path

To switch to a different oracle (e.g. Pyth, Redstone, custom):
1. Deploy a new contract implementing `IPriceOracle`
2. Call `factory.setOracle(newOracleAddress)` as owner
3. New markets will reference the new oracle; existing markets are unaffected
