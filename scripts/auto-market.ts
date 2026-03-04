/**
 * auto-market.ts (Vercel-Sync Version)
 * ───────────────────────────────────────────────────────────────────────────
 * Rial Market — Auto-scheduler for hourly and daily BTC/USD prediction markets
 *
 * This version uses the Vercel-deployed API as the absolute source of truth
 * to ensure 100% price parity with the chart and UI.
 */

import * as dotenv from "dotenv";
dotenv.config();

import { ethers } from "ethers";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";

// ── Config ────────────────────────────────────────────────────────────────
const RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as string;
const VERCEL_URL = "https://sky-market-alpha.vercel.app";

if (!RPC_URL || !PRIVATE_KEY || !FACTORY_ADDRESS) {
    console.error("❌  Missing required env vars.");
    process.exit(1);
}

// ── ABIs ───────────────────────────────────────────────────────────
const FACTORY_ABI = [
    "function createMarket(string memory question, uint256 strikePrice, uint256 endTime, uint256 bettingEndTime) external returns (address)",
    "function getAllMarkets() external view returns (address[])"
];

const MARKET_ABI = [
    "function endTime() external view returns (uint256)",
    "function resolved() external view returns (bool)",
    "function resolveWithCustomPrice(uint256 price) external",
    "function question() external view returns (string)"
];

// ── Provider / Signer ─────────────────────────────────────────────────────
const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

// ── Internal 10-CEX Fallback Engine ─────────────────────────────────────────

async function getInternalLivePrice(): Promise<number> {
    try {
        const ccxt = require('ccxt');
        const exchangeIds = ['binance', 'bybit', 'mexc', 'kucoin', 'gate', 'bitget', 'htx', 'okx', 'bitmart', 'digifinex'];
        const results = await Promise.all(exchangeIds.map(async id => {
            try {
                const exchange = new ccxt[id]({ timeout: 2500 });
                const ticker = await exchange.fetchTicker('BTC/USDT');
                return ticker.last;
            } catch (e) { return null; }
        }));
        const prices = results.filter((p): p is number => p !== null && p > 15000);
        if (prices.length === 0) throw new Error("Internal sources failed");
        prices.sort((a, b) => a - b);
        const mid = Math.floor(prices.length / 2);
        return prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
    } catch (e: any) {
        throw new Error("Internal fallback failed: " + e.message);
    }
}

// ── Vercel-First Price Engine ─────────────────────────────────────────────

async function getLivePrice(): Promise<bigint> {
    try {
        console.log(`      📡 Fetching from Vercel: ${VERCEL_URL}/api/price ...`);
        const res = await axios.get(`${VERCEL_URL}/api/price`, { timeout: 10000 });
        let p = res.data?.price;
        if (typeof p === 'string') p = parseFloat(p);

        if (p && p > 15000) {
            console.log(`      ✅ Vercel Live Price: $${p}`);
            return BigInt(Math.floor(p * 1e8));
        }
        throw new Error("Invalid price from Vercel");
    } catch (err: any) {
        console.warn(`      ⚠️ Vercel fail (${err.message}). Using internal 10-CEX fallback...`);
        const p = await getInternalLivePrice();
        return BigInt(Math.floor(p * 1e8));
    }
}

