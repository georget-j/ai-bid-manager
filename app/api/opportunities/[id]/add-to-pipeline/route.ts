import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { addToPipeline, upsertSeedOpportunities } from "@/lib/procurement/data";
import { getServiceSupabase } from "@/lib/supabase";

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

  // Seed opportunities use non-UUID IDs. Auto-upsert them to DB first so the
  // FK constraint on bid_pipeline is satisfied, then resolve the real UUID.
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

  try {
    const item = await addToPipeline(opportunityId, orgId);
    return NextResponse.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
