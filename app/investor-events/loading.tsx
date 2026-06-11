// Instant skeleton for the investor events page — mirrors the real layout
// (header, filter bar, map + event list split) while the catalogue loads.

function Bar({
  width,
  height = 14,
  style,
}: {
  width: number | string;
  height?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div className="shimmer" style={{ width, height, ...style }} aria-hidden />
  );
}

export default function InvestorEventsLoading() {
  return (
    <div style={{ maxWidth: 1080 }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <Bar width={70} height={11} style={{ marginBottom: 10 }} />
        <Bar width={260} height={26} style={{ marginBottom: 10 }} />
        <Bar width="60%" height={14} />
      </div>

      {/* Filter bar */}
      <div
        className="card card-pad"
        style={{ display: "flex", gap: 10, marginBottom: 14 }}
      >
        <Bar width={200} height={28} style={{ borderRadius: 6 }} />
        <Bar width={320} height={28} style={{ borderRadius: 999 }} />
      </div>

      {/* Map + list split */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 460px", minWidth: 320 }}>
          <Bar width="100%" height={600} style={{ borderRadius: 10 }} />
        </div>
        <div
          style={{
            flex: "1 1 380px",
            minWidth: 300,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="card card-pad"
              style={{ display: "flex", gap: 12 }}
            >
              <Bar width={44} height={40} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <Bar width="80%" style={{ marginBottom: 8 }} />
                <Bar
                  width={120}
                  height={18}
                  style={{ borderRadius: 999, marginBottom: 8 }}
                />
                <Bar width="55%" height={12} />
              </div>
            </div>
          ))}
          <p style={{ fontSize: 12.5, color: "var(--muted)" }}>
            Finding upcoming investor events…
          </p>
        </div>
      </div>
    </div>
  );
}
