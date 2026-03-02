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

    // ZERO-GAS SIMULATION: Fetch historical and live data
    useEffect(() => {
        let isMounted = true;

        async function fetchHistoryAndLive() {
            if (!startTime || !endTime) return;

            try {
                let historicalData: any[] = [];

                // 1. Try CoinGecko First
                try {
                    const daysSpan = Math.ceil((Date.now() / 1000 - startTime) / 86400);
                    const cgRes = await fetch(`https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${Math.max(1, daysSpan)}`);
                    if (cgRes.ok) {
                        const data = await cgRes.json();
                        historicalData = data.prices.map((p: any) => ({
                            time: Math.floor(p[0] / 1000) as Time,
                            value: p[1]
                        }));
                    } else {
                        throw new Error("CoinGecko non-200 response");
                    }
                } catch (e) {
                    console.warn("CoinGecko History blocked/failed, falling back to MEXC Klines...");
                    // 2. Fallback to MEXC History
                    try {
                        const mexcInterval = "5m";
                        const mexcStartTime = `&startTime=${startTime * 1000}`;
                        const mexcRes = await fetch(`https://api.mexc.com/api/v3/klines?symbol=${symbol}&interval=${mexcInterval}${mexcStartTime}&limit=1000`);
                        if (mexcRes.ok) {
                            const data = await mexcRes.json();
                            historicalData = data.map((k: any) => ({
                                time: Math.floor(k[0] / 1000) as Time, // OpenTime
                                value: Number(k[1])                    // OpenPrice
                            }));
                        }
                    } catch (mexcErr) {
                        console.error("All History APIs failed to load, chart will start blank.");
                    }
                }

                if (!isMounted) return;

                // Sync and draw historical data
                if (startTime) {
                    historicalData = historicalData.filter(d => (d.time as number) >= startTime);
                    const nowSec = Math.floor(Date.now() / 1000);
                    historicalData = historicalData.filter(d => (d.time as number) <= nowSec);
                }

                if (isMounted && seriesRef.current) {
                    if (historicalData.length > 0) {
                        lastUpdatedTimeRef.current = historicalData[historicalData.length - 1].time as number;
                    } else {
                        lastUpdatedTimeRef.current = startTime - 1;
                    }
                    seriesRef.current.setData(historicalData);
                }
            } catch (err) {
                console.error("fetchHistoryAndLive wrapper error:", err);
            }
        }

        fetchHistoryAndLive();

        return () => {
            isMounted = false;
        };
    }, [startTime, endTime, symbol]);

    // Live Price Fetcher (Centralized API)
    useEffect(() => {
        let isMounted = true;

        async function fetchLive() {
            try {
                const res = await fetch("/api/price", { cache: "no-store" });
                if (res.ok && isMounted) {
                    const data = await res.json();
                    if (data.price && data.price > 0) {
                        setLivePrice(data.price);
                    }
                }
            } catch (err) {
                console.error("Live fetch wrapper error:", err);
            }
        }

        const interval = setInterval(fetchLive, 1000);
        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, []);

    const priceRef = useRef<number | null>(null);
    const lastUpdatedTimeRef = useRef<number>(0);

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
                shiftVisibleRangeOnNewBar: false,
                fixLeftEdge: true,
                fixRightEdge: true,
                lockVisibleTimeRangeOnResize: true,
                tickMarkFormatter: (time: Time) => {
                    const date = new Date((time as number) * 1000);
                    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                },
            },
            crosshair: {
                mode: 1,
                vertLine: { color: "#6366f1", labelBackgroundColor: "#6366f1", style: 3 },
                horzLine: { color: "#6366f1", labelBackgroundColor: "#6366f1", style: 3 },
            },
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
            priceFormat: {
                type: "price",
                precision: 2,
                minMove: 0.01,
            },
            autoscaleInfoProvider: (original: any) => {
                const res = original();
                let currentMin = strikePrice || 0;
                let currentMax = strikePrice || 0;

                if (res !== null && res.priceRange !== null) {
                    currentMin = res.priceRange.minValue;
                    currentMax = res.priceRange.maxValue;
                }

                if (priceRef.current !== null) {
                    currentMin = Math.min(currentMin, priceRef.current);
                    currentMax = Math.max(currentMax, priceRef.current);
                }

                if (strikePrice) {
                    const maxDiff = Math.max(
                        Math.abs(currentMax - strikePrice),
                        Math.abs(currentMin - strikePrice)
                    );
                    const padding = maxDiff * 0.15;

                    if (maxDiff === 0) {
                        return { priceRange: { minValue: strikePrice - 100, maxValue: strikePrice + 100 }, margins: { above: 0, below: 0 } };
                    }
                    return {
                        priceRange: {
                            minValue: strikePrice - maxDiff - padding,
                            maxValue: strikePrice + maxDiff + padding,
                        },
                        margins: { above: 0, below: 0 }
                    };
                }
                return res;
            },
        });

        const invisibleSeries = chart.addSeries(LineSeries, {
            color: 'transparent',
            lineWidth: 1,
            crosshairMarkerVisible: false,
            priceLineVisible: false,
            lastValueVisible: false,
            autoscaleInfoProvider: () => null,
        });

        if (startTime && endTime) {
            const timeData: any[] = [];
            let t = startTime;
            while (t <= endTime) {
                timeData.push({ time: t as Time, value: strikePrice || 0 });
                t += 300;
            }
            if (bettingEndTime) timeData.push({ time: bettingEndTime as Time, value: strikePrice || 0 });
            timeData.push({ time: endTime as Time, value: strikePrice || 0 });

            timeData.sort((a, b) => (a.time as number) - (b.time as number));
            const uniqueTimeData = timeData.filter((item, pos, ary) => {
                return !pos || item.time !== ary[pos - 1].time;
            });

            invisibleSeries.setData(uniqueTimeData);

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
                (invisibleSeries as any).setMarkers(markers);
            }

            chart.timeScale().setVisibleRange({
                from: startTime as Time,
                to: endTime as Time
            });
        }

        if (strikePrice) {
            series.createPriceLine({
                price: strikePrice,
                color: '#06b6d4',
                lineWidth: 2,
                lineStyle: 3,
                axisLabelVisible: true,
                title: 'Target',
            });
        }

        chartRef.current = chart;
        seriesRef.current = series;

        const updateInterval = setInterval(() => {
            if (priceRef.current && seriesRef.current) {
                const currentTimestamp = Math.floor(Date.now() / 1000);
                if (endTime && currentTimestamp > endTime) return;

                if (currentTimestamp >= lastUpdatedTimeRef.current) {
                    seriesRef.current.update({
                        time: currentTimestamp as Time,
                        value: priceRef.current
                    });
                    lastUpdatedTimeRef.current = currentTimestamp;
                }

                if (bettingEndTime && chartRef.current) {
                    const xPos = chartRef.current.timeScale().timeToCoordinate(bettingEndTime as Time);
                    const lineDiv = document.getElementById("closed-bet-line");
                    if (lineDiv && xPos !== null) {
                        lineDiv.style.left = `${xPos}px`;
                        lineDiv.style.display = "block";
                    }
                }
            }
        }, 1000);

        const handleResize = () => {
            if (chartContainerRef.current && chartRef.current) {
                chartRef.current.applyOptions({
                    width: chartContainerRef.current.clientWidth,
                    height: chartContainerRef.current.clientHeight
                });
            }
        };

        const resizeObserver = new ResizeObserver(() => {
            handleResize();
        });

        if (chartContainerRef.current) {
            resizeObserver.observe(chartContainerRef.current);
        }

        return () => {
            clearInterval(updateInterval);
            resizeObserver.disconnect();
            chart.remove();
        };
    }, [height, startTime, endTime, symbol, strikePrice, bettingEndTime]);

    return (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", overflow: "hidden" }}>
            <div style={{
                padding: "16px 16px 8px 16px",
                display: "flex",
                flexDirection: "column",
                zIndex: 10,
                flexShrink: 0
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
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

            <div style={{ position: "relative", flexGrow: 1, width: "100%" }}>
                <div ref={chartContainerRef} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
                <div
                    id="closed-bet-line"
                    style={{
                        position: "absolute",
                        top: "0px",
                        bottom: "26px",
                        width: "1px",
                        borderLeft: "2px dashed #4b5563",
                        pointerEvents: "none",
                        display: "none",
                        zIndex: 5
                    }}
                >
                    <div style={{
                        position: "absolute",
                        top: "10px",
                        left: "4px",
                        color: "var(--text-muted)",
                        fontSize: "11px",
                        fontWeight: "600",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        background: "var(--bg-card)",
                        padding: "2px 4px",
                        borderRadius: "4px"
                    }}>
                        Betting Closed
                    </div>
                </div>
            </div>
        </div>
    );
}
