const axios = require('axios');

async function testSources() {
    const limit = 100;
    const sundayTs = Math.floor(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).getTime() / 1000); // approx 3 days ago

    const urls = [
        { name: "Binance", url: `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=${limit}` },
        { name: "MEXC", url: `https://api.mexc.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=${limit}` },
        { name: "Bybit", url: `https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=1&limit=${limit}` },
        { name: "Bitget", url: `https://api.bitget.com/api/v2/spot/market/history-candles?symbol=BTCUSDT&granularity=1min&limit=${limit}` },
        { name: "KuCoin", url: `https://api.kucoin.com/api/v1/market/candles?symbol=BTC-USDT&type=1min` }
    ];

    for (const s of urls) {
        try {
            const res = await axios.get(s.url, { timeout: 5000 });
            let count = 0;
            if (s.name === "Binance" || s.name === "MEXC") count = res.data.length;
            if (s.name === "Bybit") count = res.data.result.list.length;
            if (s.name === "Bitget") count = res.data.data.length;
            if (s.name === "KuCoin") count = res.data.data.length;
            console.log(`✅ ${s.name}: ${count} points`);
        } catch (e) {
            console.log(`❌ ${s.name} failed: ${e.message}`);
        }
    }
}

testSources();
