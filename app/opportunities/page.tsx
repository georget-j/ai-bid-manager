import Link from "next/link";
import { listOpportunitiesWithFallback } from "@/lib/procurement/data";
import type { OpportunityRow } from "@/lib/procurement/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Opportunities — UK Bid Intelligence",
};

function formatValue(amount: number | null | undefined, _currency = "GBP") {
  if (!amount) return null;
  if (amount >= 1_000_000)
    return `£${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}m`;
  if (amount >= 1_000) return `£${Math.round(amount / 1_000)}k`;
  return `£${amount.toLocaleString()}`;
}

function formatDeadline(deadlineAt: string | null | undefined) {
  if (!deadlineAt) return null;
  const d = new Date(deadlineAt);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  const formatted = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  if (diffDays < 0) return { label: formatted, urgent: false, overdue: true };
  if (diffDays <= 7)
    return {
      label: `${diffDays}d — ${formatted}`,
      urgent: true,
      overdue: false,
    };
  if (diffDays <= 21)
    return {
      label: `${diffDays}d — ${formatted}`,
      urgent: false,
      overdue: false,
    };
  return { label: formatted, urgent: false, overdue: false };
}

const STAGE_LABELS: Record<string, string> = {
  planning: "Planning",
  tender: "Tender",
  award: "Award",
  contract: "Contract",
  implementation: "Implementation",
  unknown: "Unknown",
};

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function OpportunitiesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.search ?? "";
  const status = params.status ?? "";
  const stage = params.stage ?? "";
  const region = params.region ?? "";

  const { opportunities, total, source } = await listOpportunitiesWithFallback({
    search: search || undefined,
    status: status || undefined,
    stage: stage || undefined,
    region: region || undefined,
    limit: 50,
  });

  const hasFilters = !!(search || status || stage || region);

  return (
    <div style={{ maxWidth: 960 }}>
      <div
        className="page-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}
      >
        <div className="eyebrow">Intelligence</div>
        <h1>
          UK procurement
          <br />
          <em>opportunities</em>
        </h1>
        <p className="subtitle">
          Browse and filter public-sector tender opportunities matched to your
          organisation. Score bid fit, add to your pipeline, and start RFP
          responses directly from any opportunity.
        </p>
      </div>

      {/* Filters */}
      <form method="GET" style={{ marginBottom: 20 }}>
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <input
            name="search"
            defaultValue={search}
            placeholder="Search by title…"
            className="input"
            style={{ flex: "1 1 220px", minWidth: 0 }}
          />
          <select
            name="stage"
            defaultValue={stage}
            className="input"
            style={{ flex: "0 0 140px" }}
          >
            <option value="">All stages</option>
            <option value="tender">Tender</option>
            <option value="planning">Planning</option>
            <option value="award">Award</option>
          </select>
          <select
            name="status"
            defaultValue={status}
            className="input"
            style={{ flex: "0 0 130px" }}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="planned">Planned</option>
            <option value="closed">Closed</option>
            <option value="awarded">Awarded</option>
          </select>
          <button type="submit" className="btn primary">
            Filter
          </button>
          {hasFilters && (
            <Link href="/opportunities" className="btn ghost">
              Clear
            </Link>
          )}
        </div>
      </form>

      {/* Results header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          {total === 0
            ? "No opportunities found"
            : `${total} opportunit${total === 1 ? "y" : "ies"}`}
          {source === "seed" && (
            <span
              style={{
                marginLeft: 8,
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 999,
                background: "var(--accent-tint)",
                color: "var(--accent)",
              }}
            >
              Demo data
            </span>
          )}
        </span>
        <Link
          href="/sources"
          style={{
            fontSize: 12,
            color: "var(--accent)",
            textDecoration: "none",
          }}
        >
          + Connect a source
        </Link>
      </div>

      {/* Empty state */}
      {opportunities.length === 0 && (
        <div
          className="card card-pad"
          style={{
            textAlign: "center",
            padding: "48px 32px",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 18,
              color: "var(--ink)",
              marginBottom: 12,
            }}
          >
            {hasFilters
              ? "No opportunities match your filters."
              : "No opportunities yet."}
          </p>
          <p
            style={{
              fontSize: 13,
              color: "var(--muted)",
              lineHeight: 1.6,
              maxWidth: 440,
              margin: "0 auto 20px",
            }}
          >
            {hasFilters
              ? "Try removing some filters or broadening your search."
              : "Connect a procurement source or load demo data to get started."}
          </p>
          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Link href="/sources" className="btn primary">
              Connect a source
            </Link>
            <Link href="/demo" className="btn ghost">
              Load demo data
            </Link>
          </div>
        </div>
      )}

      {/* Opportunity list */}
      {opportunities.length > 0 && (
        <div className="card" style={{ overflow: "hidden" }}>
          {opportunities.map((opp: OpportunityRow, i: number) => {
            const deadline = formatDeadline(opp.deadline_at);
            const value = formatValue(
              Number(opp.value_amount) || null,
              opp.value_currency ?? "GBP",
            );
            return (
              <Link
                key={opp.id ?? opp.source_notice_id}
                href={`/opportunities/${opp.id ?? opp.source_notice_id}`}
                style={{ textDecoration: "none" }}
              >
                <div
                  style={{
                    padding: "16px 20px",
                    borderBottom:
                      i < opportunities.length - 1
                        ? "1px solid var(--border)"
                        : "none",
                    display: "flex",
                    gap: 16,
                    alignItems: "flex-start",
                    transition: "background 100ms",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background =
                      "var(--bg-tint)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = "";
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 4,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 500,
                          fontSize: 14,
                          color: "var(--ink)",
                          lineHeight: 1.3,
                        }}
                      >
                        {opp.title}
                      </span>
                      {opp.framework_flag && (
                        <span
                          style={{
                            fontSize: 10,
                            padding: "1px 6px",
                            borderRadius: 999,
                            background: "#dbeafe",
                            color: "#1d4ed8",
                            fontWeight: 600,
                            flexShrink: 0,
                          }}
                        >
                          Framework
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        flexWrap: "wrap",
                        fontSize: 12.5,
                        color: "var(--muted)",
                      }}
                    >
                      {opp.buyer_name && <span>{opp.buyer_name}</span>}
                      {opp.region && (
                        <>
                          <span>·</span>
                          <span>{opp.region}</span>
                        </>
                      )}
                      {opp.procurement_stage && (
                        <>
                          <span>·</span>
                          <span>
                            {STAGE_LABELS[opp.procurement_stage] ??
                              opp.procurement_stage}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 4,
                      flexShrink: 0,
                    }}
                  >
                    {value && (
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: "var(--ink)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {value}
                      </span>
                    )}
                    {deadline && (
                      <span
                        style={{
                          fontSize: 11.5,
                          color: deadline.urgent
                            ? "#dc2626"
                            : deadline.overdue
                              ? "var(--muted)"
                              : "var(--muted)",
                          fontWeight: deadline.urgent ? 600 : 400,
                        }}
                      >
                        {deadline.overdue ? "Closed · " : "Deadline · "}
                        {deadline.label}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {opportunities.length > 0 && (
        <div style={{ marginTop: 16, textAlign: "center" }}>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>
            Showing {opportunities.length} of {total}
            {source === "seed"
              ? " (demo data — connect a source to see live opportunities)"
              : ""}
          </p>
        </div>
      )}
    </div>
  );
}
