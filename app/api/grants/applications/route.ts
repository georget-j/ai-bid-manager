import { NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";
import { getRunReviewStatuses } from "@/lib/grants/review-status";

export const dynamic = "force-dynamic";

/** GET — this org's grant applications (grant-linked response drafts) for the pipeline. */
export async function GET() {
  const orgId = await getRequestOrgId();
  if (!orgId) return NextResponse.json({ applications: [] });

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("response_drafts")
    .select(
      `
      id, rfp_title, stage, submitted_at, question_count, answered_count,
      grant_id, latest_rfp_run_id, updated_at,
      grant:grants(id, title, funder_name, deadline_at, status)
    `,
    )
    .eq("org_id", orgId)
    .not("grant_id", "is", null)
    .neq("status", "archived")
    .order("updated_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const reviews = await getRunReviewStatuses(
    rows.map((r) => r.latest_rfp_run_id as string | null),
  );
  const applications = rows.map((r) => ({
    ...r,
    review: r.latest_rfp_run_id
      ? (reviews.get(r.latest_rfp_run_id as string) ?? null)
      : null,
  }));

  return NextResponse.json({ applications });
}
