import Link from "next/link";
import { notFound } from "next/navigation";
import { getFunderProfile } from "@/lib/grants/data";
import { FunderResearch } from "./FunderResearch";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ name: string }>;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `£${Math.round(n / 1_000)}k`;
  return `£${n.toLocaleString()}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 19, fontWeight: 700, color: "var(--ink)" }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)" }}>{label}</div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  forthcoming: "Forthcoming",
  closed: "Closed",
  rolling: "Rolling",
  awarded: "Awarded",
  unknown: "Unknown",
};

export default async function FunderDetailPage({ params }: PageProps) {
  const { name } = await params;
  const funderName = decodeURIComponent(name);
  const profile = await getFunderProfile(funderName);
  if (!profile) notFound();

  return (
    <div style={{ maxWidth: 840 }}>
      <Link
        href="/funders"
        style={{
          display: "inline-flex",
          gap: 6,
          fontSize: 13,
          color: "var(--muted)",
          textDecoration: "none",
          marginBottom: 18,
        }}
      >
        ← All funders
      </Link>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Funder
        </div>
        <h1
          style={{
            fontSize: 22,
            fontFamily: "var(--font-serif)",
            lineHeight: 1.25,
            marginBottom: 4,
          }}
        >
          {profile.name}
        </h1>
        {profile.region && (
          <p style={{ fontSize: 12.5, color: "var(--muted)" }}>
            {profile.region}
          </p>
        )}
        <div
          style={{
            display: "flex",
            gap: 28,
            flexWrap: "wrap",
            marginTop: 16,
          }}
        >
          <Stat label="grants" value={profile.grantCount.toLocaleString()} />
          {profile.openCount > 0 && (
            <Stat label="open now" value={profile.openCount.toLocaleString()} />
          )}
          {profile.totalAmount > 0 && (
            <Stat label="total funded" value={fmt(profile.totalAmount)} />
          )}
          {profile.medianAmount > 0 && (
            <Stat label="typical grant" value={fmt(profile.medianAmount)} />
          )}
          {profile.maxAmount > 0 && (
            <Stat label="largest" value={fmt(profile.maxAmount)} />
          )}
        </div>

        {profile.topThemes.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div
              style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6 }}
            >
              What they fund
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {profile.topThemes.map((t) => (
                <span
                  key={t.theme}
                  style={{
                    fontSize: 11.5,
                    padding: "2px 9px",
                    borderRadius: 999,
                    background: "var(--accent-tint)",
                    color: "var(--accent)",
                  }}
                >
                  {t.theme} · {t.count}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <FunderResearch name={profile.name} />

      <div className="card card-pad">
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Grants from this funder
        </div>
        {profile.grants.map((g, i) => {
          const amount = g.amount_max ?? g.amount_min;
          return (
            <Link
              key={g.id}
              href={`/grants/${g.id}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                borderTop: i > 0 ? "1px solid var(--border)" : "none",
                textDecoration: "none",
              }}
            >
              <span
                style={{
                  fontSize: 13.5,
                  color: "var(--ink)",
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {g.title}
              </span>
              <span
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexShrink: 0,
                  fontSize: 12,
                  color: "var(--muted)",
                }}
              >
                {amount ? (
                  <span style={{ fontFamily: "var(--font-mono)" }}>
                    {fmt(amount)}
                  </span>
                ) : null}
                <span>{STATUS_LABEL[g.status] ?? g.status}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
