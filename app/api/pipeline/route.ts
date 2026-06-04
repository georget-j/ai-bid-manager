import { NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase";

export async function GET() {
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json({ items: [] });
  }

  // Fetch pipeline items joined with opportunity data
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("bid_pipeline")
    .select(
      `
      *,
      opportunity:opportunities (
        id, title, buyer_name, region, deadline_at, value_amount,
        value_currency, procurement_stage, status
      )
    `,
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: `Failed to fetch pipeline: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ items: data ?? [] });
}
