# Fee Structure

## Platform Fee (ETH)

A **1% fee in ETH** is charged per bet, paid upfront at time of betting:

| Parameter | Value |
|---|---|
| Fee rate | 1% of bet amount (`FEE_BPS = 100`) |
| Currency | ETH (native) |
| Timing | Paid with `buyYes()` / `buyNo()` transaction |
| Destination | Accumulated in `MarketFactory` |
| Withdrawal | Owner calls `factory.withdrawFees()` |

The fee is calculated in ETH equivalent of 1% of the USDT bet amount, using the on-chain oracle's ETH/USD price via `calcEthFee()`.

---

## No Fee on Winnings

Winners receive **100% of their proportional payout** from the total pool. There is no fee deducted from winnings. The platform earns only from the upfront ETH fee.

---

## Fee Accumulation

ETH fees accumulate in `MarketFactory.balance` (the contract's ETH balance). They are not automatically distributed.

The owner can call `factory.withdrawFees()` at any time to sweep all accumulated ETH to the owner wallet.

---

## Gas Costs

Users also pay standard Sepolia gas for each transaction:
- `approve()` — ~45,000 gas
- `buyYes()` / `buyNo()` — ~80,000 gas
- `claim()` — ~60,000 gas

On testnet, gas costs are negligible (Sepolia ETH is free).
