# Skyzee Market — Web3 Prediction Market dApp

> A Polymarket-inspired decentralized prediction market running on the Ethereum Sepolia testnet.  
> Built with Solidity 0.8.20, Chainlink Oracles, Next.js 14, wagmi v2, viem, and RainbowKit.

---

## 🚀 Key Features

- **On-Chain Truth:** All markets are resolved deterministically using Chainlink Price Feeds (BTC/USD and ETH/USD).
- **Time-Gated Betting Windows:** Betting closes dynamically *prior* to settlement (e.g., 15 mins before for hourly, 12 hours for daily) to prevent last-minute sniping and ensure fairness.
- **Transparent Settlement Tracking:** The exact fractional Chainlink precision price is saved permanently on-chain in `settlementPrice` when the market resolves.
- **Real-Time Oracle Integrations:** Natively fetches exact price movements via standard smart-contracts directly to the UI's live chart in real-time, completely wiping off-chain historical artifacts.
- **Resettable Volume Leaderboard:** Tracks trading volumes natively utilizing `BetPlaced` Event Logs directly from Web3, sortable and viewable instantly without centralized backend servers. 
- **Automated Market Bots:** Built-in Node/PM2 configurations (`auto-market.ts`) autonomously resolve expiring markets and indefinitely spin up matching recursive markets on automated schedules (Hourly, Daily, Weekly).

---

## 📁 Folder Structure

```
BOT WHITELIST/
├── contracts/
│   ├── IPriceOracle.sol        ← Swappable Oracle Interface 
│   ├── ChainlinkOracle.sol     ← Sepolia BTC/USD implementation
│   ├── PredictionMarket.sol    ← Core market logic, holds liquidity
│   ├── MarketFactory.sol       ← Factory contract tracking new markets
│   └── SkyUSDT.sol             ← Mock ERC-20 token for test betting
├── scripts/
│   ├── deploy.ts               ← Contract deployer 
│   ├── seed-markets.ts         ← Creates initial hourly/daily/weekly markets
│   ├── auto-market.ts          ← PM2 background scheduler bot
│   └── export-abi.js           ← Exports ABI bindings to Next.js
├── frontend/
│   ├── app/                    ← Next.js 14 App Router
│   │   ├── page.tsx            ← Live Markets Grid
│   │   ├── history/            ← User Portfolio & Settled bets
│   │   ├── leaderboard/        ← Top bettors ranked by Event Log volume
│   │   └── market/[address]/   ← Individual detail betting page
│   ├── components/
│   │   └── BtcChart.tsx        ← Realtime tracking oracle graph
│   └── .env.local.example      ← Next.js environment variables
├── package.json
└── hardhat.config.ts
```

---

## 🛠 Prerequisites

- **Node.js**: v18 or higher
- **Wallet**: MetaMask connected to Sepolia Testnet. (Get testnet ETH from [sepoliafaucet.com](https://sepoliafaucet.com))
- **RPC**: [Infura](https://infura.io) or [Alchemy](https://alchemy.com) URL
- **WalletConnect ID**: Setup a free project on [WalletConnect Cloud](https://cloud.walletconnect.com)

---

## 1️⃣ Deploy Contracts

Create your `.env` file in the root directory:
```bash
cp .env.example .env
```
Fill out `PRIVATE_KEY` and `SEPOLIA_RPC_URL` inside `.env`. Then run:

```bash
npm install
npx hardhat compile
npx hardhat run scripts/deploy.ts --network sepolia
```

This script deploys the Factory, Mock USDT, and Oracle. **Save the addresses printed out in the console.**

---

## 2️⃣ Run Frontend

Navigate to `frontend/`:
```bash
cd frontend
cp .env.local.example .env.local
```

Inside `.env.local`, map the environment variables based on the deploy output:
- `NEXT_PUBLIC_FACTORY_ADDRESS=0x...`
- `NEXT_PUBLIC_TOKEN_ADDRESS=0x...`
- `NEXT_PUBLIC_ORACLE_ADDRESS=0x...`
- `NEXT_PUBLIC_ETH_ORACLE_ADDRESS=0x...`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...`

Start the Next.js app:
```bash
npm run dev
```

---

## 3️⃣ Run Autopilot Bots (PM2 Scheduler)

You do not need to manually create and resolve markets. The system ships with PM2 integration.

```bash
cd .. # Back to root dir
npx ts-node scripts/seed-markets.ts  # Seeds the very first batch of active markets
npx pm2 start auto-market.bat --name auto-market # Starts the recursive checking bot
```

The daemon will now run silently. It checks active markets every 60 seconds. When `endTime` passes, it triggers `resolve()` automatically and spins up the identical market for the next cycle.

---

## 4️⃣ Architectural Summary & Fees

- **Platform Fee**: **1%** on net winnings only. 
- Original bets are returned cleanly. The owner account can invoke `withdrawFees()` to sweep platform revenue.
- **Oracle Upgrade Path**: If transitioning to an alt oracle (e.g. Rialo), just deploy an implementation of `IPriceOracle.sol` and call `MarketFactory.setOracle(addr)`. PredictionMarket contracts are intrinsically agnostic.

| Link | Resource |
|---|---|
| Faucet | [sepoliafaucet.com](https://sepoliafaucet.com) |
| Explorer | [Sepolia Etherscan](https://sepolia.etherscan.io) |
| Price Feeds | [Chainlink Testnet](https://docs.chain.link/data-feeds/price-feeds/addresses?network=ethereum&page=1#sepolia-testnet) |
