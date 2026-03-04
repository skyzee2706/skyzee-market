# PredictionMarket Contract

Each prediction market is a separate smart contract deployed by `MarketFactory`. It holds user funds and enforces all market rules on-chain.

---

## State Variables

| Variable | Type | Description |
|---|---|---|
| `token` | `IERC20` | SkyUSDT — the betting asset |
| `strikePrice` | `uint256` | Target price (8 decimal, e.g. `8300000000` = $83,000) |
| `endTime` | `uint256` | Unix timestamp when the market resolves |
| `bettingEndTime` | `uint256` | Betting closes at this timestamp |
| `yesPool` | `uint256` | Total USDT bet on YES |
| `noPool` | `uint256` | Total USDT bet on NO |
| `yesPrice` | `uint256` | Current YES probability (1e18 scale) |
| `resolved` | `bool` | True after `resolve()` or `resolveWithCustomPrice()` |
| `result` | `bool` | True = YES won, False = NO won |
| `settlementPrice` | `uint256` | The actual price used for settlement, stored permanently |

---

## Key Functions

### `buyYes(uint256 amount)`
Places a YES bet. Requires:
1. `block.timestamp <= bettingEndTime`
2. Market not resolved
3. `amount` of SkyUSDT pre-approved and transferred from caller
4. ETH fee (1% of amount) sent with transaction

### `buyNo(uint256 amount)`
Same as `buyYes` but for NO side.

### `resolveWithCustomPrice(uint256 price)`
Called exclusively by the **owner** (the bot wallet). Settles the market:
- Compares `price` to `strikePrice`
- Sets `result = price >= strikePrice`
- Stores `settlementPrice` on-chain
- Emits `Resolved(settlementPrice, result)`

Requires `block.timestamp >= endTime`.

### `claim()`
Called by a winner after resolution. Calculates and transfers their proportional payout from the total pool.

### `calcEthFee(uint256 amount)`
View function. Returns the ETH fee (1% of `amount` denominated in ETH at current price) required for a bet. Used by the frontend to show the exact ETH cost before confirmation.

---

## Price Probability (`yesPrice`)

`yesPrice` represents the implied probability of YES winning:

```
yesPrice = (yesPool × 1e18) / (yesPool + noPool)
```

Displayed in the UI as a percentage: `yesPrice / 1e16`.

---

## Events

| Event | Emitted When |
|---|---|
| `BetPlaced(address user, bool isYes, uint256 amount)` | User places a bet |
| `Resolved(uint256 price, bool result)` | Market is settled |
| `Claimed(address user, uint256 payout)` | Winner claims payout |
