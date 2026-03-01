"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMarket } from "@/hooks/useMarket";
import { formatUnits } from "viem";

interface Props {
    address: `0x${string}`;
}

function useNow() {
    const [now, setNow] = useState<number | null>(null);
    useEffect(() => {
        setNow(Math.floor(Date.now() / 1000));
        const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
        return () => clearInterval(t);
    }, []);
    return now;
}

export function MarketCard({ address }: Props) {
    const { marketInfo, isLoading } = useMarket(address);
    const now = useNow();

    if (isLoading || !marketInfo || now === null) {
        return (
            <div
                style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "16px",
                    padding: "24px",
                    minHeight: "200px",
                    animation: "pulse 1.5s ease-in-out infinite",
                }}
            />
        );
    }

    const { question, endTime, resolved, result, yesPool, noPool, yesPrice } = marketInfo;
    const totalLiquidity = yesPool + noPool;
    const yesPct = Number(yesPrice) / 1e16; // 0–100
    const noPct = 100 - yesPct;

    const remaining = Number(endTime) - now;
    let countdown = "Ended";
    if (remaining > 0) {
        const d = Math.floor(remaining / 86400);
        const h = Math.floor((remaining % 86400) / 3600);
        const m = Math.floor((remaining % 3600) / 60);
        const s = remaining % 60;
        countdown = d > 0 ? `${d}d ${h}h` : `${h}h ${m}m ${s}s`;
    }

    const status = resolved
        ? result
            ? { label: "✅ YES Won", color: "var(--accent-yes)" }
            : { label: "❌ NO Won", color: "var(--accent-no)" }
        : remaining > 0
            ? { label: "🟢 Live", color: "var(--accent-yes)" }
            : { label: "⏳ Resolving", color: "var(--gold)" };

    return (
        <Link href={`/market/${address}`} style={{ textDecoration: "none" }}>
            <div
                style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "16px",
                    padding: "20px",
                    cursor: "pointer",
                    transition: "all 0.25s ease",
                    position: "relative",
                    overflow: "hidden",
                }}
                onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.borderColor = "var(--accent-blue)";
                    el.style.transform = "translateY(-3px)";
                    el.style.boxShadow = "0 8px 32px rgba(99,102,241,0.15)";
                }}
                onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.borderColor = "var(--border)";
                    el.style.transform = "translateY(0)";
                    el.style.boxShadow = "none";
                }}
            >
                {/* Status badge */}
                <div
                    style={{
                        display: "inline-block",
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "3px 10px",
                        borderRadius: "20px",
                        background: `${status.color}22`,
                        color: status.color,
                        border: `1px solid ${status.color}44`,
                        marginBottom: "12px",
                        letterSpacing: "0.3px",
                    }}
                >
                    {status.label}
                </div>

                {/* Question */}
                <p
                    style={{
                        fontSize: "15px",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        lineHeight: 1.5,
                        marginBottom: "16px",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                    }}
                >
                    {question}
                </p>

                {/* Odds bar */}
                <div style={{ marginBottom: "8px" }}>
                    <div
                        style={{
                            display: "flex",
                            height: "6px",
                            borderRadius: "3px",
                            overflow: "hidden",
                            background: "var(--border)",
                        }}
                    >
                        <div
                            className="odds-bar"
                            style={{
                                width: `${yesPct}%`,
                                background: "linear-gradient(90deg, #22c55e, #16a34a)",
                                borderRadius: "3px 0 0 3px",
                                transition: "width 0.6s ease",
                            }}
                        />
                        <div
                            style={{
                                flex: 1,
                                background: "linear-gradient(90deg, #ef4444, #b91c1c)",
                                borderRadius: "0 3px 3px 0",
                            }}
                        />
                    </div>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginTop: "6px",
                            fontSize: "13px",
                            fontWeight: 700,
                        }}
                    >
                        <span style={{ color: "var(--accent-yes)" }}>YES {yesPct.toFixed(1)}%</span>
                        <span style={{ color: "var(--accent-no)" }}>NO {noPct.toFixed(1)}%</span>
                    </div>
                </div>

                {/* Meta row */}
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginTop: "16px",
                        paddingTop: "12px",
                        borderTop: "1px solid var(--border)",
                        fontSize: "12px",
                        color: "var(--text-muted)",
                    }}
                >
                    <span>💧 {parseFloat(formatUnits(totalLiquidity, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT</span>
                    {!resolved && <span>⏱ {countdown}</span>}
                </div>
            </div>
        </Link>
    );
}
