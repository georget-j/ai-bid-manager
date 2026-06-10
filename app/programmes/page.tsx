import Link from "next/link";
import {
  listProgrammes,
  type ProgrammeType,
  type Programme,
} from "@/lib/programmes/data";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<ProgrammeType, string> = {
  accelerator: "Accelerator",
  incubator: "Incubator",
  "investor-programme": "Investor programme",
  "grant-competition": "Grant competition",
  "ecosystem-support": "Ecosystem support",
};

const TYPE_FILTERS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All" },
  { key: "accelerator", label: "Accelerators" },
  { key: "investor-programme", label: "Investor programmes" },
  { key: "ecosystem-support", label: "Ecosystem support" },
];

function ProgrammeCard({ p }: { p: Programme }) {
  return (
    <div className="card card-pad" style={{ marginBottom: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 6,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}
            >
              {p.name}
            </span>
            {p.cyberRelevant && (
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  padding: "1px 7px",
                  borderRadius: 999,
                  background: "#ecfdf5",
                  color: "#059669",
                }}
              >
                Cyber
              </span>
            )}
            <span
              style={{
                fontSize: 11,
                padding: "1px 8px",
                borderRadius: 999,
                background: "var(--accent-tint)",
                color: "var(--accent)",
              }}
            >
              {TYPE_LABELS[p.type]}
            </span>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
            {p.organiser} · {p.location}
          </p>
        </div>
        <a
          href={p.applicationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn primary"
          style={{ fontSize: 12.5, flexShrink: 0 }}
        >
          Apply ↗
        </a>
      </div>

      <p
        style={{
          fontSize: 13,
          color: "var(--ink-2)",
          lineHeight: 1.5,
          marginBottom: 10,
        }}
      >
        {p.description}
      </p>

      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          fontSize: 12,
          color: "var(--muted)",
        }}
      >
        <span>
          <strong style={{ color: "var(--ink-2)" }}>Offer:</strong> {p.offer}
        </span>
        <span>
          <strong style={{ color: "var(--ink-2)" }}>Opens:</strong> {p.cadence}
        </span>
      </div>
      {p.focus.length > 0 && (
        <div
          style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}
        >
          {p.focus.map((f) => (
            <span
              key={f}
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 6,
                background: "var(--surface-2, #f3f4f6)",
                color: "var(--ink-2)",
              }}
            >
              {f}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function ProgrammesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const active = type && type !== "all" ? type : "all";
  const programmes =
    active === "all"
      ? listProgrammes()
      : listProgrammes(active as ProgrammeType);

  return (
    <div style={{ maxWidth: 820 }}>
      <div
        className="page-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}
      >
        <div className="eyebrow">Funding</div>
        <h1>
          Investor <em>programmes</em>
        </h1>
        <p className="subtitle">
          Accelerators, investor programmes and demo days for tech and cyber
          founders — a curated complement to grants and tenders. Equity and
          non-equity routes to capital and support.
        </p>
      </div>

      <div
        style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}
      >
        {TYPE_FILTERS.map((f) => {
          const selected = active === f.key;
          return (
            <Link
              key={f.key}
              href={
                f.key === "all" ? "/programmes" : `/programmes?type=${f.key}`
              }
              style={{
                fontSize: 12.5,
                padding: "4px 12px",
                borderRadius: 999,
                border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                background: selected ? "var(--accent-tint)" : "transparent",
                color: selected ? "var(--accent)" : "var(--ink-2)",
                textDecoration: "none",
              }}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {programmes.map((p) => (
        <ProgrammeCard key={p.id} p={p} />
      ))}

      <p
        style={{
          fontSize: 11.5,
          color: "var(--muted)",
          marginTop: 16,
          lineHeight: 1.5,
        }}
      >
        Curated from public programme listings. Always confirm current dates and
        eligibility on the programme&apos;s own site before applying.
      </p>
    </div>
  );
}
