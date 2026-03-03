"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";

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

export function BtcChart({ symbol = "BTCUSDT", height = 480, startTime, endTime, bettingEndTime, strikePrice }: BtcChartProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    const [history, setHistory] = useState<PricePoint[]>([]);
    const [livePrice, setLivePrice] = useState<number | null>(null);

    // Interactive state
    const [hoverPoint, setHoverPoint] = useState<PricePoint | null>(null);
    const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

    const actualBettingEndTime = bettingEndTime || (endTime ? endTime - 900 : undefined);

    // We reserve space on the right for the price axis/labels
    const RIGHT_AXIS_WIDTH = 75;

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

    const allPoints = useMemo(() => {
        const points = [...history];
        const now = Math.floor(Date.now() / 1000);
        if (livePrice && (!points.length || now > points[points.length - 1].time) && startTime && now <= endTime!) {
            points.push({ time: now, value: livePrice });
        }
        return points;
    }, [history, livePrice, startTime, endTime]);

    const scale = useMemo(() => {
        if (!startTime || !endTime || !width || !strikePrice) return null;

        let prices = allPoints.map(p => p.value);
        const midP = strikePrice;

        // Calculate symmetric range centering strikePrice
        const maxDelta = prices.length > 0 ? Math.max(...prices.map(p => Math.abs(p - midP))) : 50;
        const buffer = Math.max(maxDelta, 40) * 1.5;

        const minScale = midP - buffer;
        const maxScale = midP + buffer;

        // Map time to width minus the reserved price axis area
        const availableWidth = width - RIGHT_AXIS_WIDTH;
        const getX = (t: number) => ((t - startTime) / (endTime - startTime)) * availableWidth;

        const paddingY = 70;
        const chartAreaH = height - paddingY * 2 - 40;
        const getY = (p: number) => paddingY + chartAreaH - ((p - minScale) / (maxScale - minScale)) * chartAreaH;

        return { getX, getY, minScale, maxScale, midP, strikeY: getY(midP), availableWidth };
    }, [allPoints, startTime, endTime, width, height, strikePrice, RIGHT_AXIS_WIDTH]);

    const paths = useMemo(() => {
        if (!scale || allPoints.length === 0) return null;

        let d = `M ${scale.getX(allPoints[0].time)} ${scale.getY(allPoints[0].value)}`;
        for (let i = 1; i < allPoints.length; i++) {
            const x = scale.getX(allPoints[i].time);
            const y = scale.getY(allPoints[i].value);
            if (!isNaN(x) && !isNaN(y)) {
                d += ` L ${x} ${y}`;
            }
        }

        const lastX = scale.getX(allPoints[allPoints.length - 1].time);
        const lastY = scale.getY(allPoints[allPoints.length - 1].value);

        return { mainPath: d, lastX, lastY };
    }, [allPoints, scale]);

    const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
        if (!scale || allPoints.length === 0 || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Limit interaction to the chart area (not the axis)
        if (x > scale.availableWidth) return;

        let nearest = allPoints[0];
        let minDist = Math.abs(scale.getX(allPoints[0].time) - x);

        for (let i = 1; i < allPoints.length; i++) {
            const dist = Math.abs(scale.getX(allPoints[i].time) - x);
            if (dist < minDist) {
                minDist = dist;
                nearest = allPoints[i];
            }
        }

        setHoverPoint(nearest);
        setMousePos({ x, y });
    }, [allPoints, scale]);

    const handleMouseLeave = useCallback(() => {
        setHoverPoint(null);
        setMousePos(null);
    }, []);

    if (!startTime || !endTime || !strikePrice) return null;

    const isAbove = livePrice !== null && strikePrice !== undefined && livePrice > strikePrice;

    return (
        <div ref={containerRef} style={{
            display: "flex", flexDirection: "column", width: "100%", height: `${height}px`,
            background: "#0a0a0a", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.05)",
            position: "relative", overflow: "hidden"
        }}>
            {/* Header UI */}
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
                        background: isAbove ? "rgba(156,252,13,0.1)" : "rgba(255, 45, 85, 0.1)",
                        color: isAbove ? "#9cfc0d" : "#ff375f",
                        padding: "3px 8px", borderRadius: "4px", fontWeight: 900,
                        border: isAbove ? "1px solid rgba(156,252,13,0.3)" : "1px solid rgba(255, 45, 85, 0.3)"
                    }}>
                        {isAbove ? "ABOVE" : "BELOW"}
                    </span>
                </div>

                <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                    <div style={{ fontSize: "13px" }}>
                        <span style={{ color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>Current</span> <span style={{ fontFamily: "monospace", color: "#fff", fontWeight: 800, fontSize: "16px" }}>${livePrice?.toLocaleString(undefined, { minimumFractionDigits: 3 })}</span>
                    </div>
                </div>
            </div>

            {width > 0 && scale && (
                <svg
                    width={width}
                    height={height}
                    style={{ display: "block", cursor: "crosshair" }}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                >
                    <defs>
                        <linearGradient id="greenFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#9cfc0d" stopOpacity="0.1" />
                            <stop offset="100%" stopColor="#9cfc0d" stopOpacity="0" />
                        </linearGradient>
                        <linearGradient id="redFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#ff375f" stopOpacity="0" />
                            <stop offset="100%" stopColor="#ff375f" stopOpacity="0.1" />
                        </linearGradient>

                        <clipPath id="clipTop">
                            <rect x="0" y="0" width={scale.availableWidth} height={scale.strikeY} />
                        </clipPath>
                        <clipPath id="clipBottom">
                            <rect x="0" y={scale.strikeY} width={scale.availableWidth} height={height - scale.strikeY} />
                        </clipPath>
                    </defs>

                    {/* Horizontal Grid & Price Labels (Axis stays fixed on right padding) */}
                    {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
                        const y = 70 + f * (height - 180);
                        const price = scale.maxScale - f * (scale.maxScale - scale.minScale);
                        return (
                            <g key={i}>
                                <line x1="0" y1={y} x2={scale.availableWidth} y2={y} stroke="rgba(255,255,255,0.03)" />
                                <text x={width - 10} y={y + 3} textAnchor="end" fill="rgba(255,255,255,0.15)" fontSize="9" fontFamily="monospace">
                                    {Math.round(price)}
                                </text>
                            </g>
                        );
                    })}

                    {/* Time Labels (Bottom Axis) */}
                    {[startTime, Math.floor((startTime + endTime) / 2), endTime].map((t, i) => {
                        const x = scale.getX(t);
                        const date = new Date(t * 1000);
                        const h = date.getUTCHours().toString().padStart(2, '0');
                        const m = date.getUTCMinutes().toString().padStart(2, '0');
                        return (
                            <text key={i} x={x} y={height - 25} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} fill="rgba(255,255,255,0.3)" fontSize="10" fontFamily="monospace">
                                {`${h}:${m}`}
                            </text>
                        );
                    })}

                    {/* TARGET PRICE LINE */}
                    <line x1="0" y1={scale.strikeY} x2={width} y2={scale.strikeY} stroke="#00ccff" strokeDasharray="4 4" strokeWidth="1" />
                    <rect x={width - 65} y={scale.strikeY - 7} width="65" height="14" fill="#00ccff" rx="2" />
                    <text x={width - 32} y={scale.strikeY + 3} textAnchor="middle" fill="#000" fontSize="8.5" fontWeight="950" fontFamily="monospace">
                        {strikePrice?.toFixed(2)}
                    </text>
                    <text x={width - 7} y={scale.strikeY - 11} textAnchor="end" fill="#00ccff" fontSize="8" fontWeight="800">Target</text>

                    {/* Vertical Betting Closes Marker */}
                    {actualBettingEndTime && (
                        <g>
                            <line x1={scale.getX(actualBettingEndTime)} y1="0" x2={scale.getX(actualBettingEndTime)} y2={height - 60} stroke="rgba(245, 158, 11, 0.4)" strokeDasharray="3 3" />
                            <text
                                x={scale.getX(actualBettingEndTime)}
                                y={height - 45}
                                textAnchor="middle"
                                fill="#f59e0b"
                                fontSize="10"
                                fontFamily="monospace"
                                fontWeight="700"
                            >
                                {(() => {
                                    const d = new Date(actualBettingEndTime * 1000);
                                    return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`;
                                })()}
                            </text>
                            <text
                                x={scale.getX(actualBettingEndTime)}
                                y={height - 35}
                                textAnchor="middle"
                                fill="rgba(245, 158, 11, 0.6)"
                                fontSize="8"
                                fontFamily="sans-serif"
                                fontWeight="900"
                            >
                                BETTING CLOSE TIME
                            </text>
                        </g>
                    )}

                    {/* Price Line Rendering */}
                    {paths && (
                        <>
                            {/* Above Path */}
                            <g clipPath="url(#clipTop)">
                                <path d={paths.mainPath} fill="none" stroke="#9cfc0d" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d={`${paths.mainPath} L ${paths.lastX} ${scale.strikeY} L ${scale.getX(allPoints[0].time)} ${scale.strikeY} Z`} fill="url(#greenFill)" stroke="none" />
                            </g>
                            {/* Below Path */}
                            <g clipPath="url(#clipBottom)">
                                <path d={paths.mainPath} fill="none" stroke="#ff375f" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d={`${paths.mainPath} L ${paths.lastX} ${scale.strikeY} L ${scale.getX(allPoints[0].time)} ${scale.strikeY} Z`} fill="url(#redFill)" stroke="none" />
                            </g>

                            {/* LIVE HORIZONTAL PRICE LINE */}
                            <line x1={paths.lastX} y1={paths.lastY} x2={width} y2={paths.lastY} stroke={isAbove ? "#9cfc0d" : "#ff375f"} strokeDasharray="4 4" strokeWidth="1" />

                            {/* Current Price Dot & Label */}
                            <circle cx={paths.lastX} cy={paths.lastY} r="3" fill={isAbove ? "#9cfc0d" : "#ff375f"} stroke="#fff" strokeWidth="1" />
                            <rect x={width - 65} y={paths.lastY - 7} width="65" height="14" fill={isAbove ? "#9cfc0d" : "#ff375f"} rx="2" />
                            <text x={width - 32} y={paths.lastY + 3} textAnchor="middle" fill="#000" fontSize="8.5" fontWeight="950" fontFamily="monospace">
                                {livePrice?.toFixed(2)}
                            </text>
                        </>
                    )}

                    {/* CROSSHAIR & TOOLTIP */}
                    {hoverPoint && mousePos && (
                        <g>
                            <line
                                x1={scale.getX(hoverPoint.time)} y1="0"
                                x2={scale.getX(hoverPoint.time)} y2={height - 60}
                                stroke="rgba(255,255,255,0.3)" strokeDasharray="4 4" strokeWidth="1"
                            />
                            <line
                                x1="0" y1={scale.getY(hoverPoint.value)}
                                x2={scale.availableWidth} y2={scale.getY(hoverPoint.value)}
                                stroke="rgba(255,255,255,0.3)" strokeDasharray="4 4" strokeWidth="1"
                            />

                            <circle
                                cx={scale.getX(hoverPoint.time)}
                                cy={scale.getY(hoverPoint.value)}
                                r="3" fill="#fff"
                            />

                            {/* Tooltip */}
                            <g transform={`translate(${scale.getX(hoverPoint.time) + 12}, ${scale.getY(hoverPoint.value) - 45})`}>
                                <rect
                                    width="100" height="35" rx="6"
                                    fill="rgba(20,20,20,0.95)" stroke="rgba(255,255,255,0.15)" strokeWidth="1"
                                />
                                <text x="10" y="14" fill="rgba(255,255,255,0.5)" fontSize="9" fontFamily="monospace">
                                    {new Date(hoverPoint.time * 1000).getUTCHours().toString().padStart(2, '0')}:
                                    {new Date(hoverPoint.time * 1000).getUTCMinutes().toString().padStart(2, '0')}:
                                    {new Date(hoverPoint.time * 1000).getUTCSeconds().toString().padStart(2, '0')}
                                </text>
                                <text x="10" y="26" fill="#fff" fontSize="10" fontWeight="800" fontFamily="monospace">
                                    ${hoverPoint.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </text>
                            </g>
                        </g>
                    )}
                </svg>
            )}

            {/* Loading Overlay */}
            {(allPoints.length === 0 || !scale) && (
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: "rgba(255,255,255,0.15)", fontSize: "11px", fontWeight: 700 }}>
                    CONSTRUCTING SVG TIMELINE...
                </div>
            )}
        </div>
    );
}
