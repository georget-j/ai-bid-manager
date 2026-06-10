import Link from "next/link";
import { notFound } from "next/navigation";
import { getRequestOrgId } from "@/lib/org";
import { getResponseDraft, type ResponseDraft } from "@/lib/responses/drafts";
import { RFPProcessor } from "@/components/RFPProcessor";
import type { ExtractedQuestion } from "@/lib/rfp-extract";
import { getGrant } from "@/lib/grants/data";
import { getOrgProfile } from "@/lib/procurement/data";
import { scoreGrant } from "@/lib/grants/scoring";
import { grantCollection } from "@/lib/grants/ingest-docs";
import { assessGrantReadiness } from "@/lib/grants/readiness";
import { getRunReviewStatus } from "@/lib/grants/review-status";
import { getServiceSupabase } from "@/lib/supabase-service";
import { BudgetBuilder } from "./BudgetBuilder";

export const dynamic = "force-dynamic";

async function grantReadiness(draft: ResponseDraft, orgId: string) {
  if (!draft.grant_id) return null;
  const grant = await getGrant(draft.grant_id);
  if (!grant) return null;
  const profile = await getOrgProfile(orgId);
  const fit = profile ? scoreGrant(grant, profile) : null;
  const { count } = await getServiceSupabase()
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("collection", grantCollection(grant.id));
  const review = await getRunReviewStatus(draft.latest_rfp_run_id);
  return assessGrantReadiness({
    extractedQuestions: (draft.extracted_questions ??
      []) as ExtractedQuestion[],
    answers: draft.answers ?? {},
    selectedIds: draft.selected_question_ids ?? [],
    grant,
    fit,
    kbDocCount: count ?? 0,
    pendingReview: review.pending,
    budget: draft.budget,
    stage: draft.stage,
  });
}

interface PageProps {
  params: Promise<{ id: string }>;
}

type Step = "upload" | "reviewing" | "answering" | "done";

function stepFor(d: ResponseDraft): Step {
  if (Object.keys(d.answers ?? {}).length > 0) return "done";
  if ((d.extracted_questions ?? []).length > 0) return "reviewing";
  return "upload";
}

export default async function DraftResumePage({ params }: PageProps) {
  const { id } = await params;
  const orgId = await getRequestOrgId();
  if (!orgId) notFound();
  const draft = await getResponseDraft(id, orgId);
  if (!draft) notFound();

  const readiness = await grantReadiness(draft, orgId);

  return (
    <div style={{ maxWidth: 900 }}>
      <Link
        href="/responses"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: "var(--muted)",
          textDecoration: "none",
          marginBottom: 16,
        }}
      >
        ← All responses
      </Link>

      <div
        className="page-head"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}
      >
        <div className="eyebrow">Respond</div>
        <h1>{draft.rfp_title}</h1>
      </div>

      {readiness && (
        <div className="card card-pad" style={{ marginBottom: 18 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <div className="eyebrow">Submission readiness</div>
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                padding: "2px 10px",
                borderRadius: 999,
                background: readiness.ready ? "#ecfdf5" : "#fef3c7",
                color: readiness.ready ? "#059669" : "#b45309",
              }}
            >
              {readiness.ready
                ? "Ready to submit"
                : `${readiness.score}% ready`}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {readiness.checks.map((c) => (
              <div
                key={c.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    flexShrink: 0,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: c.ok ? "#059669" : "var(--border)",
                    color: "#fff",
                    fontSize: 11,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {c.ok ? "✓" : "!"}
                </span>
                <span style={{ color: c.ok ? "var(--ink-2)" : "var(--ink)" }}>
                  {c.label}
                </span>
                {c.detail && (
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    · {c.detail}
                  </span>
                )}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 10 }}>
            Reflects your last saved progress. Mark the application{" "}
            <strong>Submitted</strong> from My Applications once you&apos;ve
            applied.
          </p>
        </div>
      )}

      {draft.grant_id && (
        <BudgetBuilder draftId={draft.id} initialBudget={draft.budget} />
      )}

      <RFPProcessor
        draftId={draft.id}
        initialTitle={draft.rfp_title}
        initialOpportunityId={draft.opportunity_id ?? undefined}
        initialGrantId={draft.grant_id ?? undefined}
        initialQuestions={draft.extracted_questions as ExtractedQuestion[]}
        initialSelected={draft.selected_question_ids}
        initialAnswers={draft.answers}
        initialStep={stepFor(draft)}
      />
    </div>
  );
}
