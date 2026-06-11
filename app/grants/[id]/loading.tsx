// Instant skeleton for the grant detail page. The first view of a grant can take a
// few seconds while we fetch the funder's latest details, so this renders immediately
// and mirrors the real layout (header card + content cards).

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

export default function GrantDetailLoading() {
  return (
    <div style={{ maxWidth: 840, margin: "0 auto" }}>
      <Bar width={110} height={13} style={{ marginBottom: 20 }} />

      {/* Header card: funder, title, status/amount, CTA */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 14,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Bar width={140} height={11} style={{ marginBottom: 10 }} />
            <Bar width="85%" height={22} style={{ marginBottom: 8 }} />
            <Bar width="55%" height={22} />
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 10,
              flexShrink: 0,
            }}
          >
            <Bar width={64} height={22} style={{ borderRadius: 999 }} />
            <Bar width={90} height={20} />
          </div>
        </div>
        <Bar width={190} height={34} style={{ borderRadius: 5 }} />
        <p
          style={{ fontSize: 12.5, color: "var(--muted)", margin: "12px 0 0" }}
        >
          Getting this grant ready — fetching the latest details from the
          funder…
        </p>
      </div>

      {/* Content cards */}
      {[0, 1, 2].map((i) => (
        <div key={i} className="card card-pad" style={{ marginBottom: 16 }}>
          <Bar width={120} height={11} style={{ marginBottom: 12 }} />
          <Bar width="100%" style={{ marginBottom: 8 }} />
          <Bar width="92%" style={{ marginBottom: 8 }} />
          <Bar width="60%" />
        </div>
      ))}
    </div>
  );
}
