# Betting Mechanics

## How Bets Work

Users bet **SkyUSDT** on one of two outcomes for each market:

- **YES** — BTC/USD will be **≥ strikePrice** at `endTime`
- **NO** — BTC/USD will be **< strikePrice** at `endTime`

Each bet adds to the respective liquidity pool (`yesPool` or `noPool`).

---

## Approval Flow

Because `PredictionMarket` pulls USDT via `transferFrom`, users must first approve the contract:

```
1. User calls SkyUSDT.approve(marketAddress, amount)
2. User calls market.buyYes(amount) or market.buyNo(amount)
3. Contract pulls amount from user via transferFrom
4. Amount is added to yesPool / noPool
```

The frontend handles this automatically — it checks the current allowance and shows an **Approve** button if needed before showing **Buy**.

---

## ETH Fee

Each bet requires an ETH fee of **1% of the bet amount**, calculated at the current ETH/USD price:

```solidity
function calcEthFee(uint256 usdtAmount) public view returns (uint256 ethRequired) {
    uint256 ethPrice = oracle.getPrice(); // 8-decimal ETH/USD
    uint256 feeUsd = (usdtAmount * FEE_BPS) / 10000; // 1% in USDT
    return (feeUsd * 1e8 * 1e12) / ethPrice; // Convert to ETH wei
}
```

The fee is sent as `msg.value` with the `buyYes` / `buyNo` transaction and accumulates in `MarketFactory`.

---

## Betting Window

| Time | State |
|---|---|
| `now ≤ bettingEndTime` | Betting OPEN |
| `bettingEndTime < now ≤ endTime` | Betting CLOSED, market running |
| `now > endTime` | Pending resolution |
| After `resolveWithCustomPrice()` | Settled |

The `bettingEndTime` buffer prevents last-second price manipulation by ensuring the final price is unknown when bets close.

---

## Implied Probability

The contract computes a live **implied win probability** for YES:

```solidity
yesPrice = (yesPool * 1e18) / (yesPool + noPool);
```

Displayed in the UI as `yesPrice / 1e16` percent. This reflects the collective market belief about the outcome, updated in real-time as bets come in.
