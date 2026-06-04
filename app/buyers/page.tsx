import Link from "next/link";
import { getServiceSupabase } from "@/lib/supabase";
import { getAuthUser } from "@/lib/supabase-server";
import { getOrgIdForUser } from "@/lib/org";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Buyers — UK Bid Intelligence",
};

type BuyerRow = {
  buyer_name: string;
  buyer_region: string | null;
  opp_count: number;
  open_count: number;
  award_count: number;
  total_value: number;
  value_count: number;
  last_seen: string | null;
};

async function getBuyerStats(): Promise<BuyerRow[]> {
  const user = await getAuthUser().catch(() => null);
  const orgId = user ? await getOrgIdForUser(user.id) : null;
  if (!orgId) return [];

  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("opportunities")
    .select(
      "buyer_name, buyer_region, value_amount, status, procurement_stage, created_at",
    )
    .eq("org_id", orgId)
    .not("buyer_name", "is", null)
    .order("created_at", { ascending: false })
    .limit(2000);

  if (!data || data.length === 0) return [];

  const map = new Map<string, BuyerRow>();
  for (const opp of data) {
    const key = (opp.buyer_name as string).trim();
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, {
        buyer_name: key,
        buyer_region: opp.buyer_region ?? null,
        opp_count: 0,
        open_count: 0,
        award_count: 0,
        total_value: 0,
        value_count: 0,
        last_seen: null,
      });
    }
    const stat = map.get(key)!;
    stat.opp_count++;
    if (opp.status === "active") stat.open_count++;
    if (opp.procurement_stage === "award") stat.award_count++;
    if (typeof opp.value_amount === "number" && opp.value_amount > 0) {
      stat.total_value += opp.value_amount;
      stat.value_count++;
    }
    if (
      !stat.last_seen ||
      (opp.created_at && opp.created_at > stat.last_seen)
    ) {
      stat.last_seen = opp.created_at;
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.opp_count - a.opp_count)
    .slice(0, 100);
}

function fmtValue(total: number, count: number): string {
  if (count === 0) return "—";
  const avg = total / count;
  if (avg >= 1_000_000) return `£${(avg / 1_000_000).toFixed(1)}m avg`;
  if (avg >= 1_000) return `£${Math.round(avg / 1_000)}k avg`;
  return `£${Math.round(avg).toLocaleString()} avg`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function BuyersPage() {
  const buyers = await getBuyerStats();
  const isEmpty = buyers.length === 0;

  return (
    <div style={{ maxWidth: 900 }}>
      <div
        className="page-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}
      >
        <div className="eyebrow">Intelligence</div>
        <h1>
          Public sector <em>buyers</em>
        </h1>
        <p className="subtitle">
          {isEmpty
            ? "Build intelligence on the buyers who publish opportunities relevant to your organisation. Connect a source and run a sync to start."
            : `${buyers.length.toLocaleString()} buyer${buyers.length !== 1 ? "s" : ""} indexed across all procurement sources.`}
        </p>
      </div>

      {isEmpty ? (
        <div
          className="card card-pad"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            padding: "56px 40px",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "var(--accent-tint)",
              display: "grid",
              placeItems: "center",
              marginBottom: 8,
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 16 16"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 14V7l6-5 6 5v7H2z" />
              <path d="M6 14v-4h4v4" />
            </svg>
          </div>
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 20,
              color: "var(--ink)",
              lineHeight: 1.3,
              maxWidth: 440,
            }}
          >
            No buyers indexed yet.
          </p>
          <p
            style={{
              fontSize: 13,
              color: "var(--muted)",
              lineHeight: 1.6,
              maxWidth: 480,
            }}
          >
            Buyer records are populated automatically when procurement sources
            are synced. Connect a source and run a sync to start building your
            buyer intelligence.
          </p>
          <div
            style={{
              display: "flex",
              gap: 10,
              marginTop: 8,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <Link href="/sources" className="btn primary">
              Connect a source
            </Link>
            <Link href="/opportunities" className="btn ghost">
              Browse opportunities
            </Link>
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              >
                {[
                  "Buyer",
                  "Region",
                  "Notices",
                  "Open",
                  "Awards",
                  "Avg value",
                  "Last seen",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 14px",
                      textAlign: "left",
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {buyers.map((b, i) => (
                <tr
                  key={b.buyer_name}
                  style={{
                    borderBottom:
                      i < buyers.length - 1
                        ? "1px solid var(--border)"
                        : "none",
                  }}
                >
                  <td
                    style={{
                      padding: "12px 14px",
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--ink)",
                      maxWidth: 260,
                    }}
                  >
                    {b.buyer_name}
                  </td>
                  <td
                    style={{
                      padding: "12px 14px",
                      fontSize: 12,
                      color: "var(--muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {b.buyer_region ?? "—"}
                  </td>
                  <td
                    style={{
                      padding: "12px 14px",
                      fontSize: 13,
                      color: "var(--ink)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {b.opp_count.toLocaleString()}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    {b.open_count > 0 ? (
                      <span className="badge success">
                        <span className="dot success" />
                        {b.open_count}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>
                        0
                      </span>
                    )}
                  </td>
                  <td
                    style={{
                      padding: "12px 14px",
                      fontSize: 13,
                      color: "var(--muted)",
                    }}
                  >
                    {b.award_count > 0 ? b.award_count : "—"}
                  </td>
                  <td
                    style={{
                      padding: "12px 14px",
                      fontSize: 12,
                      color: "var(--muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtValue(b.total_value, b.value_count)}
                  </td>
                  <td
                    style={{
                      padding: "12px 14px",
                      fontSize: 12,
                      color: "var(--muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtDate(b.last_seen)}
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "right" }}>
                    <Link
                      href={`/opportunities?buyer=${encodeURIComponent(b.buyer_name)}`}
                      style={{
                        fontSize: 12,
                        color: "var(--accent)",
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
