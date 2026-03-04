# Historical Data (OHLCV)

The `/api/history` endpoint provides 1-minute OHLCV candles for BTC/USDT, also aggregated as a median across the same 10 CEX exchanges used for live pricing.

---

## Endpoint

```
GET /api/history?since=<unix_timestamp_seconds>
```

**Query Parameters:**

| Parameter | Description |
|---|---|
| `since` | Market start timestamp. Clamped to Sunday 00:00 UTC. |

**Response:**

```json
{
  "history": [
    { "time": 1741046400, "value": 83200.5 },
    { "time": 1741046460, "value": 83215.2 }
  ],
  "sources_count": 8
}
```

---

## How It Works

1. Calculates `limit = (now - since) / 60 + 120` (minutes to cover, +buffer, capped at 2000)
2. Calls `exchange.fetchOHLCV('BTC/USDT', '1m', since * 1000, limit)` on all 10 exchanges in parallel
3. Groups all candles **by minute timestamp**
4. For each minute: computes the **median close price** across all responding exchanges
5. Returns sorted array of `{ time, value }` points

---

## CCXT Lag Limitation

CCXT's OHLCV endpoint returns only **closed candles**. The currently-running minute candle is not available until it closes. This causes a natural lag of **1-15 minutes** at the "now" end of the dataset.

This gap is bridged on the client side by the Binance REST + WebSocket layers (see [Chart Architecture](chart-architecture.md)).

---

## Usage by the Bot (Settlement)

When resolving a market, the bot calls `/api/history` and finds the candle **closest to `endTime`**:

```ts
let closest = history[0];
let minDiff = Infinity;
for (const h of history) {
    const diff = Math.abs(h.time - targetTs);
    if (diff < minDiff) { minDiff = diff; closest = h; }
}
```

This ensures the settlement price is the actual median market price at the exact moment of resolution.
