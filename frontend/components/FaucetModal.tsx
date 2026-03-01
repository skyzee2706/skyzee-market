"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { isAddress } from "viem";
import { useFaucet, useCooldown } from "@/hooks/useUSDT";

interface Props {
    onClose: () => void;
    onSuccess: () => void;
}

export function FaucetModal({ onClose, onSuccess }: Props) {
    const { address: connectedWallet } = useAccount();
    const [mode, setMode] = useState<"self" | "other">("self");
    const [customAddr, setCustomAddr] = useState("");

    const recipient = (mode === "self"
        ? connectedWallet
        : (isAddress(customAddr) ? customAddr : undefined)) as `0x${string}` | undefined;

    const { claim, isPending, isConfirming, isSuccess, error } = useFaucet();
    const { seconds: cooldown, refetch: refetchCooldown } = useCooldown(recipient);

    useEffect(() => {
        if (isSuccess) {
            onSuccess();
            onClose();
        }
    }, [isSuccess, onSuccess, onClose]);

    const canClaim = !!recipient && cooldown === 0n && !isPending && !isConfirming;
    const isBusy = isPending || isConfirming;

    function formatCooldown(secs: bigint): string {
        const s = Number(secs);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
    }

    return (
        <div
            style={{
                position: "fixed", inset: 0, zIndex: 1000,
                background: "rgba(0,0,0,0.7)",
                backdropFilter: "blur(6px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "24px",
            }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div
                style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "24px",
                    padding: "32px",
                    width: "100%",
                    maxWidth: "440px",
                    boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
                }}
            >
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                    <div>
                        <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
                            🚰 Claim Faucet
                        </h2>
                        <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
                            Get 1,000 USDT — once every 24 hours
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: "var(--bg-secondary)", border: "1px solid var(--border)",
                            borderRadius: "8px", color: "var(--text-muted)",
                            cursor: "pointer", fontSize: "18px", padding: "4px 10px",
                        }}
                    >✕</button>
                </div>

                {/* Mode toggle */}
                <div
                    style={{
                        display: "flex", background: "var(--bg-secondary)",
                        borderRadius: "10px", padding: "4px", marginBottom: "20px",
                    }}
                >
                    {(["self", "other"] as const).map((m) => (
                        <button
                            key={m}
                            onClick={() => setMode(m)}
                            style={{
                                flex: 1, padding: "10px", borderRadius: "8px",
                                border: "none", cursor: "pointer", fontWeight: 700,
                                fontSize: "13px", transition: "all 0.2s",
                                background: mode === m ? "var(--accent-blue)" : "transparent",
                                color: mode === m ? "white" : "var(--text-muted)",
                            }}
                        >
                            {m === "self" ? "✅ My Wallet" : "📋 Other Address"}
                        </button>
                    ))}
                </div>

                {/* Self mode: show connected wallet */}
                {mode === "self" && (
                    <div
                        style={{
                            background: "var(--bg-secondary)", border: "1px solid var(--border)",
                            borderRadius: "10px", padding: "12px 16px",
                            fontFamily: "monospace", fontSize: "13px",
                            color: "var(--text-secondary)", marginBottom: "20px",
                        }}
                    >
                        {connectedWallet ? connectedWallet : (
                            <span style={{ color: "var(--text-muted)" }}>No wallet connected</span>
                        )}
                    </div>
                )}

                {/* Other mode: address input */}
                {mode === "other" && (
                    <div style={{ marginBottom: "20px" }}>
                        <label style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "6px", fontWeight: 600 }}>
                            Recipient Address
                        </label>
                        <input
                            type="text"
                            placeholder="0x..."
                            value={customAddr}
                            onChange={(e) => { setCustomAddr(e.target.value); refetchCooldown(); }}
                            style={{
                                width: "100%", padding: "12px 16px",
                                background: "var(--bg-secondary)",
                                border: `1px solid ${isAddress(customAddr) || !customAddr ? "var(--border)" : "#ef4444"}`,
                                borderRadius: "10px", color: "var(--text-primary)",
                                fontSize: "13px", fontFamily: "monospace", outline: "none",
                                boxSizing: "border-box",
                            }}
                        />
                        {customAddr && !isAddress(customAddr) && (
                            <p style={{ fontSize: "12px", color: "#ef4444", marginTop: "4px" }}>Invalid address</p>
                        )}
                    </div>
                )}

                {/* Cooldown warning */}
                {recipient && cooldown > 0n && (
                    <div
                        style={{
                            background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
                            borderRadius: "10px", padding: "12px 16px",
                            fontSize: "13px", color: "#f59e0b", marginBottom: "20px",
                        }}
                    >
                        ⏳ This address can claim again in <strong>{formatCooldown(cooldown)}</strong>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "12px", fontSize: "13px", color: "#ef4444", marginBottom: "16px" }}>
                        {(error as Error).message.slice(0, 120)}
                    </div>
                )}

                {/* Claim button */}
                <button
                    onClick={() => recipient && claim(recipient)}
                    disabled={!canClaim}
                    style={{
                        width: "100%", padding: "14px",
                        background: canClaim
                            ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
                            : "var(--bg-elevated)",
                        border: "none", borderRadius: "12px",
                        color: canClaim ? "white" : "var(--text-muted)",
                        fontSize: "15px", fontWeight: 700,
                        cursor: canClaim ? "pointer" : "not-allowed",
                        transition: "all 0.2s",
                    }}
                >
                    {isBusy ? "⏳ Claiming..." : "🚰 Claim 1,000 USDT"}
                </button>

                <p style={{ fontSize: "12px", color: "var(--text-muted)", textAlign: "center", marginTop: "12px" }}>
                    You pay the Sepolia gas fee. Limit: 1,000 USDT per address per 24h.
                </p>
            </div>
        </div>
    );
}
