# SKY Market

**SKY Market** is a decentralized BTC/USD prediction market protocol running on Ethereum Sepolia testnet. It is fully on-chain and automated — no centralized backend, no manual resolution, no admin custody of user funds.

---

## What It Does

Users bet on whether **BTC/USD will close above or below a predetermined strike price** at a specific future timestamp. The protocol handles everything else: market creation, price settlement, and payout distribution.

---

## Core Properties

| Property | Value |
|---|---|
| **Network** | Ethereum Sepolia Testnet |
| **Settlement Asset** | SkyUSDT (ERC-20) |
| **Price Source** | Median of 10 CEX exchanges (CCXT) |
| **Market Types** | Hourly, Daily |
| **Resolution** | Automated bot (`auto-market.ts`) via `resolveWithCustomPrice()` |
| **Payout Model** | Proportional — no fee on winnings |
| **Platform Fee** | 1% of bet amount, paid upfront in ETH |

---

## Who Controls It

- **Contracts** are deployed by the owner wallet
- **Resolution** is performed by the same owner wallet via the bot
- **User funds** are locked in the `PredictionMarket` contract per market — owner cannot withdraw user funds
- **Platform fees** (ETH) are collected in `MarketFactory` and withdrawn by the owner

---

> 👉 Continue to [Architecture Overview](architecture.md)
