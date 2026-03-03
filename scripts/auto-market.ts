/**
 * auto-market.ts
 * ───────────────────────────────────────────────────────────────────────────
 * Rial Market — Auto-scheduler for hourly and daily BTC/USD prediction markets
 *
 * This version uses a unified 10-CEX median engine for both Live Prices and
 * Historical Snapshots (for accurate market settlement).
 */

import * as dotenv from "dotenv";
dotenv.config();

import { ethers } from "ethers";
import axios from "axios";

// ── Config ────────────────────────────────────────────────────────────────
const RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as string;

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

// ── Unified 10-CEX Price Engine ──────────────────────────────────────────

async function getLivePrice(retries = 3): Promise<bigint> {
    const timeout = 2500;
    for (let i = 0; i < retries; i++) {
        try {
            const prices: number[] = [];
            const fetch = async (url: string) => axios.get(url, { timeout });

            const results = await Promise.allSettled([
                fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT").then(r => Number(r.data.price)),
                fetch("https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT").then(r => Number(r.data.result.list[0].lastPrice)),
                fetch("https://api.mexc.com/api/v3/ticker/price?symbol=BTCUSDT").then(r => Number(r.data.price)),
                fetch("https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=BTC-USDT").then(r => Number(r.data.data.price)),
                fetch("https://api.gateio.ws/api/v4/spot/tickers?currency_pair=BTC_USDT").then(r => Number(r.data[0].last)),
                fetch("https://api.bitget.com/api/v2/spot/market/tickers?symbol=BTCUSDT").then(r => Number(r.data.data[0].lastPr)),
                fetch("https://api.huobi.pro/market/trade?symbol=btcusdt").then(r => Number(r.data.tick.data[0].price)),
                fetch("https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT").then(r => Number(r.data.data[0].last)),
                fetch("https://api-cloud.bitmart.com/spot/quotation/v3/ticker?symbol=BTC_USDT").then(r => Number(r.data.data.last)),
                fetch("https://openapi.digifinex.com/v3/spot/ticker?symbol=BTC_USDT").then(r => Number(r.data.ticker[0].last))
            ]);

            results.forEach(res => {
                if (res.status === 'fulfilled' && res.value && res.value > 10000) prices.push(res.value);
            });

            if (prices.length < 3) throw new Error("Not enough sources.");
            prices.sort((a, b) => a - b);
            const mid = Math.floor(prices.length / 2);
            const medianPrice = prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;

            return BigInt(Math.floor(medianPrice * 1e8));
        } catch (err) {
            if (i === retries - 1) throw err;
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    return 0n;
}

/** 
 * Fetches the median price at a specific historical timestamp (UTC seconds).
 * Uses 1-minute klines from multiple sources to find the exact candle.
 */
async function getHistoricalPrice(targetTs: number): Promise<bigint> {
    const timeout = 4000;
    // Round to the minute start
    const minuteStart = Math.floor(targetTs / 60) * 60;
    console.log(`      📡 Fetching snapshot for ${new Date(targetTs * 1000).toUTCString()} (Minute: ${minuteStart})`);

    const fetchers = [
        // 1. Binance
        async () => {
            const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&startTime=${minuteStart * 1000}&limit=1`, { timeout });
            return parseFloat(res.data[0][4]);
        },
        // 2. MEXC
        async () => {
            const res = await axios.get(`https://api.mexc.com/api/v3/klines?symbol=BTCUSDT&interval=1m&startTime=${minuteStart * 1000}&limit=1`, { timeout });
            return parseFloat(res.data[0][4]);
        },
        // 3. Bybit
        async () => {
            const res = await axios.get(`https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=1&startTime=${minuteStart * 1000}&limit=1`, { timeout });
            return parseFloat(res.data.result.list[0][4]);
        },
        // 4. KuCoin
        async () => {
            // KuCoin uses startAt/endAt seconds
            const res = await axios.get(`https://api.kucoin.com/api/v1/market/candles?symbol=BTC-USDT&type=1min&startAt=${minuteStart}&endAt=${minuteStart + 65}`, { timeout });
            return parseFloat(res.data.data[0][2]);
        },
        // 5. Gate.io
        async () => {
            const res = await axios.get(`https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=BTC_USDT&interval=1m&from=${minuteStart}`, { timeout });
            return parseFloat(res.data[0][2]);
        },
        // 6. Bitget
        async () => {
            const res = await axios.get(`https://api.bitget.com/api/v2/spot/market/history-candles?symbol=BTCUSDT&granularity=1min&startTime=${minuteStart * 1000}&limit=1`, { timeout });
            return parseFloat(res.data[0][4]);
        }
    ];

    const results = await Promise.allSettled(fetchers.map(f => f()));
    const prices: number[] = [];

    results.forEach(res => {
        if (res.status === 'fulfilled' && res.value && res.value > 10000) prices.push(res.value);
    });

    if (prices.length === 0) {
        console.warn("      ⚠️ Historical CEX fail, falling back to live as proxy...");
        return await getLivePrice();
    }

    prices.sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    const medianPrice = prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;

    return BigInt(Math.floor(medianPrice * 1e8));
}

// ── Market Actions ────────────────────────────────────────────────────────

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

async function resolveMarkets() {
    try {
        console.log(`\n🔍 [SWEEP] Scaling 10 CEX sources...`);
        const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
        const all = await factory.getAllMarkets();
        const recent = all.slice(-40); // scan last 40 markets
        const now = Math.floor(Date.now() / 1000);

        let activeCount = { H: 0, D: 0, W: 0 };
        let resolvedInThisSweep = false;

        for (const addr of recent) {
            const m = new ethers.Contract(addr, MARKET_ABI, signer);
            const [endTime, resolved, question] = await Promise.all([m.endTime(), m.resolved(), m.question()]);

            const tsType = question.includes(" at ") ? "H" : question.includes(" midnight ") ? "D" : "W";

            if (!resolved && now >= Number(endTime)) {
                console.log(`   ⚡ Settling: ${question}`);
                try {
                    // USE HISTORICAL SNAPSHOT
                    const price = await getHistoricalPrice(Number(endTime));
                    const tx = await m.resolveWithCustomPrice(price);
                    await tx.wait();
                    console.log(`      ✅ Settled @ $${(Number(price) / 1e8).toFixed(2)} [Snapshot]`);
                    resolvedInThisSweep = true;
                } catch (e: any) { console.error(`      ❌ Settle Error:`, e.message); }
            } else if (!resolved) {
                activeCount[tsType]++;
            }
        }

        console.log(`   📊 Active: ${activeCount.H}H, ${activeCount.D}D, ${activeCount.W}W`);

        // Market Re-creation if resolved or missing
        if (activeCount.H === 0) {
            const p = await getLivePrice();
            const et = nextHourUTC();
            const q = `Will BTC/USD be above $${(Number(p) / 1e8).toLocaleString()} at ${formatHour(et)}?`;
            console.log(`   🆕 Creating Hourly...`);
            await factory.createMarket(q, p, et, et - 900).then((t: any) => t.wait());
        }
        if (activeCount.D === 0) {
            const p = await getLivePrice();
            const et = nextMidnightUTC();
            const q = `Will BTC/USD be above $${(Number(p) / 1e8).toLocaleString()} by midnight ${formatDate(et)}?`;
            console.log(`   🆕 Creating Daily...`);
            await factory.createMarket(q, p, et, et - 43200).then((t: any) => t.wait());
        }
        if (activeCount.W === 0) {
            const p = await getLivePrice();
            const et = nextWeekUTC();
            const q = `Will BTC/USD be above $${(Number(p) / 1e8).toLocaleString()} by ${formatDate(et)}?`;
            console.log(`   🆕 Creating Weekly...`);
            await factory.createMarket(q, p, et, et - 259200).then((t: any) => t.wait());
        }

    } catch (err) { console.error("❌ Sweep failure:", err); }
}

async function main() {
    console.log("🚀 Rial Market Unified Snapshot Bot Starting...");
    console.log(`   Signer: ${signer.address}`);

    // Initial sweep
    await resolveMarkets();

    // Regular interval
    setInterval(resolveMarkets, 30_000);
}

main().catch(console.error);
