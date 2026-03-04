# Market Creation Logic

New markets are created by the bot automatically when no active market exists for the upcoming target time window.

---

## Target Time Calculation

| Type | `endTime` | `bettingEndTime` |
|---|---|---|
| Hourly | Next full UTC hour (e.g. 15:00:00) | `endTime - 600s` (10 min before) |
| Daily | Next UTC midnight (00:00:00) | `endTime - 43200s` (12 h before) |

```ts
function nextHourUTC(): number {
    const d = new Date();
    d.setUTCHours(d.getUTCHours() + 1, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
}

function nextMidnightUTC(): number {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
}
```

---

## Strike Price

At the moment of creation, the bot fetches the live BTC/USD price from `/api/price` (Vercel). This median price becomes the `strikePrice` for the new market.

```ts
const p = await getLivePrice(); // Returns bigint with 8 decimal precision
```

---

## Market Question Format

```
Hourly: "Will BTC/USD be above $83,200 at 15:00 UTC?"
Daily:  "Will BTC/USD be above $83,200 by midnight 2026-03-06?"
```

---

## Transaction

```ts
const tx = await factory.createMarket(
    question,       // string
    strikePrice,    // uint256 (8 decimals)
    endTime,        // uint256 unix ts
    bettingEndTime  // uint256 unix ts
);
await tx.wait();
```

The factory emits `MarketCreated(address market, ...)` on success. The new market address is automatically tracked in `factory.markets[]`.
