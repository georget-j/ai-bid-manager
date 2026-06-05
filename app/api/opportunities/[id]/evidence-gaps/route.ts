import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";
import { analyseGaps } from "@/lib/evidence-gap";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: opportunityId } = await params;
  const clientId = req.nextUrl.searchParams.get("clientId");

  if (!clientId) {
    return NextResponse.json(
      { error: "clientId query param required" },
      { status: 400 },
    );
  }

  const supabase = getServiceSupabase();

  // Verify client belongs to this org
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, vertical")
    .eq("id", clientId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!client)
    return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // Fetch requirements (question_class = 'requirement') for this opportunity
  const { data: questions, error: qErr } = await supabase
    .from("opportunity_questions")
    .select("id, question_text, section_ref, is_mandatory, question_class")
    .eq("opportunity_id", opportunityId)
    .eq("org_id", orgId)
    .eq("question_class", "requirement")
    .order("sort_order");

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });

  // Also include general questions that might imply evidence needs
  const { data: allQuestions } = await supabase
    .from("opportunity_questions")
    .select("id, question_text, section_ref, is_mandatory, question_class")
    .eq("opportunity_id", opportunityId)
    .eq("org_id", orgId)
    .neq("question_class", "guidance")
    .order("sort_order");

  const requirements = questions ?? [];
  const allQ = allQuestions ?? [];

  if (allQ.length === 0) {
    return NextResponse.json({
      client,
      total_requirements: 0,
      covered: 0,
      partial: 0,
      missing: 0,
      expired: 0,
      coverage_score: 0,
      results: [],
      message:
        "No questions extracted yet. Extract questions from tender documents first.",
    });
  }

  // Use requirements if available, fall back to all non-guidance questions
  const toAnalyse = requirements.length > 0 ? requirements : allQ;

  // Fetch client evidence
  const { data: evidence } = await supabase
    .from("evidence_items")
    .select("id, title, evidence_type, status, notes")
    .eq("org_id", orgId)
    .eq("client_id", clientId);

  const report = analyseGaps(toAnalyse, evidence ?? []);

  return NextResponse.json({ client, ...report });
}
