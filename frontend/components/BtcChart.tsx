"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, AreaSeries, IChartApi, ISeriesApi, Time } from "lightweight-charts";

interface BtcChartProps {
    symbol?: string; // e.g. "BTCUSDT"
    height?: number;
}

export function BtcChart({ symbol = "BTCUSDT", height = 300 }: BtcChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

    const [livePrice, setLivePrice] = useState<number | null>(null);

    // ZERO-GAS SIMULATION: Fetch live price from Binance instead of slow Testnet Oracle
    useEffect(() => {
        let isMounted = true;

        async function fetchBinance() {
            try {
                const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
                const data = await res.json();
                if (isMounted && data.price) {
                    setLivePrice(parseFloat(data.price));
                }
            } catch (err) {
                console.error("Binance API error:", err);
            }
        }

        fetchBinance(); // Initial fetch
        const interval = setInterval(fetchBinance, 2000); // Poll every 2 seconds

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, []);

    const priceRef = useRef<number | null>(null);

    // Keep the ref updated with the latest price without causing the chart to rebuild
    useEffect(() => {
        if (livePrice !== null) {
            priceRef.current = livePrice;
        }
    }, [livePrice]);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            height,
            layout: {
                background: { color: "transparent" },
                textColor: "#A3A8B8",
            },
            grid: {
                vertLines: { color: "rgba(255, 255, 255, 0.05)" },
                horzLines: { color: "rgba(255, 255, 255, 0.05)" },
            },
            rightPriceScale: {
                borderVisible: false,
            },
            timeScale: {
                borderVisible: false,
                timeVisible: true,
                secondsVisible: true, // Crucial for real-time second ticks
            },
            crosshair: {
                mode: 1,
                vertLine: { color: "#6366f1", labelBackgroundColor: "#6366f1" },
                horzLine: { color: "#6366f1", labelBackgroundColor: "#6366f1" },
            },
        });

        const series = chart.addSeries(AreaSeries, {
            lineColor: "#6366f1",
            topColor: "rgba(99, 102, 241, 0.4)",
            bottomColor: "rgba(99, 102, 241, 0.05)",
            lineWidth: 2,
            priceFormat: {
                type: "price",
                precision: 2,
                minMove: 0.01,
            },
        });

        chartRef.current = chart;
        seriesRef.current = series;

        // Start drawing the live oracle line directly without historical artifacts
        const initInterval = setInterval(() => {
            if (priceRef.current) {
                clearInterval(initInterval);
                const p = priceRef.current;
                const now = Math.floor(Date.now() / 1000);
                // Seed 1 point in the past just to make the current line visible immediately
                series.setData([
                    { time: (now - 2) as Time, value: p },
                    { time: now as Time, value: p }
                ]);
                chart.timeScale().fitContent();
            }
        }, 500);

        // Tick every 1 second continuously matching real time updates
        const interval = setInterval(() => {
            if (priceRef.current) {
                const now = Math.floor(Date.now() / 1000) as Time;
                series.update({
                    time: now,
                    value: priceRef.current
                });
                // Ensure chart follows the new price if it goes out of view
                chart.timeScale().fitContent();
            }
        }, 1000);

        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };
        window.addEventListener("resize", handleResize);

        return () => {
            clearInterval(initInterval);
            clearInterval(interval);
            window.removeEventListener("resize", handleResize);
            chart.remove();
        };
    }, [height]);

    return (
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
            <div style={{
                position: "absolute",
                top: 10,
                left: 16,
                zIndex: 10,
                display: "flex",
                flexDirection: "column",
                pointerEvents: "none"
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-muted)" }}>
                        {symbol.replace("USDT", " / USD")}
                    </span>
                    <span style={{ fontSize: "11px", background: "rgba(99,102,241,0.15)", color: "#6366f1", padding: "2px 6px", borderRadius: "12px", border: "1px solid rgba(99,102,241,0.3)" }}>
                        Oracle Live
                    </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                    <span style={{ fontSize: "28px", fontWeight: 800, color: "var(--text-primary)", fontFamily: "monospace" }}>
                        {livePrice ? `$${livePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Loading..."}
                    </span>
                    {livePrice && (
                        <span style={{
                            width: "8px", height: "8px", borderRadius: "50%",
                            background: "#6366f1",
                            animation: "pulse 1.5s infinite",
                            boxShadow: "0 0 10px rgba(99,102,241,0.5)"
                        }} />
                    )}
                </div>
            </div>
            <div ref={chartContainerRef} style={{ width: "100%", paddingTop: "70px" }} />
        </div>
    );
}
