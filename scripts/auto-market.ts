/**
 * auto-market.ts
 * ───────────────────────────────────────────────────────────────────────────
 * Rial Market — Auto-scheduler for hourly and daily BTC/USD prediction markets
 *
 * Reads the live BTC/USD price from top public sources (Binance, Pyth, MEXC),
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
import cron from "node-cron";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";

// ── Config ────────────────────────────────────────────────────────────────
const RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as string;
const ORACLE_ADDRESS = process.env.NEXT_PUBLIC_ORACLE_ADDRESS as string;
const TOKEN_ADDRESS = process.env.NEXT_PUBLIC_TOKEN_ADDRESS as string;

if (!RPC_URL || !PRIVATE_KEY || !FACTORY_ADDRESS || !ORACLE_ADDRESS || !TOKEN_ADDRESS) {
    console.error("❌  Missing required env vars. Check .env:");
    console.error("    SEPOLIA_RPC_URL, PRIVATE_KEY, NEXT_PUBLIC_FACTORY_ADDRESS, NEXT_PUBLIC_ORACLE_ADDRESS, NEXT_PUBLIC_TOKEN_ADDRESS");
    process.exit(1);
}

// ── ABIs (minimal) ────────────────────────────────────────────────────────
const ORACLE_ABI = [
    "function getPrice() external view returns (uint256)",
];

const FACTORY_ABI = [
    "function createMarket(string memory question, uint256 strikePrice, uint256 endTime, uint256 bettingEndTime) external returns (address)",
    "function getAllMarkets() external view returns (address[])"
];

const MARKET_ABI = [
    "function endTime() external view returns (uint256)",
    "function resolved() external view returns (bool)",
    "function resolve() external",
    "function resolveWithCustomPrice(uint256 price) external",
    "function question() external view returns (string)"
];

// ── Provider / Signer ─────────────────────────────────────────────────────
const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

// ── Helpers ───────────────────────────────────────────────────────────────

/** Returns the UNIX timestamp of the next UTC hour boundary */
function nextHourUTC(): number {
    const now = new Date();
    const next = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        now.getUTCHours() + 1, // next hour
        0, 0, 0
    ));
    return Math.floor(next.getTime() / 1000);
}

/** Returns the UNIX timestamp of the next UTC midnight */
function nextMidnightUTC(): number {
    const now = new Date();
    const next = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1, // tomorrow
        0, 0, 0, 0
    ));
    return Math.floor(next.getTime() / 1000);
}

/** Returns human-readable UTC hour string like "08:00 UTC" */
function formatHourUTC(ts: number): string {
    const d = new Date(ts * 1000);
    return `${String(d.getUTCHours()).padStart(2, "0")}:00 UTC`;
}

