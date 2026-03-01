"use client";

import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { parseUnits, formatUnits, formatEther } from "viem";
import PredictionMarketABI from "@/abis/PredictionMarket.json";
import { MarketInfo } from "@/hooks/useMarket";
import { useTokenBalance, useAllowance, useApproveUSDT } from "@/hooks/useUSDT";
import { FaucetModal } from "./FaucetModal";

const USDT_DECIMALS = 6;

interface Props {
    address: `0x${string}`;
    marketInfo: MarketInfo;
    yesBet: bigint;
    noBet: bigint;
    claimed: boolean;
    onSuccess: () => void;
}

export function BetPanel({ address, marketInfo, yesBet, noBet, claimed, onSuccess }: Props) {
    const { address: userAddress, isConnected } = useAccount();
    const [side, setSide] = useState<"YES" | "NO">("YES");
    const [amount, setAmount] = useState("");
    const [showFaucet, setShowFaucet] = useState(false);

    // USDT state
    const { balance: usdtBalance, refetch: refetchBalance } = useTokenBalance(userAddress);
    const { allowance, refetch: refetchAllowance } = useAllowance(userAddress, address);
    const { approve, isConfirming: isApproving, isSuccess: approveOk } = useApproveUSDT(address);

    // Bet transaction
    const { writeContract, data: txHash, isPending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

    useEffect(() => {
        if (isSuccess) { setAmount(""); onSuccess(); refetchBalance(); refetchAllowance(); }
    }, [isSuccess, onSuccess, refetchBalance, refetchAllowance]);

    useEffect(() => {
        if (approveOk) refetchAllowance();
    }, [approveOk, refetchAllowance]);

    const { yesPool, noPool, yesPrice, resolved, result, endTime, bettingEndTime } = marketInfo;
    const totalPool = yesPool + noPool;
    const yesPct = Number(yesPrice) / 1e16;
    const noPct = 100 - yesPct;
    const now = Date.now() / 1000;
    const bettingOpen = !resolved && Number(bettingEndTime) > now;
    const pendingSettlement = !resolved && Number(bettingEndTime) <= now && Number(endTime) > now;
    const isLive = bettingOpen; // alias used by downstream logic

    const amountWei = amount ? parseUnits(amount as `${number}`, USDT_DECIMALS) : 0n;
    const needsApproval = amountWei > 0n && allowance < amountWei;

    // Read ETH fee from contract (on-chain, updates as amount changes)
    const { data: ethFeeData } = useReadContract({
        address,
        abi: PredictionMarketABI as any,
        functionName: "calcEthFee",
        args: amountWei > 0n ? [amountWei] : undefined,
        query: { enabled: amountWei > 0n },
    });
    const ethFee = (ethFeeData as bigint | undefined) ?? 0n;
    const ethFeeDisplay = ethFee > 0n ? parseFloat(formatEther(ethFee)).toFixed(6) : "—";

    // Payout estimate (no fee on winnings now — full payout)
    function calcPayout(amtStr: string, isSideYes: boolean): string {
        if (!amtStr || isNaN(parseFloat(amtStr))) return "0";
        try {
            const amt = parseUnits(amtStr as `${number}`, USDT_DECIMALS);
            const winPool = isSideYes ? yesPool + amt : noPool + amt;
            const total = totalPool + amt;
            const gross = (amt * total) / winPool;
            return parseFloat(formatUnits(gross, USDT_DECIMALS)).toFixed(2);
        } catch { return "0"; }
    }

    function placeBet() {
        if (!amount || !isConnected) return;
        writeContract({
            address,
            abi: PredictionMarketABI as any,
            functionName: side === "YES" ? "buyYes" : "buyNo",
            args: [amountWei],
            value: ethFee,  // ETH fee sent upfront
        });
    }

    function claimReward() {
        writeContract({ address, abi: PredictionMarketABI, functionName: "claim" });
    }

    const isBusy = isPending || isConfirming || isApproving;

    return (
        <>
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "20px", padding: "24px", position: "sticky", top: "80px" }}>
                {/* Title */}
                <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "20px" }}>
                    {resolved ? "Market Settled" : pendingSettlement ? "⏸ Pending Settlement" : "Place a Bet"}
                </h3>

                {/* Odds bars */}
                <div style={{ marginBottom: "20px" }}>
                    <div style={{ display: "flex", height: "8px", borderRadius: "4px", overflow: "hidden", marginBottom: "8px" }}>
                        <div style={{ width: `${yesPct}%`, background: "linear-gradient(90deg, #22c55e, #16a34a)", transition: "width 0.6s ease" }} />
                        <div style={{ flex: 1, background: "linear-gradient(90deg, #ef4444, #b91c1c)" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: 700 }}>
                        <span style={{ color: "var(--accent-yes)" }}>YES {yesPct.toFixed(1)}%</span>
                        <span style={{ color: "var(--accent-no)" }}>NO {noPct.toFixed(1)}%</span>
                    </div>
                </div>

                {/* USDT Balance */}
                {isConnected && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--text-muted)", marginBottom: "16px" }}>
                        <span>Your USDT Balance</span>
                        <span style={{ fontFamily: "monospace", fontWeight: 700, color: usdtBalance === 0n ? "#ef4444" : "var(--text-secondary)" }}>
                            {parseFloat(formatUnits(usdtBalance, USDT_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT
                        </span>
                    </div>
                )}

                {/* No USDT → Faucet CTA */}
                {isConnected && usdtBalance === 0n && (
                    <button
                        onClick={() => setShowFaucet(true)}
                        style={{ width: "100%", padding: "10px", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: "10px", color: "var(--accent-blue)", fontSize: "13px", fontWeight: 700, cursor: "pointer", marginBottom: "16px", transition: "all 0.2s" }}
                    >
                        🚰 No USDT? Claim from Faucet first
                    </button>
                )}

                {/* Pending Settlement Banner */}
                {pendingSettlement && (
                    <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "10px", padding: "12px", textAlign: "center", marginBottom: "16px" }}>
                        <span style={{ fontSize: "20px" }}>⏳</span>
                        <p style={{ marginTop: "6px", fontWeight: 700, color: "#f59e0b", fontSize: "14px" }}>Betting Closed</p>
                        <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                            Awaiting settlement at {new Date(Number(endTime) * 1000).toUTCString()}
                        </p>
                    </div>
                )}

                {/* Live betting */}
                {isLive && (
                    <>
                        {/* YES/NO toggle */}
                        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", background: "var(--bg-secondary)", padding: "4px", borderRadius: "10px" }}>
                            {(["YES", "NO"] as const).map((s) => (
                                <button key={s} onClick={() => setSide(s)} style={{ flex: 1, padding: "10px", borderRadius: "8px", border: "none", fontWeight: 700, fontSize: "14px", cursor: "pointer", transition: "all 0.2s", background: side === s ? (s === "YES" ? "var(--accent-yes)" : "var(--accent-no)") : "transparent", color: side === s ? "white" : "var(--text-muted)" }}>
                                    {s}
                                </button>
                            ))}
                        </div>

                        {/* Amount input */}
                        <div style={{ marginBottom: "16px" }}>
                            <label style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Amount (USDT)</label>
                            <div style={{ position: "relative" }}>
                                <input
                                    type="number" min="0" step="1" placeholder="100"
                                    value={amount} onChange={(e) => setAmount(e.target.value)}
                                    style={{ width: "100%", padding: "12px 60px 12px 16px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "10px", color: "var(--text-primary)", fontSize: "16px", fontFamily: "monospace", outline: "none", boxSizing: "border-box" }}
                                />
                                <span style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: "13px", fontWeight: 600 }}>USDT</span>
                            </div>
                        </div>

                        {/* Quick select */}
                        <div style={{ display: "flex", gap: "6px", marginBottom: "16px" }}>
                            {["100", "500", "1000"].map((v) => (
                                <button key={v} onClick={() => setAmount(v)} style={{ flex: 1, padding: "6px", background: amount === v ? "var(--accent-blue)" : "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "6px", color: amount === v ? "white" : "var(--text-muted)", fontSize: "12px", cursor: "pointer", transition: "all 0.15s", fontWeight: 600 }}>
                                    {v}
                                </button>
                            ))}
                        </div>

                        {/* Payout preview */}
                        {amount && (
                            <div style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px", marginBottom: "16px", fontSize: "13px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                                    <span style={{ color: "var(--text-muted)" }}>Est. Payout (if {side} wins)</span>
                                    <span style={{ fontWeight: 700, color: "var(--text-primary)", fontFamily: "monospace" }}>{calcPayout(amount, side === "YES")} USDT</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                                    <span style={{ color: "var(--text-muted)" }}>Platform Fee (ETH)</span>
                                    <span style={{ color: "#f59e0b", fontWeight: 600, fontFamily: "monospace" }}>{ethFeeDisplay} ETH</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span style={{ color: "var(--text-muted)" }}>Winnings Fee</span>
                                    <span style={{ color: "var(--accent-yes)", fontWeight: 600 }}>None — full payout 🎯</span>
                                </div>
                            </div>
                        )}

                        {/* Approve or Bet button */}
                        {needsApproval ? (
                            <button
                                onClick={() => approve(amount)}
                                disabled={isBusy}
                                style={{ width: "100%", padding: "14px", background: "linear-gradient(135deg, #f59e0b, #d97706)", border: "none", borderRadius: "12px", color: "white", fontSize: "15px", fontWeight: 700, cursor: isBusy ? "not-allowed" : "pointer", transition: "all 0.2s" }}
                            >
                                {isApproving ? "⏳ Approving..." : `🔓 Approve ${amount} USDT`}
                            </button>
                        ) : (
                            <button
                                onClick={placeBet}
                                disabled={!isConnected || !amount || isBusy}
                                style={{ width: "100%", padding: "14px", background: !isConnected || !amount ? "var(--bg-elevated)" : `linear-gradient(135deg, ${side === "YES" ? "#16a34a, #22c55e" : "#b91c1c, #ef4444"})`, border: "none", borderRadius: "12px", color: !isConnected || !amount ? "var(--text-muted)" : "white", fontSize: "15px", fontWeight: 700, cursor: !isConnected || !amount || isBusy ? "not-allowed" : "pointer", transition: "all 0.2s", letterSpacing: "0.3px" }}
                            >
                                {isBusy ? "⏳ Confirming..." : !isConnected ? "Connect Wallet" : `Buy ${side} ${amount ? `(${Number(amount).toLocaleString()} USDT)` : ""}`}
                            </button>
                        )}
                    </>
                )}

                {/* Claim */}
                {resolved && (
                    <>
                        <div style={{ background: result ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${result ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`, borderRadius: "10px", padding: "12px", textAlign: "center", marginBottom: "16px" }}>
                            <span style={{ fontSize: "22px" }}>{result ? "✅" : "❌"}</span>
                            <p style={{ marginTop: "6px", fontWeight: 700, color: result ? "var(--accent-yes)" : "var(--accent-no)" }}>{result ? "YES Won" : "NO Won"}</p>
                            <p style={{ marginTop: "4px", fontSize: "14px", color: "var(--text-muted)" }}>
                                Settled at: ${parseFloat(formatUnits(marketInfo.settlementPrice, 8)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                        </div>
                        {((result && yesBet > 0n) || (!result && noBet > 0n)) && !claimed && (
                            <button onClick={claimReward} disabled={isBusy} style={{ width: "100%", padding: "14px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", border: "none", borderRadius: "12px", color: "white", fontSize: "15px", fontWeight: 700, cursor: isBusy ? "not-allowed" : "pointer" }}>
                                {isBusy ? "⏳ Claiming..." : "🏆 Claim Winnings"}
                            </button>
                        )}
                        {claimed && <p style={{ textAlign: "center", color: "var(--accent-yes)", fontWeight: 700, padding: "12px" }}>✅ Already claimed!</p>}
                    </>
                )}

                {/* User position */}
                {(yesBet > 0n || noBet > 0n) && (
                    <div style={{ marginTop: "16px", padding: "12px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "10px", fontSize: "13px" }}>
                        <p style={{ color: "var(--text-muted)", marginBottom: "8px", fontWeight: 600 }}>Your Position</p>
                        {yesBet > 0n && (
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ color: "var(--accent-yes)" }}>YES</span>
                                <span style={{ fontFamily: "monospace", color: "var(--text-primary)" }}>{parseFloat(formatUnits(yesBet, USDT_DECIMALS)).toLocaleString()} USDT</span>
                            </div>
                        )}
                        {noBet > 0n && (
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ color: "var(--accent-no)" }}>NO</span>
                                <span style={{ fontFamily: "monospace", color: "var(--text-primary)" }}>{parseFloat(formatUnits(noBet, USDT_DECIMALS)).toLocaleString()} USDT</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {showFaucet && (
                <FaucetModal onClose={() => setShowFaucet(false)} onSuccess={() => { refetchBalance(); }} />
            )}
        </>
    );
}
