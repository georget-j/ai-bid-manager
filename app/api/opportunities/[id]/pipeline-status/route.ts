import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json({ saved: false });
  }

  const { id } = await params;
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("bid_pipeline")
    .select("id, client_id")
    .eq("opportunity_id", id)
    .eq("org_id", orgId)
    .maybeSingle();

  return NextResponse.json({
    saved: !!data,
    client_id: data?.client_id ?? null,
  });
}
