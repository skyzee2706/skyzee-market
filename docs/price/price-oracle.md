# Price Oracle

The price infrastructure in SKY Market provides BTC/USD prices for two purposes:
1. **Strike price** at market creation
2. **Settlement price** at market resolution

---

## Source: 10-CEX Median

All prices are computed as the **statistical median** of prices fetched in parallel from up to 10 centralized exchanges via the CCXT library:

| Exchange | ID |
|---|---|
| Binance | `binance` |
| Bybit | `bybit` |
| MEXC | `mexc` |
| KuCoin | `kucoin` |
| Gate.io | `gate` |
| Bitget | `bitget` |
| HTX | `htx` |
| OKX | `okx` |
| Bitmart | `bitmart` |
| DigiFinex | `digifinex` |

Exchanges that fail or timeout (2.5s limit) are excluded from the median. The median requires at least 1 responding source.

---

## Why Median (Not Average)?

The median is statistically robust against outliers. If one exchange has a flash crash or spike, it does not affect the result:

```
Prices: [83,000, 83,100, 83,150, 83,200, 99,999]
Average: 85,290 ← affected by outlier
Median:  83,150 ← not affected
```

---

## `/api/price` Endpoint

Live price API deployed on Vercel:

```
GET /api/price
→ { price: 83412.50, sources: [...], timestamp: ... }
```

Headers:
```
Cache-Control: no-store
```

Used by:
- The chart live dot (every 2 seconds, client-side)
- The bot as a **fallback** if `/api/history` fails during market creation

---

## Price Precision

Prices are returned as floating-point USD (e.g. `83412.50`).

When stored on-chain, they are converted to **8-decimal integer** format (Chainlink compatible):
```ts
BigInt(Math.floor(price * 1e8))  // 83412.50 → 8341250000000n
```
