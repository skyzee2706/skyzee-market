# Architecture Overview

SKY Market is composed of four independent layers that interact to form the full system.

---

## System Diagram

```
┌────────────────────────────────────────────────────────────┐
│                        User Browser                        │
│                                                            │
│  wagmi/viem ──▶ Sepolia RPC      (read contract state)     │
│  /api/price ──▶ 10 CEX median    (live dot, 2s interval)   │
│  /api/history ─▶ 10 CEX OHLCV   (1-min candles, since=)   │
│  Binance REST ─▶ Gap fill        (recent 30-60 candles)    │
│  Binance WS ───▶ Live candle     (real-time tick data)     │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│                 PM2 Bot (auto-market.ts)                   │
│                                                            │
│  factory.getAllMarkets()  ──▶ scan on-chain every 60s      │
│  /api/history (Vercel) ───▶ snapshot price at endTime      │
│  market.resolveWithCustomPrice(price) ──▶ settle on-chain  │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│                   Ethereum Sepolia                         │
│                                                            │
│  MarketFactory ──▶ tracks all PredictionMarket addresses   │
│  PredictionMarket ──▶ holds bets, distributes payouts      │
│  SkyUSDT ──▶ ERC-20 betting token with faucet              │
└────────────────────────────────────────────────────────────┘
```

---

## Layer Responsibilities

| Layer | Technology | Role |
|---|---|---|
| **Smart Contracts** | Solidity 0.8.20 | Store bets, enforce rules, distribute payouts |
| **Price Infrastructure** | CCXT + Binance | Provide real-time and historical BTC/USD prices |
| **Market Bot** | Node.js + PM2 | Create markets, resolve markets on schedule |
| **Frontend** | Next.js 14, wagmi, viem | UI for betting, chart, portfolio |

---

## Data Flow: Market Lifecycle

```
1. Bot detects no Hourly market exists for next hour
2. Bot fetches live price from /api/price (median 10 CEX)
3. Bot calls factory.createMarket(question, strikePrice, endTime, bettingEndTime)
   → PredictionMarket contract deployed on-chain
4. Users place bets via buyYes() / buyNo() with SkyUSDT
5. bettingEndTime passes → no more bets accepted
6. endTime passes → bot fetches snapshot price from /api/history
7. Bot calls market.resolveWithCustomPrice(price)
   → result computed on-chain: price >= strikePrice → YES wins
8. Winners call claim() → proportional payout distributed
```
