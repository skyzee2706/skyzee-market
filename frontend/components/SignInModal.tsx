"use client";
import { useSignIn } from "@/hooks/useSignIn";

export function SignInModal() {
    const { showSignModal, signIn, dismiss, isSigning, isSwitching, error } = useSignIn();

    if (!showSignModal) return null;

    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "16px",
        }}>
            <div style={{
                background: "var(--bg-card)", border: "1px solid var(--border)",
                borderRadius: "24px", padding: "36px 32px", maxWidth: "420px", width: "100%",
                boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
                animation: "fadeSlideUp 0.3s ease",
                textAlign: "center",
            }}>
                {/* Icon */}
                <div style={{
                    width: "64px", height: "64px", borderRadius: "50%",
                    background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))",
                    border: "1px solid rgba(99,102,241,0.4)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    margin: "0 auto 20px", fontSize: "28px",
                }}>
                    ✍️
                </div>

                <h2 style={{ fontSize: "22px", fontWeight: 800, color: "var(--text-primary)", marginBottom: "10px", letterSpacing: "-0.5px" }}>
                    Sign In to Sky Market
                </h2>

                <p style={{ color: "var(--text-muted)", fontSize: "14px", lineHeight: "1.6", marginBottom: "24px" }}>
                    Sign a message to verify wallet ownership.<br />
                    <span style={{ color: "var(--accent-yes)", fontWeight: 600 }}>Free – no gas required.</span>
                </p>

                {error && (
                    <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px", color: "#ef4444" }}>
                        {error}
                    </div>
                )}

                {/* Sign button */}
                <button
                    onClick={signIn}
                    disabled={isSigning || isSwitching}
                    style={{
                        width: "100%", padding: "14px",
                        background: isSigning || isSwitching
                            ? "var(--bg-elevated)"
                            : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                        border: "none", borderRadius: "12px", color: "white",
                        fontSize: "15px", fontWeight: 700, cursor: isSigning || isSwitching ? "not-allowed" : "pointer",
                        transition: "all 0.2s", marginBottom: "12px",
                        letterSpacing: "0.3px",
                    }}
                >
                    {isSwitching ? "🔄 Switching to Sepolia…" : isSigning ? "⏳ Waiting for signature…" : "🔏 Sign to Login"}
                </button>
            </div>

            <style>{`
                @keyframes fadeSlideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
