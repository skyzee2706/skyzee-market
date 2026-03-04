# Run Frontend

## 1. Navigate to Frontend

```bash
cd frontend
```

## 2. Configure Environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_FACTORY_ADDRESS=0x...        # From deploy output
NEXT_PUBLIC_TOKEN_ADDRESS=0x...          # SkyUSDT address
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=... # From WalletConnect Cloud
```

## 3. Install and Run

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`

---

## Deploy to Vercel

See [Deploy to Vercel](deploy-to-vercel.md) for production deployment.
