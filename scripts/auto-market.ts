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

// ── Core: fetch price + deploy market ─────────────────────────────────────

async function getOnChainBTCPrice(): Promise<bigint> {
    const oracle = new ethers.Contract(ORACLE_ADDRESS, ORACLE_ABI, provider);
    const price: bigint = await oracle.getPrice();
    return price;
}

/** 
 * ZERO-GAS SIMULATION: Fetch live price from multiple unblocked sources and find the median.
 * Formats price to 8 decimals to match Chainlink USD standard.
 */
async function getLivePrice(retries = 3): Promise<bigint> {
    for (let i = 0; i < retries; i++) {
        try {
            const prices: number[] = [];

            // 1. Pyth Network (Hermes) - Very reliable, no API key
            try {
                const pyth = await axios.get("https://hermes.pyth.network/v2/updates/price/latest?ids[]=0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43", { timeout: 3000 });
                // Pyth returns price with its own exponent, usually 1e8 for BTC
                const p = Number(pyth.data.parsed[0].price.price) * Math.pow(10, pyth.data.parsed[0].price.expo);
                if (p > 0) prices.push(p);
            } catch (e) { }

            // 2. CoinGecko - Reliable fallback
            try {
                const cg = await axios.get("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd", { timeout: 3000 });
                const p = Number(cg.data.bitcoin.usd);
                if (p > 0) prices.push(p);
            } catch (e) { }

            // 3. Binance / MEXC (Might be blocked, fire-and-forget fallback)
            try {
                const mexc = await axios.get("https://api.mexc.com/api/v3/ticker/price?symbol=BTCUSDT", { timeout: 2000 });
                const p = Number(mexc.data.price);
                if (p > 0) prices.push(p);
            } catch (e) { }

            if (prices.length === 0) throw new Error("All APIs failed to return a price.");

            // Calculate Median
            prices.sort((a, b) => a - b);
            const mid = Math.floor(prices.length / 2);
            const medianPrice = prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;

            const price8Decimals = Math.floor(medianPrice * 1e8);
            return BigInt(price8Decimals);
        } catch (err) {
            console.warn(`⚠️ API aggregation failed (attempt ${i + 1}/${retries}). Retrying...`);
            if (i === retries - 1) throw new Error("API completely unreachable. Cannot resolve or create market fairly.");
            await new Promise(r => setTimeout(r, 3000));
        }
    }
    return 0n;
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

        let hasActiveHourly = false;
        let hasActiveDaily = false;
        let hasActiveWeekly = false;

        for (const marketAddr of allMarkets) {
            const market = new ethers.Contract(marketAddr, MARKET_ABI, signer);
            // Fetch state once to minimize RPC hits
            const [endTime, resolved, question] = await Promise.all([
                market.endTime(),
                market.resolved(),
                market.question()
            ]);

            const isHourly = question.includes(" at ");
            const isDaily = question.includes(" by midnight ");
            const isWeekly = question.includes(" by ") && question.includes(" UTC");

            // Check if this market is currently active and ongoing
            if (!resolved && now < Number(endTime)) {
                if (isHourly) hasActiveHourly = true;
                if (isDaily) hasActiveDaily = true;
                if (isWeekly) hasActiveWeekly = true;
                continue; // No need to process resolution for an active market
            }

            if (!resolved && now >= Number(endTime)) {
                console.log(`   ⚡ Resolving: ${question}`);
                console.log(`      Contract: ${marketAddr}`);
                try {
                    // ZERO-GAS SIMULATION: fetch the exact dancing price on UI right now
                    const livePrice = await getLivePrice();
                    console.log(`      📡 Injecting Live Price: $${(Number(livePrice) / 1e8).toLocaleString()}`);

                    const tx = await market.resolveWithCustomPrice(livePrice);
                    const receipt = await tx.wait();
                    console.log(`      ✅ Resolved in block ${receipt.blockNumber}`);
                    resolvedCount++;

                } catch (rErr: any) {
                    console.error(`      ❌ Failed to resolve ${marketAddr}:`, rErr.reason || rErr.message || rErr);
                    // Do not break the loop, continue to the next market
                }
            }
        }

        if (resolvedCount === 0) console.log("   No markets needed resolution at this time.");

        // Guarantee that there is always at least 1 active market of each type
        if (!hasActiveHourly) {
            console.log(`      🔄 Missing active Hourly market. Auto-creating...`);
            await runHourly();
        }
        if (!hasActiveDaily) {
            console.log(`      🔄 Missing active Daily market. Auto-creating...`);
            await runDaily();
        }
        if (!hasActiveWeekly) {
            console.log(`      🔄 Missing active Weekly market. Auto-creating...`);
            await runWeekly();
        }

    } catch (err) {
        console.error("❌ Auto-resolve sweep failed:", err);
    }
}

// ── Scheduled jobs ────────────────────────────────────────────────────────

async function runHourly() {
    console.log(`\n⏰ [HOURLY] ${new Date().toUTCString()}`);
    try {
        const price = await getLivePrice(); // Use exact frontend API for baseline so question matches UI perfectly
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
        const price = await getLivePrice(); // Use exact frontend API
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
        const price = await getLivePrice(); // Use exact frontend API
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

// ── Price History Storage ──────────────────────────────────────────────────
const PRICES_CSV = path.join(process.cwd(), "price_history.csv");

/** Appends a new price point to the CSV file */
async function savePriceToHistory(price: bigint) {
    const now = Math.floor(Date.now() / 1000);
    const usd = Number(price) / 1e8;
    const line = `${now},${usd}\n`;

    try {
        if (!fs.existsSync(PRICES_CSV)) {
            fs.writeFileSync(PRICES_CSV, "timestamp,price\n");
        }
        fs.appendFileSync(PRICES_CSV, line);
    } catch (err) {
        console.error("❌ Failed to save price to history:", err);
    }
}

/** Keeps only the last 24 hours of data in the CSV (approx 86400 lines) */
async function prunePriceHistory() {
    try {
        if (!fs.existsSync(PRICES_CSV)) return;
        const data = fs.readFileSync(PRICES_CSV, "utf8").split("\n");
        const header = data[0];
        const body = data.slice(1).filter(l => l.trim() !== "");

        const maxLines = 86400; // 24h at 1s intervals
        if (body.length > maxLines) {
            const pruned = [header, ...body.slice(body.length - maxLines)].join("\n") + "\n";
            fs.writeFileSync(PRICES_CSV, pruned);
            console.log(`   🧹 Pruned price history to ${maxLines} lines.`);
        }
    } catch (err) {
        console.error("❌ Failed to prune price history:", err);
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
    console.log("\n▶️  Running initial resolution sweep on startup...");
    await resolveMarkets();

    // ── Loop 1: Price Collector (1s)
    console.log("\n📈 Price collector started: Every 1 second");
    setInterval(async () => {
        try {
            const price = await getLivePrice(1); // 1 retry only for high frequency
            await savePriceToHistory(price);
        } catch (e) {
            // Silently fail if one fetch fails, next second will retry
        }
    }, 1000);

    // ── Loop 2: History Pruning (1h)
    setInterval(prunePriceHistory, 3600_000);

    // ── Loop 3: Auto-Resolve safely overlapping prevention
    console.log("\n🔄 Auto-resolve scheduled: Every 30 seconds");

    // Instead of node-cron, use a self-invoking loop to prevent overlap if a sweep takes >30s
    while (true) {
        await resolveMarkets();
        await new Promise(res => setTimeout(res, 30_000));
    }
}

main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
});
