import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getRequestOrgId } from "@/lib/org";
import { escalateOverdueReviews } from "@/lib/review-routing";

export const dynamic = "force-dynamic";

export async function GET() {
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabase();

  // review_requests rows are org-scoped via their parent query (queries.org_id) —
  // the !inner join drops rows belonging to other orgs.
  const { data, error } = await supabase
    .from("review_requests")
    .select(
      `
      id, query_id, rfp_run_id, topic, risk_level, confidence_score,
      assigned_to, status, due_at, notified_at, created_at, updated_at,
      queries!inner(query_text, rfp_context)
    `,
    )
    .eq("queries.org_id", orgId)
    .order("created_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  void escalateOverdueReviews().catch((err) =>
    console.warn("[queue] escalation error:", err),
  );

  return NextResponse.json(data ?? []);
}
