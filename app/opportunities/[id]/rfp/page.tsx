import { notFound } from "next/navigation";
import { getOpportunity } from "@/lib/procurement/data";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";
import { OpportunityTabs } from "../OpportunityTabs";
import { RFPWorkflow } from "./RFPWorkflow";
import { SaveAsDraftButton } from "./SaveAsDraftButton";
import type { NormalizedDocument } from "@/lib/procurement/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RFPResponsePage({ params }: PageProps) {
  const { id } = await params;

  const [opp, orgId] = await Promise.all([
    getOpportunity(id),
    getRequestOrgId(),
  ]);

  if (!opp) notFound();

  const docs = ((opp.documents ?? []) as NormalizedDocument[]).filter(
    (d) => d.url,
  );

  // Fetch question counts for initial render
  let initialCounts = { requirements: 0, questions: 0, guidance: 0, total: 0 };
  if (orgId) {
    const supabase = getServiceSupabase();
    const { data: questions } = await supabase
      .from("opportunity_questions")
      .select("question_class")
      .eq("opportunity_id", id)
      .eq("org_id", orgId);

    if (questions) {
      initialCounts = {
        requirements: questions.filter(
          (q) => q.question_class === "requirement",
        ).length,
        questions: questions.filter((q) => q.question_class === "question")
          .length,
        guidance: questions.filter((q) => q.question_class === "guidance")
          .length,
        total: questions.length,
      };
    }
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <OpportunityTabs id={id} />
      {initialCounts.total > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: 12,
          }}
        >
          <SaveAsDraftButton opportunityId={id} />
        </div>
      )}
      <RFPWorkflow
        opp={{
          id: opp.id,
          title: opp.title,
          buyer_name: opp.buyer_name ?? null,
          buyer_region: opp.buyer_region ?? null,
          description: opp.description ?? null,
          source_url: opp.source_url ?? null,
          submission_url: opp.submission_url ?? null,
          value_amount: opp.value_amount ? Number(opp.value_amount) : null,
          value_currency: opp.value_currency ?? null,
          deadline_at: opp.deadline_at ?? null,
          contract_start_at: opp.contract_start_at ?? null,
          contract_end_at: opp.contract_end_at ?? null,
          notice_type: opp.notice_type ?? null,
          procurement_stage: opp.procurement_stage ?? "unknown",
          status: opp.status ?? "unknown",
          cpv_codes: opp.cpv_codes ?? [],
          framework_flag: opp.framework_flag ?? false,
        }}
        initialDocs={docs}
        initialCounts={initialCounts}
      />
    </div>
  );
}
