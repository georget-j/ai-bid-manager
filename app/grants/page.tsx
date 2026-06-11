import Link from "next/link";
import { listGrants, collapseDuplicateGrants } from "@/lib/grants/data";
import type { GrantRow } from "@/lib/grants/types";
import { daysUntil, formatDaysLeft } from "@/lib/dates";
import { formatAmountRange, AMOUNT_NOT_STATED } from "@/lib/grants/copy";

export const dynamic = "force-dynamic";

export const metadata = { title: "Grants — UK Bid Intelligence" };

const STATUS_STYLES: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  open: { label: "Open", color: "#059669", bg: "#d1fae5" },
  forthcoming: { label: "Forthcoming", color: "#b45309", bg: "#fef3c7" },
  rolling: { label: "Rolling", color: "#1d4ed8", bg: "#dbeafe" },
  closed: { label: "Closed", color: "#6b7280", bg: "#f3f4f6" },
  awarded: { label: "Awarded", color: "#6b7280", bg: "#f3f4f6" },
  unknown: { label: "—", color: "#6b7280", bg: "#f3f4f6" },
};

function deadlineBadge(
  iso: string | null,
): { label: string; color: string } | null {
  if (!iso) return null;
  const days = daysUntil(iso);
  if (days < 0) return null;
  const color = days === 0 ? "#dc2626" : days <= 14 ? "#b45309" : "#059669";
  return { label: formatDaysLeft(days), color };
}

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

// Region values as they appear in the catalogue (filtering matches them exactly).
const REGION_OPTIONS = [
  "National",
  "United Kingdom",
  "England",
  "Scotland",
  "Wales",
  "Northern Ireland",
  "Midlands",
  "North East England",
  "North West England",
  "South East England",
  "South West England",
  "International",
];

const STATUS_WORDS: Record<string, string> = {
  live: "open or upcoming",
  open: "open",
  forthcoming: "forthcoming",
  rolling: "rolling",
  closed: "closed",
  awarded: "awarded",
};

// The default view: everything you could still apply to with a planned opening —
// open calls plus forthcoming ones. Single-status options stay available below.
const DEFAULT_STATUS = "live";
const LIVE_STATUSES = ["open", "forthcoming"];

