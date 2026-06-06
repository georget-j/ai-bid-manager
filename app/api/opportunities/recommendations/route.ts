import { NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase";
import { getOrgProfile, listOpportunities } from "@/lib/procurement/data";
import { scoreOpportunity } from "@/lib/procurement/scoring";

const TOP_N = 10;
const SAMPLE_SIZE = 300;

/** Days until a deadline; null deadlines sort last (least urgent). */
function daysUntil(deadlineAt: string | null): number {
  if (!deadlineAt) return Number.POSITIVE_INFINITY;
  return (new Date(deadlineAt).getTime() - Date.now()) / 86_400_000;
}

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

  // Only recommend LIVE tenders: active status with a deadline still in the future
  // (or no stated deadline). Ordered by deadline ascending = soonest-closing first.
  const { opportunities } = await listOpportunities({
    status: "active",
    deadline: "open",
    limit: SAMPLE_SIZE,
  });

  // Score each; drop anything whose deadline has slipped past since the query, and
  // anything with no fit signal. Rank by fit, then by urgency (soonest deadline first).
  const scored = opportunities
    .map((opp) => ({
      opp,
      result: scoreOpportunity(opp, profile),
      saved: inPipeline.has(opp.id),
    }))
    .filter((s) => s.result.fitScore > 0 && daysUntil(s.opp.deadline_at) >= 0)
    .sort((a, b) => {
      if (b.result.fitScore !== a.result.fitScore)
        return b.result.fitScore - a.result.fitScore;
      return daysUntil(a.opp.deadline_at) - daysUntil(b.opp.deadline_at);
    });

  // Top N not yet in pipeline
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
    readiness_score: result.readinessScore,
    recommended_action: result.recommendedAction,
    reasons: result.reasons,
    risks: result.risks,
    // Surfaced in the UI so the user can act to improve fit (e.g. add evidence).
    missing: result.missingRequirements,
    saved,
  }));

  return NextResponse.json({ recommendations });
}
