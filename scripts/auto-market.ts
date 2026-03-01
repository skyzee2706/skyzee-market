/**
 * auto-market.ts
 * ───────────────────────────────────────────────────────────────────────────
 * Rial Market — Auto-scheduler for hourly and daily BTC/USD prediction markets
 *
 * Reads the live BTC/USD price from the deployed ChainlinkOracle on Sepolia,
 * then calls MarketFactory.createMarket() with that price as the strike price.
 *
 * Schedule (UTC):
 *   Hourly  — at the start of every UTC hour  (cron: "0 * * * *")
 *   Daily   — at midnight UTC every day        (cron: "0 0 * * *")
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

// ── Core: fetch price + deploy market ─────────────────────────────────────

async function getOnChainBTCPrice(): Promise<bigint> {
    const oracle = new ethers.Contract(ORACLE_ADDRESS, ORACLE_ABI, provider);
    const price: bigint = await oracle.getPrice();
    return price;
}

/** 
 * ZERO-GAS SIMULATION: Fetch live price from Binance instead of slow testnet Oracle.
 * Formats price to 8 decimals to match Chainlink USD standard.
 */
async function getLiveBinancePrice(): Promise<bigint> {
    try {
        const response = await axios.get("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
        const rawPriceFloat = parseFloat(response.data.price);
        // Convert to 8 decimals format: $66500.50 -> 6650050000000
        const price8Decimals = Math.floor(rawPriceFloat * 1e8);
        return BigInt(price8Decimals);
    } catch (err) {
        console.warn("⚠️ Binance API failed, falling back to Chainlink Oracle");
        return getOnChainBTCPrice();
    }
}

async function createMarket(question: string, strikePrice: bigint, endTime: number, bettingEndTime: number) {
    const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);
    console.log(`\n📝 Creating market...`);
    console.log(`   Question       : ${question}`);
    console.log(`   Strike         : $${(Number(strikePrice) / 1e8).toLocaleString()}`);
    console.log(`   Betting Closes : ${new Date(bettingEndTime * 1000).toUTCString()}`);
    console.log(`   Settles At     : ${new Date(endTime * 1000).toUTCString()}`);

    const tx = await factory.createMarket(question, strikePrice, endTime, bettingEndTime);
    console.log(`   TX         : ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`   ✅ Confirmed in block ${receipt.blockNumber}`);
}

async function resolveMarkets() {
    try {
        console.log(`\n🔍 [AUTO-RESOLVE] Checking for ended markets...`);
        const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
        const allMarkets: string[] = await factory.getAllMarkets();

        const now = Math.floor(Date.now() / 1000);
        let resolvedCount = 0;

        for (const marketAddr of allMarkets) {
            const market = new ethers.Contract(marketAddr, MARKET_ABI, signer);
            const [endTime, resolved, question] = await Promise.all([
                market.endTime(),
                market.resolved(),
                market.question()
            ]);

            if (!resolved && now >= Number(endTime)) {
                console.log(`   ⚡ Resolving: ${question}`);
                console.log(`      Contract: ${marketAddr}`);
                try {
                    // ZERO-GAS SIMULATION: fetch the exact dancing price on UI right now
                    const binancePrice = await getLiveBinancePrice();
                    console.log(`      📡 Injecting Live Binance Price: $${(Number(binancePrice) / 1e8).toLocaleString()}`);

                    const tx = await market.resolveWithCustomPrice(binancePrice);
                    const receipt = await tx.wait();
                    console.log(`      ✅ Resolved in block ${receipt.blockNumber}`);
                    resolvedCount++;

                    // Auto-recreate based on original market question
                    if (question.includes(" at ")) {
                        console.log(`      🔄 Auto-recreating Hourly market...`);
                        await runHourly();
                    } else if (question.includes(" by midnight ")) {
                        console.log(`      🔄 Auto-recreating Daily market...`);
                        await runDaily();
                    } else if (question.includes(" by ") && question.includes(" UTC")) {
                        // Catch-all for weekly or similar formatting
                        console.log(`      🔄 Auto-recreating Weekly market...`);
                        await runWeekly();
                    }
                } catch (rErr: any) {
                    console.error(`      ❌ Failed to resolve:`, rErr.reason || rErr.message);
                }
            }
        }
        if (resolvedCount === 0) console.log("   No markets needed resolution at this time.");
    } catch (err) {
        console.error("❌ Auto-resolve check failed:", err);
    }
}

// ── Scheduled jobs ────────────────────────────────────────────────────────

async function runHourly() {
    console.log(`\n⏰ [HOURLY] ${new Date().toUTCString()}`);
    try {
        const price = await getLiveBinancePrice(); // Use Binance for baseline so question matches UI perfectly
        const endTime = nextHourUTC();
        const bettingEndTime = endTime - 15 * 60;  // close 15 mins early
        const label = formatHourUTC(endTime);
        const usd = (Number(price) / 1e8).toLocaleString(undefined, { minimumFractionDigits: 2 });
        const question = `Will BTC/USD be above $${usd} at ${label}?`;
        await createMarket(question, price, endTime, bettingEndTime);
    } catch (err) {
        console.error("❌ Hourly market failed:", err);
    }
}

async function runDaily() {
    console.log(`\n📅 [DAILY] ${new Date().toUTCString()}`);
    try {
        const price = await getLiveBinancePrice(); // Use Binance
        const endTime = nextMidnightUTC();
        const bettingEndTime = endTime - 12 * 60 * 60; // close 12 hrs early
        const label = formatDateUTC(endTime);
        const usd = (Number(price) / 1e8).toLocaleString(undefined, { minimumFractionDigits: 2 });
        const question = `Will BTC/USD be above $${usd} by midnight ${label}?`;
        await createMarket(question, price, endTime, bettingEndTime);
    } catch (err) {
        console.error("❌ Daily market failed:", err);
    }
}

async function runWeekly() {
    console.log(`\n📅 [WEEKLY] ${new Date().toUTCString()}`);
    try {
        const price = await getLiveBinancePrice(); // Use Binance
        const endTime = nextWeekUTC();
        const bettingEndTime = endTime - 3 * 24 * 60 * 60; // close 3 days early
        const label = formatDateUTC(endTime);
        const usd = (Number(price) / 1e8).toLocaleString(undefined, { minimumFractionDigits: 2 });
        const question = `Will BTC/USD be above $${usd} by ${label}?`;
        await createMarket(question, price, endTime, bettingEndTime);
    } catch (err) {
        console.error("❌ Weekly market failed:", err);
    }
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
    console.log("🚀 Rial Market — Auto-Scheduler starting...");
    console.log(`   Factory  : ${FACTORY_ADDRESS}`);
    console.log(`   Oracle   : ${ORACLE_ADDRESS}`);
    console.log(`   Wallet   : ${signer.address}`);

    const balance = await provider.getBalance(signer.address);
    console.log(`   Balance  : ${ethers.formatEther(balance)} ETH`);
    console.log("");

    // Sweep on startup to catch missed deadlines during downtime
    // This will inherently trigger 'runHourly', 'runDaily', 'runWeekly' via the recreation logic
    console.log("\n▶️  Running initial resolution sweep on startup...");
    await resolveMarkets();

    // ── Cron: Auto-Resolve every 1 minute
    cron.schedule("* * * * *", resolveMarkets);
    console.log("\n🔄 Auto-resolve scheduled : * * * * * (Every 1 min)");

    console.log("\n✅ Scheduler is now running. Press Ctrl+C to stop.\n");
}

main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
});
