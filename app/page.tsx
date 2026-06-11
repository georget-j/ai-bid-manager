// Home — answers "what should I do next?" across both offerings (tenders + grants).
// Server component; all data is assembled in parallel by app/home-data.ts and every
// section degrades to fallback copy on failure rather than crashing the page.

import Link from "next/link";
import { getHomeData, type SourceStatus } from "./home-data";
import { HomeSetupChecklist } from "./HomeSetupChecklist";
import { HomeRecommendations } from "./HomeRecommendations";
import { HomeDueSoon } from "./HomeDueSoon";

export const dynamic = "force-dynamic";

function KpiTile({
  label,
  value,
  linkHref,
  linkLabel,
}: {
  label: string;
  value: number | null;
  linkHref: string;
  linkLabel: string;
}) {
  return (
    <div className="kpi">
      <div className="eyebrow">{label}</div>
      <div className="kpi-value">
        {value !== null ? value.toLocaleString() : "—"}
      </div>
      <div className="kpi-sub">
        <Link
          href={linkHref}
          style={{
            color: "var(--accent)",
            textDecoration: "none",
            fontSize: 12,
          }}
        >
          {linkLabel} →
        </Link>
      </div>
    </div>
  );
}

function SourceCards({ sources }: { sources: SourceStatus[] }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <div
        className="section-title"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>Data sources</span>
        <Link
          href="/sources"
          style={{
            fontSize: 12,
            color: "var(--accent)",
            textDecoration: "none",
            fontWeight: 400,
          }}
        >
          Manage →
        </Link>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 10,
        }}
      >
        {sources.map((src) => {
          const hasError = Boolean(src.last_error);
          const synced = Boolean(src.last_successful_sync_at);
          const statusColor = !src.enabled
            ? "var(--muted)"
            : hasError
              ? "#dc2626"
              : synced
                ? "var(--success)"
                : "var(--muted)";
          const statusLabel = !src.enabled
            ? "Disabled"
            : hasError
              ? "Error"
              : synced
                ? "OK"
                : "Never synced";
          return (
            <div
              key={src.name}
              className="card"
              style={{ padding: "12px 14px" }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--ink)",
                  marginBottom: 4,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {src.display_name}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 11,
                  color: statusColor,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: statusColor,
                    flexShrink: 0,
                    display: "inline-block",
                  }}
                />
                {statusLabel}
              </div>
              {src.last_successful_sync_at && (
                <div
                  style={{
                    fontSize: 10.5,
                    color: "var(--muted)",
                    marginTop: 2,
                  }}
                >
                  {new Date(src.last_successful_sync_at).toLocaleDateString(
                    "en-GB",
                    { day: "numeric", month: "short" },
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default async function HomePage() {
  const data = await getHomeData();

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Hero — short, both offerings */}
      <div
        className="page-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}
      >
        <div className="eyebrow">Home</div>
        <h1>
          Win UK tenders and grants
          <br />
          <em>backed by your own evidence</em>
        </h1>
        <p className="subtitle">
          We match open tenders and grant funding to your organisation, show you
          what&apos;s due, and help you draft strong answers from documents you
          already have.
        </p>
      </div>

      {/* KPI row — both offerings, plain English */}
      <div
        className="kpi-grid"
        style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 36 }}
      >
        <KpiTile
          label="Open tenders"
          value={data.counts.openTenders}
          linkHref="/opportunities"
          linkLabel="Browse"
        />
        <KpiTile
          label="Open grants"
          value={data.counts.openGrants}
          linkHref="/grants"
          linkLabel="Browse"
        />
        <KpiTile
          label="Evidence documents"
          value={data.counts.evidenceDocs}
          linkHref="/documents"
          linkLabel="Add more"
        />
        <KpiTile
          label="Matches this week"
          value={data.counts.matchesThisWeek}
          linkHref="/my-opportunities"
          linkLabel="See matches"
        />
      </div>

      {/* Get set up — derived checklist, hides itself once everything is done */}
      <HomeSetupChecklist setup={data.setup} />

      {/* Recommended for you — top tenders and grants side by side */}
      <section style={{ marginBottom: 36 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            alignItems: "start",
          }}
        >
          <HomeRecommendations
            heading="Top tenders for you"
            items={data.tenderRecs}
            hasProfile={data.hasProfile}
            seeAllHref="/my-opportunities"
            browseHref="/opportunities"
            browseLabel="Browse all tenders"
          />
          <HomeRecommendations
            heading="Top grants for you"
            items={data.grantRecs}
            hasProfile={data.hasProfile}
            seeAllHref="/my-grants"
            browseHref="/grants"
            browseLabel="Browse all grants"
          />
        </div>
      </section>

      {/* Due soon — tender + grant deadlines merged */}
      <HomeDueSoon items={data.dueSoon} />

      {/* Operator-only: source sync status */}
      {data.isOperator && data.sources && data.sources.length > 0 && (
        <SourceCards sources={data.sources} />
      )}

      {/* Slim footer */}
      <div
        style={{ display: "flex", gap: 10, marginTop: 28, flexWrap: "wrap" }}
      >
        <Link href="/opportunities" className="btn primary">
          Browse tenders
        </Link>
        <Link href="/grants" className="btn primary">
          Browse grants
        </Link>
        <Link href="/documents" className="btn">
          Upload evidence
        </Link>
        <Link href="/ask" className="btn">
          Ask a question
        </Link>
      </div>
    </div>
  );
}
