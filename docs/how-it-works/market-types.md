# Market Types

SKY Market currently runs two types of automated markets:

---

## ⏰ Hourly Markets

| Field | Value |
|---|---|
| Duration | 1 hour |
| End Time | Next full hour UTC (e.g., 14:00, 15:00) |
| Betting Closes | 10 minutes before end |
| Strike Price | Live BTC/USD median at time of creation |

**Example:** Market created at 13:45 UTC → Strike = $83,500 → End = 14:00 UTC → Betting closes 13:50 UTC

---

## 📅 Daily Markets

| Field | Value |
|---|---|
| Duration | 24 hours |
| End Time | Next midnight UTC |
| Betting Closes | 12 hours before midnight |
| Strike Price | Live BTC/USD median at time of creation |

**Example:** Market created at 10:00 UTC → Strike = $83,200 → End = 00:00 UTC next day → Betting closes 12:00 UTC

---

## How Markets are Named

Market questions follow the pattern:

```
Will BTC/USD be above $83,200 at 15:00 UTC?
Will BTC/USD be above $83,200 by midnight 2026-03-05?
```

---

## Market States

| State | Description |
|---|---|
| 🟢 **Live** | Betting is open |
| ⏸ **Bet Closed** | Betting closed, waiting for end time |
| ⌛ **Pending Resolution** | End time passed, bot is resolving |
| ✅ **YES Won** | Price was ≥ strike at end time |
| ❌ **NO Won** | Price was < strike at end time |
