"use client";

import { useMarket } from "@/hooks/useMarket";
import { formatUnits } from "viem";
import { useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import PredictionMarketABI from "@/abis/PredictionMarket.json";

interface Props {
    address: `0x${string}`;
    position: { yesBet: bigint; noBet: bigint; claimed: boolean };
    resolved: boolean;
    user: `0x${string}`;
}

export function PredictionMarketCard({ address, position, resolved, user }: Props) {
    const { marketInfo, isLoading } = useMarket(address);
    const { writeContractAsync } = useWriteContract();

    const [isClaiming, setIsClaiming] = useState(false);
    const [txHash, setTxHash] = useState<`0x${string}` | null>(null);

    const { isLoading: isWaiting } = useWaitForTransactionReceipt({
        hash: txHash ?? undefined,
    });

    if (isLoading || !marketInfo) {
        return (
            <div style={{ padding: "24px", background: "var(--bg-card)", borderRadius: "16px", border: "1px solid var(--border)", opacity: 0.5 }}>
                Loading market details...
            </div>
        );
    }

    const totalBet = position.yesBet + position.noBet;

    // Determine outcomes conditionally if resolved
    let userWon = false;
    if (resolved) {
        // Did the user bet on the winning side?
        // marketInfo.result = true means YES won, false means NO won
        if (marketInfo.result && position.yesBet > 0n) userWon = true;
        if (!marketInfo.result && position.noBet > 0n) userWon = true;
    }

    const handleClaim = async () => {
        try {
            setIsClaiming(true);
            const hash = await writeContractAsync({
                address,
                abi: PredictionMarketABI,
                functionName: "claim",
            });
            setTxHash(hash);
            // It will refetch naturally via wagmi polling or the user can refresh
        } catch (err: any) {
            console.error("Claim failed:", err);
            alert("Claim failed: " + (err.shortMessage || err.message));
        } finally {
            setIsClaiming(false);
        }
    };

    return (
        <div style={{
            padding: "24px",
            background: "var(--bg-card)",
            borderRadius: "16px",
            border: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: "16px"
        }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: "18px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                        {marketInfo.question}
                    </h3>
                    {resolved && (
                        <div style={{ marginTop: "6px", fontSize: "13px", color: "var(--text-muted)" }}>
                            Settlement Price: <span style={{ fontFamily: "monospace", color: "var(--text-secondary)" }}>${parseFloat(formatUnits(marketInfo.settlementPrice, 8)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                    )}
                </div>

                <div style={{ marginLeft: "16px" }}>
                    {resolved ? (
                        marketInfo.result ? (
                            <span style={{ padding: "4px 8px", background: "rgba(34,197,94,0.1)", color: "var(--accent-yes)", borderRadius: "6px", fontSize: "12px", fontWeight: 700 }}>✅ YES Won</span>
                        ) : (
                            <span style={{ padding: "4px 8px", background: "rgba(239,68,68,0.1)", color: "var(--accent-no)", borderRadius: "6px", fontSize: "12px", fontWeight: 700 }}>❌ NO Won</span>
                        )
                    ) : (
                        <span style={{ padding: "4px 8px", background: "rgba(99,102,241,0.1)", color: "var(--accent-blue)", borderRadius: "6px", fontSize: "12px", fontWeight: 700 }}>⏳ Live</span>
                    )}
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "rgba(255,255,255,0.03)", padding: "16px", borderRadius: "12px" }}>
                <div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>My Position</div>
                    <div style={{ display: "flex", gap: "12px" }}>
                        {position.yesBet > 0n && (
                            <span style={{ color: "var(--accent-yes)", fontWeight: 700 }}>
                                YES: {parseFloat(formatUnits(position.yesBet, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT
                            </span>
                        )}
                        {position.noBet > 0n && (
                            <span style={{ color: "var(--accent-no)", fontWeight: 700 }}>
                                NO: {parseFloat(formatUnits(position.noBet, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT
                            </span>
                        )}
                    </div>
                </div>

                <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>Status</div>
                    {resolved ? (
                        userWon ? (
                            position.claimed ? (
                                <div style={{ color: "var(--text-muted)", fontWeight: 600 }}>Claimed</div>
                            ) : (
                                <button
                                    onClick={handleClaim}
                                    disabled={isClaiming || isWaiting}
                                    style={{
                                        background: "linear-gradient(135deg, #10b981, #059669)",
                                        color: "white",
                                        border: "none",
                                        padding: "6px 16px",
                                        borderRadius: "8px",
                                        fontWeight: 700,
                                        cursor: isClaiming || isWaiting ? "not-allowed" : "pointer",
                                        opacity: isClaiming || isWaiting ? 0.7 : 1
                                    }}
                                >
                                    {isClaiming || isWaiting ? "Claiming..." : "🏆 Claim Winnings"}
                                </button>
                            )
                        ) : (
                            <div style={{ color: "var(--accent-no)", fontWeight: 600 }}>Lost</div>
                        )
                    ) : (
                        <div style={{ color: "var(--text-muted)" }}>Waiting for resolution...</div>
                    )}
                </div>
            </div>
        </div>
    );
}