function parseAmount(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw.replace(/[£,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}
    >
      <span style={{ color: "var(--muted)", fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

export default async function GrantsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const limit = 25;

  // Default to live opportunities: with no status in the URL we show open AND
  // forthcoming calls ("Open & upcoming"). "All statuses" (status=all) keeps the
  // awarded history reachable for funder research.
  const statusParam = sp.status ?? DEFAULT_STATUS;
  const statuses = statusParam === DEFAULT_STATUS ? LIVE_STATUSES : undefined;
  const status =
    statusParam === "all" || statuses ? undefined : statusParam || undefined;
  const amountMin = parseAmount(sp.amountMin);
  const amountMax = parseAmount(sp.amountMax);

  let grants: GrantRow[] = [];
  let total = 0;
  let error: string | null = null;
  try {
    const res = await listGrants({
      search: sp.search,
      funder: sp.funder,
      status,
      statuses,
      deadline: sp.deadline,
      region: sp.region,
      amountMin,
      amountMax,
      limit,
      offset: (page - 1) * limit,
    });
    // Display-level: the same call often appears 2–3× across sources — show one
    // card per call (DB rows and their audit trails stay untouched).
    grants = collapseDuplicateGrants(res.grants);
    total = res.total;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load grants";
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Plain-English summary of what's on screen, e.g. "Showing 113 open grants".
  const statusWord =
    statusParam === "all" ? "" : (STATUS_WORDS[statusParam] ?? "");
  const otherFiltersActive = Boolean(
    sp.search ||
    sp.funder ||
    sp.deadline ||
    sp.region ||
    amountMin != null ||
    amountMax != null,
  );
  const anyFiltersActive = otherFiltersActive || statusParam !== DEFAULT_STATUS;
  const summary = [
    `Showing ${total.toLocaleString()}`,
    statusWord,
    `grant${total === 1 ? "" : "s"}`,
    otherFiltersActive ? "matching your filters" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div style={{ maxWidth: 880 }}>
      <div
        className="page-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}
      >
        <div className="eyebrow">Funding</div>
        <h1>
          Grant <em>opportunities</em>
        </h1>
        <p className="subtitle">
          UK grant funding. Open calls can be scored against your organisation
          and applied to step by step; awarded grants are shown for funder
          research.
        </p>
        <Link
          href="/my-grants"
          style={{
            fontSize: 13,
            color: "var(--accent)",
            textDecoration: "none",
          }}
        >
          See grants matched to you →
        </Link>
      </div>

      {/* Filters */}
      <form
        method="get"
        className="card card-pad"
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "flex-end",
          marginBottom: 16,
        }}
      >
        <Field label="Search">
          <input
            className="input"
            name="search"
            defaultValue={sp.search ?? ""}
            placeholder="Search title…"
            style={{ width: 180 }}
          />
        </Field>
        <Field label="Funder">
          <input
            className="input"
            name="funder"
            defaultValue={sp.funder ?? ""}
            placeholder="Funder…"
            style={{ width: 140 }}
          />
        </Field>
        <Field label="Status">
          <select
            className="input"
            name="status"
            defaultValue={statusParam}
            style={{ width: 130 }}
          >
            <option value="live">Open &amp; upcoming</option>
            <option value="open">Open</option>
            <option value="forthcoming">Forthcoming</option>
            <option value="rolling">Rolling</option>
            <option value="closed">Closed</option>
            <option value="awarded">Awarded</option>
            <option value="all">All statuses</option>
          </select>
        </Field>
        <Field label="Deadline">
          <select
            className="input"
            name="deadline"
            defaultValue={sp.deadline ?? ""}
            style={{ width: 160 }}
          >
            <option value="">Any deadline</option>
            <option value="open">Still open</option>
            <option value="soon">Closing in 30 days</option>
            <option value="closed">Deadline passed</option>
          </select>
        </Field>
        <Field label="Region">
          <select
            className="input"
            name="region"
            defaultValue={sp.region ?? ""}
            style={{ width: 150 }}
          >
            <option value="">Any region</option>
            {REGION_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount from (£)">
          <input
            className="input"
            type="number"
            name="amountMin"
            min={0}
            defaultValue={sp.amountMin ?? ""}
            placeholder="e.g. 10,000"
            style={{ width: 110 }}
          />
        </Field>
        <Field label="Amount up to (£)">
          <input
            className="input"
            type="number"
            name="amountMax"
            min={0}
            defaultValue={sp.amountMax ?? ""}
            placeholder="e.g. 250,000"
            style={{ width: 110 }}
          />
        </Field>
        <button type="submit" className="btn primary" style={{ fontSize: 13 }}>
          Filter
        </button>
      </form>

      <p
        style={{
          fontSize: 13,
          color: "var(--muted)",
          marginBottom: 12,
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <span>{summary}</span>
        {statusParam === DEFAULT_STATUS && (
          <Link
            href="/grants?status=all"
            style={{ color: "var(--accent)", textDecoration: "none" }}
          >
            Include past awards
          </Link>
        )}
        {anyFiltersActive && (
          <Link
            href="/grants"
            style={{ color: "var(--accent)", textDecoration: "none" }}
          >
            Reset filters
          </Link>
        )}
      </p>

      {error && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: "#dc2626" }}>{error}</p>
        </div>
      )}

      {!error && grants.length === 0 && (
        <div className="card card-pad">
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            No grants match these filters. Try widening the amount range,
            choosing a different region or status, or{" "}
            <Link href="/grants" style={{ color: "var(--accent)" }}>
              reset the filters
            </Link>
            .
          </p>
        </div>
      )}

      {grants.map((g) => {
        const s = STATUS_STYLES[g.status] ?? STATUS_STYLES.unknown;
        const formatted = formatAmountRange(g.amount_min, g.amount_max);
        // Cards stay quiet when there's no amount — the helper's
        // "Amount not stated" copy is for surfaces with an Amount label.
        const amount = formatted === AMOUNT_NOT_STATED ? null : formatted;
        return (
          <Link
            key={g.id}
            href={`/grants/${g.id}`}
            className="card card-pad"
            style={{
              display: "block",
              marginBottom: 10,
              textDecoration: "none",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 14.5,
                    fontWeight: 600,
                    color: "var(--ink)",
                    marginBottom: 3,
                  }}
                >
                  {g.title}
                </p>
                <p style={{ fontSize: 12.5, color: "var(--muted)" }}>
                  {g.funder_name ?? "Unknown funder"}
                  {g.regions?.length ? ` · ${g.regions[0]}` : ""}
                </p>
                {deadlineBadge(g.deadline_at) && (
                  <p
                    style={{
                      fontSize: 11.5,
                      fontWeight: 600,
                      marginTop: 4,
                      color: deadlineBadge(g.deadline_at)!.color,
                    }}
                  >
                    {deadlineBadge(g.deadline_at)!.label}
                  </p>
                )}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "2px 9px",
                    borderRadius: 999,
                    background: s.bg,
                    color: s.color,
                  }}
                >
                  {s.label}
                </span>
                {amount && (
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      fontFamily: "var(--font-mono)",
                      marginTop: 6,
                    }}
                  >
                    {amount}
                  </p>
                )}
              </div>
            </div>
          </Link>
        );
      })}

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 16,
            fontSize: 13,
          }}
        >
          {page > 1 ? (
            <Link
              href={`/grants?${new URLSearchParams({ ...sp, page: String(page - 1) } as Record<string, string>)}`}
              style={{ color: "var(--accent)" }}
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span style={{ color: "var(--muted)" }}>
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={`/grants?${new URLSearchParams({ ...sp, page: String(page + 1) } as Record<string, string>)}`}
              style={{ color: "var(--accent)" }}
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
