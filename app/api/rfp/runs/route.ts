import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getRequestOrgId } from "@/lib/org";

export type RFPRunSummary = {
  run_id: string;
  rfp_title: string;
  created_at: string;
  question_count: number;
  answered_count: number;
  confidence_distribution: { high: number; medium: number; low: number };
};

export async function GET() {
  try {
    const orgId = await getRequestOrgId();
    if (!orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceSupabase();

    const { data, error } = await supabase
      .from("queries")
      .select("id, rfp_context, created_at, query_results(id, answer)")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (error) throw new Error(error.message);

    // Keep only RFP batch queries
    const rfpRows = (data ?? []).filter((row) => {
      const ctx = row.rfp_context as Record<string, unknown> | null;
      return typeof ctx?.rfp_run_id === "string";
    });

    // Group by run_id
    const runMap = new Map<string, typeof rfpRows>();
    for (const row of rfpRows) {
      const ctx = row.rfp_context as Record<string, unknown>;
      const runId = ctx.rfp_run_id as string;
      const arr = runMap.get(runId) ?? [];
      arr.push(row);
      runMap.set(runId, arr);
    }

    const summaries: RFPRunSummary[] = [];
    for (const [runId, rows] of runMap) {
      const ctx = rows[0].rfp_context as Record<string, unknown>;
      const dist = { high: 0, medium: 0, low: 0 };
      let answered = 0;

      for (const row of rows) {
        const result = Array.isArray(row.query_results)
          ? row.query_results[0]
          : null;
        if (!result) continue;
        answered++;
        const level = (result.answer as Record<string, unknown>)?.confidence as
          | { level: string }
          | undefined;
        const lvl = level?.level;
        if (lvl === "high") dist.high++;
        else if (lvl === "medium") dist.medium++;
        else if (lvl === "low") dist.low++;
      }

      const earliest = rows.reduce(
        (min, r) => (r.created_at < min ? r.created_at : min),
        rows[0].created_at,
      );

      summaries.push({
        run_id: runId,
        rfp_title:
          typeof ctx.rfp_title === "string" ? ctx.rfp_title : "Untitled RFP",
        created_at: earliest,
        question_count: rows.length,
        answered_count: answered,
        confidence_distribution: dist,
      });
    }

    summaries.sort((a, b) => b.created_at.localeCompare(a.created_at));

    return NextResponse.json(summaries);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
