"use client";

import { useAccount } from "wagmi";
import { useFactory } from "@/hooks/useFactory";
import { useUserHistory, useAllMarketsStatus, MarketInfo } from "@/hooks/useMarket";
import { formatUnits } from "viem";
import Link from "next/link";
import { PredictionMarketCard } from "./PredictionMarketCard"; // Will create a modular helper

export default function HistoryPage() {
    const { address: user } = useAccount();
    const { markets, isLoading: isFactoryLoading } = useFactory();
    const { statuses, isLoading: isStatusLoading } = useAllMarketsStatus(markets);
    const { positions, isLoading: isHistoryLoading } = useUserHistory(markets, user);

    const isLoading = isFactoryLoading || isStatusLoading || isHistoryLoading;

    if (!user) {
        return (
            <div style={{ textAlign: "center", padding: "100px 24px", color: "var(--text-muted)" }}>
                <h2>Connect your wallet to view history</h2>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div style={{ textAlign: "center", padding: "100px 24px", color: "var(--text-muted)" }}>
                <h2>Loading history...</h2>
            </div>
        );
    }

    // Filter only markets where the user has placed a bet
    const userMarkets = markets.filter(addr => {
        const pos = positions[addr];
        if (!pos) return false;
        return pos.yesBet > 0n || pos.noBet > 0n;
    });

    return (
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 24px" }}>
            <h1 style={{ fontSize: "36px", fontWeight: 800, marginBottom: "32px", color: "var(--text-primary)" }}>
                My Portfolio
            </h1>

            {userMarkets.length === 0 ? (
                <div style={{ textAlign: "center", padding: "80px 24px", border: "1px dashed var(--border)", borderRadius: "16px", color: "var(--text-muted)" }}>
                    <div style={{ fontSize: "48px", marginBottom: "16px" }}>🧾</div>
                    <p style={{ fontSize: "16px", marginBottom: "8px", color: "var(--text-secondary)" }}>No betting history yet</p>
                    <Link href="/" style={{ color: "var(--accent-blue)", textDecoration: "none", fontWeight: 600 }}>
                        ← Explore Active Markets
                    </Link>
                </div>
            ) : (
                <div style={{ display: "grid", gap: "20px" }}>
                    {userMarkets.map(addr => (
                        <PredictionMarketCard
                            key={addr}
                            address={addr}
                            position={positions[addr]}
                            resolved={statuses[addr]}
                            user={user}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
