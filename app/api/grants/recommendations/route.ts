import { NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getOrgProfile } from "@/lib/procurement/data";
import { getServiceSupabase } from "@/lib/supabase-service";
import { scoreGrant } from "@/lib/grants/scoring";

const TOP_N = 10;
const SAMPLE = 300;

/** GET — grant recommendations for the caller's org: applyable grants scored by fit. */
export async function GET() {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getOrgProfile(orgId);
  if (!profile) {
    return NextResponse.json({ recommendations: [], reason: "no-profile" });
  }

  // Only applyable calls (open/forthcoming/rolling) — awarded grants are historical.
  const supabase = getServiceSupabase();
  const { data: rows } = await supabase
    .from("grants")
    .select(
      "id, title, funder_name, amount_min, amount_max, currency, deadline_at, status, themes, regions, eligibility_text, eligible_org_types, match_funding_required, description, sectors, beneficiaries",
    )
    .in("status", ["open", "forthcoming", "rolling"])
    .limit(SAMPLE);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grants = (rows ?? []) as any[];
  const scored = grants
    .map((g) => ({ g, result: scoreGrant(g, profile) }))
    .filter((s) => s.result.fitScore > 0)
    .sort((a, b) => b.result.fitScore - a.result.fitScore);

  // Persist matches (best-effort).
  if (scored.length > 0) {
    await supabase.from("grant_matches").upsert(
      scored.slice(0, 50).map(({ g, result }) => ({
        grant_id: g.id,
        org_id: orgId,
        fit_score: result.fitScore,
        readiness_score: result.readinessScore,
        recommended_action: result.recommendedAction,
        eligible: result.eligible,
        reasons: result.reasons,
        risks: result.risks,
        missing_requirements: result.missingRequirements,
      })),
      { onConflict: "grant_id,org_id" },
    );
  }

  const recommendations = scored.slice(0, TOP_N).map(({ g, result }) => ({
    id: g.id,
    title: g.title,
    funder_name: g.funder_name,
    amount_min: g.amount_min,
    amount_max: g.amount_max,
    currency: g.currency,
    deadline_at: g.deadline_at,
    status: g.status,
    fit_score: result.fitScore,
    eligible: result.eligible,
    recommended_action: result.recommendedAction,
    reasons: result.reasons,
    risks: result.risks,
    missing: result.missingRequirements,
  }));

  return NextResponse.json({ recommendations });
}
