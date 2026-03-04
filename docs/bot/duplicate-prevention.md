# Duplicate Market Prevention

Creating duplicate markets (two markets with the same `endTime` and type) would fragment liquidity and confuse users. The bot uses multiple layers of protection to prevent this.

---

## Layer 1: In-Memory Active EndTime Tracking

During each sweep, the bot collects all **active** (unresolved, not yet ended) market endTimes per type:

```ts
const activeEndTimes: Record<string, Set<number>> = { H: new Set(), D: new Set() };

// For each unresolved active market:
if (!resolved && now < endTime) {
    activeEndTimes[tsType].add(Number(endTime));
}
```

Before creating a new market, it checks:
```ts
const alreadyExists = activeEndTimes[t.id].has(targetET);
if (alreadyExists) continue; // Skip creation
```

This prevents duplicates within the same sweep.

---

## Layer 2: On-Chain Re-Verification (Race Condition Guard)

Between the initial scan and the transaction, another process could have created a market. The bot does a **fresh on-chain scan** right before sending the `createMarket` tx:

```ts
const freshAll = await factory.getAllMarkets();
const freshRecent = freshAll.slice(-300); // Last 300 markets
for (const addr of freshRecent) {
    const [freshET, freshResolved] = await Promise.all([...]);
    if (!freshResolved && Number(freshET) === targetET) {
        raceConflict = true; break; // Abort creation
    }
}
if (raceConflict) continue;
```

---

## Layer 3: File-Based Process Lock

Only one sweep can run at a time. A file lock (`auto-market.lock`) is acquired at the start and released at the end:

```ts
function acquireLock(): boolean {
    if (fs.existsSync(LOCK_FILE)) {
        const stats = fs.statSync(LOCK_FILE);
        if (Date.now() - stats.mtimeMs < 120000) return false; // Lock still fresh
        fs.unlinkSync(LOCK_FILE); // Stale lock — remove
    }
    fs.writeFileSync(LOCK_FILE, process.pid.toString());
    return true;
}
```

The lock TTL is **2 minutes**. If the process crashes while holding the lock, the next sweep can acquire it after 2 minutes.

The lock file is also **cleared on bot startup** to prevent indefinite blocking after a crash.

---

## Scan Depth

The bot scans the **last 500 markets** from `factory.getAllMarkets()` for the in-memory check, and the **last 300** for the on-chain re-verification. This assumes no more than 500 total markets will be created within a typical operating window.
