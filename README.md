# SKY Market — Decentralized BTC Prediction Market

> A Polymarket-inspired on-chain prediction market on Ethereum Sepolia testnet.  
> Built with Solidity, Next.js 14, wagmi v2, viem, RainbowKit, CCXT, and Binance WebSocket.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-sky--market--alpha.vercel.app-brightgreen)](https://sky-market-alpha.vercel.app)
[![Sepolia](https://img.shields.io/badge/Network-Sepolia%20Testnet-blue)](https://sepolia.etherscan.io)

---

## 🚀 What is SKY Market?

SKY Market lets users bet on whether **BTC/USD will be above or below a target price** at a specific time. Markets run on a fully automated schedule — no manual intervention needed.

- **Hourly Markets** — Betting closes 10 minutes before end
- **Daily Markets** — Betting closes 12 hours before midnight UTC

Markets are created, managed, and resolved entirely on-chain by an automated bot.

---

## ✨ Key Features

| Feature | Description |
|---|---|
| **On-Chain Settlement** | Markets resolved via `resolveWithCustomPrice()` using a median price from 10 CEXes |
| **Real-Time Chart** | 3-layer chart: CCXT 10-CEX history + Binance REST gap fill + Binance WebSocket live candle |
| **Time-Gated Betting** | Betting windows close before settlement to prevent last-second sniping |
| **Platform Fee** | 1% fee paid upfront in ETH per bet. Winners claim 100% proportional payout |
| **Faucet** | Claim free SkyUSDT to start betting |
| **Portfolio History** | View all past bets and claim winnings |
| **Auto-Scheduler Bot** | PM2 daemon creates and resolves all markets on schedule |
| **Price Parity** | Bot resolution uses same Vercel-deployed median price as the chart live dot |

---

## 📁 Project Structure

```
sky-market/
├── contracts/
│   ├── IPriceOracle.sol        ← Swappable oracle interface
│   ├── ChainlinkOracle.sol     ← Chainlink BTC/USD fallback
│   ├── PredictionMarket.sol    ← Core market: betting, resolution, payouts
│   ├── MarketFactory.sol       ← Factory tracking all deployed markets
│   └── SkyUSDT.sol             ← Mock ERC-20 faucet token
├── scripts/
│   ├── deploy.ts               ← Deploy all contracts to Sepolia
│   └── auto-market.ts          ← PM2 bot: auto-create & resolve markets
├── frontend/
│   ├── app/
│   │   ├── page.tsx            ← Live Markets grid
│   │   ├── history/            ← User portfolio & settled bets
│   │   └── market/[address]/   ← Market detail + betting panel
│   ├── components/
│   │   ├── BtcChart.tsx        ← Real-time SVG price chart
│   │   ├── BetPanel.tsx        ← Bet UI + approval flow
│   │   ├── Navbar.tsx          ← Navigation + wallet connect
│   │   └── FaucetModal.tsx     ← Faucet claim modal
│   └── app/api/
│       ├── price/route.ts      ← Live price: median from 10 CEXes
│       └── history/route.ts    ← OHLCV history with `since` param
├── ecosystem.config.js         ← PM2 configuration
└── hardhat.config.ts
```

---

## 🛠 Prerequisites

- **Node.js** v18+
- **MetaMask** connected to Sepolia Testnet → [Get test ETH](https://sepoliafaucet.com)
- **Sepolia RPC** from [Infura](https://infura.io) or [Alchemy](https://alchemy.com)
- **WalletConnect ID** from [WalletConnect Cloud](https://cloud.walletconnect.com)

---

## 1️⃣ Setup Environment

```bash
# Root .env (for bot and Hardhat)
cp .env.example .env
```

```env
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
PRIVATE_KEY=0xyour_wallet_private_key
NEXT_PUBLIC_FACTORY_ADDRESS=0x...
```

---

## 2️⃣ Deploy Contracts

```bash
npm install
npx hardhat compile
npx hardhat run scripts/deploy.ts --network sepolia
```

Save the addresses printed to console, then fill them into `.env`.

---

## 3️⃣ Run Frontend

```bash
cd frontend
cp .env.local.example .env.local
# Fill in contract addresses and WalletConnect project ID
npm run dev
```

Visit `http://localhost:3000`

---

## 4️⃣ Run Market Bot (PM2)

The bot automatically creates Hourly and Daily markets and resolves them at end time.

```bash
# From root directory
pm2 start ecosystem.config.js
pm2 logs sky-market-scheduler
```

The bot runs on a **60-second sweep** cycle:
1. Scans all markets on-chain
2. Resolves any expired markets with the median BTC price at that exact end time
3. Creates new Hourly and Daily markets if none exist for the next target window

---

## 5️⃣ Deploy to Vercel

1. Import the GitHub repo to [Vercel](https://vercel.com)
2. Set **Root Directory** → `frontend`
3. Add environment variables from `.env.local`
4. Deploy

---

## 📐 Architecture

```
User Browser
    │
    ├── wagmi/viem  →  Sepolia RPC (read contract state)
    ├── /api/price  →  10 CEX median (CCXT) — live dot
    ├── /api/history?since= →  10 CEX OHLCV (CCXT) — main history
    ├── Binance REST API  →  Gap fill (recent 30-60 candles)
    └── Binance WebSocket →  Live current candle (real-time)

PM2 Bot (auto-market.ts)
    │
    ├── factory.getAllMarkets()  →  scan on-chain
    ├── /api/history (Vercel)   →  get snapshot price at market end
    └── market.resolveWithCustomPrice(price)  →  settle on-chain
```

---

## 💰 Fee Structure

| Action | Fee |
|---|---|
| Place Bet | 1% of bet amount, paid in ETH upfront |
| Claim Winnings | Free — 100% proportional payout |
| Lose | Original bet stays in the losing pool |

---

## 🔗 Resources

| Resource | Link |
|---|---|
| Live App | [sky-market-alpha.vercel.app](https://sky-market-alpha.vercel.app) |
| Sepolia Faucet | [sepoliafaucet.com](https://sepoliafaucet.com) |
| Sepolia Explorer | [sepolia.etherscan.io](https://sepolia.etherscan.io) |
| Chainlink Feeds | [docs.chain.link](https://docs.chain.link/data-feeds/price-feeds/addresses?network=ethereum&page=1#sepolia-testnet) |
