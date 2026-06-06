import Link from "next/link";
import { listOpportunities } from "@/lib/procurement/data";
import { getIsAdmin } from "@/lib/admin-auth";
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
  const diffDays = Math.ceil(
    (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
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

// Source connectors (migration 036). Friendly labels for the source filter.
const SOURCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "find-tender", label: "Find a Tender" },
  { value: "contracts-finder", label: "Contracts Finder" },
  { value: "public-contracts-scotland", label: "Public Contracts Scotland" },
  { value: "sell2wales", label: "Sell2Wales" },
  { value: "etenders-ni", label: "eTenders NI" },
  { value: "manual-upload", label: "Manual upload" },
];

// CPV divisions (2-digit prefix) most relevant to UK public-sector SME suppliers.
const SECTOR_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "72", label: "IT services (72)" },
  { value: "48", label: "Software (48)" },
  { value: "30", label: "Computing & office equipment (30)" },
  { value: "64", label: "Telecoms (64)" },
  { value: "79", label: "Business & professional services (79)" },
  { value: "71", label: "Engineering & architecture (71)" },
  { value: "45", label: "Construction (45)" },
  { value: "50", label: "Repair & maintenance (50)" },
  { value: "85", label: "Health & social care (85)" },
  { value: "80", label: "Education & training (80)" },
  { value: "90", label: "Environmental services (90)" },
];

const DEADLINE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "open", label: "Open (default)" },
  { value: "soon", label: "Closing soon (7d)" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "Any deadline" },
];

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function OpportunitiesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.search ?? "";
  const status = params.status ?? "";
  const stage = params.stage ?? "";
  const region = params.region ?? "";
  const buyer = params.buyer ?? "";
  const source = params.source ?? "";
  const sector = params.sector ?? "";
  const valueMin = params.valueMin ?? "";
  const valueMax = params.valueMax ?? "";
  // Default to open tenders so the browse view is relevant out of the box.
  const deadline = params.deadline ?? "open";

  let opportunities: OpportunityRow[] = [];
  let total = 0;
  let fetchError: string | null = null;
  const isAdmin = await getIsAdmin();

  try {
    const result = await listOpportunities({
      search: search || undefined,
      status: status || undefined,
      stage: stage || undefined,
      region: region || undefined,
      buyer: buyer || undefined,
      source: source || undefined,
      sector: sector || undefined,
      valueMin: valueMin ? Number(valueMin) : undefined,
      valueMax: valueMax ? Number(valueMax) : undefined,
      deadline: deadline === "all" ? undefined : deadline,
      limit: 50,
    });
    opportunities = result.opportunities;
    total = result.total;
  } catch (err) {
    fetchError =
      err instanceof Error ? err.message : "Failed to load opportunities";
  }

  // "open" is the default, so it doesn't count as an active filter.
  const hasFilters = !!(
    search ||
    status ||
    stage ||
    region ||
    buyer ||
    source ||
    sector ||
    valueMin ||
    valueMax ||
    (deadline && deadline !== "open")
  );

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
          Browse and filter public-sector tender opportunities synced from your
          connected sources. Score bid fit, add to your pipeline, and start RFP
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
            name="deadline"
            defaultValue={deadline}
            className="input"
            style={{ flex: "0 0 150px" }}
          >
            {DEADLINE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            name="sector"
            defaultValue={sector}
            className="input"
            style={{ flex: "0 0 200px" }}
          >
            <option value="">All sectors</option>
            {SECTOR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            name="source"
            defaultValue={source}
            className="input"
            style={{ flex: "0 0 180px" }}
          >
            <option value="">All sources</option>
            {SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            name="stage"
            defaultValue={stage}
            className="input"
            style={{ flex: "0 0 130px" }}
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
          <input
            name="buyer"
            defaultValue={buyer}
            placeholder="Buyer…"
            className="input"
            style={{ flex: "0 0 150px" }}
          />
          {/* Region filter intentionally omitted: opportunities.region /
              buyer_region are not yet populated by the connectors (Contracts
              Finder OCDS). Re-add once Epic 7 backfills location. */}
          <input
            name="valueMin"
            defaultValue={valueMin}
            type="number"
            min="0"
            placeholder="Min £"
            className="input"
            style={{ flex: "0 0 100px" }}
          />
          <input
            name="valueMax"
            defaultValue={valueMax}
            type="number"
            min="0"
            placeholder="Max £"
            className="input"
            style={{ flex: "0 0 100px" }}
          />
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
        </span>
        {isAdmin && (
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
        )}
      </div>

      {/* Error state */}
      {fetchError && (
        <div
          className="card card-pad"
          style={{
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            padding: "16px 20px",
            marginBottom: 16,
          }}
        >
          <p style={{ fontSize: 13, color: "#dc2626" }}>
            Error loading opportunities: {fetchError}
          </p>
        </div>
      )}

      {/* Empty state */}
      {!fetchError && opportunities.length === 0 && (
        <div
          className="card card-pad"
          style={{ textAlign: "center", padding: "48px 32px" }}
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
              : isAdmin
                ? "Connect a procurement source and run a sync to start seeing live UK tender opportunities here."
                : "Your admin is setting up procurement sources. Check back soon."}
          </p>
          {!hasFilters && isAdmin && (
            <Link href="/sources" className="btn primary">
              Connect a source
            </Link>
          )}
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
                key={opp.id}
                href={`/opportunities/${opp.id}`}
                style={{ textDecoration: "none" }}
              >
                <div
                  className="opp-row"
                  style={{
                    padding: "16px 20px",
                    borderBottom:
                      i < opportunities.length - 1
                        ? "1px solid var(--border)"
                        : "none",
                    display: "flex",
                    gap: 16,
                    alignItems: "flex-start",
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
                          color: deadline.urgent ? "#dc2626" : "var(--muted)",
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
          </p>
        </div>
      )}
    </div>
  );
}
