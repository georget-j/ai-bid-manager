// Zero-dependency SVG chart primitives (server-renderable, inline styles + CSS vars).
// Used by the Buyers tab. Purely presentational — no client interactivity.

export interface Segment {
  label: string;
  value: number;
  color: string;
}

/** Donut chart with a centred total and a legend. */
export function Donut({
  segments,
  size = 116,
  thickness = 16,
  centerLabel,
  centerSub,
}: {
  segments: Segment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  let acc = 0;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          position: "relative",
          width: size,
          height: size,
          flexShrink: 0,
        }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--border)"
            strokeWidth={thickness}
          />
          {total > 0 &&
            segments.map((s, i) => {
              const frac = s.value / total;
              const dash = frac * circ;
              const el = (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={thickness}
                  strokeDasharray={`${dash} ${circ - dash}`}
                  strokeDashoffset={-acc * circ}
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
              );
              acc += frac;
              return el;
            })}
        </svg>
        {(centerLabel || centerSub) && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {centerLabel && (
              <span
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  fontFamily: "var(--font-mono)",
                  color: "var(--ink)",
                  lineHeight: 1,
                }}
              >
                {centerLabel}
              </span>
            )}
            {centerSub && (
              <span
                style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}
              >
                {centerSub}
              </span>
            )}
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 5,
          minWidth: 0,
        }}
      >
        {segments.map((s) => (
          <div
            key={s.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              fontSize: 12,
            }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: 2,
                background: s.color,
                flexShrink: 0,
              }}
            />
            <span
              style={{ color: "var(--ink-2)", textTransform: "capitalize" }}
            >
              {s.label}
            </span>
            <span
              style={{
                marginLeft: "auto",
                fontFamily: "var(--font-mono)",
                color: "var(--ink)",
              }}
            >
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface BarItem {
  label: string;
  value: number;
  color?: string;
}

/** Horizontal labelled bars (e.g. top sectors). */
export function BarList({
  items,
  accent = "var(--accent)",
}: {
  items: BarItem[];
  accent?: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((it) => (
        <div key={it.label}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              marginBottom: 3,
            }}
          >
            <span style={{ color: "var(--ink-2)" }}>{it.label}</span>
            <span
              style={{ fontFamily: "var(--font-mono)", color: "var(--muted)" }}
            >
              {it.value}
            </span>
          </div>
          <div
            style={{
              height: 6,
              background: "var(--border)",
              borderRadius: 99,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(it.value / max) * 100}%`,
                height: "100%",
                background: it.color ?? accent,
                borderRadius: 99,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Vertical bars for a time series (e.g. notices per month). */
export function Sparkbars({
  data,
  height = 52,
  color = "var(--accent)",
}: {
  data: Array<{ label: string; value: number }>;
  height?: number;
  color?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 3,
          height,
        }}
      >
        {data.map((d, i) => (
          <div
            key={i}
            title={`${d.label}: ${d.value}`}
            style={{
              flex: 1,
              height: `${Math.max(2, (d.value / max) * height)}px`,
              background: d.value > 0 ? color : "var(--border)",
              borderRadius: 2,
              minWidth: 4,
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 4,
          fontSize: 9.5,
          color: "var(--muted)",
        }}
      >
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}
