const ccxt = require('ccxt');
async function test() {
    try {
        const mexc = new ccxt.mexc();
        console.log("MEXC loaded successfully");
        const binance = new ccxt.binance();
        console.log("Binance loaded successfully");
        console.log("CCXT is working!");
    } catch (e) {
        console.error("CCXT load failed:", e);
    }
}
test();
