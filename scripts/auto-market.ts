/**
 * auto-market.ts (Robust Edition)
 * ───────────────────────────────────────────────────────────────────────────
 * Rial Market — Auto-scheduler for hourly and daily BTC/USD prediction markets
 *
 * This version uses a multi-layered price engine:
 * 1. Tries local project APIs (localhost:3000) for 100% parity.
 * 2. Falls back to internal 10-CEX logic if local API is unreachable/invalid.
 */

import * as dotenv from "dotenv";
dotenv.config();

import { ethers } from "ethers";
import axios from "axios";

// ── Config ────────────────────────────────────────────────────────────────
const RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as string;
const BASE_URL = "http://localhost:3000";

const HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" };

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

// ── Internal 10-CEX Fallback Engine ───────────────────────────────────────

async function getInternalLivePrice(): Promise<number> {
    const timeout = 5000;
    const f = async (name: string, url: string) => {
        try {
            const res = await axios.get(url, { headers: HEADERS, timeout });
            const d = res.data;
            if (name === "Binance" || name === "MEXC") return Number(d.price);
            if (name === "Bybit") return Number(d.result.list[0].lastPrice);
            if (name === "KuCoin") return Number(d.data.price);
            if (name === "Gate") return Number(d[0].last);
            if (name === "Bitget") return Number(d.data[0].lastPr);
            if (name === "HTX") return Number(d.tick.data[0].price);
            if (name === "OKX") return Number(d.data[0].last);
            if (name === "Bitmart") return Number(d.data.last);
            if (name === "DigiFinex") return Number(d.ticker[0].last);
            return null;
        } catch (e: any) { return null; }
    };

    const results = await Promise.all([
        f("Binance", "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"),
        f("Bybit", "https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT"),
        f("MEXC", "https://api.mexc.com/api/v3/ticker/price?symbol=BTCUSDT"),
        f("KuCoin", "https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=BTC-USDT"),
        f("Gate", "https://api.gateio.ws/api/v4/spot/tickers?currency_pair=BTC_USDT"),
        f("Bitget", "https://api.bitget.com/api/v2/spot/market/tickers?symbol=BTCUSDT"),
        f("HTX", "https://api.huobi.pro/market/trade?symbol=btcusdt"),
        f("OKX", "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT"),
        f("Bitmart", "https://api-cloud.bitmart.com/spot/quotation/v3/ticker?symbol=BTC_USDT"),
        f("DigiFinex", "https://openapi.digifinex.com/v3/spot/ticker?symbol=BTC_USDT")
    ]);

    const prices = results.filter((p): p is number => p !== null && p > 15000);
    if (prices.length < 2) throw new Error("Internal sources failed");
    prices.sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    return prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
}

// ── Multi-Layer Price Fetcher ─────────────────────────────────────────────

async function getLivePrice(): Promise<bigint> {
    try {
        // Layer 1: Local API
        const res = await axios.get(`${BASE_URL}/api/price`, { timeout: 8000 });
        let p = res.data?.price;
        if (typeof p === 'string') p = parseFloat(p);

        if (p && p > 15000) {
            return BigInt(Math.floor(p * 1e8));
        }
        throw new Error("Invalid price from local API");
    } catch (err: any) {
        console.warn(`      ⚠️ Local API fail (${err.message}). Using internal fallback...`);
        const p = await getInternalLivePrice();
        return BigInt(Math.floor(p * 1e8));
    }
}

async function getHistoricalPrice(targetTs: number): Promise<bigint> {
    try {
        // Layer 1: Local History API
        const res = await axios.get(`${BASE_URL}/api/history`, { timeout: 10000 });
        const history = res.data?.history;

        if (history && Array.isArray(history) && history.length > 0) {
            const targetMin = Math.floor(targetTs / 60) * 60;
            const match = history.find((h: any) => h.time === targetMin);
            const val = match ? match.value : history[history.length - 1].value;
            console.log(`      🎯 Snapshot: ${match ? "Exact" : "Latest"} match $${val}`);
            return BigInt(Math.floor(val * 1e8));
        }
        throw new Error("Empty history");
    } catch (err: any) {
        console.warn(`      ⚠️ Local Hist fail (${err.message}). Using live proxy...`);
        return await getLivePrice();
    }
}

