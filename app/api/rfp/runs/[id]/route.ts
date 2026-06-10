import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getRequestOrgId } from "@/lib/org";
import { RFPResponseSchema } from "@/lib/schema";

export type RFPRunQuestion = {
  id: string;
  query_text: string;
  section: string;
  created_at: string;
  response: import("@/lib/schema").RFPResponse | null;
  confidence_level: "high" | "medium" | "low" | null;
  executive_summary: string | null;
};

export type RFPRunDetail = {
  run_id: string;
  rfp_title: string;
  created_at: string;
  questions: RFPRunQuestion[];
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: runId } = await params;
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
      .order("created_at", { ascending: true })
      .limit(2000);

    if (error) throw new Error(error.message);

    const runRows = (data ?? []).filter((row) => {
      const ctx = row.rfp_context as Record<string, unknown> | null;
      return ctx?.rfp_run_id === runId;
    });

    if (runRows.length === 0) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const firstCtx = runRows[0].rfp_context as Record<string, unknown>;

    const questions: RFPRunQuestion[] = runRows.map((row) => {
      const ctx = row.rfp_context as Record<string, unknown>;
      const result = Array.isArray(row.query_results)
        ? row.query_results[0]
        : null;
      const rawAnswer = result?.answer ?? null;

      let response = null;
      let confidenceLevel: "high" | "medium" | "low" | null = null;
      let executiveSummary: string | null = null;

      if (rawAnswer) {
        const parsed = RFPResponseSchema.safeParse(rawAnswer);
        if (parsed.success) {
          response = parsed.data;
          confidenceLevel = parsed.data.confidence.level;
          executiveSummary = parsed.data.executive_summary;
        }
      }

      return {
        id: row.id,
        query_text: row.query_text,
        section: typeof ctx.section === "string" ? ctx.section : "General",
        created_at: row.created_at,
        response,
        confidence_level: confidenceLevel,
        executive_summary: executiveSummary,
      };
    });

    const detail: RFPRunDetail = {
      run_id: runId,
      rfp_title:
        typeof firstCtx.rfp_title === "string"
          ? firstCtx.rfp_title
          : "Untitled RFP",
      created_at: runRows[0].created_at,
      questions,
    };

    return NextResponse.json(detail);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
