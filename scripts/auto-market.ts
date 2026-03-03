/**
 * auto-market.ts
 * ───────────────────────────────────────────────────────────────────────────
 * Rial Market — Auto-scheduler for hourly and daily BTC/USD prediction markets
 *
 * This version uses a unified 10-CEX median engine for both Live Prices and
 * Historical Snapshots. Uses 'fetch' to match frontend API reliability.
 */

import * as dotenv from "dotenv";
dotenv.config();

import { ethers } from "ethers";

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

// ── Robust Price Engine (Standard 10 CEX) ────────────────────────────────

const HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" };

async function getLivePrice(retries = 3): Promise<bigint> {
    const timeout = 3000;
    for (let i = 0; i < retries; i++) {
        try {
            const prices: number[] = [];
            const f = async (url: string) => {
                const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeout) });
                return await res.json();
            };

            const results = await Promise.allSettled([
                f("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT").then(d => Number(d.price)),
                f("https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT").then(d => Number(d.result.list[0].lastPrice)),
                f("https://api.mexc.com/api/v3/ticker/price?symbol=BTCUSDT").then(d => Number(d.price)),
                f("https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=BTC-USDT").then(d => Number(d.data.price)),
                f("https://api.gateio.ws/api/v4/spot/tickers?currency_pair=BTC_USDT").then(d => Number(d[0].last)),
                f("https://api.bitget.com/api/v2/spot/market/tickers?symbol=BTCUSDT").then(d => Number(d.data[0].lastPr)),
                f("https://api.huobi.pro/market/trade?symbol=btcusdt").then(d => Number(d.tick.data[0].price)),
                f("https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT").then(d => Number(d.data[0].last)),
                f("https://api-cloud.bitmart.com/spot/quotation/v3/ticker?symbol=BTC_USDT").then(d => Number(d.data.last)),
                f("https://openapi.digifinex.com/v3/spot/ticker?symbol=BTC_USDT").then(d => Number(d.ticker[0].last))
            ]);

            results.forEach(res => {
                if (res.status === 'fulfilled' && res.value && res.value > 15000) prices.push(res.value);
            });

            if (prices.length < 3) throw new Error(`Only ${prices.length} sources reached.`);
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

async function getHistoricalPrice(targetTs: number): Promise<bigint> {
    const timeout = 4000;
    const minuteStart = Math.floor(targetTs / 60) * 60;
    console.log(`      📡 Fetching snapshot for ${new Date(targetTs * 1000).toUTCString()}`);

    const f = async (url: string) => {
        const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeout) });
        return await res.json();
    };

    const fetchers = [
        async () => f(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&startTime=${minuteStart * 1000}&limit=1`).then(d => parseFloat(d[0][4])),
        async () => f(`https://api.mexc.com/api/v3/klines?symbol=BTCUSDT&interval=1m&startTime=${minuteStart * 1000}&limit=1`).then(d => parseFloat(d[0][4])),
        async () => f(`https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=1&startTime=${minuteStart * 1000}&limit=1`).then(d => parseFloat(d.result.list[0][4])),
        async () => f(`https://api.kucoin.com/api/v1/market/candles?symbol=BTC-USDT&type=1min&startAt=${minuteStart}&endAt=${minuteStart + 65}`).then(d => parseFloat(d.data[0][2])),
        async () => f(`https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=BTC_USDT&interval=1m&from=${minuteStart}`).then(d => parseFloat(d[0][2])),
        async () => f(`https://api.bitget.com/api/v2/spot/market/history-candles?symbol=BTCUSDT&granularity=1min&startTime=${minuteStart * 1000}&limit=1`).then(d => parseFloat(d.data[0][4]))
    ];

    const results = await Promise.allSettled(fetchers.map(f => f()));
    const prices: number[] = [];

    results.forEach(res => {
        if (res.status === 'fulfilled' && res.value && res.value > 15000) prices.push(res.value);
    });

    if (prices.length === 0) {
        console.warn("      ⚠️ Historical CEX fail, falling back to live proxy...");
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
        const balance = await provider.getBalance(signer.address);
        console.log(`\n🔍 [SWEEP] Balance: ${ethers.formatEther(balance)} ETH | ${new Date().toISOString()}`);

        const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
        const all = await factory.getAllMarkets();
        const recent = all.slice(-40);
        const now = Math.floor(Date.now() / 1000);

        let activeCount = { H: 0, D: 0, W: 0 };

        for (const addr of recent) {
            try {
                const m = new ethers.Contract(addr, MARKET_ABI, signer);
                const [endTime, resolved, question] = await Promise.all([m.endTime(), m.resolved(), m.question()]);
                const tsType = question.includes(" at ") ? "H" : question.includes(" midnight ") ? "D" : "W";

                if (!resolved && now >= Number(endTime)) {
                    console.log(`   ⚡ Settling: ${question}`);
                    const price = await getHistoricalPrice(Number(endTime));
                    const tx = await m.resolveWithCustomPrice(price);
                    await tx.wait();
                    console.log(`      ✅ Settled @ $${(Number(price) / 1e8).toFixed(2)}`);
                } else if (!resolved) {
                    activeCount[tsType]++;
                }
            } catch (e: any) {
                console.error(`   ❌ Error market ${addr}:`, e.shortMessage || e.message);
            }
        }

        console.log(`   📊 Active (Before creation): ${activeCount.H}H, ${activeCount.D}D, ${activeCount.W}W`);

        if (activeCount.H === 0) {
            try {
                const p = await getLivePrice();
                const et = nextHourUTC();
                const q = `Will BTC/USD be above $${(Number(p) / 1e8).toLocaleString()} at ${formatHour(et)}?`;
                console.log(`   🆕 Creating Hourly: ${q}`);
                const tx = await factory.createMarket(q, p, et, et - 900);
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
    console.log("🚀 Rial Market Unified Snapshot Bot Starting...");
    await resolveMarkets();
    setInterval(resolveMarkets, 30_000);
}

main().catch(console.error);