/** Returns human-readable UTC date string like "2025-03-01 UTC" */
function formatDateUTC(ts: number): string {
    const d = new Date(ts * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} UTC`;
}

/** Returns the UNIX timestamp for 7 days from now (UTC) */
function nextWeekUTC(): number {
    const now = new Date();
    const next = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 7,
        0, 0, 0, 0
    ));
    return Math.floor(next.getTime() / 1000);
}

// ── Unified Price Engine ──────────────────────────────────────────────────

/** 
 * Fetches BTC price from multiple top-tier sources and returns the median.
 * Logic is MIRRORED in /api/price to ensure 100% parity.
 */
async function getLivePrice(retries = 3): Promise<bigint> {
    for (let i = 0; i < retries; i++) {
        try {
            const prices: number[] = [];

            // 1. Binance Spot
            try {
                const binance = await axios.get("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT", { timeout: 2000 });
                const p = Number(binance.data.price);
                if (p > 0) prices.push(p);
            } catch (e) { }

            // 2. Pyth Network (Hermes)
            try {
                const pyth = await axios.get("https://hermes.pyth.network/v2/updates/price/latest?ids[]=0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43", { timeout: 2000 });
                const p = Number(pyth.data.parsed[0].price.price) * Math.pow(10, pyth.data.parsed[0].price.expo);
                if (p > 0) prices.push(p);
            } catch (e) { }

            // 3. MEXC Spot
            try {
                const mexc = await axios.get("https://api.mexc.com/api/v3/ticker/price?symbol=BTCUSDT", { timeout: 2000 });
                const p = Number(mexc.data.price);
                if (p > 0) prices.push(p);
            } catch (e) { }

            if (prices.length === 0) throw new Error("Price collection failed.");

            // Median Calculation
            prices.sort((a, b) => a - b);
            const mid = Math.floor(prices.length / 2);
            const medianPrice = prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;

            // Chainlink standard: 8 decimals
            return BigInt(Math.floor(medianPrice * 1e8));
        } catch (err) {
            console.warn(`⚠️ Price sync failed (attempt ${i + 1}/${retries}).`);
            if (i === retries - 1) throw err;
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    return 0n;
}

// ── Market Actions ────────────────────────────────────────────────────────

async function createMarket(question: string, strikePrice: bigint, endTime: number, bettingEndTime: number) {
    const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);
    console.log(`\n📝 Creating market...`);
    console.log(`   Question       : ${question}`);
    console.log(`   Strike         : $${(Number(strikePrice) / 1e8).toLocaleString()}`);
    console.log(`   Betting Closes : ${new Date(bettingEndTime * 1000).toUTCString()}`);
    console.log(`   Settles At     : ${new Date(endTime * 1000).toUTCString()}`);

    const tx = await factory.createMarket(question, strikePrice, endTime, bettingEndTime);
    const receipt = await tx.wait();
    console.log(`   ✅ Success: BTC/USD @ $${(Number(strikePrice) / 1e8).toFixed(2)} (Block ${receipt.blockNumber})`);
}

async function resolveMarkets() {
    try {
        console.log(`\n🔍 [AUTO-RESOLVE] Scanning recent markets...`);
        const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
        const allMarkets: string[] = await factory.getAllMarkets();

        const recentMarkets = allMarkets.slice(-50);
        const now = Math.floor(Date.now() / 1000);

        let activeHourly = 0;
        let activeDaily = 0;
        let activeWeekly = 0;

        for (const marketAddr of recentMarkets) {
            const market = new ethers.Contract(marketAddr, MARKET_ABI, signer);
            const [endTime, resolved, question] = await Promise.all([
                market.endTime(),
                market.resolved(),
                market.question()
            ]);

            const isHourly = question.includes(" at ") && question.includes(" UTC?");
            const isDaily = question.includes(" by midnight ");
            const isWeekly = question.includes(" by ") && !question.includes(" midnight ");

            if (!resolved && now < Number(endTime)) {
                if (isHourly) activeHourly++;
                if (isDaily) activeDaily++;
                if (isWeekly) activeWeekly++;
                continue;
            }

            if (!resolved && now >= Number(endTime)) {
                console.log(`   ⚡ Settling Market: ${question}`);
                try {
                    const settlementPrice = await getLivePrice();
                    console.log(`      📡 Settling @ $${(Number(settlementPrice) / 1e8).toLocaleString()}`);
                    const tx = await market.resolveWithCustomPrice(settlementPrice);
                    await tx.wait();
                    console.log(`      ✅ Settled: ${marketAddr}`);
                } catch (rErr: any) {
                    console.error(`      ❌ Error ${marketAddr}:`, rErr.message);
                }
            }
        }

        console.log(`   📊 Current Active: ${activeHourly}H, ${activeDaily}D, ${activeWeekly}W`);

        // Re-create markets if needed
        if (activeHourly === 0) await runHourly();
        if (activeDaily === 0) await runDaily();
        if (activeWeekly === 0) await runWeekly();

    } catch (err) {
        console.error("❌ Sweep failure:", err);
    }
}

// ── Scheduled Tasks ───────────────────────────────────────────────────────

async function runHourly() {
    try {
        const price = await getLivePrice();
        const endTime = nextHourUTC();
        const bettingEndTime = endTime - 15 * 60;
        const label = formatHourUTC(endTime);
        const question = `Will BTC/USD be above $${(Number(price) / 1e8).toLocaleString(undefined, { minimumFractionDigits: 2 })} at ${label}?`;
        await createMarket(question, price, endTime, bettingEndTime);
    } catch (err) { }
}

async function runDaily() {
    try {
        const price = await getLivePrice();
        const endTime = nextMidnightUTC();
        const bettingEndTime = endTime - 12 * 60 * 60;
        const label = formatDateUTC(endTime);
        const question = `Will BTC/USD be above $${(Number(price) / 1e8).toLocaleString(undefined, { minimumFractionDigits: 2 })} by midnight ${label}?`;
        await createMarket(question, price, endTime, bettingEndTime);
    } catch (err) { }
}

async function runWeekly() {
    try {
        const price = await getLivePrice();
        const endTime = nextWeekUTC();
        const bettingEndTime = endTime - 3 * 24 * 60 * 60;
        const label = formatDateUTC(endTime);
        const question = `Will BTC/USD be above $${(Number(price) / 1e8).toLocaleString(undefined, { minimumFractionDigits: 2 })} by ${label}?`;
        await createMarket(question, price, endTime, bettingEndTime);
    } catch (err) { }
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
    console.log("\n🚀 Rial Market Unified Node — Bot Starting...");
    console.log(`   Signer: ${signer.address}`);

    const balance = await provider.getBalance(signer.address);
    console.log(`   Balance: ${ethers.formatEther(balance)} ETH\n`);

    // Initial check
    await resolveMarkets();

    // Auto-Resolve Sweep (Every 30s)
    console.log("🔄 Scheduler Active: Every 30 seconds");
    while (true) {
        await resolveMarkets();
        await new Promise(res => setTimeout(res, 30_000));
    }
}

main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
});
