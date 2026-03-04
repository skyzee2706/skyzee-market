# Real-Time Chart Architecture

The BTC/USD price chart uses a **3-layer hybrid architecture** to display seamless, gap-free real-time data. Each layer covers a different time window.

---

## The Three Layers

```
00:00 UTC ─────────────────────────── now ───────▶
│                                                  │
│  Layer 1: CCXT + 10 CEX                          │
│  (server-side, median, 1-min candles)            │
│  Coverage: startTime → ~15 min ago               │
│                          │                       │
│                          │ Layer 2: Binance REST  │
│                          │  (gap fill, client)    │
│                          │  Coverage: ~15 min ago │
│                          │            → now       │
│                                        │          │
│                                        ● live dot │
│                                     (10 CEX, 2s) │
```

---

## Layer 1: CCXT Server History

- **Source:** `/api/history?since=<marketStartTime>` (Vercel API)
- **Data:** 1-minute closed candles, median of 10 exchanges
- **Coverage:** From market `startTime` to ~15-20 minutes before now
- **Refresh:** Every 60 seconds
- **Accuracy:** Highest — same source as settlement price

---

## Layer 2: Binance REST Gap Fill

- **Source:** `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=N` — called **directly from the browser**  
- **Data:** 1-minute candles from Binance specifically
- **Coverage:** Bridges the CCXT lag gap (last 15-30 min)
- **Refresh:** Every 60 seconds
- **Important:** Not median-priced — Binance only. Minor price difference from live dot is expected.

When both CCXT and Binance data cover the same timestamp, **Binance data takes priority** for recent candles (it is more current).

---

## Layer 3: Binance WebSocket Live Candle

- **Source:** `wss://stream.binance.com:9443/ws/btcusdt@kline_1m`
- **Data:** Real-time tick updates for the currently-open 1-minute candle
- **Latency:** ~50ms
- **Behavior:** Each tick updates the latest candle in `wsCandles` state in place (does not create new points, overwrites the current minute's entry)

---

## Live Dot (Separate from Chart Line)

The white dot at the chart edge represents the **10-CEX median live price** from `/api/price`, polled every 2 seconds. This is the true reference price — the same source used by the bot for settlement.

The live dot is **not** part of the CCXT or Binance data layers. It is always the most up-to-date median price and serves as the definitive "right edge" anchor of the chart.

---

## `allPoints` Construction

```ts
// 1. Merge CCXT and Binance candles by timestamp (Binance overwrites overlap)
const combined = new Map<number, number>();
history.forEach(p => combined.set(p.time, p.value));      // CCXT
wsCandles.forEach(p => combined.set(p.time, p.value));     // Binance (priority)

// 2. Filter to market window, sort
const merged = Array.from(combined.entries())
    .map(([time, value]) => ({ time, value }))
    .filter(p => p.time >= startTime && p.time <= now)
    .sort((a, b) => a.time - b.time);

// 3. Append live dot
merged.push({ time: now, value: livePrice });
```

---

## Chart Scale

The Y-axis is centered on `strikePrice` (the horizontal dashed line) and scaled to always contain all data points with **15% padding**:

```ts
const buffer = Math.max(maxDelta * 1.15, strikePrice * 0.01);
const minScale = strikePrice - buffer;
const maxScale = strikePrice + buffer;
```

The scale recomputes on every render, so it adjusts dynamically as BTC moves.
