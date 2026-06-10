import Link from "next/link";
import { listGrants } from "@/lib/grants/data";
import type { GrantRow } from "@/lib/grants/types";
import { daysUntil } from "@/lib/dates";

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

function formatAmount(min: number | null, max: number | null) {
  const fmt = (n: number) =>
    n >= 1_000_000
      ? `£${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}m`
      : n >= 1_000
        ? `£${Math.round(n / 1_000)}k`
        : `£${n.toLocaleString()}`;
  if (min != null && max != null && min !== max)
    return `${fmt(min)}–${fmt(max)}`;
  const one = max ?? min;
  return one != null ? fmt(one) : null;
}

function deadlineBadge(
  iso: string | null,
): { label: string; color: string } | null {
  if (!iso) return null;
  const days = daysUntil(iso);
  if (days < 0) return null;
  if (days === 0) return { label: "Due today", color: "#dc2626" };
  if (days <= 14) return { label: `${days} days left`, color: "#b45309" };
  return { label: `${days} days left`, color: "#059669" };
}

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function GrantsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const limit = 25;

  let grants: GrantRow[] = [];
  let total = 0;
  let error: string | null = null;
  try {
    const res = await listGrants({
      search: sp.search,
      funder: sp.funder,
      status: sp.status,
      deadline: sp.deadline,
      limit,
      offset: (page - 1) * limit,
    });
    grants = res.grants;
    total = res.total;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load grants";
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

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
        <input
          className="input"
          name="search"
          defaultValue={sp.search ?? ""}
          placeholder="Search title…"
          style={{ flex: 1, minWidth: 180 }}
        />
        <input
          className="input"
          name="funder"
          defaultValue={sp.funder ?? ""}
          placeholder="Funder…"
          style={{ width: 160 }}
        />
        <select
          className="input"
          name="status"
          defaultValue={sp.status ?? ""}
          style={{ width: 140 }}
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="forthcoming">Forthcoming</option>
          <option value="rolling">Rolling</option>
          <option value="closed">Closed</option>
          <option value="awarded">Awarded</option>
        </select>
        <button type="submit" className="btn primary" style={{ fontSize: 13 }}>
          Filter
        </button>
      </form>

      <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
        {total.toLocaleString()} grant{total === 1 ? "" : "s"}
      </p>

      {error && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: "#dc2626" }}>{error}</p>
        </div>
      )}

      {!error && grants.length === 0 && (
        <div className="card card-pad">
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            No grants match these filters. Try clearing the search box or
            choosing a different status.
          </p>
        </div>
      )}

      {grants.map((g) => {
        const s = STATUS_STYLES[g.status] ?? STATUS_STYLES.unknown;
        const amount = formatAmount(g.amount_min, g.amount_max);
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
