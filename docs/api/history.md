# /api/history

Returns historical BTC/USD OHLCV data as 1-minute median-priced candles from up to 10 CEXes.

## Endpoint

```
GET /api/history?since=<unix_timestamp>
```

## Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `since` | `number` | No | Unix timestamp (seconds) to start from. Clamped to Sunday midnight. |

## Response

```json
{
  "history": [
    { "time": 1741046400, "value": 83200.5 },
    { "time": 1741046460, "value": 83215.2 },
    ...
  ],
  "source": "ccxt_optimized_1m",
  "sources_count": 8,
  "timestamp": 1741132800
}
```

| Field | Type | Description |
|---|---|---|
| `history` | `array` | Sorted array of `{ time, value }` points |
| `time` | `number` | Unix timestamp (seconds) of candle open |
| `value` | `number` | Median close price across responding exchanges |
| `sources_count` | `number` | Number of exchanges that returned data |

## How it Works

1. Calculates `limit` = minutes from `since` to now (+120 buffer, max 2000)
2. Calls `fetchOHLCV('BTC/USDT', '1m', since, limit)` on all 10 exchanges in parallel
3. Groups all candles by minute timestamp
4. Returns the **median price** for each minute (drops outliers)

## Usage

The chart fetches history on load with `?since=<marketStartTime - 600>` to cover the full market window. Polled every 60 seconds.

The bot also uses this endpoint to look up the settlement price at market `endTime`.

## Headers

```
Cache-Control: no-store
Access-Control-Allow-Origin: *
```
