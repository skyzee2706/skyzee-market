import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Web3Provider } from "./providers/Web3Provider";
import { Navbar } from "@/components/Navbar";
import { SignInModal } from "@/components/SignInModal";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Sky Market — Prediction Markets on Sepolia",
  description:
    "Decentralized predictions. On-chain truth. Sky Market dApp running on Ethereum Sepolia testnet.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body style={{ background: "var(--bg-primary)" }}>
        <Web3Provider>
          <Navbar />
          <SignInModal />
          <main style={{ minHeight: "calc(100vh - 64px)" }}>{children}</main>
          <footer
            style={{
              textAlign: "center",
              padding: "24px",
              color: "var(--text-muted)",
              fontSize: "12px",
              borderTop: "1px solid var(--border)",
            }}
          >
            Sky Market Alpha · Sepolia Testnet · 1% Upfront Fee Paid in ETH
          </footer>
        </Web3Provider>
      </body>
    </html>
  );
}
