import Link from "next/link";
import { notFound } from "next/navigation";
import { getRequestOrgId } from "@/lib/org";
import { getResponseDraft, type ResponseDraft } from "@/lib/responses/drafts";
import { RFPProcessor, type AnsweredQuestion } from "@/components/RFPProcessor";
import type { ExtractedQuestion } from "@/lib/rfp-extract";
import { getGrant } from "@/lib/grants/data";
import { getOrgProfile } from "@/lib/procurement/data";
import { scoreGrant } from "@/lib/grants/scoring";
import { grantCollection } from "@/lib/grants/ingest-docs";
import { buildApplicationFlow } from "@/lib/grants/application-flow";
import { getRunReviewStatus } from "@/lib/grants/review-status";
import { getServiceSupabase } from "@/lib/supabase-service";
import { GrantApplicationFlow } from "./GrantApplicationFlow";

export const dynamic = "force-dynamic";

type Step = "upload" | "reviewing" | "answering" | "done";

function stepFor(d: ResponseDraft): Step {
  if (Object.keys(d.answers ?? {}).length > 0) return "done";
  if ((d.extracted_questions ?? []).length > 0) return "reviewing";
  return "upload";
}

/** For grant applications, gather everything the guided flow needs. Null for plain RFPs. */
async function grantFlowData(draft: ResponseDraft, orgId: string) {
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
  const extractedQuestions = (draft.extracted_questions ??
    []) as ExtractedQuestion[];
  const flow = buildApplicationFlow({
    grant,
    fit,
    extractedQuestions,
    answers: draft.answers ?? {},
    selectedIds: draft.selected_question_ids ?? [],
    kbDocCount: count ?? 0,
    pendingReview: review.pending,
    budget: draft.budget,
    stage: draft.stage,
  });
  const availableResources =
    (grant.details?.documents?.length ?? 0) +
    (grant.details?.links?.length ?? 0);
  return { grant, fit, flow, kbDocCount: count ?? 0, availableResources };
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DraftResumePage({ params }: PageProps) {
  const { id } = await params;
  const orgId = await getRequestOrgId();
  if (!orgId) notFound();
  const draft = await getResponseDraft(id, orgId);
  if (!draft) notFound();

  // Grant applications get the guided, plain-English step-by-step flow.
  const grantData = await grantFlowData(draft, orgId);
  if (grantData) {
    return (
      <GrantApplicationFlow
        draftId={draft.id}
        grant={grantData.grant}
        fit={grantData.fit}
        flow={grantData.flow}
        guide={grantData.grant.details?.guide ?? null}
        kbDocCount={grantData.kbDocCount}
        availableResources={grantData.availableResources}
        initialTitle={draft.rfp_title}
        initialQuestions={
          (draft.extracted_questions ?? []) as ExtractedQuestion[]
        }
        initialSelected={draft.selected_question_ids ?? []}
        initialAnswers={
          (draft.answers ?? {}) as Record<string, AnsweredQuestion>
        }
        initialStep={stepFor(draft)}
        initialBudget={draft.budget ?? null}
      />
    );
  }

  // Plain RFP response — the original responses workspace, unchanged.
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

      <RFPProcessor
        draftId={draft.id}
        initialTitle={draft.rfp_title}
        initialOpportunityId={draft.opportunity_id ?? undefined}
        initialQuestions={draft.extracted_questions as ExtractedQuestion[]}
        initialSelected={draft.selected_question_ids}
        initialAnswers={draft.answers}
        initialStep={stepFor(draft)}
      />
    </div>
  );
}
