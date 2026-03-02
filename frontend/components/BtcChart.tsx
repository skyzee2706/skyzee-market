"use client";

import { useEffect, useRef, useState, useMemo } from "react";

interface PricePoint {
    time: number;
    value: number;
}

interface BtcChartProps {
    symbol?: string;
    height?: number;
    startTime?: number;
    endTime?: number;
    bettingEndTime?: number;
    strikePrice?: number;
}

export function BtcChart({ symbol = "BTCUSDT", height = 450, startTime, endTime, bettingEndTime, strikePrice }: BtcChartProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    const [history, setHistory] = useState<PricePoint[]>([]);
    const [livePrice, setLivePrice] = useState<number | null>(null);

    // Default betting time to 15m (900s) before endTime
    const actualBettingEndTime = bettingEndTime || (endTime ? endTime - 900 : undefined);

    // 1. Observe Container Width for responsiveness
    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (let entry of entries) {
                setWidth(entry.contentRect.width);
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    // 2. Fetch History
    useEffect(() => {
        let isMounted = true;
        async function fetchHistory() {
            if (!startTime || !endTime) return;
            try {
                const res = await fetch("/api/history", { cache: "no-store" });
                if (!res.ok) throw new Error("History API failed");
                const data = await res.json();
                const raw = data.history || [];
                const currentNow = Math.floor(Date.now() / 1000);

                // Filter: only points in the fixed window [startTime, now]
                const filtered = raw
                    .filter((p: any) => p.time >= startTime && p.time <= Math.min(endTime, currentNow))
                    .sort((a: any, b: any) => a.time - b.time);

                if (isMounted) setHistory(filtered);
            } catch (err) {
                console.error("SVG Chart history error:", err);
            }
        }
        fetchHistory();
        const t = setInterval(fetchHistory, 10000);
        return () => { isMounted = false; clearInterval(t); };
    }, [startTime, endTime]);

    // 3. Fetch Live
    useEffect(() => {
        let isMounted = true;
        async function fetchLive() {
            try {
                const res = await fetch("/api/price", { cache: "no-store" });
                if (res.ok && isMounted) {
                    const data = await res.json();
                    if (data.price > 0) setLivePrice(data.price);
                }
            } catch (k) { }
        }
        fetchLive();
        const t = setInterval(fetchLive, 2000);
        return () => { isMounted = false; clearInterval(t); };
    }, []);

    // Combine history + live price
    const allPoints = useMemo(() => {
        const points = [...history];
        const now = Math.floor(Date.now() / 1000);
        if (livePrice && (!points.length || now > points[points.length - 1].time) && startTime && now <= endTime!) {
            points.push({ time: now, value: livePrice });
        }
        return points;
    }, [history, livePrice, startTime, endTime]);

    // 4. Calculate Scaling
    const scale = useMemo(() => {
        if (!startTime || !endTime || !width) return null;

        // Price range calculation
        let prices = allPoints.map(p => p.value);
        if (strikePrice) prices.push(strikePrice);

        if (prices.length === 0) prices = [70000];

        const minP = Math.min(...prices);
        const maxP = Math.max(...prices);
        const midP = strikePrice || prices[0];

        // Buffer to keep the chart centered and looking good
        const diff = Math.max(Math.abs(maxP - midP), Math.abs(minP - midP), 40);
        const minScale = midP - diff * 1.5;
        const maxScale = midP + diff * 1.5;

        // X-axis: 100% linear mapping of [startTime, endTime] to [0, width]
        const getX = (t: number) => ((t - startTime) / (endTime - startTime)) * width;

        // Y-axis: price to height (inverted for SVG)
        const paddingY = 80; // Space for labels top/bottom
        const chartAreaH = height - paddingY * 2;
        const getY = (p: number) => height - paddingY - ((p - minScale) / (maxScale - minScale)) * chartAreaH;

        return { getX, getY, minScale, maxScale, midP };
    }, [allPoints, startTime, endTime, width, height, strikePrice]);

    // 5. Generate SVG Paths
    const paths = useMemo(() => {
        if (!scale || allPoints.length === 0) return null;

        let d = `M ${scale.getX(allPoints[0].time)} ${scale.getY(allPoints[0].value)}`;
        for (let i = 1; i < allPoints.length; i++) {
            d += ` L ${scale.getX(allPoints[i].time)} ${scale.getY(allPoints[i].value)}`;
        }

        const strikeY = scale.getY(strikePrice || scale.midP);

        // Fill areas (Green/Red)
        const fillBaseY = strikeY;
        let greenD = d;
        let redD = d;

        return { mainPath: d, strikeY, greenD, redD };
    }, [allPoints, scale, strikePrice]);

    const isAbove = livePrice !== null && strikePrice !== null && livePrice > strikePrice;

    if (!startTime || !endTime) return null;

    return (
        <div ref={containerRef} style={{
            display: "flex", flexDirection: "column", width: "100%", height: `${height}px`,
            background: "#0a0a0a", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.05)",
            position: "relative", overflow: "hidden", userSelect: "none"
        }}>
            {/* Header UI (High Fidelity) */}
            <div style={{
                position: "absolute", top: "16px", left: "20px", right: "20px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                zIndex: 50, pointerEvents: "none"
            }}>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>{symbol.replace("USDT", "/USD")}</span>
                    <span style={{ fontSize: "14px", color: "rgba(255,255,255,0.2)" }}>•</span>
                    <span style={{ fontSize: "10px", color: "#9cfc0d", fontWeight: 700 }}>LIVE</span>
                    <span style={{
                        fontSize: "10px",
                        background: isAbove ? "rgba(156,252,13,0.1)" : "rgba(255, 55, 95, 0.1)",
                        color: isAbove ? "#9cfc0d" : "#ff375f",
                        padding: "3px 8px", borderRadius: "4px", fontWeight: 900,
                        border: isAbove ? "1px solid rgba(156,252,13,0.3)" : "1px solid rgba(255, 55, 95, 0.3)"
                    }}>
                        {isAbove ? "ABOVE" : "BELOW"}
                    </span>
                </div>

                <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                    <div>
                        <span style={{ color: "#00ccff", fontSize: "13px", fontWeight: 500 }}>Target</span> <span style={{ fontFamily: "monospace", color: "#00ccff", fontWeight: 700, fontSize: "13px" }}>${strikePrice?.toLocaleString()}</span>
                    </div>
                    <div style={{ width: "1px", height: "14px", background: "rgba(255,255,255,0.15)" }} />
                    <div>
                        <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "13px", fontWeight: 500 }}>Current</span> <span style={{ fontFamily: "monospace", color: "#fff", fontWeight: 800, fontSize: "16px" }}>${livePrice?.toLocaleString()}</span>
                    </div>
                </div>
            </div>

            {/* Main SVG Chart Area */}
            {width > 0 && scale && (
                <svg width={width} height={height} style={{ display: "block" }}>
                    <defs>
                        <linearGradient id="greenFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#9cfc0d" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="#9cfc0d" stopOpacity="0" />
                        </linearGradient>
                        <linearGradient id="redFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#ff375f" stopOpacity="0" />
                            <stop offset="100%" stopColor="#ff375f" stopOpacity="0.3" />
                        </linearGradient>

                        {/* Split Masks for Top/Bottom half coloring */}
                        <clipPath id="clipTop">
                            <rect x="0" y="0" width={width} height={scale.strikeY} />
                        </clipPath>
                        <clipPath id="clipBottom">
                            <rect x="0" y={scale.strikeY} width={width} height={height - scale.strikeY} />
                        </clipPath>
                    </defs>

                    {/* Grid Lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
                        const y = 80 + f * (height - 160);
                        const price = scale.maxScale - f * (scale.maxScale - scale.minScale);
                        return (
                            <g key={i}>
                                <line x1="0" y1={y} x2={width - 70} y2={y} stroke="rgba(255,255,255,0.03)" />
                                <text x={width - 60} y={y + 4} fill="rgba(255,255,255,0.3)" fontSize="10" fontFamily="monospace">
                                    {Math.round(price)}
                                </text>
                            </g>
                        );
                    })}

                    {/* Time Labels (X Axis) */}
                    {[startTime, Math.floor((startTime + endTime) / 2), endTime].map((t, i) => {
                        const x = scale.getX(t);
                        const date = new Date(t * 1000);
                        const timeStr = `${date.getUTCHours().toString().padStart(2, '0')}:${date.getUTCMinutes().toString().padStart(2, '0')}`;
                        return (
                            <text key={i} x={x} y={height - 15} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} fill="rgba(255,255,255,0.4)" fontSize="10" fontFamily="monospace">
                                {timeStr}
                            </text>
                        );
                    })}

                    {/* Target / Strike Price Line */}
                    <line x1="0" y1={scale.strikeY} x2={width - 70} y2={scale.strikeY} stroke="#00ccff" strokeDasharray="4 4" strokeWidth="1" />
                    <rect x={width - 75} y={scale.strikeY - 10} width="70" height="20" rx="4" fill="#00ccff" />
                    <text x={width - 40} y={scale.strikeY + 4} textAnchor="middle" fill="#000" fontSize="10" fontWeight="800">Target</text>

                    {/* Vertical Events Markers */}
                    {actualBettingEndTime && (
                        <g>
                            <line x1={scale.getX(actualBettingEndTime)} y1="0" x2={scale.getX(actualBettingEndTime)} y2={height - 40} stroke="rgba(245, 158, 11, 0.3)" strokeDasharray="3 3" />
                            <rect x={scale.getX(actualBettingEndTime) + 5} y="40" width="100" height="20" rx="2" fill="rgba(10,10,10,0.8)" />
                            <text x={scale.getX(actualBettingEndTime) + 10} y="54" fill="#f59e0b" fontSize="9" fontWeight="900">BETTING CLOSES</text>
                        </g>
                    )}
                    <line x1={scale.getX(endTime)} y1="0" x2={scale.getX(endTime)} y2={height - 40} stroke="rgba(255, 55, 95, 0.4)" strokeDasharray="3 3" />
                    <rect x={scale.getX(endTime) - 105} y="80" width="100" height="24" rx="4" fill="rgba(10,10,10,0.85)" stroke="rgba(255, 55, 95, 0.4)" />
                    <text x={scale.getX(endTime) - 55} y="96" textAnchor="middle" fill="#ff375f" fontSize="9" fontWeight="900">MARKET ENDS</text>

                    {/* Price Line Rendering with Baseline Logic */}
                    {paths && (
                        <>
                            {/* Green Half (Above Style) */}
                            <g clipPath="url(#clipTop)">
                                <path d={paths.mainPath} fill="none" stroke="#9cfc0d" strokeWidth="2" />
                                <path d={`${paths.mainPath} L ${scale.getX(allPoints[allPoints.length - 1].time)} ${scale.strikeY} L ${scale.getX(allPoints[0].time)} ${scale.strikeY} Z`} fill="url(#greenFill)" stroke="none" />
                            </g>
                            {/* Red Half (Below Style) */}
                            <g clipPath="url(#clipBottom)">
                                <path d={paths.mainPath} fill="none" stroke="#ff375f" strokeWidth="2" />
                                <path d={`${paths.mainPath} L ${scale.getX(allPoints[allPoints.length - 1].time)} ${scale.strikeY} L ${scale.getX(allPoints[0].time)} ${scale.strikeY} Z`} fill="url(#redFill)" stroke="none" />
                            </g>

                            {/* Current Price Dot */}
                            <circle cx={scale.getX(allPoints[allPoints.length - 1].time)} cy={scale.getY(allPoints[allPoints.length - 1].value)} r="4" fill={isAbove ? "#9cfc0d" : "#ff375f"} stroke="#fff" strokeWidth="1" />
                            <rect x={width - 75} y={scale.getY(allPoints[allPoints.length - 1].value) - 10} width="70" height="20" rx="4" fill={isAbove ? "#9cfc0d" : "#ff375f"} />
                            <text x={width - 40} y={scale.getY(allPoints[allPoints.length - 1].value) + 4} textAnchor="middle" fill="#000" fontSize="10" fontWeight="800">
                                {livePrice?.toFixed(2)}
                            </text>
                        </>
                    )}
                </svg>
            )}

            {/* Loading State or Placeholder */}
            {(allPoints.length === 0 || !scale) && (
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: "rgba(255,255,255,0.2)", fontSize: "12px", textAlign: "center" }}>
                    INITIALIZING CHART...<br />Waiting for Price Data
                </div>
            )}
        </div>
    );
}
