# Price Resolution

## How Markets are Settled

When a market's `endTime` is reached, the bot fetches the **BTC/USD price at exactly that timestamp** and calls `resolveWithCustomPrice(price)` on-chain.

---

## Price Source Architecture

```
Bot (auto-market.ts)
    │
    ├── Primary: GET https://sky-market-alpha.vercel.app/api/history
    │   └── Finds candle closest to endTime
    │       └── Returns median close price across 10 CEXes
    │
    └── Fallback: Internal CCXT median (10 exchanges direct)
```

The Vercel API is the **source of truth** — same data source as the live chart dot visible to users. This guarantees 100% price parity between what users see and what is used for settlement.

---

## 10-CEX Median

The price is calculated as the **median** of prices from up to 10 exchanges:

- Binance, Bybit, MEXC, KuCoin, Gate, Bitget, HTX, OKX, Bitmart, DigiFinex

Using median (not average) makes the price resistant to manipulation by any single exchange.

---

## On-Chain Verification

The settlement price is stored permanently on-chain in `settlementPrice` (8 decimal precision):

```solidity
function resolveWithCustomPrice(uint256 price) external onlyOwner {
    require(!resolved, "Already resolved");
    require(block.timestamp >= endTime, "Not yet");
    _settle(price);
}
```

Visible on Sepolia Etherscan after resolution.

---

## Snapshot Timing

The bot takes the snapshot price **at exactly `endTime`** — the closest available price point to the market's end timestamp.
