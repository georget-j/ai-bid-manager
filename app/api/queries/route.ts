import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getRequestOrgId } from "@/lib/org";
import type { QueryHistoryItem, RFPContext } from "@/lib/schema";

export async function GET() {
  try {
    const orgId = await getRequestOrgId();
    if (!orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceSupabase();

    const { data, error } = await supabase
      .from("queries")
      .select(
        "id, query_text, rfp_context, created_at, query_results(id, answer, created_at)",
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw new Error(error.message);

    const items: QueryHistoryItem[] = (data ?? []).map((row) => {
      const result = Array.isArray(row.query_results)
        ? row.query_results[0]
        : null;
      const answer = result?.answer as Record<string, unknown> | null;
      const confidence = answer?.confidence as { level: string } | null;
      const level = confidence?.level;

      return {
        id: row.id,
        query_text: row.query_text,
        rfp_context: (row.rfp_context as RFPContext) ?? null,
        created_at: row.created_at,
        confidence_level:
          level === "high" || level === "medium" || level === "low"
            ? level
            : null,
        executive_summary:
          typeof answer?.executive_summary === "string"
            ? answer.executive_summary
            : null,
      };
    });

    return NextResponse.json(items);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
