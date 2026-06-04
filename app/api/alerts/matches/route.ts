import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase";

export async function GET() {
  const orgId = await getRequestOrgId();
  if (!orgId) return NextResponse.json({ matches: [], unseen_total: 0 });

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("alert_matches")
    .select(
      `
      id, seen, matched_at, org_id,
      alert_rule:alert_rules(id, name),
      opportunity:opportunities(id, title, buyer_name, deadline_at, value_amount, region, procurement_stage)
    `,
    )
    .eq("org_id", orgId)
    .order("matched_at", { ascending: false })
    .limit(50);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const matches = data ?? [];
  const unseen_total = matches.filter((m) => !m.seen).length;

  return NextResponse.json({ matches, unseen_total });
}

export async function POST(request: NextRequest) {
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const body = (await request.json()) as { ids?: string[]; all?: boolean };
  const supabase = getServiceSupabase();

  if (body.all) {
    await supabase
      .from("alert_matches")
      .update({ seen: true })
      .eq("org_id", orgId)
      .eq("seen", false);
  } else if (body.ids?.length) {
    await supabase
      .from("alert_matches")
      .update({ seen: true })
      .in("id", body.ids)
      .eq("org_id", orgId);
  }

  return NextResponse.json({ ok: true });
}
