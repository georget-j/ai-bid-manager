import Link from "next/link";
import { notFound } from "next/navigation";
import { getOpportunity } from "@/lib/procurement/data";
import { countTenderDocuments } from "@/lib/procurement/documents";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";
import { OpportunityActions } from "./OpportunityActions";
import { OpportunityTabs } from "./OpportunityTabs";
import { OpportunityInsights } from "./OpportunityInsights";
import { OpportunityKnowledgeBase } from "./OpportunityKnowledgeBase";
import { OpportunityLifecycle } from "./OpportunityLifecycle";
import type { OpportunityRow, NormalizedLot } from "@/lib/procurement/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatValue(amount: number | null | undefined, currency = "GBP") {
  if (!amount) return null;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "GBP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function daysUntil(iso: string | null | undefined) {
  if (!iso) return null;
  const diff = Math.ceil(
    (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  return diff;
}

const STAGE_LABELS: Record<string, string> = {
  planning: "Planning notice",
  tender: "Contract notice",
  award: "Award notice",
  contract: "Contract",
  implementation: "Implementation",
  unknown: "Unknown",
};

const STATUS_STYLES: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  active: { label: "Active", color: "#059669", bg: "#d1fae5" },
  planned: { label: "Planned", color: "#b45309", bg: "#fef3c7" },
  closed: { label: "Closed", color: "#6b7280", bg: "#f3f4f6" },
  awarded: { label: "Awarded", color: "#1d4ed8", bg: "#dbeafe" },
  cancelled: { label: "Cancelled", color: "#dc2626", bg: "#fee2e2" },
  unknown: { label: "Unknown", color: "#6b7280", bg: "#f3f4f6" },
};

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
      <span style={{ width: 180, flexShrink: 0, color: "var(--muted)" }}>
        {label}
      </span>
      <span style={{ color: "var(--ink)", flex: 1 }}>{value}</span>
    </div>
  );
}

