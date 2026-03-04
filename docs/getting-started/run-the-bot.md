# Run the Market Bot

The `auto-market.ts` bot is the heart of SKY Market's automation. It runs continuously and:

1. **Resolves** expired markets with the accurate median BTC/USD price
2. **Creates** new Hourly and Daily markets before the current ones end

---

## Start via PM2 (Recommended)

```bash
# From the root directory
pm2 start ecosystem.config.js
```

Check status:
```bash
pm2 list
pm2 logs sky-market-scheduler
```

Stop:
```bash
pm2 stop sky-market-scheduler
```

---

## How the Bot Works

The bot runs a **sweep every 60 seconds**:

```
1. Fetch all markets from factory.getAllMarkets() (last 500)
2. For each unresolved market where now >= endTime:
   → Fetch snapshot price from /api/history at endTime
   → Call resolveWithCustomPrice(price) on-chain
3. Check if Hourly market for next hour exists
   → If not: create it
4. Check if Daily market for next midnight exists  
   → If not: create it
```

---

## Price Source for Resolution

The bot fetches the settlement price from the **Vercel-deployed `/api/history`** endpoint. This ensures 100% price parity with the live chart dot visible to users.

Fallback: internal 10-CEX median via CCXT.

---

## File-Based Lock

To prevent duplicate sweeps from overlapping, the bot uses a **file lock** (`auto-market.lock`). If a crash leaves a stale lock, it is automatically cleared on the next startup.

---

## Market Types

| Type | End Time | Betting Closes |
|---|---|---|
| Hourly | Next full hour UTC | 10 minutes before end |
| Daily | Next midnight UTC | 12 hours before end |

---

Next → [Deploy to Vercel](deploy-to-vercel.md)
