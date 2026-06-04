import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import {
  getOpportunity,
  getOrgProfile,
  upsertSeedOpportunities,
} from "@/lib/procurement/data";
import { getServiceSupabase } from "@/lib/supabase";
import {
  scoreOpportunity,
  scoringResultToMatchRow,
} from "@/lib/procurement/scoring";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  let opportunityId = id;

  // Seed opportunities use non-UUID IDs — upsert to DB first to get a real UUID.
  if (!UUID_RE.test(id)) {
    await upsertSeedOpportunities();
    const supabase = getServiceSupabase();
    const { data } = await supabase
      .from("opportunities")
      .select("id")
      .or(`canonical_ocid.eq.${id},source_notice_id.eq.${id}`)
      .limit(1)
      .single();
    if (!data?.id) {
      return NextResponse.json(
        { error: "Opportunity not found" },
        { status: 404 },
      );
    }
    opportunityId = data.id;
  }

  const [opp, profile] = await Promise.all([
    getOpportunity(opportunityId),
    getOrgProfile(orgId),
  ]);

  if (!opp) {
    return NextResponse.json(
      { error: "Opportunity not found" },
      { status: 404 },
    );
  }

  if (!profile) {
    return NextResponse.json(
      {
        error: "No organisation profile found. Set up your profile first.",
        profileRequired: true,
      },
      { status: 422 },
    );
  }

  const result = scoreOpportunity(opp, profile);
  const matchRow = scoringResultToMatchRow(result, opportunityId, orgId);

  const supabase = getServiceSupabase();
  await supabase
    .from("opportunity_matches")
    .upsert(
      { ...matchRow, created_at: new Date().toISOString() },
      { onConflict: "opportunity_id,org_id" },
    );

  return NextResponse.json(result);
}
