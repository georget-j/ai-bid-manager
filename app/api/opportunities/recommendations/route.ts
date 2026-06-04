import { NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase";
import { getOrgProfile, listOpportunities } from "@/lib/procurement/data";
import { scoreOpportunity } from "@/lib/procurement/scoring";

const TOP_N = 10;
const SAMPLE_SIZE = 150;

export async function GET() {
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const profile = await getOrgProfile(orgId);
  if (!profile) {
    return NextResponse.json({ recommendations: [], reason: "no-profile" });
  }

  const supabase = getServiceSupabase();

  // Get opportunity IDs already in this org's pipeline so we can deprioritise them
  const { data: pipelineRows } = await supabase
    .from("bid_pipeline")
    .select("opportunity_id")
    .eq("org_id", orgId);
  const inPipeline = new Set((pipelineRows ?? []).map((r) => r.opportunity_id));

  // Fetch a sample of active opportunities ordered by deadline ascending (most urgent first)
  const { opportunities } = await listOpportunities({
    status: "active",
    limit: SAMPLE_SIZE,
  });

  // Score each and separate pipeline vs not-in-pipeline
  const scored = opportunities
    .map((opp) => ({
      opp,
      result: scoreOpportunity(opp, profile),
      saved: inPipeline.has(opp.id),
    }))
    .filter((s) => s.result.fitScore > 0)
    .sort((a, b) => b.result.fitScore - a.result.fitScore);

  // Top N not yet in pipeline, then fill with pipeline items if needed
  const notSaved = scored.filter((s) => !s.saved).slice(0, TOP_N);

  const recommendations = notSaved.map(({ opp, result, saved }) => ({
    id: opp.id,
    title: opp.title,
    buyer_name: opp.buyer_name,
    region: opp.region,
    deadline_at: opp.deadline_at,
    value_amount: opp.value_amount,
    value_currency: opp.value_currency,
    procurement_stage: opp.procurement_stage,
    fit_score: result.fitScore,
    recommended_action: result.recommendedAction,
    reasons: result.reasons,
    risks: result.risks,
    saved,
  }));

  return NextResponse.json({ recommendations });
}
