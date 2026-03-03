import { NextResponse } from 'next/server';

export const revalidate = 0;

/**
 * Unified Price API - 10+ Source Median Engine
 * Aggregates BTC/USD price from top CEXs, DEXs, and Oracles (Pyth).
 * This logic is MIRRORED in the bot to ensure 100% parity.
 */
export async function GET() {
    try {
        const timeout = 2500;
        const fetchers = [
            // 1. Pyth Network (Hermes)
            async () => {
                const res = await fetch("https://hermes.pyth.network/v2/updates/price/latest?ids[]=0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43", { cache: "no-store", signal: AbortSignal.timeout(timeout) });
                const data = await res.json();
                return Number(data.parsed[0].price.price) * Math.pow(10, data.parsed[0].price.expo);
            },
            // 2. Binance
            async () => {
                const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT", { cache: "no-store", signal: AbortSignal.timeout(timeout) });
                const data = await res.json();
                return Number(data.price);
            },
            // 3. Bybit
            async () => {
                const res = await fetch("https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT", { cache: "no-store", signal: AbortSignal.timeout(timeout) });
                const data = await res.json();
                return Number(data.result.list[0].lastPrice);
            },
            // 4. MEXC
            async () => {
                const res = await fetch("https://api.mexc.com/api/v3/ticker/price?symbol=BTCUSDT", { cache: "no-store", signal: AbortSignal.timeout(timeout) });
                const data = await res.json();
                return Number(data.price);
            },
            // 5. KuCoin
            async () => {
                const res = await fetch("https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=BTC-USDT", { cache: "no-store", signal: AbortSignal.timeout(timeout) });
                const data = await res.json();
                return Number(data.data.price);
            },
            // 6. Gate.io
            async () => {
                const res = await fetch("https://api.gateio.ws/api/v4/spot/tickers?currency_pair=BTC_USDT", { cache: "no-store", signal: AbortSignal.timeout(timeout) });
                const data = await res.json();
                return Number(data[0].last);
            },
            // 7. Bitget
            async () => {
                const res = await fetch("https://api.bitget.com/api/v2/spot/market/tickers?symbol=BTCUSDT", { cache: "no-store", signal: AbortSignal.timeout(timeout) });
                const data = await res.json();
                return Number(data.data[0].lastPr);
            },
            // 8. HTX (Huobi)
            async () => {
                const res = await fetch("https://api.huobi.pro/market/trade?symbol=btcusdt", { cache: "no-store", signal: AbortSignal.timeout(timeout) });
                const data = await res.json();
                return Number(data.tick.data[0].price);
            },
            // 9. OKX
            async () => {
                const res = await fetch("https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT", { cache: "no-store", signal: AbortSignal.timeout(timeout) });
                const data = await res.json();
                return Number(data.data[0].last);
            },
            // 10. CoinGecko
            async () => {
                const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd", { cache: "no-store", signal: AbortSignal.timeout(timeout) });
                const data = await res.json();
                return Number(data.bitcoin.usd);
            }
        ];

        const results = await Promise.allSettled(fetchers.map(f => f()));
        const prices: number[] = [];

        results.forEach(res => {
            if (res.status === 'fulfilled' && res.value && res.value > 10000) { // basic sanity check
                prices.push(res.value);
            }
        });

        if (prices.length === 0) {
            throw new Error("All price sources unreachable");
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
