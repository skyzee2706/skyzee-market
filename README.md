# Rial Market — Prediction Market dApp on Sepolia

> Polymarket-inspired Web3 prediction market running on Ethereum Sepolia testnet.  
> Built with Solidity 0.8.20, Chainlink oracles, Next.js 14, wagmi v2, viem, and RainbowKit.

---

## Folder Structure

```
BOT WHITELIST/
├── contracts/
│   ├── IPriceOracle.sol        ← Oracle interface (the upgrade seam)
│   ├── ChainlinkOracle.sol     ← Sepolia BTC/USD implementation
│   ├── PredictionMarket.sol    ← Core market logic
│   ├── MarketFactory.sol       ← Deploys & tracks markets
│   └── test/
│       └── MockOracle.sol      ← Test mock only
├── scripts/
│   ├── deploy.ts               ← Deploys all contracts to Sepolia
│   └── export-abi.js           ← Copies ABIs to frontend
├── test/
│   └── PredictionMarket.test.ts
├── hardhat.config.ts
├── tsconfig.json
├── .env.example
├── package.json
└── frontend/
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx              ← Market grid homepage
    │   ├── globals.css
    │   ├── providers/
    │   │   └── Web3Provider.tsx
    │   └── market/[address]/
    │       └── page.tsx          ← Individual market page
    ├── components/
    │   ├── Navbar.tsx
    │   ├── MarketCard.tsx
    │   └── BetPanel.tsx
    ├── hooks/
    │   ├── useMarket.ts
    │   └── useFactory.ts
    ├── abis/                     ← Auto-generated after compile
    ├── next.config.ts
    └── .env.local.example
```

---

## Prerequisites

- Node.js ≥ 18
- MetaMask with Sepolia ETH (get from [sepoliafaucet.com](https://sepoliafaucet.com))
- [Infura](https://infura.io) or [Alchemy](https://alchemy.com) Sepolia RPC URL
- [Etherscan](https://etherscan.io) API key (for verification, optional)
- [WalletConnect Cloud](https://cloud.walletconnect.com) Project ID

---

## 1. Deploy Contracts

### Setup

```powershell
cd "d:\ZIAN\Garapan\BOT WHITELIST"

# Copy and fill in your keys
cp .env.example .env
# Edit .env: PRIVATE_KEY, SEPOLIA_RPC_URL, ETHERSCAN_API_KEY

npm install
```

### Compile

```powershell
npx hardhat compile
```

### Run Tests (local)

```powershell
npx hardhat test
```

### Deploy to Sepolia

```powershell
npx hardhat run scripts/deploy.ts --network sepolia
```

Output will print:
```
NEXT_PUBLIC_FACTORY_ADDRESS=0x...
ORACLE_ADDRESS=0x...
SAMPLE_MARKET=0x...
```

### Export ABIs to Frontend

```powershell
node scripts/export-abi.js
```

This copies `PredictionMarket.json` and `MarketFactory.json` to `frontend/abis/`.

---

## 2. Run Frontend

```powershell
cd "d:\ZIAN\Garapan\BOT WHITELIST\frontend"

# Copy and fill env
cp .env.local.example .env.local
# Edit .env.local:
#   NEXT_PUBLIC_FACTORY_ADDRESS=0x... (from deploy output)
#   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...

npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 3. Create a Market (via Hardhat console)

```powershell
npx hardhat console --network sepolia
```

```js
const factory = await ethers.getContractAt("MarketFactory", "0xYOUR_FACTORY");

// Strike: $60,000 = 60000 * 1e8 (Chainlink 8-decimal format)
// endTime: 7 days from now
const endTime = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

await factory.createMarket(
  "BTC will close below $60,000 USD this week",
  60_000n * 10n ** 8n,
  endTime
);
```

---

## 4. Resolve a Market

Anyone can call `resolve()` after `endTime`. It fetches the Chainlink price on-chain.

```js
const market = await ethers.getContractAt("PredictionMarket", "0xMARKET_ADDR");
await market.resolve();
```

Or use the **⚡ Resolve Market** button on the market page in the UI.

---

## 5. Platform Fee

- Fee = **1%** on winnings only
- Original bet is always returned in full
- Fees accumulate in the `PredictionMarket` contract
- Owner can call `withdrawFees()` to send fees to `feeWallet`

```solidity
uint256 public constant FEE_BPS = 100;   // 1%
uint256 public constant BPS     = 10000;
```

---

## 6. Oracle Upgrade Path (Chainlink → Rialo)

When Rialo testnet goes live:

1. Create `contracts/RialoOracle.sol`:
```solidity
contract RialoOracle is IPriceOracle {
    function getPrice() external view override returns (uint256) {
        // call Rialo feed here
    }
}
```

2. Deploy it:
```powershell
npx hardhat run scripts/deployRialoOracle.ts --network rialo
```

3. Update factory:
```js
await factory.setOracle("0xNEW_RIALO_ORACLE");
```

**No `PredictionMarket.sol` changes needed. All new markets use the new oracle automatically.**

---

## Smart Contract Architecture

```
MarketFactory
  ├── oracle: IPriceOracle  ← swappable
  ├── createMarket() → PredictionMarket[]
  └── setOracle()    ← upgrade seam

PredictionMarket (per market)
  ├── buyYes() / buyNo()   ← blocked after endTime
  ├── resolve()            ← calls oracle.getPrice(), once after endTime
  ├── claim()              ← pays winners, deducts 1% of winnings
  └── withdrawFees()       ← owner only

IPriceOracle (interface)
  └── getPrice() → uint256

ChainlinkOracle implements IPriceOracle
  └── Fetches BTC/USD from Chainlink Sepolia
      Feed: 0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43
```

---

## Useful Links

| Resource | Link |
|---|---|
| Sepolia Faucet | https://sepoliafaucet.com |
| Sepolia Etherscan | https://sepolia.etherscan.io |
| Chainlink Sepolia Feeds | https://docs.chain.link/data-feeds/price-feeds/addresses?network=ethereum&page=1#sepolia-testnet |
| WalletConnect Cloud | https://cloud.walletconnect.com |
| Infura | https://infura.io |
