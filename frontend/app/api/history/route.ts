import { NextResponse } from 'next/server';

export const revalidate = 0;

export async function GET() {
    try {
        // Fetch last 120 minutes of 1m klines from Binance
        // Format: [[open_time, open, high, low, close, volume, close_time, ...], ...]
        const binanceRes = await fetch("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=120", {
            cache: "no-store",
            next: { revalidate: 0 }
        });

        if (!binanceRes.ok) {
            throw new Error(`Binance API failed: ${binanceRes.statusText}`);
        }

        const klines = await binanceRes.json();

        // Map to {time, value} format
        const history = klines.map((k: any) => ({
            time: Math.floor(k[0] / 1000), // open time in seconds
            value: parseFloat(k[4])       // closing price
        }));

        return NextResponse.json({
            history,
            source: "binance_api",
            timestamp: Math.floor(Date.now() / 1000)
        });

    } catch (err: any) {
        console.error("Error providing price history:", err);
        return NextResponse.json({
            history: [],
            source: "error",
            message: err.message
        }, { status: 200 });
    }
}
