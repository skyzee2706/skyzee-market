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
                let url = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1`;
                let intervalSec = 300; // 5m default for 1 day

                if (startTime && endTime) {
                    const duration = endTime - startTime;
                    let days = "1";
                    if (duration > 3 * 86400) { days = "7"; intervalSec = 3600; }
                    else if (duration > 86400) { days = "3"; intervalSec = 3600; }

                    // CoinGecko auto-adjusts granularity based on 'days', but we want historical span covering our start time
                    // Math.ceil converts duration to days.
                    const daysSpan = Math.ceil((Date.now() / 1000 - startTime) / 86400);
                    url = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${Math.max(1, daysSpan)}`;
                }

                const res = await fetch(url);
                const data = await res.json();

                if (!isMounted) return;

                let historicalData: any[] = data.prices.map((p: any) => ({
                    time: Math.floor(p[0] / 1000) as Time,
                    value: p[1]
                }));

                // Filter out history that is way before our start time (optional but clean)
                if (startTime) {
                    historicalData = historicalData.filter(d => (d.time as number) >= startTime);
                }

                // Pad future whitespace to lock the X-axis frame up to endTime
                if (endTime && historicalData.length > 0) {
                    let lastTime = historicalData[historicalData.length - 1].time as number;
                    while (lastTime < endTime) {
                        lastTime += intervalSec;
                        historicalData.push({ time: lastTime as Time }); // Explicitly push whitespace to lock timeline Left-to-Right
                    }
                }

                if (isMounted && seriesRef.current) {
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

                    // Enforce strict Left-to-Right drawing by locking the Timeline
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

                if (data.prices && data.prices.length > 0) {
                    setLivePrice(data.prices[data.prices.length - 1][1]);
                }
            } catch (err) {
                console.error("CoinGecko history error:", err);
            }
        }

        async function fetchLive() {
            try {
                const prices: number[] = [];

                // 1. Pyth Network
                try {
                    const pyth = await fetch("https://hermes.pyth.network/v2/updates/price/latest?ids[]=0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43", { cache: "no-store" });
                    const pythData = await pyth.json();
                    if (pythData.parsed && pythData.parsed.length > 0) {
                        const p = Number(pythData.parsed[0].price.price) * Math.pow(10, pythData.parsed[0].price.expo);
                        if (p > 0) prices.push(p);
                    }
                } catch (e) {
                    console.error("Pyth API error", e);
                }

                // 2. CoinGecko
                try {
                    const cg = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd", { cache: "no-store" });
                    const cgData = await cg.json();
                    const p = Number(cgData.bitcoin.usd);
                    if (p > 0) prices.push(p);
                } catch (e) {
                    console.error("CoinGecko API error", e);
                }

                // 3. MEXC
                try {
                    const mexc = await fetch("https://api.mexc.com/api/v3/ticker/price?symbol=BTCUSDT", { cache: "no-store" });
                    const mexcData = await mexc.json();
                    const p = Number(mexcData.price);
                    if (p > 0) prices.push(p);
                } catch (e) {
                    console.error("MEXC API error", e);
                }

                if (prices.length > 0 && isMounted) {
                    prices.sort((a, b) => a - b);
                    const mid = Math.floor(prices.length / 2);
                    const medianPrice = prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
                    setLivePrice(medianPrice);
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
                if (res !== null && res.priceRange !== null && strikePrice) {
                    const maxDiff = Math.max(
                        Math.abs(res.priceRange.maxValue - strikePrice),
                        Math.abs(res.priceRange.minValue - strikePrice)
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

                seriesRef.current.update({
                    time: now,
                    value: priceRef.current
                });

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
                // Determine remaining height in the viewport to act "Full Frame"
                const rect = chartContainerRef.current.getBoundingClientRect();
                const availableHeight = window.innerHeight - rect.top;
                chart.applyOptions({
                    width: chartContainerRef.current.clientWidth,
                    height: Math.max(availableHeight, 400) // Minimum 400px height, else fill screen
                });
            }
        };
        window.addEventListener("resize", handleResize);
        setTimeout(handleResize, 100); // Initial fit

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
            <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
                <div ref={chartContainerRef} style={{ width: "100%", paddingTop: "70px" }} />

                {/* Vertical Closed Bet Line Overlay */}
                <div
                    id="closed-bet-line"
                    style={{
                        position: "absolute",
                        top: "70px",
                        bottom: "30px", // leave space for timeline
                        width: "1px",
                        borderLeft: "2px dashed #4b5563",
                        pointerEvents: "none",
                        display: "none",
                        zIndex: 5
                    }}
                >
                    <div style={{
                        position: "absolute",
                        top: "0",
                        left: "4px",
                        color: "#9ca3af",
                        fontSize: "10px",
                        fontWeight: "600",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px"
                    }}>
                        Betting Closed
                    </div>
                </div>
            </div>
        </div>
    );
}
