import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase";

export async function GET() {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({
      matches: [],
      grant_matches: [],
      unseen_total: 0,
    });

  const supabase = getServiceSupabase();
  const [oppRes, grantRes] = await Promise.all([
    supabase
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
      .limit(50),
    supabase
      .from("grant_alert_matches")
      .select(
        `
        id, seen, matched_at, org_id,
        alert_rule:alert_rules(id, name),
        grant:grants(id, title, funder_name, deadline_at, amount_min, amount_max, status)
      `,
      )
      .eq("org_id", orgId)
      .order("matched_at", { ascending: false })
      .limit(50),
  ]);

  if (oppRes.error)
    return NextResponse.json({ error: oppRes.error.message }, { status: 500 });

  const matches = oppRes.data ?? [];
  const grant_matches = grantRes.data ?? [];
  const unseen_total =
    matches.filter((m) => !m.seen).length +
    grant_matches.filter((m) => !m.seen).length;

  return NextResponse.json({ matches, grant_matches, unseen_total });
}

export async function POST(request: NextRequest) {
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const body = (await request.json()) as {
    ids?: string[];
    all?: boolean;
    kind?: "opportunity" | "grant";
  };
  const supabase = getServiceSupabase();
  const table = body.kind === "grant" ? "grant_alert_matches" : "alert_matches";

  if (body.all) {
    // Mark both opportunity and grant matches as seen.
    await Promise.all([
      supabase
        .from("alert_matches")
        .update({ seen: true })
        .eq("org_id", orgId)
        .eq("seen", false),
      supabase
        .from("grant_alert_matches")
        .update({ seen: true })
        .eq("org_id", orgId)
        .eq("seen", false),
    ]);
  } else if (body.ids?.length) {
    await supabase
      .from(table)
      .update({ seen: true })
      .in("id", body.ids)
      .eq("org_id", orgId);
  }

  return NextResponse.json({ ok: true });
}