export default async function OpportunityDetailPage({ params }: PageProps) {
  const { id } = await params;

  const [opp, orgId] = await Promise.all([
    getOpportunity(id),
    getRequestOrgId(),
  ]);

  if (!opp) notFound();

  // Fetch question counts for the response status card
  let qCounts = { requirements: 0, questions: 0, total: 0 };
  if (orgId) {
    const supabase = getServiceSupabase();
    const { data: qs } = await supabase
      .from("opportunity_questions")
      .select("question_class")
      .eq("opportunity_id", id)
      .eq("org_id", orgId);
    if (qs) {
      qCounts = {
        requirements: qs.filter((q) => q.question_class === "requirement")
          .length,
        questions: qs.filter((q) => q.question_class === "question").length,
        total: qs.length,
      };
    }
  }

  const status = STATUS_STYLES[opp.status] ?? STATUS_STYLES.unknown;
  const days = daysUntil(opp.deadline_at);
  const lots = (opp.lots ?? []) as NormalizedLot[];
  const docCount = countTenderDocuments(opp);

  return (
    <div style={{ maxWidth: 840 }}>
      {/* Back */}
      <Link
        href="/opportunities"
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
        ← Back to opportunities
      </Link>

      {/* Tab navigation */}
      <OpportunityTabs id={id} />

      {/* Header */}
      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              {STAGE_LABELS[opp.procurement_stage] ?? opp.procurement_stage}
              {opp.notice_type ? ` · ${opp.notice_type}` : ""}
            </div>
            <h1
              style={{
                fontSize: 24,
                fontFamily: "var(--font-serif)",
                lineHeight: 1.25,
                marginBottom: 8,
              }}
            >
              {opp.title}
            </h1>
            {opp.buyer_name && (
              <p style={{ fontSize: 14, color: "var(--ink-2)" }}>
                {opp.buyer_name}
                {opp.buyer_region ? ` · ${opp.buyer_region}` : ""}
              </p>
            )}
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
                background: status.bg,
                color: status.color,
              }}
            >
              {status.label}
            </span>
            {opp.value_amount && (
              <span
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                  color: "var(--ink)",
                }}
              >
                {formatValue(
                  Number(opp.value_amount),
                  opp.value_currency ?? "GBP",
                )}
              </span>
            )}
            {opp.framework_flag && (
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "#dbeafe",
                  color: "#1d4ed8",
                  fontWeight: 600,
                }}
              >
                Framework agreement
              </span>
            )}
          </div>
        </div>

        {/* Deadline banner */}
        {days !== null && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "var(--r-sm)",
              background:
                days <= 7
                  ? "#fee2e2"
                  : days <= 21
                    ? "#fef3c7"
                    : "var(--bg-tint)",
              color:
                days <= 7 ? "#dc2626" : days <= 21 ? "#b45309" : "var(--ink-2)",
              fontSize: 13,
              fontWeight: days <= 7 ? 600 : 400,
              marginBottom: 16,
            }}
          >
            {days < 0
              ? `Deadline passed · ${formatDate(opp.deadline_at)}`
              : days === 0
                ? `Deadline today · ${formatDate(opp.deadline_at)}`
                : `${days} day${days === 1 ? "" : "s"} until deadline · ${formatDate(opp.deadline_at)}`}
          </div>
        )}

        {/* Tender document count */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "5px 11px",
            borderRadius: 999,
            background: "var(--bg-tint)",
            border: "1px solid var(--border)",
            fontSize: 12.5,
            color: docCount > 0 ? "var(--ink-2)" : "var(--muted)",
            marginBottom: 16,
          }}
        >
          <span aria-hidden>📄</span>
          {docCount > 0
            ? `${docCount} tender document${docCount === 1 ? "" : "s"} listed`
            : "No tender documents listed"}
        </div>

        {/* Actions */}
        <OpportunityActions
          opportunityId={opp.id}
          opportunityTitle={opp.title}
          sourceUrl={opp.source_url}
        />
      </div>

      {/* Description */}
      {opp.description && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Description
          </div>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.7,
              color: "var(--ink-2)",
              whiteSpace: "pre-wrap",
            }}
          >
            {opp.description}
          </p>
        </div>
      )}

      {/* Tender lifecycle (Find a Tender record package — compiled timeline) */}
      <OpportunityLifecycle opportunityId={opp.id} />

      {/* AI tender brief (derived, org-scoped — never written to the catalog) */}
      <OpportunityInsights opportunityId={opp.id} />

      {/* Knowledge-base cross-reference (tender docs ↔ org KB) */}
      <OpportunityKnowledgeBase opportunityId={opp.id} />

      {/* Procurement details */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Procurement details
        </div>
        <div>
          <Row label="Buyer" value={opp.buyer_name} />
          <Row label="Buyer identifier" value={opp.buyer_identifier} />
          <Row label="Region" value={opp.region ?? opp.buyer_region} />
          <Row
            label="Stage"
            value={STAGE_LABELS[opp.procurement_stage] ?? opp.procurement_stage}
          />
          <Row label="Status" value={status.label} />
          <Row
            label="Contract value"
            value={formatValue(
              Number(opp.value_amount) || null,
              opp.value_currency ?? "GBP",
            )}
          />
          <Row label="Framework" value={opp.framework_flag ? "Yes" : null} />
          <Row
            label="CPV codes"
            value={opp.cpv_codes?.length ? opp.cpv_codes.join(", ") : null}
          />
          <Row label="Published" value={formatDate(opp.published_at)} />
          <Row label="Deadline" value={formatDate(opp.deadline_at)} />
          <Row
            label="Contract start"
            value={formatDate(opp.contract_start_at)}
          />
          <Row label="Contract end" value={formatDate(opp.contract_end_at)} />
          <Row label="Source" value={opp.source_name} />
          <Row label="Notice ID" value={opp.source_notice_id} />
          {opp.submission_url && (
            <Row
              label="Submission link"
              value={
                <a
                  href={opp.submission_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--accent)" }}
                >
                  {opp.submission_url}
                </a>
              }
            />
          )}
        </div>
      </div>

      {/* Lots */}
      {lots.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            Lots ({lots.length})
          </div>
          {lots.map((lot, i) => (
            <div
              key={lot.id ?? i}
              style={{
                padding: "12px 0",
                borderBottom:
                  i < lots.length - 1 ? "1px solid var(--border)" : "none",
              }}
            >
              <p style={{ fontWeight: 500, fontSize: 13.5, marginBottom: 4 }}>
                {lot.title ?? `Lot ${i + 1}`}
              </p>
              {lot.description && (
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--muted)",
                    marginBottom: 4,
                  }}
                >
                  {lot.description}
                </p>
              )}
              {lot.valueAmount && (
                <p style={{ fontSize: 12.5, color: "var(--muted)" }}>
                  {formatValue(lot.valueAmount, lot.valueCurrency ?? "GBP")}
                  {lot.deadlineAt
                    ? ` · Deadline ${formatDate(lot.deadlineAt)}`
                    : ""}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Response status card — links to the RFP Response tab */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              RFP response
            </div>
            {qCounts.total > 0 ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {qCounts.requirements > 0 && (
                  <span
                    style={{
                      fontSize: 12,
                      padding: "3px 10px",
                      borderRadius: 999,
                      background: "#dbeafe",
                      color: "#1d4ed8",
                      fontWeight: 600,
                    }}
                  >
                    {qCounts.requirements} requirement
                    {qCounts.requirements !== 1 ? "s" : ""}
                  </span>
                )}
                {qCounts.questions > 0 && (
                  <span
                    style={{
                      fontSize: 12,
                      padding: "3px 10px",
                      borderRadius: 999,
                      background: "#d1fae5",
                      color: "#065f46",
                      fontWeight: 600,
                    }}
                  >
                    {qCounts.questions} question
                    {qCounts.questions !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
                No questions extracted yet.
              </p>
            )}
          </div>
          <Link
            href={`/opportunities/${opp.id}/rfp`}
            className="btn primary"
            style={{ fontSize: 13, padding: "7px 18px", flexShrink: 0 }}
          >
            {qCounts.total > 0 ? "Work on response →" : "Start response →"}
          </Link>
        </div>
      </div>
    </div>
  );
}
