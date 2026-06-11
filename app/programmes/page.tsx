import Link from "next/link";
import {
  listProgrammes,
  CURATED_PROGRAMMES_SOURCE,
  type ProgrammeType,
  type Programme,
} from "@/lib/programmes/data";
import { getServiceSupabase } from "@/lib/supabase-service";
import { getRequestOrgId } from "@/lib/org";
import { getOrgProfile } from "@/lib/procurement/data";
import { scoreGrant } from "@/lib/grants/scoring";
import { matchColor } from "@/lib/grants/copy";
import type { GrantRow } from "@/lib/grants/types";
import { ProgrammeApplyButton } from "./ApplyButton";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<ProgrammeType, string> = {
  accelerator: "Accelerator",
  "investor-programme": "Investor programme",
  "ecosystem-support": "Ecosystem support",
};

const TYPE_FILTERS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All" },
  { key: "accelerator", label: "Accelerators" },
  { key: "investor-programme", label: "Investor programmes" },
  { key: "ecosystem-support", label: "Ecosystem support" },
];

/** Curated programme rows in the grants catalogue, keyed by programme id
 *  (= source_notice_id). Best-effort: an empty map degrades cards to the
 *  external link only. */
async function getProgrammeGrantRows(): Promise<Map<string, GrantRow>> {
  const map = new Map<string, GrantRow>();
  try {
    const { data, error } = await getServiceSupabase()
      .from("grants")
      .select("*")
      .eq("source_name", CURATED_PROGRAMMES_SOURCE);
    if (error) return map;
    for (const row of (data ?? []) as GrantRow[]) {
      map.set(row.source_notice_id, row);
    }
  } catch {
    /* degrade quietly */
  }
  return map;
}

interface ProgrammeMatch {
  programme: Programme;
  grant: GrantRow;
  score: number;
  reason: string | null;
}

function ProgrammeCard({ p, grant }: { p: Programme; grant: GrantRow | null }) {
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
        {grant ? (
          <ProgrammeApplyButton grantId={grant.id} />
        ) : (
          <a
            href={p.applicationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn primary"
            style={{ fontSize: 12.5, flexShrink: 0 }}
          >
            Apply ↗
          </a>
        )}
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
      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          marginTop: 10,
          fontSize: 12.5,
        }}
      >
        {grant && (
          <a
            href={p.applicationUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--accent)", textDecoration: "none" }}
          >
            Visit site ↗
          </a>
        )}
        {p.organizerSlug && (
          <Link
            href={`/investor-events/organizers/${p.organizerSlug}`}
            style={{ color: "var(--accent)", textDecoration: "none" }}
          >
            See their investor events →
          </Link>
        )}
      </div>
    </div>
  );
}

/** Top programme matches for the org — same card language as /my-grants. */
function ProgrammesForYou({ matches }: { matches: ProgrammeMatch[] }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
        Programmes for you
      </h2>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {matches.map((m) => (
          <div
            key={m.programme.id}
            className="card card-pad"
            style={{ flex: "1 1 220px", minWidth: 220 }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: "var(--ink)",
                  }}
                >
                  {m.programme.name}
                </p>
                <p style={{ fontSize: 12, color: "var(--muted)" }}>
                  {m.programme.organiser}
                </p>
                {m.reason && (
                  <p
                    style={{
                      fontSize: 12,
                      color: "#059669",
                      marginTop: 4,
                    }}
                  >
                    ✓ {m.reason}
                  </p>
                )}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: matchColor(m.score),
                  }}
                >
                  {m.score}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--muted)" }}>
                  / 100 match
                </div>
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <ProgrammeApplyButton grantId={m.grant.id} />
            </div>
          </div>
        ))}
      </div>
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

  const grantRows = await getProgrammeGrantRows();

  // "Programmes for you": when a profile exists, score every programme row with
  // the same scorer as /my-grants and surface the top 3. Best-effort — any
  // failure just hides the strip.
  let matches: ProgrammeMatch[] = [];
  try {
    const orgId = await getRequestOrgId();
    const profile = orgId ? await getOrgProfile(orgId) : null;
    if (profile && grantRows.size > 0) {
      matches = listProgrammes()
        .flatMap((programme) => {
          const grant = grantRows.get(programme.id);
          if (!grant) return [];
          const result = scoreGrant(grant, profile);
          return [
            {
              programme,
              grant,
              score: result.fitScore,
              reason: result.reasons[0] ?? null,
            },
          ];
        })
        .filter((m) => m.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
    }
  } catch {
    /* no strip on failure */
  }

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
          non-equity routes to capital and support. Start an application here
          and we&apos;ll draft answers from your evidence library.
        </p>
      </div>

      {matches.length > 0 && <ProgrammesForYou matches={matches} />}

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
        <ProgrammeCard key={p.id} p={p} grant={grantRows.get(p.id) ?? null} />
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
