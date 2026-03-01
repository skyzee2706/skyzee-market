"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useSwitchChain, useChainId } from "wagmi";
import { sepolia } from "wagmi/chains";
import { formatUnits } from "viem";
import Link from "next/link";
import { useState } from "react";
import { useTokenBalance } from "@/hooks/useUSDT";
import { FaucetModal } from "./FaucetModal";

export function Navbar() {
    const { address, isConnected } = useAccount();
    const chainId = useChainId();
    const { switchChain } = useSwitchChain();
    const { balance: usdtBalance, refetch } = useTokenBalance(address);
    const [showFaucet, setShowFaucet] = useState(false);

    const isWrongChain = isConnected && chainId !== sepolia.id;

    return (
        <>
            <nav
                style={{
                    height: "64px",
                    background: "var(--bg-secondary)",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0 24px",
                    position: "sticky",
                    top: 0,
                    zIndex: 50,
                    backdropFilter: "blur(12px)",
                }}
            >
                {/* Logo */}
                <Link href="/" style={{ textDecoration: "none" }}>
                    <span
                        style={{
                            fontSize: "22px",
                            fontWeight: 700,
                            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            letterSpacing: "-0.5px",
                        }}
                    >
                        Sky Market
                    </span>
                    <span
                        style={{
                            fontSize: "11px",
                            color: "var(--text-muted)",
                            marginLeft: "8px",
                            fontWeight: 500,
                        }}
                    >
                        Alpha Test
                    </span>
                </Link>

                <div style={{ display: "flex", gap: "24px", alignItems: "center", marginLeft: "32px", flex: 1 }}>
                    <Link
                        href="/history"
                        style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "14px", fontWeight: 600, letterSpacing: "0.5px", transition: "color 0.2s" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
                    >
                        Portfolio
                    </Link>
                    <Link
                        href="/leaderboard"
                        style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "14px", fontWeight: 600, letterSpacing: "0.5px", transition: "color 0.2s" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
                    >
                        🏆 Leaderboard
                    </Link>
                </div>

                {/* Right Actions */}
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    {/* Wrong chain warning */}
                    {isWrongChain && (
                        <button
                            onClick={() => switchChain({ chainId: sepolia.id })}
                            style={{
                                background: "rgba(239,68,68,0.15)",
                                border: "1px solid rgba(239,68,68,0.4)",
                                color: "#ef4444",
                                borderRadius: "8px",
                                padding: "6px 14px",
                                fontSize: "13px",
                                cursor: "pointer",
                                fontWeight: 600,
                                transition: "all 0.2s",
                            }}
                        >
                            ⚠️ Switch to Sepolia
                        </button>
                    )}

                    {/* Faucet button */}
                    {isConnected && !isWrongChain && (
                        <button
                            onClick={() => setShowFaucet(true)}
                            style={{
                                background: "rgba(99,102,241,0.12)",
                                border: "1px solid rgba(99,102,241,0.3)",
                                color: "var(--accent-blue)",
                                borderRadius: "8px",
                                padding: "6px 14px",
                                fontSize: "13px",
                                cursor: "pointer",
                                fontWeight: 600,
                                transition: "all 0.2s",
                            }}
                        >
                            🚰 Faucet
                        </button>
                    )}

                    {/* USDT Balance */}
                    {isConnected && !isWrongChain && (
                        <span
                            style={{
                                fontSize: "13px",
                                color: "var(--text-secondary)",
                                background: "var(--bg-card)",
                                border: "1px solid var(--border)",
                                borderRadius: "8px",
                                padding: "6px 12px",
                                fontFamily: "monospace",
                                fontWeight: 600,
                            }}
                        >
                            {parseFloat(formatUnits(usdtBalance, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT
                        </span>
                    )}

                    <ConnectButton
                        accountStatus="address"
                        chainStatus="none"
                        showBalance={false}
                    />
                </div>
            </nav>

            {showFaucet && (
                <FaucetModal
                    onClose={() => setShowFaucet(false)}
                    onSuccess={() => refetch()}
                />
            )}
        </>
    );
}
