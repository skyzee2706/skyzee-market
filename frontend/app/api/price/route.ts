import { NextResponse } from 'next/server';

export const revalidate = 0;

/**
 * BTC/USD Price API - 10-CEX Unified Median Engine
 * Exact same 10 sources used for History, Live Price, and Settlement.
 */
export async function GET() {
    try {
        const timeout = 2500;
        const fetchers = [
            async () => { // 1. Binance
                const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT", { cache: "no-store", signal: AbortSignal.timeout(timeout) });
                const data = await res.json();
                return Number(data.price);
            },
            async () => { // 2. Bybit
                const res = await fetch("https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT", { cache: "no-store", signal: AbortSignal.timeout(timeout) });
                const data = await res.json();
                return Number(data.result.list[0].lastPrice);
            },
            async () => { // 3. MEXC
                const res = await fetch("https://api.mexc.com/api/v3/ticker/price?symbol=BTCUSDT", { cache: "no-store", signal: AbortSignal.timeout(timeout) });
                const data = await res.json();
                return Number(data.price);
            },
            async () => { // 4. KuCoin
                const res = await fetch("https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=BTC-USDT", { cache: "no-store", signal: AbortSignal.timeout(timeout) });
                const data = await res.json();
                return Number(data.data.price);
            },
            async () => { // 5. Gate.io
                const res = await fetch("https://api.gateio.ws/api/v4/spot/tickers?currency_pair=BTC_USDT", { cache: "no-store", signal: AbortSignal.timeout(timeout) });
                const data = await res.json();
                return Number(data[0].last);
            },
            async () => { // 6. Bitget
                const res = await fetch("https://api.bitget.com/api/v2/spot/market/tickers?symbol=BTCUSDT", { cache: "no-store", signal: AbortSignal.timeout(timeout) });
                const data = await res.json();
                return Number(data.data[0].lastPr);
            },
            async () => { // 7. HTX (Huobi)
                const res = await fetch("https://api.huobi.pro/market/trade?symbol=btcusdt", { cache: "no-store", signal: AbortSignal.timeout(timeout) });
                const data = await res.json();
                return Number(data.tick.data[0].price);
            },
            async () => { // 8. OKX
                const res = await fetch("https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT", { cache: "no-store", signal: AbortSignal.timeout(timeout) });
                const data = await res.json();
                return Number(data.data[0].last);
            },
            async () => { // 9. Bitmart
                const res = await fetch("https://api-cloud.bitmart.com/spot/quotation/v3/ticker?symbol=BTC_USDT", { cache: "no-store", signal: AbortSignal.timeout(timeout) });
                const data = await res.json();
                return Number(data.data.last);
            },
            async () => { // 10. DigiFinex
                const res = await fetch("https://openapi.digifinex.com/v3/spot/ticker?symbol=BTC_USDT", { cache: "no-store", signal: AbortSignal.timeout(timeout) });
                const data = await res.json();
                return Number(data.ticker[0].last);
            }
        ];

        const results = await Promise.allSettled(fetchers.map(f => f()));
        const prices: number[] = [];

        results.forEach(res => {
            if (res.status === 'fulfilled' && res.value && res.value > 10000) {
                prices.push(res.value);
            }
        });

        if (prices.length === 0) throw new Error("Price sources unreachable");

        // Calculate Median
        prices.sort((a, b) => a - b);
        const mid = Math.floor(prices.length / 2);
        const medianPrice = prices.length % 2 !== 0 ? prices[mid] : (vals: any) => (prices[mid - 1] + prices[mid]) / 2;
        const finalPrice = typeof medianPrice === 'function' ? medianPrice() : medianPrice;

        return NextResponse.json({
            price: finalPrice,
            sources: prices.length,
            timestamp: Math.floor(Date.now() / 1000)
        });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
