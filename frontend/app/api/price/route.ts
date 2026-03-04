import { NextResponse } from 'next/server';
import ccxt from 'ccxt';

export const revalidate = 0;

// Initialize exchange instances outside to reuse connections
const exchanges: Record<string, any> = {
    binance: new ccxt.binance({ timeout: 5000 }),
    bybit: new ccxt.bybit({ timeout: 5000 }),
    mexc: new ccxt.mexc({ timeout: 5000 }),
    kucoin: new ccxt.kucoin({ timeout: 5000 }),
    gate: new ccxt.gate({ timeout: 5000 }),
    bitget: new ccxt.bitget({ timeout: 5000 }),
    okx: new ccxt.okx({ timeout: 5000 }),
    htx: new ccxt.htx({ timeout: 5000 }),
    bitmart: new ccxt.bitmart({ timeout: 5000 }),
    digifinex: new ccxt.digifinex({ timeout: 5000 })
};

export async function GET() {
    try {
        const exchangeIds = Object.keys(exchanges);

        const results = await Promise.allSettled(exchangeIds.map(async (id) => {
            try {
                const ticker = await exchanges[id].fetchTicker('BTC/USDT');
                return ticker.last;
            } catch (e) {
                return null;
            }
        }));

        const prices = results
            .filter((r): r is PromiseFulfilledResult<number> => r.status === 'fulfilled' && r.value !== null && r.value > 10000)
            .map(r => r.value);

        if (prices.length === 0) throw new Error("Price sources unreachable");

        prices.sort((a, b) => a - b);
        const mid = Math.floor(prices.length / 2);
        const finalPrice = prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;

        return NextResponse.json({
            price: finalPrice,
            sources: prices.length,
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
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