async function getHistoricalPrice(targetTs: number): Promise<bigint> {
    try {
        const snapshotTs = targetTs; // Snapshot exactly at end time
        console.log(`      📡 Fetching Historical Snapshot (T-1s) from Vercel history ...`);
        const res = await axios.get(`${VERCEL_URL}/api/history`, { timeout: 15000 });
        const history = res.data?.history;

        if (history && Array.isArray(history) && history.length > 0) {
            const target = snapshotTs;
            let closest = history[0];
            let minDiff = Math.abs(history[0].time - target);

            for (const h of history) {
                const diff = Math.abs(h.time - target);
                if (diff < minDiff) {
                    minDiff = diff;
                    closest = h;
                }
            }

            console.log(`      🎯 Snapshot: Found closest match $${closest.value} (diff: ${minDiff}s)`);
            return BigInt(Math.floor(closest.value * 1e8));
        }
        throw new Error("Empty history from Vercel");
    } catch (err: any) {
        console.warn(`      ⚠️ Vercel Hist fail (${err.message}). Defaulting to current Vercel live price.`);
        return await getLivePrice();
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────

const formatHour = (ts: number) => `${new Date(ts * 1000).getUTCHours().toString().padStart(2, "00")}:00 UTC`;
const formatDate = (ts: number) => new Date(ts * 1000).toISOString().split("T")[0];

function nextHourUTC() {
    const d = new Date();
    d.setUTCHours(d.getUTCHours() + 1, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
}

function nextMidnightUTC() {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
}

// ── Lock System ──────────────────────────────────────────────────────────
const LOCK_FILE = path.join(__dirname, "auto-market.lock");

function clearStaleLock() {
    // Always clear lock on startup to avoid blocks after crashes
    try { if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE); } catch (e) { }
}

function acquireLock(): boolean {
    try {
        if (fs.existsSync(LOCK_FILE)) {
            const stats = fs.statSync(LOCK_FILE);
            if (Date.now() - stats.mtimeMs < 120000) return false; // Lock is fresh (2m)
            fs.unlinkSync(LOCK_FILE);
        }
        fs.writeFileSync(LOCK_FILE, process.pid.toString());
        return true;
    } catch (e) { return false; }
}

function releaseLock() {
    try { if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE); } catch (e) { }
}

// ── Main Controller ──────────────────────────────────────────────────────

async function resolveMarkets() {
    if (!acquireLock()) {
        console.log("⏳ Another sweep is already running, skipping...");
        return;
    }
    try {
        const balance = await provider.getBalance(signer.address);
        console.log(`\n🔍 [SWEEP] Balance: ${ethers.formatEther(balance)} ETH | ${new Date().toISOString()}`);

        const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);
        const all = await factory.getAllMarkets();

        // Scan last 500 markets (enough to cover many weeks of hourly + daily)
        const scanDepth = 500;
        const recent = all.slice(-scanDepth);
        const now = Math.floor(Date.now() / 1000);

        const activeEndTimes: Record<string, Set<number>> = { H: new Set(), D: new Set() };

        for (const addr of recent) {
            try {
                const m = new ethers.Contract(addr, MARKET_ABI, signer);
                const [endTime, resolved, question] = await Promise.all([m.endTime(), m.resolved(), m.question()]);

                const questionLower = question.toLowerCase();
                const isHourly = (questionLower.includes(" at ") && (questionLower.includes(":") || questionLower.includes("utc"))) || questionLower.includes("hour");
                const isDaily = questionLower.includes("midnight") || questionLower.includes("daily");
                const tsType = isHourly ? "H" : isDaily ? "D" : null;

                if (!resolved) {
                    if (now >= Number(endTime)) {
                        console.log(`   ⚡ RESOLVING: ${question}`);
                        try {
                            const price = await getHistoricalPrice(Number(endTime));
                            const tx = await m.resolveWithCustomPrice(price);
                            await tx.wait();
                            console.log(`      ✅ Resolved OK @ $${(Number(price) / 1e8).toFixed(2)}`);
                        } catch (err: any) {
                            console.error(`      ❌ Resolve Transact Fail:`, err.shortMessage || err.message);
                        }
                    } else if (tsType) {
                        activeEndTimes[tsType].add(Number(endTime));
                    }
                }
            } catch (e: any) {
                console.error(`   ❌ Error processing market ${addr}:`, e.shortMessage || e.message);
            }
        }

        console.log(`   📊 Active Markets: H:${activeEndTimes.H.size}, D:${activeEndTimes.D.size}`);

        // Market Re-creation — Hourly and Daily only
        const types = [
            { id: "H", label: "Hourly", getET: nextHourUTC, buffer: 600 },
            { id: "D", label: "Daily", getET: nextMidnightUTC, buffer: 43200 }
        ];

        for (const t of types) {
            const targetET = t.getET();
            const alreadyExists = activeEndTimes[t.id].has(targetET);

            if (!alreadyExists) {
                try {
                    console.log(`   🆕 [ACTION] Creating ${t.label} market for ${new Date(targetET * 1000).toISOString()}...`);
                    const p = await getLivePrice();

                    // ── Re-verify on-chain before TX to prevent race condition ──
                    const freshAll = await factory.getAllMarkets();
                    const freshRecent = freshAll.slice(-300); // Scan last 300 to be safe
                    let raceConflict = false;
                    for (const addr of freshRecent) {
                        try {
                            const m2 = new ethers.Contract(addr, MARKET_ABI, provider);
                            const [freshET, freshResolved] = await Promise.all([m2.endTime(), m2.resolved()]);
                            if (!freshResolved && Number(freshET) === targetET) {
                                raceConflict = true;
                                console.log(`   ⚠️ Race conflict detected for ${targetET}. Skipping.`);
                                break;
                            }
                        } catch { /* skip */ }
                    }
                    if (raceConflict) continue;

                    const et = targetET;
                    const formattedPrice = (Number(p) / 1e8).toLocaleString();
                    let q: string;
                    if (t.id === "H") q = `Will BTC/USD be above $${formattedPrice} at ${formatHour(et)}?`;
                    else q = `Will BTC/USD be above $${formattedPrice} by midnight ${formatDate(et)}?`;

                    console.log(`      🚀 Creating: ${q}`);
                    const tx = await factory.createMarket(q, p, et, et - t.buffer);
                    console.log(`      ⏳ TX Sent: ${tx.hash}`);
                    await tx.wait();
                    console.log(`      ✅ Created ${t.label} Successfully`);
                } catch (e: any) {
                    console.error(`      ❌ ${t.label} Create Fail:`, e.shortMessage || e.message);
                }
            }
        }

    } catch (err: any) { console.error("❌ Sweep failure:", err.shortMessage || err.message || err); }
    finally { releaseLock(); }
}

async function main() {
    console.log("🚀 Rial Market Bot Starting...");
    clearStaleLock(); // Clear any leftover lock from previous crash
    await resolveMarkets();
    // Use 60s interval to reduce overlap risk between sweeps
    setInterval(resolveMarkets, 60_000);
}

main().catch(console.error);
