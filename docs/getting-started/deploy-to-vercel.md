# Deploy to Vercel

SKY Market's frontend lives in the `frontend/` subdirectory. You must configure the Root Directory in Vercel.

## Steps

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) → **Add New Project**
3. Import your GitHub repository
4. Under **Root Directory**, type: `frontend`
5. Framework preset: **Next.js** (auto-detected)
6. Add Environment Variables:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_FACTORY_ADDRESS` | Your deployed factory address |
| `NEXT_PUBLIC_TOKEN_ADDRESS` | SkyUSDT contract address |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect project ID |

7. Click **Deploy**

Your app will be live at `https://your-project.vercel.app`

> Note: The bot (`auto-market.ts`) **cannot run on Vercel** — it must run on a separate server (local machine, VPS, etc.) using PM2.
