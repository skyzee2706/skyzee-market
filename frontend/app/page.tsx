"use client";

import { MarketCard } from "@/components/MarketCard";
import { useFactory } from "@/hooks/useFactory";
import { useAllMarketsStatus } from "@/hooks/useMarket";

export default function HomePage() {
  const { markets, isLoading: isFactoryLoading } = useFactory();
  const { statuses, isLoading: isStatusLoading } = useAllMarketsStatus(markets);

  // Filter down to only those that are NOT resolved
  const activeMarkets = markets.filter((addr) => statuses[addr] === false);

  const isLoading = isFactoryLoading || isStatusLoading;

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 24px" }}>
      {/* Hero */}
      <div style={{ marginBottom: "48px", textAlign: "center" }}>
        <div
          style={{
            display: "inline-block",
            fontSize: "11px",
            fontWeight: 700,
            color: "var(--accent-blue)",
            background: "rgba(99,102,241,0.1)",
            border: "1px solid rgba(99,102,241,0.3)",
            borderRadius: "20px",
            padding: "4px 14px",
            marginBottom: "20px",
            letterSpacing: "1px",
            textTransform: "uppercase",
          }}
        >
          Live Now
        </div>
        <h1
          style={{
            fontSize: "clamp(36px, 5vw, 60px)",
            fontWeight: 800,
            lineHeight: 1.1,
            background: "linear-gradient(135deg, #f0f1f5 0%, #6366f1 60%, #8b5cf6 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: "16px",
            letterSpacing: "-1.5px",
          }}
        >
          Predict the Future.
          <br />
          Earn on the Truth.
        </h1>
        <p
          style={{
            fontSize: "18px",
            color: "var(--text-secondary)",
            maxWidth: "520px",
            margin: "0 auto",
            lineHeight: 1.6,
          }}
        >
          Decentralized predictions. On-chain truth.
        </p>

        {/* Stats row */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "32px",
            marginTop: "36px",
            flexWrap: "wrap",
          }}
        >
          {[
            { label: "Active Markets", value: activeMarkets.length },
            { label: "Platform Fee", value: "1%" },
            { label: "Network", value: "Sepolia" },
          ].map((s) => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: 800,
                  color: "var(--text-primary)",
                }}
              >
                {String(s.value)}
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
        }}
      >
        <h2
          style={{
            fontSize: "20px",
            fontWeight: 700,
            color: "var(--text-primary)",
          }}
        >
          🔮 Active Markets
        </h2>
        <span
          style={{
            fontSize: "13px",
            color: "var(--text-muted)",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            padding: "4px 12px",
            borderRadius: "8px",
          }}
        >
          {activeMarkets.length} market{activeMarkets.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Market grid */}
      {isLoading ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "20px",
          }}
        >
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "16px",
                height: "220px",
                opacity: 0.4 + i * 0.2,
              }}
            />
          ))}
        </div>
      ) : activeMarkets.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "80px 24px",
            border: "1px dashed var(--border)",
            borderRadius: "16px",
            color: "var(--text-muted)",
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔮</div>
          <p style={{ fontSize: "16px", marginBottom: "8px", color: "var(--text-secondary)" }}>
            No markets yet
          </p>
          <p style={{ fontSize: "13px" }}>
            Deploy the factory and create your first market via script
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "20px",
          }}
        >
          {activeMarkets.map((addr) => (
            <MarketCard key={addr} address={addr} />
          ))}
        </div>
      )}

      {/* How it works */}
      <div style={{ marginTop: "80px" }}>
        <h2
          style={{
            fontSize: "20px",
            fontWeight: 700,
            marginBottom: "24px",
            color: "var(--text-secondary)",
            textAlign: "center",
          }}
        >
          How It Works
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
          }}
        >
          {[
            { icon: "🔗", title: "Connect Wallet", desc: "Connect MetaMask on Sepolia testnet" },
            { icon: "💡", title: "Pick a Market", desc: "Browse active prediction markets" },
            { icon: "📈", title: "Place Your Bet", desc: "Buy YES or NO shares with USDT (fee in ETH)" },
            { icon: "🏆", title: "Claim Winnings", desc: "Winners get full payout on resolution" },
          ].map((step) => (
            <div
              key={step.title}
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                padding: "20px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "32px", marginBottom: "12px" }}>{step.icon}</div>
              <div style={{ fontWeight: 700, marginBottom: "6px", color: "var(--text-primary)" }}>
                {step.title}
              </div>
              <div style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.5 }}>
                {step.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
