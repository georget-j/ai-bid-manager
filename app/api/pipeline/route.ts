import { NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase";

export async function GET() {
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json(
      {
        error:
          "Could not determine your organisation — try signing out and back in.",
      },
      { status: 401 },
    );
  }

  const supabase = getServiceSupabase();

  // Fetch pipeline items joined with opportunity data
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

  const oppIds = (data ?? [])
    .map((item) => item.opportunity_id as string)
    .filter(Boolean);

  if (oppIds.length === 0) {
    return NextResponse.json({
      items: [],
      totals: { questions: 0, answered: 0, matrices: 0 },
    });
  }

  // Fetch question counts per opportunity for this org (two extra queries, run in parallel)
  const [{ data: qRows }, { data: mRows }] = await Promise.all([
    supabase
      .from("opportunity_questions")
      .select("opportunity_id, answer_status")
      .eq("org_id", orgId)
      .in("opportunity_id", oppIds),
    supabase
      .from("compliance_matrices")
      .select("opportunity_id, id")
      .eq("org_id", orgId)
      .in("opportunity_id", oppIds),
  ]);

  // Aggregate question counts by opportunity
  const questionMap = new Map<string, { total: number; answered: number }>();
  for (const q of qRows ?? []) {
    const oId = q.opportunity_id as string;
    const entry = questionMap.get(oId) ?? { total: 0, answered: 0 };
    entry.total++;
    if (q.answer_status !== "unanswered") entry.answered++;
    questionMap.set(oId, entry);
  }

  // Aggregate matrix IDs by opportunity
  const matrixMap = new Map<string, string[]>();
  for (const m of mRows ?? []) {
    const oId = m.opportunity_id as string;
    if (!oId) continue;
    const list = matrixMap.get(oId) ?? [];
    list.push(m.id as string);
    matrixMap.set(oId, list);
  }

  // Enrich pipeline items
  const items = (data ?? []).map((item) => {
    const qData = questionMap.get(item.opportunity_id as string);
    const mIds = matrixMap.get(item.opportunity_id as string) ?? [];
    return {
      ...item,
      question_count: qData?.total ?? 0,
      answered_count: qData?.answered ?? 0,
      matrix_count: mIds.length,
      first_matrix_id: mIds[0] ?? null,
    };
  });

  // Aggregate totals across all pipeline items
  const totals = items.reduce(
    (acc, item) => ({
      questions: acc.questions + item.question_count,
      answered: acc.answered + item.answered_count,
      matrices: acc.matrices + item.matrix_count,
    }),
    { questions: 0, answered: 0, matrices: 0 },
  );

  return NextResponse.json({ items, totals });
}
