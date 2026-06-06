import Link from "next/link";
import { notFound } from "next/navigation";
import { getServiceSupabase } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

interface BuyerOpp {
  id: string;
  title: string;
  status: string | null;
  procurement_stage: string | null;
  value_amount: number | string | null;
  value_currency: string | null;
  deadline_at: string | null;
  published_at: string | null;
  created_at: string | null;
  cpv_codes: string[] | null;
  region: string | null;
}

// CPV division (2-digit) → friendly label. Mirrors the opportunities sector filter.
const CPV_DIVISION: Record<string, string> = {
  "72": "IT services",
  "48": "Software",
  "30": "Computing & office equipment",
  "64": "Telecoms",
  "79": "Business & professional services",
  "71": "Engineering & architecture",
  "45": "Construction",
  "50": "Repair & maintenance",
  "85": "Health & social care",
  "80": "Education & training",
  "90": "Environmental services",
  "60": "Transport",
  "33": "Medical equipment",
  "44": "Construction materials",
};

function fmtMoney(n: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `£${Math.round(n / 1_000)}k`;
  return `£${Math.round(n).toLocaleString()}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const STATUS_COLOR: Record<string, string> = {
  active: "#059669",
  awarded: "#3b82f6",
  closed: "#6b7280",
  planned: "#d97706",
  cancelled: "#dc2626",
};

export default async function BuyerDetailPage({
  params,
}: {
  params: Promise<{ buyer: string }>;
}) {
  const { buyer: raw } = await params;
  const buyerName = decodeURIComponent(raw);

  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("opportunities")
    .select(
      "id, title, status, procurement_stage, value_amount, value_currency, deadline_at, published_at, created_at, cpv_codes, region",
    )
    .eq("buyer_name", buyerName)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(1000);

  const opps = (data ?? []) as BuyerOpp[];
  if (opps.length === 0) notFound();

  // KPIs. Server component rendered per request (force-dynamic), so reading the
  // current request time to compute "open now" is intentional and stable per render.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const total = opps.length;
  const open = opps.filter(
    (o) =>
      o.status === "active" &&
      (!o.deadline_at || new Date(o.deadline_at).getTime() >= now),
  ).length;
  const awards = opps.filter((o) => o.procurement_stage === "award").length;
  const valued = opps
    .map((o) => Number(o.value_amount) || 0)
    .filter((v) => v > 0);
  const totalValue = valued.reduce((a, b) => a + b, 0);
  const avgValue = valued.length ? totalValue / valued.length : 0;
  const region = opps.find((o) => o.region)?.region ?? null;
  const seen = opps
    .map((o) => o.published_at ?? o.created_at)
    .filter(Boolean) as string[];
  const firstSeen = seen.length ? seen[seen.length - 1] : null;
  const lastSeen = seen.length ? seen[0] : null;

  // Status breakdown
  const statusCounts = new Map<string, number>();
  for (const o of opps) {
    const s = o.status ?? "unknown";
    statusCounts.set(s, (statusCounts.get(s) ?? 0) + 1);
  }
  const statusBreakdown = [...statusCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  );

  // Top sectors (CPV divisions)
  const divCounts = new Map<string, number>();
  for (const o of opps) {
    const divs = new Set((o.cpv_codes ?? []).map((c) => c.slice(0, 2)));
    for (const d of divs) divCounts.set(d, (divCounts.get(d) ?? 0) + 1);
  }
  const topSectors = [...divCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const recent = opps.slice(0, 8);

  const kpis: Array<{ label: string; value: string }> = [
    { label: "Notices", value: total.toLocaleString() },
    { label: "Open now", value: open.toLocaleString() },
    { label: "Awards", value: awards.toLocaleString() },
    { label: "Avg value", value: fmtMoney(avgValue) },
    { label: "Total value", value: fmtMoney(totalValue) },
  ];

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 8 }}>
        <Link
          href="/buyers"
          style={{
            fontSize: 12.5,
            color: "var(--accent)",
            textDecoration: "none",
          }}
        >
          ← All buyers
        </Link>
      </div>

      <div
        className="page-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}
      >
        <div className="eyebrow">Buyer profile</div>
        <h1 style={{ marginBottom: 0 }}>{buyerName}</h1>
        <p className="subtitle" style={{ marginTop: 4 }}>
          {region ? `${region} · ` : ""}
          Active since {fmtDate(firstSeen)} · last notice {fmtDate(lastSeen)}
        </p>
      </div>

      {/* KPI cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 10,
          marginBottom: 16,
        }}
      >
        {kpis.map((k) => (
          <div
            key={k.label}
            className="card card-pad"
            style={{ padding: "14px 16px" }}
          >
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
                color: "var(--ink)",
              }}
            >
              {k.value}
            </div>
            <div
              style={{
                fontSize: 10.5,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--muted)",
                marginTop: 2,
              }}
            >
              {k.label}
            </div>
          </div>
        ))}
      </div>

      {/* Status + sectors */}
      <div
        style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}
      >
        <div className="card card-pad" style={{ flex: "1 1 260px" }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            By status
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {statusBreakdown.map(([s, n]) => (
              <div
                key={s}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: 13,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: STATUS_COLOR[s] ?? "var(--muted)",
                    }}
                  />
                  <span
                    style={{
                      color: "var(--ink-2)",
                      textTransform: "capitalize",
                    }}
                  >
                    {s}
                  </span>
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: "var(--ink)",
                  }}
                >
                  {n}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card card-pad" style={{ flex: "1 1 260px" }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Top sectors
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {topSectors.map(([d, n]) => (
              <span
                key={d}
                style={{
                  fontSize: 12,
                  padding: "3px 9px",
                  borderRadius: 999,
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  color: "var(--ink-2)",
                }}
              >
                {CPV_DIVISION[d] ?? `CPV ${d}`} · {n}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Recent notices */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div className="eyebrow" style={{ padding: "12px 16px 0" }}>
          Recent notices
        </div>
        {recent.map((o, i) => {
          const value = Number(o.value_amount) || 0;
          return (
            <Link
              key={o.id}
              href={`/opportunities/${o.id}`}
              style={{ textDecoration: "none" }}
            >
              <div
                style={{
                  padding: "12px 16px",
                  borderTop: "1px solid var(--border)",
                  marginTop: i === 0 ? 10 : 0,
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--ink)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {o.title}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                    {o.status ?? "—"} ·{" "}
                    {fmtDate(o.published_at ?? o.created_at)}
                  </div>
                </div>
                {value > 0 && (
                  <span
                    style={{
                      fontSize: 12.5,
                      fontFamily: "var(--font-mono)",
                      color: "var(--ink-2)",
                      flexShrink: 0,
                    }}
                  >
                    {fmtMoney(value)}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {total > recent.length && (
        <div style={{ marginTop: 14, textAlign: "center" }}>
          <Link
            href={`/opportunities?buyer=${encodeURIComponent(buyerName)}`}
            className="btn ghost"
          >
            View all {total} notices from this buyer
          </Link>
        </div>
      )}
    </div>
  );
}
