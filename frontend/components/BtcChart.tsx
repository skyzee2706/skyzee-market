"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, BaselineSeries, LineSeries, IChartApi, ISeriesApi, Time } from "lightweight-charts";

interface BtcChartProps {
    symbol?: string; // e.g. "BTCUSDT"
    height?: number;
    startTime?: number;
    endTime?: number;
    bettingEndTime?: number;
    strikePrice?: number;
}

export function BtcChart({ symbol = "BTCUSDT", height = 300, startTime, endTime, bettingEndTime, strikePrice }: BtcChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<"Baseline"> | null>(null);

    const [livePrice, setLivePrice] = useState<number | null>(null);
    const priceRef = useRef<number | null>(null);
    const lastUpdatedTimeRef = useRef<number>(0);

    // Sync livePrice to ref for chart updates without re-triggering effects
    useEffect(() => {
        if (livePrice !== null) {
            priceRef.current = livePrice;
        }
    }, [livePrice]);

    // Utility to sanitize data for lightweight-charts
    const sanitizeData = (data: any[]) => {
        if (!data || data.length === 0) return [];
        // Sort by time ascending
        const sorted = [...data].sort((a, b) => Number(a.time) - Number(b.time));
        // Remove duplicates (keep the latest one for each timestamp)
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

    // Loop 1: Fetch History from Private API
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

                // Filter to market window
                historicalData = historicalData.filter((d: any) => d.time >= startTime);
                const nowSec = Math.floor(Date.now() / 1000);
                historicalData = historicalData.filter((d: any) => d.time <= nowSec);

                // Santize: sort and deduplicate
                const sanitized = sanitizeData(historicalData);

                if (seriesRef.current) {
                    if (sanitized.length > 0) {
                        lastUpdatedTimeRef.current = Number(sanitized[sanitized.length - 1].time);
                    } else {
                        lastUpdatedTimeRef.current = startTime - 1;
                    }
                    seriesRef.current.setData(sanitized);
                }
            } catch (err) {
                console.error("Failed to fetch internal history:", err);
            }
        }
        fetchHistory();
        return () => { isMounted = false; };
    }, [startTime, endTime]);

    // Loop 2: Fetch Live Price
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
        const t = setInterval(fetchLive, 1000);
        return () => { isMounted = false; clearInterval(t); };
    }, []);

    // Loop 3: Main Chart Setup
    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            height,
            layout: { background: { color: "transparent" }, textColor: "#A3A8B8" },
            grid: {
                vertLines: { color: "rgba(255, 255, 255, 0.05)" },
                horzLines: { color: "rgba(255, 255, 255, 0.05)" },
            },
            rightPriceScale: { borderVisible: false },
            timeScale: {
                borderVisible: false,
                timeVisible: true,
                secondsVisible: false,
                shiftVisibleRangeOnNewBar: false,
                fixLeftEdge: true,
                fixRightEdge: true,
                lockVisibleTimeRangeOnResize: true,
                tickMarkFormatter: (time: Time) => {
                    const d = new Date((time as number) * 1000);
                    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                },
            },
            crosshair: { mode: 1 },
            handleScroll: false,
            handleScale: false,
        });

        const series = chart.addSeries(BaselineSeries, {
            baseValue: { type: 'price', price: strikePrice || 0 },
            topLineColor: '#22c55e',
            topFillColor1: 'rgba(34, 197, 94, 0.28)',
            topFillColor2: 'rgba(34, 197, 94, 0.05)',
            bottomLineColor: '#ef4444',
            bottomFillColor1: 'rgba(239, 68, 68, 0.05)',
            bottomFillColor2: 'rgba(239, 68, 68, 0.28)',
            lineWidth: 2,
            autoscaleInfoProvider: (original: any) => {
                const res = original();
                let min = strikePrice || 0;
                let max = strikePrice || 0;
                if (res?.priceRange) {
                    min = res.priceRange.minValue;
                    max = res.priceRange.maxValue;
                }
                if (priceRef.current !== null) {
                    min = Math.min(min, priceRef.current);
                    max = Math.max(max, priceRef.current);
                }
                if (strikePrice) {
                    const diff = Math.max(Math.abs(max - strikePrice), Math.abs(min - strikePrice));
                    const pad = diff * 0.15;
                    if (diff === 0) return { priceRange: { minValue: strikePrice - 100, maxValue: strikePrice + 100 }, margins: { above: 0, below: 0 } };
                    return { priceRange: { minValue: strikePrice - diff - pad, maxValue: strikePrice + diff + pad }, margins: { above: 0, below: 0 } };
                }
                return res;
            }
        });

        if (startTime && endTime) {
            chart.timeScale().setVisibleRange({ from: startTime as Time, to: endTime as Time });
        }

        if (strikePrice) {
            series.createPriceLine({ price: strikePrice, color: '#06b6d4', lineWidth: 2, lineStyle: 3, axisLabelVisible: true, title: 'Target' });
        }

        chartRef.current = chart;
        seriesRef.current = series;

        const loop = setInterval(() => {
            if (priceRef.current && seriesRef.current) {
                const now = Math.floor(Date.now() / 1000);
                if (endTime && now > endTime) return;

                // CRITICAL: Prevent "update time is earlier than last" error
                if (now > lastUpdatedTimeRef.current) {
                    seriesRef.current.update({ time: now as Time, value: priceRef.current });
                    lastUpdatedTimeRef.current = now;
                }

                if (chartRef.current) {
                    // Update Betting Closed line
                    if (bettingEndTime) {
                        const x = chartRef.current.timeScale().timeToCoordinate(bettingEndTime as Time);
                        const div = document.getElementById("closed-bet-line");
                        if (div && x !== null) {
                            div.style.left = `${x}px`;
                            div.style.display = "block";
                        }
                    }
                    // Update Market Ends line
                    if (endTime) {
                        const x = chartRef.current.timeScale().timeToCoordinate(endTime as Time);
                        const div = document.getElementById("market-end-line");
                        if (div && x !== null) {
                            div.style.left = `${x}px`;
                            div.style.display = "block";
                        }
                    }
                }
            }
        }, 1000);

        // Responsive handling
        const handleResize = () => {
            if (chartContainerRef.current && chartRef.current) {
                chartRef.current.applyOptions({
                    width: chartContainerRef.current.clientWidth,
                    height: chartContainerRef.current.clientHeight
                });
            }
        };
        const obs = new ResizeObserver(handleResize);
        obs.observe(chartContainerRef.current);

        return () => {
            clearInterval(loop);
            obs.disconnect();
            chart.remove();
            chartRef.current = null;
            seriesRef.current = null;
        };
    }, [height, startTime, endTime, symbol, strikePrice, bettingEndTime]);

    return (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", overflow: "hidden" }}>
            <div style={{ padding: "16px 16px 8px 16px", display: "flex", flexDirection: "column", zIndex: 10, flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-muted)" }}>{symbol.replace("USDT", " / USD")}</span>
                    <span style={{ fontSize: "11px", background: "rgba(99,102,241,0.15)", color: "#6366f1", padding: "2px 6px", borderRadius: "12px", border: "1px solid rgba(99,102,241,0.3)" }}>Oracle Live</span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                    <span style={{ fontSize: "28px", fontWeight: 800, color: "var(--text-primary)", fontFamily: "monospace" }}>
                        {livePrice ? `$${livePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Loading..."}
                    </span>
                    {livePrice && <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#6366f1", animation: "pulse 1.5s infinite", boxShadow: "0 0 10px rgba(99,102,241,0.5)" }} />}
                </div>
            </div>
            <div style={{ position: "relative", flexGrow: 1, width: "100%" }}>
                <div ref={chartContainerRef} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
                <div id="closed-bet-line" style={{ position: "absolute", top: "0px", bottom: "26px", width: "1px", borderLeft: "2px dashed #f59e0b", pointerEvents: "none", display: "none", zIndex: 5 }}>
                    <div style={{ position: "absolute", top: "10px", left: "4px", color: "#f59e0b", fontSize: "11px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", background: "var(--bg-card)", padding: "2px 4px", borderRadius: "4px", whiteSpace: "nowrap" }}>
                        Betting Closes
                    </div>
                </div>
                <div id="market-end-line" style={{ position: "absolute", top: "0px", bottom: "26px", width: "1px", borderLeft: "2px dashed #ef4444", pointerEvents: "none", display: "none", zIndex: 5 }}>
                    <div style={{ position: "absolute", top: "40px", left: "4px", color: "#ef4444", fontSize: "11px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", background: "var(--bg-card)", padding: "2px 4px", borderRadius: "4px", whiteSpace: "nowrap" }}>
                        Market Ends
                    </div>
                </div>
            </div>
        </div>
    );
}
