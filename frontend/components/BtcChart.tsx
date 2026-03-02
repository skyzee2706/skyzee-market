"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, BaselineSeries, IChartApi, ISeriesApi, Time } from "lightweight-charts";

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

    // ZERO-GAS SIMULATION: Fetch historical and live data
    useEffect(() => {
        let isMounted = true;

        async function fetchHistoryAndLive() {
            try {
                let url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=60`;
                let intervalSec = 60;

                if (startTime && endTime) {
                    const duration = endTime - startTime;
                    let intervalStr = "1m";
                    if (duration > 3 * 86400) { intervalStr = "1h"; intervalSec = 3600; }
                    else if (duration > 86400) { intervalStr = "15m"; intervalSec = 900; }
                    else if (duration > 3600) { intervalStr = "5m"; intervalSec = 300; }

                    url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${intervalStr}&startTime=${startTime * 1000}&limit=1000`;
                }

                const res = await fetch(url);
                const data = await res.json();

                if (!isMounted) return;

                const historicalData: any[] = data.map((k: any) => ({
                    time: Math.floor(k[0] / 1000) as Time,
                    value: parseFloat(k[4]) // close price
                }));

                // Pad future whitespace to lock the X-axis frame up to endTime
                if (endTime && historicalData.length > 0) {
                    let lastTime = historicalData[historicalData.length - 1].time as number;
                    while (lastTime < endTime) {
                        lastTime += intervalSec;
                        if (lastTime <= endTime) {
                            historicalData.push({ time: lastTime as Time });
                        }
                    }
                    if (bettingEndTime && !historicalData.some(d => d.time === bettingEndTime)) {
                        historicalData.push({ time: bettingEndTime as Time });
                    }
                    if (!historicalData.some(d => d.time === endTime)) {
                        historicalData.push({ time: endTime as Time });
                    }
                    historicalData.sort((a, b) => (a.time as number) - (b.time as number));
                }

                if (seriesRef.current) {
                    seriesRef.current.setData(historicalData);

                    // Add markers for Betting Closes and Market Ended
                    const markers: any[] = [];
                    if (bettingEndTime) {
                        markers.push({
                            time: bettingEndTime as Time,
                            position: "aboveBar",
                            color: "#f59e0b",
                            shape: "arrowDown",
                            text: "Betting Closes"
                        });
                    }
                    if (endTime) {
                        markers.push({
                            time: endTime as Time,
                            position: "aboveBar",
                            color: "#ef4444",
                            shape: "arrowDown",
                            text: "Market Ends"
                        });
                    }
                    if (markers.length > 0) {
                        // Bypass exact generic constraints for older definition files
                        (seriesRef.current as any).setMarkers(markers);
                    }

                    chartRef.current?.timeScale().fitContent();
                }

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
                secondsVisible: false,
                tickMarkFormatter: (time: Time) => {
                    const date = new Date((time as number) * 1000);
                    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                },
            },
            crosshair: {
                mode: 1,
                vertLine: { color: "#6366f1", labelBackgroundColor: "#6366f1" },
                horzLine: { color: "#6366f1", labelBackgroundColor: "#6366f1" },
            },
            handleScroll: false,
            handleScale: false,
        });

        const series = chart.addSeries(BaselineSeries, {
            baseValue: { type: 'price', price: strikePrice || 0 },
            topLineColor: '#22c55e',          // tailwind green-500
            topFillColor1: 'rgba(34, 197, 94, 0.28)',
            topFillColor2: 'rgba(34, 197, 94, 0.05)',
            bottomLineColor: '#ef4444',       // tailwind red-500
            bottomFillColor1: 'rgba(239, 68, 68, 0.05)',
            bottomFillColor2: 'rgba(239, 68, 68, 0.28)',
            lineWidth: 2,
            priceFormat: {
                type: "price",
                precision: 2,
                minMove: 0.01,
            },
        });

        if (strikePrice) {
            series.createPriceLine({
                price: strikePrice,
                color: '#f8fafc',
                lineWidth: 1,
                lineStyle: 1, // Dotted
                axisLabelVisible: true,
                title: 'Strike',
            });
        }

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
