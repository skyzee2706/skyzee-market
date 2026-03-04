# /api/price

Returns the current live BTC/USD price as the median of up to 10 CEX exchanges.

## Endpoint

```
GET /api/price
```

## Response

```json
{
  "price": 83412.50,
  "sources": ["binance", "bybit", "mexc", "kucoin", "gate"],
  "timestamp": 1741132800
}
```

| Field | Type | Description |
|---|---|---|
| `price` | `number` | Median BTC/USD price in USD |
| `sources` | `string[]` | Exchanges that responded successfully |
| `timestamp` | `number` | Unix timestamp of the response |

## How it Works

1. Makes parallel requests to 10 exchanges via CCXT
2. Collects all successful prices (with 2.5s timeout per exchange)
3. Returns the **median** price (removes outliers automatically)

## Headers

```
Cache-Control: no-store
Access-Control-Allow-Origin: *
```

## Usage

This endpoint is polled by the chart every **2 seconds** for the live dot, and used by the bot as a fallback for market creation price.
