import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getRequestOrgId } from "@/lib/org";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabase();

  // Org-scoped via the parent query (queries.org_id) — cross-org ids 404.
  const [reviewResult, auditResult] = await Promise.all([
    supabase
      .from("review_requests")
      .select(
        `
        id, query_id, rfp_run_id, topic, risk_level, confidence_score,
        assigned_to, status, due_at, notified_at, created_at, updated_at,
        queries!inner(query_text, rfp_context, query_results(answer, retrieved_chunk_ids, created_at))
      `,
      )
      .eq("id", id)
      .eq("queries.org_id", orgId)
      .single(),
    supabase
      .from("review_audit_log")
      .select("id, actor_email, action, details, created_at")
      .eq("review_request_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (reviewResult.error || !reviewResult.data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...reviewResult.data,
    audit_log: auditResult.data ?? [],
  });
}
