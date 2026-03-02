import { NextResponse } from 'next/server';

export const revalidate = 0; // Disable static caching so it always fetches live

export async function GET() {
    try {
        const fetchPyth = async () => {
            const pyth = await fetch("https://hermes.pyth.network/v2/updates/price/latest?ids[]=0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43", { cache: "no-store", signal: AbortSignal.timeout(3000) });
            const pythData = await pyth.json();
            if (pythData.parsed && pythData.parsed.length > 0) {
                return Number(pythData.parsed[0].price.price) * Math.pow(10, pythData.parsed[0].price.expo);
            }
            return null;
        };

        const fetchCG = async () => {
            const cg = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd", { cache: "no-store", signal: AbortSignal.timeout(3000) });
            const cgData = await cg.json();
            return Number(cgData.bitcoin.usd);
        };

        const fetchMEXC = async () => {
            const mexc = await fetch("https://api.mexc.com/api/v3/ticker/price?symbol=BTCUSDT", { cache: "no-store", signal: AbortSignal.timeout(2000) });
            const mexcData = await mexc.json();
            return Number(mexcData.price);
        };

        const results = await Promise.allSettled([fetchPyth(), fetchCG(), fetchMEXC()]);

        const prices: number[] = [];
        results.forEach(res => {
            if (res.status === 'fulfilled' && res.value && res.value > 0) {
                prices.push(res.value);
            }
        });

        if (prices.length === 0) {
            return NextResponse.json({ error: "All backend APIs failed to load" }, { status: 500 });
        }

        prices.sort((a, b) => a - b);
        const mid = Math.floor(prices.length / 2);
        const medianPrice = prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;

        return NextResponse.json({ price: medianPrice, sources: prices.length });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
