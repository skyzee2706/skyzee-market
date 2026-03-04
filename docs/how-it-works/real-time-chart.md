# Real-Time Chart

The BTC/USD chart in SKY Market uses a **3-layer hybrid architecture** to display seamless, gap-free real-time price data.

---

## Layer 1: CCXT History (Server)

Fetched server-side via the `/api/history?since=<startTime>` endpoint.

- Source: **10 CEX exchanges** via CCXT (Binance, Bybit, MEXC, etc.)
- Data: 1-minute OHLCV closed candles
- Coverage: From market `startTime` to ~15-20 minutes ago
- Update interval: Every 60 seconds

This is the **most accurate** data — median-priced across multiple exchanges.

---

## Layer 2: Binance REST Gap Fill (Client)

Fetched directly from Binance API by the browser:

```
GET https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=N
```

- Coverage: Fills the recent gap that CCXT lags behind (last 20-30 min)
- Data: 1-minute candles from Binance specifically
- Update interval: Every 60 seconds
- Works immediately on first page load — no warming period needed

---

## Layer 3: Binance WebSocket (Client)

Real-time WebSocket connection to Binance:

```
wss://stream.binance.com:9443/ws/btcusdt@kline_1m
```

- Updates the **current open candle** in real-time (every tick)
- Closes when the market ends

---

## Live Price Dot

The white dot at the end of the line represents the **current live price** — the median from 10 CEXes via `/api/price`. Updated every **2 seconds**.

This is the source used by the bot for market resolution, ensuring what users see matches what is used to settle markets.

---

## Data Priority

Where layers overlap, Binance data takes priority over CCXT for recent timestamps:

```
allPoints = merge(CCXT history, Binance candles)
           + live dot from /api/price
```

---

## Strike Price Line

The horizontal dashed cyan line shows the market's **strike price** — the target price. The chart is centered symmetrically around this value.

Chart scale dynamically adjusts to always fit all data with 15% padding.
