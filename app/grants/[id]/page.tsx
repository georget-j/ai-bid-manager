import Link from "next/link";
import { notFound } from "next/navigation";
import { getGrant } from "@/lib/grants/data";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";
import { getOrgProfile } from "@/lib/procurement/data";
import { scoreGrant } from "@/lib/grants/scoring";
import { enrichGrant } from "@/lib/grants/enrich";
import { ensureApplicationGuide } from "@/lib/grants/guide";
import { matchColor, matchVerdict } from "@/lib/grants/copy";
import { DraftApplicationButton } from "./DraftApplicationButton";
import { GrantSectionNav, type NavSection } from "./GrantSectionNav";
import { ApplicationGuide } from "./ApplicationGuide";

export const dynamic = "force-dynamic";

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

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
  const orgId = await getRequestOrgId();
  const grant = await getGrant(id);
  if (!grant) notFound();

  const s = STATUS_STYLES[grant.status] ?? STATUS_STYLES.unknown;
  const amount = fmtAmount(grant.amount_min, grant.amount_max);
  // Only open calls are applyable; closed grants are often delisted at source, so we
  // hide their (likely dead) external links and show a note instead.
  const applyable =
    grant.status === "open" ||
    grant.status === "forthcoming" ||
    grant.status === "rolling";
  const isClosed = grant.status === "closed";

  // Deep details: lazily pull the source detail page (eligibility, how to apply, key
  // dates, documents, links) on first view of an open grant, then cache on the row.
  const details =
    grant.details ?? (applyable ? await enrichGrant(grant) : null);
  // Prefer the source's canonical apply/info page when enrichment found one.
  const applyUrl = details?.webpageUrl || grant.application_url;

  const profile = orgId ? await getOrgProfile(orgId) : null;
  const fit = profile ? scoreGrant(grant, profile) : null;

  // Does this org already have an application underway for this grant? Same rules
  // as the start-application route: archived and unsuccessful drafts don't count.
  // Best-effort — on a lookup error we just fall back to the start button.
  let existingDraft: {
    id: string;
    answered_count: number;
    question_count: number;
  } | null = null;
  if (orgId && applyable) {
    const { data } = await getServiceSupabase()
      .from("response_drafts")
      .select("id, answered_count, question_count")
      .eq("org_id", orgId)
      .eq("grant_id", grant.id)
      .neq("status", "archived")
      .neq("stage", "unsuccessful")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    existingDraft = data ?? null;
  }

  // Auto-surface the how-to-apply guide: serve the cached one, or generate + cache it on
  // first view (a capped cron pre-generates most open grants, so this is usually instant).
  const guide =
    details?.guide ??
    (applyable
      ? await ensureApplicationGuide({ ...grant, details }).catch(() => null)
      : null);

  // Right-hand jump-nav ("hot bar") entries, in render order.
  const navSections: NavSection[] = [];
  if (fit)
    navSections.push({ id: "eligibility-fit", label: "Eligibility & fit" });
  if (applyable)
    navSections.push({ id: "how-to-apply", label: "How to apply" });
  if (grant.description) navSections.push({ id: "about", label: "About" });
  for (const s of details?.sections ?? [])
    navSections.push({ id: `sec-${slug(s.heading)}`, label: s.heading });
  if (details && details.documents.length + details.links.length > 0)
    navSections.push({ id: "resources", label: "Documents & links" });
  navSections.push({ id: "key-details", label: "Key details" });

  return (
    <div
      style={{
        display: "flex",
        gap: 28,
        alignItems: "flex-start",
        maxWidth: 1120,
        margin: "0 auto",
      }}
    >
      <div style={{ flex: 1, minWidth: 0, maxWidth: 840 }}>
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

          {applyable && (
            <div style={{ marginBottom: 8 }}>
              <DraftApplicationButton
                grantId={grant.id}
                existingDraft={
                  existingDraft
                    ? {
                        id: existingDraft.id,
                        answeredCount: existingDraft.answered_count,
                        questionCount: existingDraft.question_count,
                      }
                    : null
                }
              />
              <p
                style={{
                  fontSize: 12,
                  color: "var(--muted)",
                  margin: "8px 0 0",
                }}
              >
                {existingDraft
                  ? "Pick up where you left off — everything you've written is saved."
                  : "We'll pull in the funder's requirements, gather their documents, and walk you through it step by step."}
              </p>
            </div>
          )}

          {/* Secondary links — going to the funder's own site. */}
          <div
            style={{
              display: "flex",
              gap: 14,
              flexWrap: "wrap",
              alignItems: "center",
              fontSize: 13,
            }}
          >
            {applyUrl && applyable && (
              <a
                href={applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent)", textDecoration: "none" }}
              >
                Apply on the funder&apos;s site ↗
              </a>
            )}
            {grant.source_url && !isClosed && (
              <a
                href={grant.source_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--muted)", textDecoration: "none" }}
              >
                View original listing ↗
              </a>
            )}
            {isClosed && (
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                This call has closed and is no longer listed at the source.
              </span>
            )}
          </div>
        </div>

        {/* Eligibility & confidence */}
        {fit && (
          <div
            id="eligibility-fit"
            className="card card-pad"
            style={{ marginBottom: 16, scrollMarginTop: 16 }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                marginBottom:
                  fit.reasons.length ||
                  fit.risks.length ||
                  fit.missingRequirements.length
                    ? 12
                    : 0,
              }}
            >
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <div
                  style={{
                    fontSize: 30,
                    fontWeight: 700,
                    lineHeight: 1,
                    color: matchColor(fit.fitScore, fit.eligible),
                  }}
                >
                  {fit.fitScore}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--muted)" }}>
                  / 100 match
                </div>
              </div>
              <div>
                <div className="eyebrow" style={{ marginBottom: 2 }}>
                  How well this fits you
                </div>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: fit.eligible ? "var(--ink)" : "#dc2626",
                  }}
                >
                  {matchVerdict(fit.fitScore, fit.eligible)}
                </div>
              </div>
            </div>
            {[
              ...fit.reasons.map((r) => ({ t: r, c: "#059669", p: "✓" })),
              ...fit.risks.map((r) => ({ t: r, c: "#b45309", p: "!" })),
              ...fit.missingRequirements.map((r) => ({
                t: r,
                c: "var(--muted)",
                p: "→",
              })),
            ].map((row, i) => (
              <p
                key={i}
                style={{ fontSize: 12.5, color: row.c, margin: "3px 0" }}
              >
                {row.p} {row.t}
              </p>
            ))}
          </div>
        )}

        {/* No profile yet → quiet prompt where the fit card would have been. */}
        {!fit && applyable && (
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              How well this fits you
            </div>
            <p
              style={{
                fontSize: 13.5,
                color: "var(--ink-2)",
                margin: "0 0 8px",
              }}
            >
              Add your organisation profile to see how well you fit this grant.
            </p>
            <Link
              href="/profile#grant-eligibility"
              style={{
                fontSize: 13,
                color: "var(--accent)",
                textDecoration: "none",
              }}
            >
              Add your profile →
            </Link>
          </div>
        )}

        {applyable && (
          <ApplicationGuide grantId={grant.id} initialGuide={guide} />
        )}

        {grant.description && (
          <details
            id="about"
            open
            className="card"
            style={{ marginBottom: 16, scrollMarginTop: 16 }}
          >
            <summary
              className="card-pad"
              style={{
                cursor: "pointer",
                listStyle: "none",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              <span className="eyebrow">About</span>
            </summary>
            <p
              className="card-pad"
              style={{
                fontSize: 14,
                lineHeight: 1.7,
                color: "var(--ink-2)",
                whiteSpace: "pre-wrap",
                paddingTop: 0,
              }}
            >
              {grant.description}
            </p>
          </details>
        )}

        {/* Deep detail pulled from the source: eligibility, how to apply, key dates.
          Each is a collapsible dropdown header with the content underneath. */}
        {details?.sections.map((section) => (
          <details
            key={section.heading}
            id={`sec-${slug(section.heading)}`}
            open
            className="card"
            style={{ marginBottom: 16, scrollMarginTop: 16 }}
          >
            <summary
              className="card-pad"
              style={{
                cursor: "pointer",
                listStyle: "none",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              <span className="eyebrow">{section.heading}</span>
            </summary>
            <p
              className="card-pad"
              style={{
                fontSize: 14,
                lineHeight: 1.7,
                color: "var(--ink-2)",
                whiteSpace: "pre-wrap",
                paddingTop: 0,
              }}
            >
              {section.text}
            </p>
          </details>
        ))}

        {details &&
          (details.documents.length > 0 || details.links.length > 0) && (
            <div
              id="resources"
              className="card card-pad"
              style={{ marginBottom: 16, scrollMarginTop: 16 }}
            >
              <div className="eyebrow" style={{ marginBottom: 10 }}>
                Documents &amp; links
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {details.documents.map((d) => (
                  <a
                    key={d.url}
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 13.5,
                      color: "var(--accent)",
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                    }}
                  >
                    <span aria-hidden>📄</span>
                    {d.title} ↗
                  </a>
                ))}
                {details.links.map((l) => (
                  <a
                    key={l.url}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 13.5,
                      color: "var(--accent)",
                      textDecoration: "none",
                    }}
                  >
                    {l.title} ↗
                  </a>
                ))}
              </div>
            </div>
          )}

        <div
          id="key-details"
          className="card card-pad"
          style={{ marginBottom: 16, scrollMarginTop: 16 }}
        >
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

      <GrantSectionNav sections={navSections} />
    </div>
  );
}
