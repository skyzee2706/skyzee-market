# Bot Overview

The market automation bot (`scripts/auto-market.ts`) is a Node.js process managed by PM2. It is the only entity that creates and resolves markets. No manual intervention is required during normal operation.

---

## Technology

| Component | Technology |
|---|---|
| Runtime | Node.js with `ts-node` |
| Process Manager | PM2 (`sky-market-scheduler`) |
| Blockchain Client | `ethers.js v6` |
| Price Source | Vercel `/api/history` + CCXT fallback |
| Chain | Ethereum Sepolia |

---

## Sweep Cycle

The bot runs a **sweep every 60 seconds**:

```
1. Acquire file lock (prevent concurrent sweeps)
2. Fetch factory.getAllMarkets() — last 500 addresses
3. For each market (parallel):
   a. Read endTime, resolved status, question from chain
   b. Classify as Hourly (H) or Daily (D)
   c. If unresolved and now >= endTime → RESOLVE
   d. If unresolved and now < endTime → record its endTime as active
4. For each market type (H, D):
   a. Calculate target endTime (next hour / next midnight UTC)
   b. If no active market exists for that endTime → CREATE
5. Release file lock
```

---

## Signer

The bot uses the **owner wallet** (`PRIVATE_KEY` from `.env`) to sign transactions. This wallet is set as the `owner` of `MarketFactory` and all child `PredictionMarket` contracts.

Only the owner wallet can:
- Call `factory.createMarket()`
- Call `market.resolveWithCustomPrice()`

---

## Price Parity Guarantee

The bot fetches settlement price from the **same Vercel-deployed API** (`/api/price`, `/api/history`) that the frontend uses. This ensures the price users see in the chart is identical to the price used for on-chain settlement.

---

## PM2 Configuration (`ecosystem.config.js`)

```js
{
  name: "sky-market-scheduler",
  script: "node",
  args: "-r ts-node/register scripts/auto-market.ts",
  cwd: "/path/to/sky-market",
  env_file: ".env",
  autorestart: true,
  restart_delay: 5000,
  max_restarts: 50
}
```

`autorestart: true` ensures the bot recovers automatically from any crash without manual intervention.
