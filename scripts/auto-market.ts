/**
 * auto-market.ts
 * ───────────────────────────────────────────────────────────────────────────
 * Rial Market — Auto-scheduler for hourly and daily BTC/USD prediction markets
 *
 * Reads the live BTC/USD price from 10 top public sources (Binance, Pyth, MEXC, OKX, etc.),
 * then calls MarketFactory.createMarket() with the median price.
 * 
 * Logic is unified with the frontend API to ensure 100% price consistency.
 *
 * Schedule (UTC):
 *   Hourly  — at the start of every UTC hour
 *   Daily   — at midnight UTC every day
 *   Weekly  — every Sunday morning
 *
 * Usage:
 *   npm run auto-market
 * ───────────────────────────────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────

function nextHourUTC(): number {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() + 1, 0, 0, 0));
    return Math.floor(next.getTime() / 1000);
}

function nextMidnightUTC(): number {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
    return Math.floor(next.getTime() / 1000);
}

function nextWeekUTC(): number {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 7, 0, 0, 0, 0));
    return Math.floor(next.getTime() / 1000);
}

function formatHourUTC(ts: number): string {
    const d = new Date(ts * 1000);
    return `${String(d.getUTCHours()).padStart(2, "0")}:00 UTC`;
}

function formatDateUTC(ts: number): string {
    const d = new Date(ts * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} UTC`;
}

// ── Unified Price Engine (10+ Sources) ───────────────────────────────────

async function getLivePrice(retries = 3): Promise<bigint> {
    const timeout = 2500;
    for (let i = 0; i < retries; i++) {
        try {
            const prices: number[] = [];

            // 1. Pyth (Hermes)
            try {
                const res = await axios.get("https://hermes.pyth.network/v2/updates/price/latest?ids[]=0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43", { timeout });
                prices.push(Number(res.data.parsed[0].price.price) * Math.pow(10, res.data.parsed[0].price.expo));
            } catch (e) { }

            // 2. Binance
            try {
                const res = await axios.get("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT", { timeout });
                prices.push(Number(res.data.price));
            } catch (e) { }

            // 3. Bybit
            try {
                const res = await axios.get("https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT", { timeout });
                prices.push(Number(res.data.result.list[0].lastPrice));
            } catch (e) { }

            // 4. MEXC
            try {
                const res = await axios.get("https://api.mexc.com/api/v3/ticker/price?symbol=BTCUSDT", { timeout });
                prices.push(Number(res.data.price));
            } catch (e) { }

            // 5. KuCoin
            try {
                const res = await axios.get("https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=BTC-USDT", { timeout });
                prices.push(Number(res.data.data.price));
            } catch (e) { }

            // 6. Gate.io
            try {
                const res = await axios.get("https://api.gateio.ws/api/v4/spot/tickers?currency_pair=BTC_USDT", { timeout });
                prices.push(Number(res.data[0].last));
            } catch (e) { }

            // 7. Bitget
            try {
                const res = await axios.get("https://api.bitget.com/api/v2/spot/market/tickers?symbol=BTCUSDT", { timeout });
                prices.push(Number(res.data.data[0].lastPr));
            } catch (e) { }

            // 8. HTX
            try {
                const res = await axios.get("https://api.huobi.pro/market/trade?symbol=btcusdt", { timeout });
                prices.push(Number(res.data.tick.data[0].price));
            } catch (e) { }

            // 9. OKX
            try {
                const res = await axios.get("https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT", { timeout });
                prices.push(Number(res.data.data[0].last));
            } catch (e) { }

            // 10. CoinGecko
            try {
                const res = await axios.get("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd", { timeout });
                prices.push(Number(res.data.bitcoin.usd));
            } catch (e) { }

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

// ── Market Actions ────────────────────────────────────────────────────────

async function createMarket(question: string, strikePrice: bigint, endTime: number, bettingEndTime: number) {
    const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);
    console.log(`\n📝 Creating: ${question}`);
    const tx = await factory.createMarket(question, strikePrice, endTime, bettingEndTime);
    await tx.wait();
    console.log(`   ✅ Success: BTC/USD @ $${(Number(strikePrice) / 1e8).toFixed(2)}`);
}

async function resolveMarkets() {
    try {
        console.log(`\n🔍 [SWEEP] Checking recent markets...`);
        const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
        const allMarkets = await factory.getAllMarkets();
        const recentMarkets = allMarkets.slice(-50);
        const now = Math.floor(Date.now() / 1000);

        let counts = { H: 0, D: 0, W: 0 };

        for (const addr of recentMarkets) {
            const m = new ethers.Contract(addr, MARKET_ABI, signer);
            const [endTime, resolved, question] = await Promise.all([m.endTime(), m.resolved(), m.question()]);

            if (!resolved && now >= Number(endTime)) {
                console.log(`   ⚡ Settling: ${question}`);
                try {
                    const price = await getLivePrice();
                    const tx = await m.resolveWithCustomPrice(price);
                    await tx.wait();
                    console.log(`      ✅ Settled @ $${(Number(price) / 1e8).toFixed(2)}`);
                } catch (e: any) { console.error(`      ❌ Error:`, e.message); }
            } else if (!resolved) {
                if (question.includes(" at ")) counts.H++;
                else if (question.includes(" midnight ")) counts.D++;
                else counts.W++;
            }
        }

        console.log(`   📊 Active: ${counts.H}H, ${counts.D}D, ${counts.W}W`);

        if (counts.H === 0) {
            const p = await getLivePrice();
            const et = nextHourUTC();
            const bt = et - 900;
            await createMarket(`Will BTC/USD be above $${(Number(p) / 1e8).toLocaleString()} at ${formatHourUTC(et)}?`, p, et, bt);
        }
        if (counts.D === 0) {
            const p = await getLivePrice();
            const et = nextMidnightUTC();
            const bt = et - 43200;
            await createMarket(`Will BTC/USD be above $${(Number(p) / 1e8).toLocaleString()} by midnight ${formatDateUTC(et)}?`, p, et, bt);
        }
        if (counts.W === 0) {
            const p = await getLivePrice();
            const et = nextWeekUTC();
            const bt = et - 259200;
            await createMarket(`Will BTC/USD be above $${(Number(p) / 1e8).toLocaleString()} by ${formatDateUTC(et)}?`, p, et, bt);
        }

    } catch (err) { console.error("❌ Sweep failed:", err); }
}

async function main() {
    console.log("🚀 Rial Market Unified 10-Source Bot Starting...");
    await resolveMarkets();
    setInterval(resolveMarkets, 30_000);
}

main().catch(console.error);
