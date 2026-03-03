import { NextResponse } from 'next/server';

export const revalidate = 0; // Disable static caching so it always fetches live

export async function GET() {
    try {
        // Fetch from 3 top sources to find a reliable median
        // This logic matches the bot's getLivePrice() exactly.

        const fetchBinance = async () => {
            const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT", { cache: "no-store", signal: AbortSignal.timeout(2000) });
            const data = await res.json();
            return Number(data.price);
        };

        const fetchPyth = async () => {
            const res = await fetch("https://hermes.pyth.network/v2/updates/price/latest?ids[]=0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43", { cache: "no-store", signal: AbortSignal.timeout(2000) });
            const data = await res.json();
            if (data.parsed && data.parsed.length > 0) {
                return Number(data.parsed[0].price.price) * Math.pow(10, data.parsed[0].price.expo);
            }
            return null;
        };

        const fetchMEXC = async () => {
            const res = await fetch("https://api.mexc.com/api/v3/ticker/price?symbol=BTCUSDT", { cache: "no-store", signal: AbortSignal.timeout(2000) });
            const data = await res.json();
            return Number(data.price);
        };

        const results = await Promise.allSettled([fetchBinance(), fetchPyth(), fetchMEXC()]);

        const prices: number[] = [];
        results.forEach(res => {
            if (res.status === 'fulfilled' && res.value && res.value > 0) {
                prices.push(res.value);
            }
        });

        if (prices.length === 0) {
            return NextResponse.json({ error: "Price sources unreachable" }, { status: 503 });
        }

        // Calculate Median
        prices.sort((a, b) => a - b);
        const mid = Math.floor(prices.length / 2);
        const medianPrice = prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;

        return NextResponse.json({
            price: medianPrice,
            sources: prices.length,
            timestamp: Math.floor(Date.now() / 1000)
        });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
