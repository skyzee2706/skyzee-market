# Betting & Payouts

## Placing a Bet

1. Connect your wallet (MetaMask or any WalletConnect wallet)
2. If you have no SkyUSDT, claim from the faucet
3. Choose **YES** (price will be above strike) or **NO** (price will be below)
4. Enter amount and click **Approve** → then **Buy**
5. Pay a small ETH fee (1% of bet, calculated on-chain)

---

## Payout Formula

Winnings are calculated proportionally from the losing pool:

```
Payout = (your_bet / winning_pool) × total_pool
```

**Example:**
- YES pool: 1,000 USDT (you bet 100)
- NO pool: 500 USDT
- Total: 1,500 USDT
- Your payout if YES wins = (100 / 1,000) × 1,500 = **150 USDT**

---

## Fee Structure

| Action | Fee |
|---|---|
| Place Bet | **1% of bet amount** paid in ETH, upfront |
| Claim Winnings | **Free** — 100% of your proportional payout |

The ETH fee is calculated dynamically on-chain via `calcEthFee()` and displayed in the UI before confirmation.

---

## Claiming Winnings

After a market resolves:
1. Open the market page
2. If you bet on the winning side, a **Claim Winnings** button appears
3. Click to receive your payout (gas required)

Losers' funds remain in the contract and are distributed to winners.

---

## Estimated Payout Preview

Before placing a bet, the UI shows an estimated payout based on the current pool sizes. This updates in real-time as other users bet.
