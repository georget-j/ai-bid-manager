import Link from "next/link";
import { notFound } from "next/navigation";
import { getGrant } from "@/lib/grants/data";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

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

function fmtAmount(min: number | null, max: number | null): string | null {
  const f = (n: number) => `£${n.toLocaleString()}`;
  if (min != null && max != null && min !== max) return `${f(min)}–${f(max)}`;
  const one = max ?? min;
  return one != null ? f(one) : null;
}

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        padding: "10px 0",
        borderBottom: "1px solid var(--border)",
        fontSize: 13.5,
      }}
    >
      <span style={{ width: 160, flexShrink: 0, color: "var(--muted)" }}>
        {label}
      </span>
      <span style={{ color: "var(--ink)", flex: 1 }}>{value}</span>
    </div>
  );
}

export default async function GrantDetailPage({ params }: PageProps) {
  const { id } = await params;
  const grant = await getGrant(id);
  if (!grant) notFound();

  const s = STATUS_STYLES[grant.status] ?? STATUS_STYLES.unknown;
  const amount = fmtAmount(grant.amount_min, grant.amount_max);

  return (
    <div style={{ maxWidth: 840 }}>
      <Link
        href="/grants"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: "var(--muted)",
          textDecoration: "none",
          marginBottom: 20,
        }}
      >
        ← Back to grants
      </Link>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              {grant.funder_name ?? "Grant"}
            </div>
            <h1
              style={{
                fontSize: 23,
                fontFamily: "var(--font-serif)",
                lineHeight: 1.25,
                marginBottom: 8,
              }}
            >
              {grant.title}
            </h1>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "4px 12px",
                borderRadius: 999,
                background: s.bg,
                color: s.color,
              }}
            >
              {s.label}
            </span>
            {amount && (
              <span
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {amount}
              </span>
            )}
          </div>
        </div>

        {grant.status === "awarded" && (
          <div
            style={{
              fontSize: 12.5,
              color: "var(--muted)",
              background: "var(--bg-tint)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)",
              padding: "8px 12px",
              marginBottom: 12,
            }}
          >
            Historical award (360Giving) — shown for funder research, not an
            open application.
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {grant.application_url && (
            <a
              href={grant.application_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn primary"
              style={{ fontSize: 13 }}
            >
              Apply ↗
            </a>
          )}
          {grant.source_url && (
            <a
              href={grant.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn ghost sm"
              style={{ fontSize: 13 }}
            >
              View source ↗
            </a>
          )}
        </div>
      </div>

      {grant.description && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            About
          </div>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.7,
              color: "var(--ink-2)",
              whiteSpace: "pre-wrap",
            }}
          >
            {grant.description}
          </p>
        </div>
      )}

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Details
        </div>
        <Row label="Funder" value={grant.funder_name} />
        <Row label="Funding type" value={grant.funding_type} />
        <Row label="Amount" value={amount} />
        <Row label="Opens" value={fmtDate(grant.open_at)} />
        <Row label="Deadline" value={fmtDate(grant.deadline_at)} />
        <Row label="Awarded" value={fmtDate(grant.published_at)} />
        <Row
          label="Themes"
          value={grant.themes?.length ? grant.themes.join(", ") : null}
        />
        <Row
          label="Geography"
          value={grant.regions?.length ? grant.regions.join(", ") : null}
        />
        <Row
          label="Eligible orgs"
          value={
            grant.eligible_org_types?.length
              ? grant.eligible_org_types.join(", ")
              : null
          }
        />
        <Row label="Eligibility" value={grant.eligibility_text} />
        <Row label="Source" value={grant.source_name} />
      </div>
    </div>
  );
}
