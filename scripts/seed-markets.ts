import * as dotenv from "dotenv";
dotenv.config();
import { ethers } from "ethers";

const RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as string;
const ORACLE_ADDRESS = process.env.NEXT_PUBLIC_ORACLE_ADDRESS as string;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

const FACTORY_ABI = [
    "function createMarket(string memory question, uint256 strikePrice, uint256 endTime, uint256 bettingEndTime) external returns (address)"
];
const ORACLE_ABI = [
    "function getPrice() external view returns (uint256)",
];

function nextHourUTC() {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() + 1, 0, 0));
    return Math.floor(next.getTime() / 1000);
}
function nextMidnightUTC() {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
    return Math.floor(next.getTime() / 1000);
}
function nextWeekUTC() {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 7, 0, 0, 0, 0));
    return Math.floor(next.getTime() / 1000);
}
function formatHourUTC(ts: number) {
    const d = new Date(ts * 1000);
    return `${String(d.getUTCHours()).padStart(2, "0")}:00 UTC`;
}
function formatDateUTC(ts: number) {
    const d = new Date(ts * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} UTC`;
}

async function main() {
    console.log("Seeding Initial Markets...");
    const oracle = new ethers.Contract(ORACLE_ADDRESS, ORACLE_ABI, provider);
    const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);

    const price = await oracle.getPrice();
    const usd = (Number(price) / 1e8).toLocaleString(undefined, { minimumFractionDigits: 2 });

    console.log("1) Hourly...");
    let end = nextHourUTC();
    let bettingEnd = end - 15 * 60; // closes 15 mins before settlement
    await (await factory.createMarket(`Will BTC/USD be above $${usd} at ${formatHourUTC(end)}?`, price, end, bettingEnd)).wait();

    console.log("2) Daily...");
    end = nextMidnightUTC();
    bettingEnd = end - 12 * 60 * 60; // closes 12 hours before settlement
    await (await factory.createMarket(`Will BTC/USD be above $${usd} by midnight ${formatDateUTC(end)}?`, price, end, bettingEnd)).wait();

    console.log("3) Weekly...");
    end = nextWeekUTC();
    bettingEnd = end - 3 * 24 * 60 * 60; // closes 3 days before settlement
    await (await factory.createMarket(`Will BTC/USD be above $${usd} by ${formatDateUTC(end)}?`, price, end, bettingEnd)).wait();

    console.log("All seeded! The PM2 scheduler will now recreate them indefinitely.");
}

main().catch(console.error);
