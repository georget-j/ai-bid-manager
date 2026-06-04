import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getOpportunity, getOrgProfile } from "@/lib/procurement/data";
import { getServiceSupabase } from "@/lib/supabase";
import {
  scoreOpportunity,
  scoringResultToMatchRow,
} from "@/lib/procurement/scoring";

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

  const [opp, profile] = await Promise.all([
    getOpportunity(id, orgId),
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
  const matchRow = scoringResultToMatchRow(result, id, orgId);

  const supabase = getServiceSupabase();
  await supabase
    .from("opportunity_matches")
    .upsert(
      { ...matchRow, created_at: new Date().toISOString() },
      { onConflict: "opportunity_id,org_id" },
    );

  return NextResponse.json(result);
}
