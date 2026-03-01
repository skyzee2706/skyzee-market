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

    // ZERO-GAS SIMULATION: Fetch last 60m of history to frame the chart, then poll live price
    useEffect(() => {
        let isMounted = true;

        async function fetchHistoryAndLive() {
            try {
                // Fetch last 60 minutes of 1m klines
                const res = await fetch("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=60");
                const data = await res.json();

                if (!isMounted) return;

                const historicalData = data.map((k: any) => ({
                    time: Math.floor(k[0] / 1000) as Time,
                    value: parseFloat(k[4]) // close price
                }));

                // Set historical data to the series to frame the Auto-Zoom correctly
                if (seriesRef.current) {
                    seriesRef.current.setData(historicalData);
                    chartRef.current?.timeScale().fitContent(); // Fit exactly once on load
                }

                // Also set live price to the latest close
                if (data.length > 0) {
                    setLivePrice(parseFloat(data[data.length - 1][4]));
                }
            } catch (err) {
                console.error("Binance history error:", err);
            }
        }

        async function fetchLive() {
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

        fetchHistoryAndLive();
        const interval = setInterval(fetchLive, 2000); // Poll every 2 seconds

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

        // Tick every 1 second continuously matching real time updates
        const interval = setInterval(() => {
            if (priceRef.current && seriesRef.current) {
                const now = Math.floor(Date.now() / 1000) as Time;
                seriesRef.current.update({
                    time: now,
                    value: priceRef.current
                });
                // The library natively auto-scrolls horizontally if timeVisible: true
                // and vertically scales automatically. No continuous fitContent() needed!
            }
        }, 1000);

        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };
        window.addEventListener("resize", handleResize);

        return () => {
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
