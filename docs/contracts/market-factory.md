# MarketFactory Contract

`MarketFactory` is the root contract of the protocol. It deploys new `PredictionMarket` contracts and maintains a registry of all markets ever created.

---

## Role

- **Deploys** new `PredictionMarket` instances via `createMarket()`
- **Registers** all market addresses in a dynamic array
- **Holds** collected ETH platform fees
- **Enforces** that only the owner can create markets

---

## Key Functions

### `createMarket(string question, uint256 strikePrice, uint256 endTime, uint256 bettingEndTime)`

Deploys a new `PredictionMarket` contract.

- `question`: Human-readable description (e.g. `"Will BTC/USD be above $83,000 at 15:00 UTC?"`)
- `strikePrice`: 8-decimal price, same format as Chainlink (e.g. `8300000000` = $83,000)
- `endTime`: Unix timestamp of market close
- `bettingEndTime`: Unix timestamp when betting closes (`endTime - buffer`)

The newly deployed market address is pushed to `markets[]` and emits `MarketCreated`.

### `getAllMarkets() → address[]`

Returns the full array of all deployed market addresses. The bot uses this to scan for markets to resolve.

### `withdrawFees()`

Transfers all accumulated ETH (collected from bet fees) to the owner. Only callable by owner.

---

## State

| Variable | Description |
|---|---|
| `markets` | `address[]` — all deployed PredictionMarket addresses |
| `oracle` | `IPriceOracle` — swappable price oracle interface |
| `token` | `IERC20` — SkyUSDT address passed to each new market |

---

## Oracle Upgrade Path

The oracle used by markets is decoupled via the `IPriceOracle` interface:

```solidity
interface IPriceOracle {
    function getPrice() external view returns (uint256);
}
```

To upgrade the oracle (e.g. move from Chainlink to a custom source), deploy a new implementation and call `setOracle(newAddress)`. Existing markets are unaffected — they do not use the oracle for resolution (they use `resolveWithCustomPrice`).

---

## Events

| Event | Emitted When |
|---|---|
| `MarketCreated(address market, string question, uint256 strikePrice, uint256 endTime)` | New market deployed |
