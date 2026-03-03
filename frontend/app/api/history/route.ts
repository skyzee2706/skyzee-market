import { NextResponse } from 'next/server';

export const revalidate = 0;

/**
 * BTC/USD History API - 10-CEX Unified Median Engine
 * Standardized 10 sources used for History, Live Price, and Settlement.
 */
export async function GET() {
    try {
        const limit = 100;
        const fetchers = [
            async () => { // 1. Binance
                const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=${limit}`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
                const data = await res.json();
                return data.map((k: any) => ({ t: Math.floor(k[0] / 1000), v: parseFloat(k[4]) }));
            },
            async () => { // 2. Bybit
                const res = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=1&limit=${limit}`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
                const data = await res.json();
                return data.result.list.map((k: any) => ({ t: Math.floor(parseInt(k[0]) / 1000), v: parseFloat(k[4]) }));
            },
            async () => { // 3. MEXC
                const res = await fetch(`https://api.mexc.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=${limit}`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
                const data = await res.json();
                return data.map((k: any) => ({ t: Math.floor(k[0] / 1000), v: parseFloat(k[4]) }));
            },
            async () => { // 4. KuCoin
                const res = await fetch(`https://api.kucoin.com/api/v1/market/candles?symbol=BTC-USDT&type=1min&limit=${limit}`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
                const data = await res.json();
                return data.data.map((k: any) => ({ t: parseInt(k[0]), v: parseFloat(k[2]) }));
            },
            async () => { // 5. Gate.io
                const res = await fetch(`https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=BTC_USDT&interval=1m&limit=${limit}`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
                const data = await res.json();
                return data.map((k: any) => ({ t: parseInt(k[0]), v: parseFloat(k[2]) }));
            },
            async () => { // 6. Bitget
                const res = await fetch(`https://api.bitget.com/api/v2/spot/market/history-candles?symbol=BTCUSDT&granularity=1min&limit=${limit}`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
                const data = await res.json();
                return data.data.map((k: any) => ({ t: Math.floor(parseInt(k[0]) / 1000), v: parseFloat(k[4]) }));
            },
            async () => { // 7. HTX (Huobi)
                const res = await fetch(`https://api.huobi.pro/market/history/kline?symbol=btcusdt&period=1min&size=${limit}`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
                const data = await res.json();
                return data.data.map((k: any) => ({ t: k.id, v: k.close }));
            },
            async () => { // 8. OKX
                const res = await fetch(`https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1m&limit=${limit}`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
                const data = await res.json();
                return data.data.map((k: any) => ({ t: Math.floor(parseInt(k[0]) / 1000), v: parseFloat(k[4]) }));
            },
            async () => { // 9. Bitmart
                const res = await fetch(`https://api-cloud.bitmart.com/spot/quotation/v3/klines?symbol=BTC_USDT&before=${Math.floor(Date.now() / 1000)}&after=${Math.floor(Date.now() / 1000) - 7200}&step=1`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
                const data = await res.json();
                return data.data.map((k: any) => ({ t: parseInt(k[0]), v: parseFloat(k[4]) }));
            },
            async () => { // 10. DigiFinex
                const res = await fetch(`https://openapi.digifinex.com/v3/spot/kline?symbol=BTC_USDT&period=1&limit=${limit}`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
                const data = await res.json();
                return data.data.map((k: any) => ({ t: k[0], v: k[4] }));
            }
        ];

        const results = await Promise.allSettled(fetchers.map(f => f()));
        const priceGroups: Record<number, number[]> = {};

        results.forEach(res => {
            if (res.status === 'fulfilled' && Array.isArray(res.value)) {
                res.value.forEach((p: any) => {
                    const t = p.t;
                    if (!priceGroups[t]) priceGroups[t] = [];
                    priceGroups[t].push(p.v);
                });
            }
        });

        const sortedTimestamps = Object.keys(priceGroups).map(Number).sort((a, b) => a - b);
        const history = sortedTimestamps.map(t => {
            const vals = priceGroups[t];
            vals.sort((a, b) => a - b);
            const mid = Math.floor(vals.length / 2);
            const medianPrice = vals.length % 2 !== 0 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
            return { time: t, value: medianPrice };
        });

        return NextResponse.json({
            history: history.slice(-limit),
            source: "standard_10_cex_median",
            sources_count: results.filter(r => r.status === 'fulfilled').length,
            timestamp: Math.floor(Date.now() / 1000)
        });

    } catch (err: any) {
        return NextResponse.json({ history: [], error: err.message }, { status: 200 });
    }
}
