# Market Resolution Logic

Market resolution is triggered by the bot when `block.timestamp >= endTime` for any unresolved market.

---

## Resolution Flow

```
1. endTime has passed for market X
2. Bot fetches settlement price:
   GET /api/history (Vercel)
   → find candle closest to endTime
3. Bot calls: market.resolveWithCustomPrice(price)
4. Contract computes: result = (price >= strikePrice)
5. Contract stores settlementPrice on-chain
6. CONTRACT emits Resolved(settlementPrice, result)
7. Winners can now call claim()
```

---

## Settlement Price Lookup

```ts
async function getHistoricalPrice(targetTs: number): Promise<bigint> {
    const res = await axios.get(`${VERCEL_URL}/api/history`);
    const history = res.data.history;

    let closest = history[0];
    let minDiff = Infinity;
    for (const h of history) {
        const diff = Math.abs(h.time - targetTs);
        if (diff < minDiff) { minDiff = diff; closest = h; }
    }

    return BigInt(Math.floor(closest.value * 1e8));
}
```

The bot searches the entire history array for the candle with the minimum time difference from `targetTs` (= `endTime`).

---

## On-Chain Resolution

```solidity
function resolveWithCustomPrice(uint256 price) external onlyOwner {
    require(!resolved, "Already resolved");
    require(block.timestamp >= endTime, "Market not ended");
    settlementPrice = price;
    result = price >= strikePrice;
    resolved = true;
    emit Resolved(price, result);
}
```

`onlyOwner` restricts calls to the deployer wallet (the bot).

---

## Fallback Price

If the Vercel `/api/history` endpoint fails (network error, timeout), the bot falls back to the **internal CCXT median** fetched directly from exchanges:

```ts
// Fallback: direct 10-CEX median via CCXT
const p = await getInternalLivePrice(); // median of 10 ccxt sources
```

This ensures markets are always resolved even if the Vercel deployment is temporarily unavailable.

---

## Post-Resolution

After resolution:
- `resolved = true` — no more bets or re-resolution possible
- `settlementPrice` is permanently readable on-chain
- `result = true` → YES pool wins; `result = false` → NO pool wins
- Users on the winning side call `claim()` to receive their proportional payout
