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
            try {
                let historicalData: any[] = [];
                let intervalSec = 300; // 5m default

                if (startTime && endTime) {
                    const duration = endTime - startTime;
                    if (duration > 3 * 86400) { intervalSec = 3600; }
                    else if (duration > 86400) { intervalSec = 3600; }
                }

                // 1. Try CoinGecko First
                try {
                    const daysSpan = startTime ? Math.ceil((Date.now() / 1000 - startTime) / 86400) : 1;
                    const cgRes = await fetch(`https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${Math.max(1, daysSpan)}`);
                    if (cgRes.ok) {
                        const data = await cgRes.json();
                        historicalData = data.prices.map((p: any) => ({
                            time: Math.floor(p[0] / 1000) as Time,
                            value: p[1]
                        }));
                        if (data.prices && data.prices.length > 0) {
                            setLivePrice(data.prices[data.prices.length - 1][1]);
                        }
                    } else {
                        throw new Error("CoinGecko non-200 response");
                    }
                } catch (e) {
                    console.warn("CoinGecko History blocked/failed, falling back to MEXC Klines...");
                    // 2. Fallback to MEXC History
                    try {
                        const mexcInterval = intervalSec >= 3600 ? "60m" : "5m";
                        const mexcStartTime = startTime ? `&startTime=${startTime * 1000}` : "";
                        const mexcRes = await fetch(`https://api.mexc.com/api/v3/klines?symbol=BTCUSDT&interval=${mexcInterval}${mexcStartTime}&limit=1000`);
                        if (mexcRes.ok) {
                            const data = await mexcRes.json();
                            historicalData = data.map((k: any) => ({
                                time: Math.floor(k[0] / 1000) as Time, // OpenTime
                                value: Number(k[1])                    // OpenPrice
                            }));
                            if (historicalData.length > 0) {
                                setLivePrice(historicalData[historicalData.length - 1].value);
                            }
                        }
                    } catch (mexcErr) {
                        console.error("All History APIs failed to load, chart will start blank.");
                    }
                }

                if (!isMounted) return;

                if (startTime) {
                    historicalData = historicalData.filter(d => (d.time as number) >= startTime);
                    // Filter out future CoinGecko artifacts if any exist so our live monotonic `update()` doesn't get rejected
                    const nowSec = Math.floor(Date.now() / 1000);
                    historicalData = historicalData.filter(d => (d.time as number) <= nowSec);
                }

                if (isMounted && seriesRef.current) {
                    if (historicalData.length > 0) {
                        lastUpdatedTimeRef.current = historicalData[historicalData.length - 1].time as number;
                    } else if (startTime) {
                        lastUpdatedTimeRef.current = startTime - 1; // Start strictly before first tick
                    }

                    seriesRef.current.setData(historicalData);

                    if (startTime && endTime) {
                        setTimeout(() => {
                            chartRef.current?.timeScale().setVisibleRange({
                                from: startTime as Time,
                                to: endTime as Time
                            });
                        }, 50);
                    } else {
                        chartRef.current?.timeScale().fitContent();
                    }
                }
            } catch (err) {
                console.error("fetchHistoryAndLive wrapper error:", err);
            }
        }

        async function fetchLive() {
            try {
                // To guarantee 100% price synchronization between the Live Frontend Chart, the text UI, 
                // and the backend PM2 resolve bot, the frontend now queries an internal server-side Next.js API route.
                // This completely prevents browser AdBlockers or CORS errors from skewing the median price.
                const res = await fetch("/api/price", { cache: "no-store" });
                if (res.ok) {
                    const data = await res.json();
                    if (data.price && data.price > 0) {
                        setLivePrice(data.price);
                    }
                }
            } catch (err) {
                console.error("Live fetch wrapper error:", err);
            }
        }

        fetchHistoryAndLive();
        // Faster polling interval to make the chart feel highly responsive (1s)
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
                fixLeftEdge: true,  // Absolutely lock the StartTime to the Left Edge
                fixRightEdge: true, // Absolutely lock the EndTime to the Right Edge
                lockVisibleTimeRangeOnResize: true,
                tickMarkFormatter: (time: Time) => {
                    const date = new Date((time as number) * 1000);
                    // Use standard en-US so it explicitly puts AM/PM
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
            autoscaleInfoProvider: (original: any) => {
                const res = original();

                // CRUCIAL FIX: Ensure our extreme live prices are ALWAYS considered in the min/max calculation 
                // so the chart perfectly zooms out and never cuts off the green/red line at the bottom or top.
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
                    const padding = maxDiff * 0.15; // 15% padding above and below

                    if (maxDiff === 0) {
                        return { priceRange: { minValue: strikePrice - 100, maxValue: strikePrice + 100 }, margins: { above: 0, below: 0 } };
                    }
                    return {
                        priceRange: {
                            minValue: strikePrice - maxDiff - padding,
                            maxValue: strikePrice + maxDiff + padding,
                        },
                        margins: { above: 0, below: 0 } // Eliminates auto-margins so it stays exactly centered
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
            // Prevent invisible baseline from warping Y-axis symmetry
            autoscaleInfoProvider: () => null,
        });

        // The Invisible Series provides the explicit shared global time Grid.
        if (startTime && endTime) {
            const timeData: any[] = [];
            let t = startTime;
            while (t <= endTime) {
                timeData.push({ time: t as Time, value: strikePrice || 0 });
                t += 300; // Lay out 5 min rigid empty track
            }
            if (bettingEndTime) timeData.push({ time: bettingEndTime as Time, value: strikePrice || 0 });
            timeData.push({ time: endTime as Time, value: strikePrice || 0 });

            timeData.sort((a, b) => (a.time as number) - (b.time as number));

            // Deduplicate to satisfy strict monotonic order
            const uniqueTimeData = timeData.filter((item, pos, ary) => {
                return !pos || item.time !== ary[pos - 1].time;
            });

            invisibleSeries.setData(uniqueTimeData);

            // Anchor Markers into the concrete invisible layout
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

            // Lock visible range onto the explicit grid bounds
            chart.timeScale().setVisibleRange({
                from: startTime as Time,
                to: endTime as Time
            });
        }

        if (strikePrice) {
            series.createPriceLine({
                price: strikePrice,
                color: '#06b6d4', // Cyan for Target line
                lineWidth: 2,
                lineStyle: 3, // 3 = Dashed, 2 = Dotted
                axisLabelVisible: true,
                title: 'Target',
            });
        }

        chartRef.current = chart;
        seriesRef.current = series;

        // Tick every 1 second continuously matching real time updates
        const interval = setInterval(() => {
            if (priceRef.current && seriesRef.current) {
                const currentTimestamp = Math.floor(Date.now() / 1000);
                const now = currentTimestamp as Time;

                // Stop injecting live updates if the market is definitively ended (prevents X-axis skewing into whitespace)
                if (endTime && currentTimestamp > endTime) {
                    return;
                }

                // Allows equal-time inline tick updates to ensure live movement
                if (currentTimestamp >= lastUpdatedTimeRef.current) {
                    seriesRef.current.update({
                        time: currentTimestamp as Time,
                        value: priceRef.current
                    });
                    lastUpdatedTimeRef.current = currentTimestamp;
                }

                // Sync the vertical "Closed Bet" line position
                if (bettingEndTime) {
                    const xPos = chart.timeScale().timeToCoordinate(bettingEndTime as Time);
                    const lineDiv = document.getElementById("closed-bet-line");
                    if (lineDiv && xPos !== null) {
                        lineDiv.style.left = `${xPos}px`;
                        lineDiv.style.display = "block";
                    }
                }
            }
        }, 1000);

        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({
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
            clearInterval(interval);
            resizeObserver.disconnect();
            chart.remove();
        };
    }, [height]);

    return (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", overflow: "hidden" }}>
            {/* Header / HUD */}
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

            {/* Chart Area */}
            <div style={{ position: "relative", flexGrow: 1, width: "100%" }}>
                {/* The ref container explicitly stretches across the bounds */}
                <div ref={chartContainerRef} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />

                {/* Vertical Closed Bet Line Overlay */}
                <div
                    id="closed-bet-line"
                    style={{
                        position: "absolute",
                        top: "0px",
                        bottom: "26px", // Leave exactly 26px explicit bottom space so it doesn't overlap the X-axis time labels
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