// ── Helper ────────────────────────────────────────────────────────────────

const formatHour = (ts: number) => `${new Date(ts * 1000).getUTCHours().toString().padStart(2, "0")}:00 UTC`;
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
function nextWeekUTC() {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 7);
    d.setUTCHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
}

// ── Main Sweep Logic ──────────────────────────────────────────────────────

async function resolveMarkets() {
    try {
        const balance = await provider.getBalance(signer.address);
        console.log(`\n🔍 [SWEEP] Balance: ${ethers.formatEther(balance)} ETH | ${new Date().toISOString()}`);

        const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
        const all = await factory.getAllMarkets();

        const scanDepth = 50;
        const recent = all.slice(-scanDepth);
        const now = Math.floor(Date.now() / 1000);

        let activeCount = { H: 0, D: 0, W: 0 };

        for (const addr of recent) {
            try {
                const m = new ethers.Contract(addr, MARKET_ABI, signer);
                const [endTime, resolved, question] = await Promise.all([m.endTime(), m.resolved(), m.question()]);
                const tsType = question.includes(" at ") ? "H" : question.includes(" midnight ") ? "D" : "W";

                if (!resolved && now >= Number(endTime)) {
                    console.log(`   ⚡ RESOLVING: ${question}`);
                    const price = await getHistoricalPrice(Number(endTime));
                    const tx = await m.resolveWithCustomPrice(price);
                    await tx.wait();
                    console.log(`      ✅ Resolved OK @ $${(Number(price) / 1e8).toFixed(2)}`);
                } else if (!resolved) {
                    activeCount[tsType]++;
                }
            } catch (e: any) {
                // Ignore small errors, report reverts
                if (e.message.includes("revert")) {
                    console.error(`   ❌ Revert on ${addr}:`, e.shortMessage || e.message);
                }
            }
        }

        console.log(`   📊 State: ${activeCount.H}H, ${activeCount.D}D, ${activeCount.W}W`);

        // Market Re-creation
        if (activeCount.H === 0) {
            try {
                const p = await getLivePrice();
                const et = nextHourUTC();
                const q = `Will BTC/USD be above $${(Number(p) / 1e8).toLocaleString()} at ${formatHour(et)}?`;
                console.log(`   🆕 Creating Hourly: ${q}`);
                const tx = await factory.createMarket(q, p, et, et - 600);
                await tx.wait();
                console.log(`      ✅ Created Hourly`);
            } catch (e: any) { console.error(`   ❌ Hourly Creation Fail:`, e.shortMessage || e.message); }
        }
        if (activeCount.D === 0) {
            try {
                const p = await getLivePrice();
                const et = nextMidnightUTC();
                const q = `Will BTC/USD be above $${(Number(p) / 1e8).toLocaleString()} by midnight ${formatDate(et)}?`;
                console.log(`   🆕 Creating Daily: ${q}`);
                const tx = await factory.createMarket(q, p, et, et - 43200);
                await tx.wait();
                console.log(`      ✅ Created Daily`);
            } catch (e: any) { console.error(`   ❌ Daily Creation Fail:`, e.shortMessage || e.message); }
        }
        if (activeCount.W === 0) {
            try {
                const p = await getLivePrice();
                const et = nextWeekUTC();
                const q = `Will BTC/USD be above $${(Number(p) / 1e8).toLocaleString()} by ${formatDate(et)}?`;
                console.log(`   🆕 Creating Weekly: ${q}`);
                const tx = await factory.createMarket(q, p, et, et - 259200);
                await tx.wait();
                console.log(`      ✅ Created Weekly`);
            } catch (e: any) { console.error(`   ❌ Weekly Creation Fail:`, e.shortMessage || e.message); }
        }

    } catch (err: any) { console.error("❌ Sweep failure:", err.shortMessage || err.message || err); }
}

async function main() {
    console.log("🚀 Rial Market Multi-Layer Bot Starting...");
    await resolveMarkets();
    setInterval(resolveMarkets, 30_000);
}

main().catch(console.error);
