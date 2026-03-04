# Deploy Contracts

## 1. Clone the Repository

```bash
git clone https://github.com/your-username/sky-market.git
cd sky-market
```

## 2. Install Dependencies

```bash
npm install
```

## 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
PRIVATE_KEY=0xYOUR_PRIVATE_KEY
```

> ⚠️ Never commit your `.env` file to Git. It is already in `.gitignore`.

## 4. Compile and Deploy

```bash
npx hardhat compile
npx hardhat run scripts/deploy.ts --network sepolia
```

Console output will print the deployed contract addresses:

```
✅ SkyUSDT deployed to: 0x...
✅ MarketFactory deployed to: 0x...
✅ ChainlinkOracle deployed to: 0x...
```

**Save these addresses** — you'll need them for the frontend and bot.

## 5. Update .env

Add the deployed addresses to your `.env`:

```env
NEXT_PUBLIC_FACTORY_ADDRESS=0x...
NEXT_PUBLIC_TOKEN_ADDRESS=0x...
```

---

Next → [Run Frontend](run-frontend.md)
