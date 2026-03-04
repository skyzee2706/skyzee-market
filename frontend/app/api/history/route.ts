import { NextResponse } from 'next/server';
import ccxt from 'ccxt';

export const revalidate = 0;

// Initialize exchange instances outside to reuse connections
const exchanges: Record<string, any> = {
    binance: new ccxt.binance({ timeout: 10000 }),
    bybit: new ccxt.bybit({ timeout: 10000 }),
    mexc: new ccxt.mexc({ timeout: 10000 }),
    kucoin: new ccxt.kucoin({ timeout: 10000 }),
    gate: new ccxt.gate({ timeout: 10000 }),
    bitget: new ccxt.bitget({ timeout: 10000 }),
    okx: new ccxt.okx({ timeout: 10000 }),
    htx: new ccxt.htx({ timeout: 10000 }),
    bitmart: new ccxt.bitmart({ timeout: 10000 }),
    digifinex: new ccxt.digifinex({ timeout: 10000 })
};

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const sinceParam = url.searchParams.get('since');

        const now = new Date();
        const sunday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay(), 0, 0, 0, 0));
        const sundayTs = Math.floor(sunday.getTime() / 1000);

        // If `since` param provided, use it (clamped to Sunday to prevent very old data)
        const sinceTs = sinceParam ? Math.max(parseInt(sinceParam), sundayTs) : null;

        // Calculate limit: from since -> now (+120 buffer for safety), capped at 2000
        const limit = sinceTs
            ? Math.min(Math.floor((Date.now() / 1000 - sinceTs) / 60) + 120, 2000)
            : 2000;

        const fetchSince = sinceTs ? sinceTs * 1000 : undefined; // ms for CCXT

        const exchangeIds = Object.keys(exchanges);

        const allResults = await Promise.allSettled(exchangeIds.map(async (id) => {
            try {
                const ohlcv = await exchanges[id].fetchOHLCV('BTC/USDT', '1m', fetchSince, limit);
                return ohlcv.map((k: any) => ({ t: Math.floor(k[0] / 1000), v: k[4] }));
            } catch (e) {
                return [];
            }
        }));

        const priceGroups: Record<number, number[]> = {};

        allResults.forEach(res => {
            if (res.status === 'fulfilled' && Array.isArray(res.value)) {
                res.value.forEach((p: any) => {
                    if (p.t >= sundayTs) {
                        if (!priceGroups[p.t]) priceGroups[p.t] = [];
                        priceGroups[p.t].push(p.v);
                    }
                });
            }
        });

        const sortedTimestamps = Object.keys(priceGroups).map(Number).sort((a, b) => a - b);
        const history = sortedTimestamps.map(t => {
            const vals = priceGroups[t];
            vals.sort((a, b) => a - b);
            const mid = Math.floor(vals.length / 2);
            return { time: t, value: vals.length % 2 !== 0 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2 };
        });

        return NextResponse.json({
            history,
            source: "ccxt_optimized_1m",
            range_start: sundayTs,
            sources_count: allResults.filter(r => r.status === 'fulfilled' && (r.value as any[]).length > 0).length,
            timestamp: Math.floor(Date.now() / 1000)
        }, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Cache-Control': 'no-store, max-age=0'
            }
        });

    } catch (err: any) {
        return NextResponse.json({ history: [], error: err.message }, { status: 200 });
    }
}
