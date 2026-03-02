"use client";

import { use, useCallback, useState, useEffect } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { useMarket, useUserPosition } from "@/hooks/useMarket";
import { BetPanel } from "@/components/BetPanel";
import { BtcChart } from "@/components/BtcChart";
import Link from "next/link";

function useNow() {
    const [now, setNow] = useState<number | null>(null);
    useEffect(() => {
        setNow(Math.floor(Date.now() / 1000));
        const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
        return () => clearInterval(t);
    }, []);
    return now;
}

export default function MarketPage({
    params,
}: {
    params: Promise<{ address: string }>;
}) {
    const { address: marketAddress } = use(params);
    const addr = marketAddress as `0x${string}`;

    const { address: userAddress } = useAccount();
    const { marketInfo, isLoading, refetch } = useMarket(addr);
    const { yesBet, noBet, claimed, refetch: refetchPos } = useUserPosition(addr, userAddress);
    const now = useNow();

    const handleSuccess = useCallback(() => {
        refetch();
        refetchPos();
    }, [refetch, refetchPos]);

    if (isLoading || !marketInfo || now === null) {
        return (
            <div
                style={{
                    maxWidth: "900px",
                    margin: "60px auto",
                    padding: "0 24px",
                    textAlign: "center",
                    color: "var(--text-muted)",
                }}
            >
                <div style={{ fontSize: "48px", marginBottom: "16px" }}>⏳</div>
                <p>Loading market data...</p>
            </div>
        );
    }

    const {
        question,
        strikePrice,
        endTime,
        resolved,
        result,
        yesPool,
        noPool,
        yesPrice,
        bettingEndTime,
    } = marketInfo;

    // Estimate start time based on typical durations
    let startTime = Number(endTime) - 3600; // default 1h
    const bDelta = Number(endTime) - Number(bettingEndTime);
    if (bDelta === 15 * 60) startTime = Number(endTime) - 3600; // Hourly
    else if (bDelta === 12 * 3600) startTime = Number(endTime) - 86400; // Daily
    else if (bDelta === 3 * 86400) startTime = Number(endTime) - 7 * 86400; // Weekly

    const totalPool = yesPool + noPool;
    const yesPct = Number(yesPrice) / 1e16;
    const noPct = 100 - yesPct;

    // Countdown
    const remaining = Number(endTime) - now;
    const countdownStr =
        remaining <= 0
            ? "Ended"
            : remaining < 3600
                ? `${Math.floor(remaining / 60)}m ${remaining % 60}s`
                : remaining < 86400
                    ? `${Math.floor(remaining / 3600)}h ${Math.floor((remaining % 3600) / 60)}m`
                    : `${Math.floor(remaining / 86400)}d ${Math.floor((remaining % 86400) / 3600)}h`;

    const status =
        resolved
            ? result
                ? { label: "✅ YES Won", color: "var(--accent-yes)" }
                : { label: "❌ NO Won", color: "var(--accent-no)" }
            : remaining > 0
                ? { label: "🟢 Live", color: "var(--accent-yes)" }
                : { label: "⏳ Pending Resolution", color: "var(--gold)" };

    return (
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "32px 24px" }}>
            {/* Breadcrumb */}
            <div style={{ marginBottom: "24px" }}>
                <Link
                    href="/"
                    style={{
                        color: "var(--text-muted)",
                        textDecoration: "none",
                        fontSize: "13px",
                        fontWeight: 500,
                    }}
                >
                    ← All Markets
                </Link>
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 380px",
                    gap: "32px",
                    alignItems: "start",
                }}
            >
                {/* LEFT COLUMN */}
                <div>
                    {/* Status */}
                    <div
                        style={{
                            display: "inline-block",
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "4px 12px",
                            borderRadius: "20px",
                            background: `${status.color}22`,
                            color: status.color,
                            border: `1px solid ${status.color}44`,
                            marginBottom: "16px",
                            letterSpacing: "0.5px",
                        }}
                    >
                        {status.label}
                    </div>

                    {/* Question */}
                    <h1
                        style={{
                            fontSize: "clamp(22px, 3vw, 32px)",
                            fontWeight: 800,
                            lineHeight: 1.3,
                            color: "var(--text-primary)",
                            marginBottom: "24px",
                            letterSpacing: "-0.5px",
                        }}
                    >
                        {question}
                    </h1>

                    {/* Stats grid */}
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                            gap: "12px",
                            marginBottom: "32px",
                        }}
                    >
                        {[
                            { label: "Strike Price", value: `$${(Number(strikePrice) / 1e8).toLocaleString()}` },
                            { label: "Total Liquidity", value: `${parseFloat(formatUnits(totalPool, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT` },
                            { label: "Ends / Ended", value: countdownStr },
                        ].map((s) => (
                            <div
                                key={s.label}
                                style={{
                                    background: "var(--bg-card)",
                                    border: "1px solid var(--border)",
                                    borderRadius: "12px",
                                    padding: "16px",
                                }}
                            >
                                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    {s.label}
                                </div>
                                <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--text-primary)", fontFamily: "monospace" }}>
                                    {s.value}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* BTC Chart */}
                    <div
                        style={{
                            background: "var(--bg-card)",
                            border: "1px solid var(--border)",
                            borderRadius: "16px",
                            padding: "0px", // Removed padding so graph touches edges fully as requested
                            marginBottom: "24px",
                            height: "450px", // Expanded height to ensure target line and timeline are not clipped
                            overflow: "hidden",
                        }}
                    >
                        <BtcChart
                            symbol="BTCUSDT"
                            height={450}
                            startTime={startTime}
                            endTime={Number(endTime)}
                            bettingEndTime={Number(bettingEndTime)}
                            strikePrice={Number(strikePrice) / 1e8}
                        />
                    </div>

                    {/* Odds visualization */}
                    <div
                        style={{
                            background: "var(--bg-card)",
                            border: "1px solid var(--border)",
                            borderRadius: "16px",
                            padding: "24px",
                            marginBottom: "24px",
                        }}
                    >
                        <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "20px", textTransform: "uppercase", letterSpacing: "0.8px" }}>
                            Live Odds
                        </h3>

                        {/* YES bar */}
                        <div style={{ marginBottom: "16px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                                <span style={{ color: "var(--accent-yes)", fontWeight: 700 }}>YES</span>
                                <span style={{ color: "var(--text-secondary)", fontFamily: "monospace" }}>
                                    {parseFloat(formatUnits(yesPool, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT · {yesPct.toFixed(1)}%
                                </span>
                            </div>
                            <div style={{ background: "var(--bg-secondary)", borderRadius: "4px", height: "10px", overflow: "hidden" }}>
                                <div
                                    className="odds-bar"
                                    style={{
                                        width: `${yesPct}%`,
                                        height: "100%",
                                        background: "linear-gradient(90deg, #16a34a, #22c55e)",
                                        borderRadius: "4px",
                                        transition: "width 0.6s ease",
                                    }}
                                />
                            </div>
                        </div>

                        {/* NO bar */}
                        <div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                                <span style={{ color: "var(--accent-no)", fontWeight: 700 }}>NO</span>
                                <span style={{ color: "var(--text-secondary)", fontFamily: "monospace" }}>
                                    {parseFloat(formatUnits(noPool, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT · {noPct.toFixed(1)}%
                                </span>
                            </div>
                            <div style={{ background: "var(--bg-secondary)", borderRadius: "4px", height: "10px", overflow: "hidden" }}>
                                <div
                                    style={{
                                        width: `${noPct}%`,
                                        height: "100%",
                                        background: "linear-gradient(90deg, #b91c1c, #ef4444)",
                                        borderRadius: "4px",
                                        transition: "width 0.6s ease",
                                    }}
                                />
                            </div>
                        </div>

                        {totalPool === 0n && (
                            <p style={{ marginTop: "16px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                                No bets yet — be the first!
                            </p>
                        )}
                    </div>

                    {/* Resolution info */}
                    <div
                        style={{
                            background: "var(--bg-card)",
                            border: "1px solid var(--border)",
                            borderRadius: "12px",
                            padding: "16px 20px",
                            fontSize: "13px",
                            color: "var(--text-muted)",
                            lineHeight: 1.7,
                        }}
                    >
                        <span style={{ fontWeight: 700, color: "var(--text-secondary)" }}>Resolution rule: </span>
                        If BTC/USD price ≥ ${(Number(strikePrice) / 1e8).toLocaleString()} at market end → <span style={{ color: "var(--accent-yes)" }}>YES</span> wins. Otherwise <span style={{ color: "var(--accent-no)" }}>NO</span> wins.
                        <br />
                        <span style={{ fontWeight: 700, color: "var(--text-secondary)" }}>Fee: </span>
                        1% platform fee is paid upfront in ETH when placing a bet. Winners claim 100% of their proportional payout.
                    </div>

                    {/* Contract address */}
                    <div style={{ marginTop: "16px", fontSize: "12px", color: "var(--text-muted)" }}>
                        Contract:{" "}
                        <a
                            href={`https://sepolia.etherscan.io/address/${addr}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "var(--accent-blue)", fontFamily: "monospace" }}
                        >
                            {addr.slice(0, 10)}...{addr.slice(-8)}
                        </a>
                    </div>
                </div>

                {/* RIGHT COLUMN — BetPanel */}
                <BetPanel
                    address={addr}
                    marketInfo={marketInfo}
                    yesBet={yesBet ?? 0n}
                    noBet={noBet ?? 0n}
                    claimed={claimed ?? false}
                    onSuccess={handleSuccess}
                />
            </div>
        </div>
    );
}
