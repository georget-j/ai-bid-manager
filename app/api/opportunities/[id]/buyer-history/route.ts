import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: opportunityId } = await params;
  const supabase = getServiceSupabase();

  // Get this opportunity's buyer_name
  const { data: opp } = await supabase
    .from("opportunities")
    .select("buyer_name, buyer_identifier, buyer_region, source_url, cpv_codes")
    .eq("id", opportunityId)
    .maybeSingle();

  if (!opp?.buyer_name) {
    return NextResponse.json({ opportunities: [], stats: null });
  }

  // All opportunities from the same buyer (excluding current)
  const { data: related } = await supabase
    .from("opportunities")
    .select(
      "id, title, status, procurement_stage, value_amount, value_currency, deadline_at, published_at, source_url, cpv_codes",
    )
    .eq("buyer_name", opp.buyer_name)
    .neq("id", opportunityId)
    .order("published_at", { ascending: false })
    .limit(50);

  const all = related ?? [];

  const stats = {
    total: all.length,
    open: all.filter((o) => o.status === "active").length,
    awarded: all.filter((o) => o.status === "awarded").length,
    closed: all.filter((o) => ["closed", "cancelled"].includes(o.status))
      .length,
    avg_value:
      all.filter((o) => o.value_amount).length > 0
        ? Math.round(
            all
              .filter((o) => o.value_amount)
              .reduce((s, o) => s + (o.value_amount ?? 0), 0) /
              all.filter((o) => o.value_amount).length,
          )
        : null,
    // Most common CPV codes across all their tenders
    top_cpv: (() => {
      const freq = new Map<string, number>();
      for (const o of all) {
        for (const code of (o.cpv_codes as string[]) ?? []) {
          freq.set(code, (freq.get(code) ?? 0) + 1);
        }
      }
      return [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([code]) => code);
    })(),
  };

  return NextResponse.json({
    buyer: {
      name: opp.buyer_name,
      identifier: opp.buyer_identifier,
      region: opp.buyer_region,
      source_url: opp.source_url,
      cpv_codes: opp.cpv_codes,
    },
    stats,
    // Last 6 recent tenders for the table
    opportunities: all.slice(0, 6),
  });
}
