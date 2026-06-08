import Link from "next/link";
import { notFound } from "next/navigation";
import { getRequestOrgId } from "@/lib/org";
import { getResponseDraft, type ResponseDraft } from "@/lib/responses/drafts";
import { RFPProcessor } from "@/components/RFPProcessor";
import type { ExtractedQuestion } from "@/lib/rfp-extract";

export const dynamic = "force-dynamic";

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
