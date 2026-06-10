import { NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getOrgProfile } from "@/lib/procurement/data";
import { getServiceSupabase } from "@/lib/supabase-service";
import { scoreGrant } from "@/lib/grants/scoring";
import { generateEmbedding } from "@/lib/embeddings";
import {
  profileEmbeddingText,
  parseEmbedding,
  cosine,
} from "@/lib/grants/embed";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TOP_N = 10;
const SAMPLE = 300;

/** GET — grant recommendations for the caller's org: applyable grants scored by fit
 *  (keyword fit + a bounded, additive semantic-similarity boost). */
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
      "id, title, funder_name, amount_min, amount_max, currency, deadline_at, status, themes, regions, eligibility_text, eligible_org_types, match_funding_required, description, sectors, beneficiaries, embedding",
    )
    .in("status", ["open", "forthcoming", "rolling"])
    .limit(SAMPLE);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grants = (rows ?? []) as any[];

  // Embed the org profile once for the semantic boost (best-effort).
  let profileVec: number[] | null = null;
  try {
    profileVec = await generateEmbedding(profileEmbeddingText(profile));
  } catch {
    profileVec = null;
  }

  // Pass 1: keyword score + per-grant semantic similarity (eligible + embedded only).
  const base = grants.map((g) => {
    const result = scoreGrant(g, profile);
    let sim: number | null = null;
    if (profileVec && result.eligible) {
      const gv = parseEmbedding(g.embedding);
      if (gv) sim = cosine(profileVec, gv);
    }
    return { g, result, sim };
  });

  // Pass 2: min-max normalise similarity across the candidate set so semantic fit is a
  // bounded, RELATIVE booster (text-embedding similarities are compressed in absolute
  // terms). Guarded so a set with no real spread/signal adds nothing.
  const sims = base.map((b) => b.sim).filter((s): s is number => s !== null);
  const maxSim = sims.length ? Math.max(...sims) : 0;
  const minSim = sims.length ? Math.min(...sims) : 0;
  const spread = maxSim - minSim;
  const useSemantic = sims.length >= 3 && maxSim >= 0.18 && spread >= 0.03;

  const scored = base
    .map(({ g, result, sim }) => {
      const reasons = [...result.reasons];
      let bonus = 0;
      if (useSemantic && sim !== null) {
        bonus = Math.round(((sim - minSim) / spread) * 20);
        if (bonus >= 14) reasons.push("Strong semantic match to your profile.");
      }
      const finalScore = Math.min(100, result.fitScore + bonus);
      return { g, result, finalScore, reasons };
    })
    .filter((s) => s.finalScore > 0)
    .sort((a, b) => b.finalScore - a.finalScore);

  // Persist matches (best-effort) — fit_score is the combined score.
  if (scored.length > 0) {
    await supabase.from("grant_matches").upsert(
      scored.slice(0, 50).map(({ g, result, finalScore, reasons }) => ({
        grant_id: g.id,
        org_id: orgId,
        fit_score: finalScore,
        readiness_score: result.readinessScore,
        recommended_action: result.recommendedAction,
        eligible: result.eligible,
        reasons,
        risks: result.risks,
        missing_requirements: result.missingRequirements,
      })),
      { onConflict: "grant_id,org_id" },
    );
  }

  const recommendations = scored
    .slice(0, TOP_N)
    .map(({ g, result, finalScore, reasons }) => ({
      id: g.id,
      title: g.title,
      funder_name: g.funder_name,
      amount_min: g.amount_min,
      amount_max: g.amount_max,
      currency: g.currency,
      deadline_at: g.deadline_at,
      status: g.status,
      fit_score: finalScore,
      eligible: result.eligible,
      recommended_action: result.recommendedAction,
      reasons,
      risks: result.risks,
      missing: result.missingRequirements,
    }));

  return NextResponse.json({ recommendations });
}
