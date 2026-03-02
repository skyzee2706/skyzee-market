"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, BaselineSeries, LineSeries, IChartApi, ISeriesApi, Time, ColorType } from "lightweight-charts";

interface BtcChartProps {
    symbol?: string; // e.g. "BTCUSDT"
    height?: number;
    startTime?: number;
    endTime?: number;
    bettingEndTime?: number;
    strikePrice?: number;
}

export function BtcChart({ symbol = "BTCUSDT", height = 450, startTime, endTime, bettingEndTime, strikePrice }: BtcChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<"Baseline"> | null>(null);
    const invisibleSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

    const [livePrice, setLivePrice] = useState<number | null>(null);
    const priceRef = useRef<number | null>(null);
    const lastUpdatedTimeRef = useRef<number>(0);

    // Default betting time to exactly 15m before endTime if not provided
    const actualBettingEndTime = bettingEndTime || (endTime ? endTime - 900 : undefined);

    useEffect(() => {
        if (livePrice !== null) priceRef.current = livePrice;
    }, [livePrice]);

    const sanitizeData = (data: any[]) => {
        if (!data || data.length === 0) return [];
        const sorted = [...data].sort((a, b) => Number(a.time) - Number(b.time));
        const unique: any[] = [];
        const seenTimes = new Set();
        for (let i = sorted.length - 1; i >= 0; i--) {
            if (!seenTimes.has(sorted[i].time)) {
                unique.unshift(sorted[i]);
                seenTimes.add(sorted[i].time);
            }
        }
        return unique;
    };

    // Loop 1: Fetch History & Linearize Timeline
    useEffect(() => {
        let isMounted = true;
        async function fetchHistory() {
            if (!startTime || !endTime) return;
            try {
                const res = await fetch("/api/history", { cache: "no-store" });
                if (!res.ok) throw new Error("History API failed");
                const data = await res.json();
                let historicalData = data.history || [];

                if (!isMounted) return;

                const currentTimestamp = Math.floor(Date.now() / 1000);

                // Filter history: within market window and NOT in the future
                historicalData = historicalData.filter((d: any) =>
                    d.time >= startTime && d.time <= Math.min(endTime, currentTimestamp)
                );

                const sanitized = sanitizeData(historicalData);

                if (seriesRef.current && invisibleSeriesRef.current && chartRef.current) {
                    if (sanitized.length > 0) {
                        lastUpdatedTimeRef.current = Number(sanitized[sanitized.length - 1].time);
                    } else {
                        lastUpdatedTimeRef.current = startTime - 1;
                    }

                    seriesRef.current.setData(sanitized);

                    // --- FORCING A LINEAR TIMESCALE ---
                    // Populate an invisible series with points every 60s for the entire duration.
                    const fullTimeline: any[] = [];
                    for (let t = startTime; t <= endTime; t += 60) {
                        fullTimeline.push({ time: t as Time, value: strikePrice || 0 });
                    }
                    if (fullTimeline[fullTimeline.length - 1].time !== (endTime as Time)) {
                        fullTimeline.push({ time: endTime as Time, value: strikePrice || 0 });
                    }
                    invisibleSeriesRef.current.setData(fullTimeline);

                    try {
                        chartRef.current.timeScale().setVisibleRange({
                            from: startTime as Time,
                            to: endTime as Time
                        });
                    } catch (e) { }
                }
            } catch (err) {
                console.error("Chart history error:", err);
            }
        }
        fetchHistory();
        const t = setInterval(fetchHistory, 15000);
        return () => { isMounted = false; clearInterval(t); };
    }, [startTime, endTime, strikePrice]);

    // Loop 2: Live Price updates
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
        const t = setInterval(fetchLive, 2500);
        fetchLive();
        return () => { isMounted = false; clearInterval(t); };
    }, []);

    // Loop 3: Main Chart Setup
    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            // Remove height here to allow absolute container to control it
            autoSize: true,
            layout: {
                background: { type: ColorType.Solid, color: "#0a0a0a" },
                textColor: "#A3A8B8",
                fontSize: 11,
                fontFamily: "'Inter', sans-serif",
            },
            grid: {
                vertLines: { color: "rgba(255, 255, 255, 0.04)" },
                horzLines: { color: "rgba(255, 255, 255, 0.04)" },
            },
            rightPriceScale: {
                borderVisible: false,
                scaleMargins: { top: 0.2, bottom: 0.2 },
                autoScale: true,
            },
            timeScale: {
                borderVisible: false,
                timeVisible: true,
                secondsVisible: false,
                fixLeftEdge: true,
                fixRightEdge: true,
                lockVisibleTimeRangeOnResize: true,
                shiftVisibleRangeOnNewBar: false,
            },
            crosshair: {
                mode: 1,
                vertLine: { color: 'rgba(255, 255, 255, 0.15)', style: 3, labelVisible: true },
                horzLine: { color: 'rgba(255, 255, 255, 0.15)', style: 3, labelVisible: true },
            },
            // ABSOLUTE INTERACTION LOCKING
            handleScroll: { mouseWheel: false, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false },
            handleScale: { mouseWheel: false, pinch: false, axisPressedMouseMove: false, axisDoubleClickReset: false },
        });

        const series = chart.addSeries(BaselineSeries, {
            baseValue: { type: 'price', price: strikePrice || 0 },
            topLineColor: '#9cfc0d',
            topFillColor1: 'rgba(156, 252, 13, 0.25)',
            topFillColor2: 'rgba(156, 252, 13, 0.01)',
            bottomLineColor: '#ff375f',
            bottomFillColor1: 'rgba(255, 55, 95, 0.01)',
            bottomFillColor2: 'rgba(255, 55, 95, 0.25)',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            autoscaleInfoProvider: (original: any) => {
                const res = original();
                if (strikePrice && res?.priceRange) {
                    const mid = strikePrice;
                    const diff = Math.max(Math.abs(res.priceRange.maxValue - mid), Math.abs(res.priceRange.minValue - mid), 30);
                    return {
                        priceRange: {
                            minValue: mid - diff * 1.5,
                            maxValue: mid + diff * 1.5,
                        },
                    };
                }
                return res;
            }
        });

        const invisible = chart.addSeries(LineSeries, {
            color: 'transparent',
            lineWidth: 0,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
            autoscaleInfoProvider: () => null,
        });

        if (strikePrice) {
            series.createPriceLine({
                price: strikePrice,
                color: '#00ccff',
                lineWidth: 1,
                lineStyle: 3,
                axisLabelVisible: true,
                title: 'Target'
            });
        }

        chartRef.current = chart;
        seriesRef.current = series;
        invisibleSeriesRef.current = invisible;

        // Force initial timeline
        if (startTime && endTime) {
            const initialTimeline: any[] = [];
            for (let t = startTime; t <= endTime; t += 60) initialTimeline.push({ time: t as Time, value: strikePrice || 0 });
            invisible.setData(initialTimeline);
            try {
                chart.timeScale().setVisibleRange({ from: startTime as Time, to: endTime as Time });
            } catch (e) { }
        }

        const loop = setInterval(() => {
            if (priceRef.current && seriesRef.current && chartRef.current) {
                const now = Math.floor(Date.now() / 1000);
                if (endTime && now >= endTime) return;

                if (now > lastUpdatedTimeRef.current) {
                    seriesRef.current.update({ time: now as Time, value: priceRef.current });
                    lastUpdatedTimeRef.current = now;
                }

                // Strictly enforce visible range
                if (startTime && endTime) {
                    const ts = chartRef.current.timeScale();
                    try {
                        ts.setVisibleRange({ from: startTime as Time, to: endTime as Time });
                    } catch (e) { }

                    // Reposition custom DOM overlays
                    if (actualBettingEndTime) {
                        const x = ts.timeToCoordinate(actualBettingEndTime as Time);
                        const div = document.getElementById("closed-bet-line");
                        if (div && x !== null) {
                            div.style.left = `${x}px`;
                            div.style.display = "block";
                        }
                    }
                    if (endTime) {
                        const x = ts.timeToCoordinate(endTime as Time);
                        const div = document.getElementById("market-end-line");
                        if (div && x !== null) {
                            div.style.left = `${x}px`;
                            div.style.display = "block";
                        }
                    }
                }
            }
        }, 1000);

        return () => {
            clearInterval(loop);
            chart.remove();
            chartRef.current = null;
            seriesRef.current = null;
        };
    }, [height, startTime, endTime, strikePrice, actualBettingEndTime]);

    const isAbove = livePrice !== null && strikePrice !== null && livePrice > strikePrice;

    return (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: `${height}px`, overflow: "hidden", position: "relative", background: "#0a0a0a", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.05)" }}>
            {/* High-Fidelity Header */}
            <div style={{
                position: "absolute", top: "16px", left: "20px", right: "20px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                zIndex: 50, pointerEvents: "none", userSelect: "none"
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
                        <span style={{ color: "#00ccff", fontSize: "13px", fontWeight: 500 }}>Target</span> <span style={{ fontFamily: "monospace", color: "#00ccff", fontWeight: 700, fontSize: "13px" }}>${strikePrice?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div style={{ width: "1px", height: "14px", background: "rgba(255,255,255,0.15)" }} />
                    <div>
                        <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "13px", fontWeight: 500 }}>Current</span> <span style={{ fontFamily: "monospace", color: "#fff", fontWeight: 800, fontSize: "16px" }}>${livePrice?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                </div>
            </div>

            {/* CHART CONTAINER: Absolute positioned to cover the whole parent to avoid clipping time scale */}
            <div ref={chartContainerRef} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }} />

            {/* Custom Overlay Elements - MUST BE RELATIVE TO PARENT BUT ABOVE CHART */}
            <div id="closed-bet-line" style={{ position: "absolute", top: "0px", bottom: "25px", width: "0px", borderLeft: "1px dashed rgba(255,255,255,0.25)", pointerEvents: "none", display: "none", zIndex: 20 }}>
                <div style={{ position: "absolute", top: "15px", left: "6px", color: "#f59e0b", fontSize: "10px", fontWeight: "900", textTransform: "uppercase", background: "rgba(10,10,10,0.8)", padding: "2px 4px", borderRadius: "2px", whiteSpace: "nowrap" }}>
                    Betting Closes
                </div>
            </div>
            <div id="market-end-line" style={{ position: "absolute", top: "0px", bottom: "25px", width: "0px", borderLeft: "1px dashed rgba(255,255,255,0.25)", pointerEvents: "none", display: "none", zIndex: 20 }}>
                <div style={{ position: "absolute", top: "50px", right: "6px", color: "#ff375f", fontSize: "10px", fontWeight: "900", background: "rgba(10,10,10,0.85)", padding: "2px 6px", borderRadius: "4px", whiteSpace: "nowrap", border: "1px solid rgba(255, 55, 95, 0.4)" }}>
                    MARKET ENDS
                </div>
            </div>
        </div>
    );
}
