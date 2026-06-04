import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getOpportunity } from "@/lib/procurement/data";
import { getServiceSupabase } from "@/lib/supabase";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("opportunity_questions")
    .select("*")
    .eq("opportunity_id", id)
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ questions: data ?? [] });
}

export async function POST(request: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const opp = await getOpportunity(id);
  if (!opp) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    questions: Array<{
      question_text: string;
      section_ref?: string | null;
      question_type?: string | null;
      word_limit?: number | null;
      is_mandatory?: boolean;
    }>;
  };

  if (!Array.isArray(body.questions) || body.questions.length === 0) {
    return NextResponse.json(
      { error: "questions array required" },
      { status: 400 },
    );
  }

  const supabase = getServiceSupabase();

  // Replace existing questions for this org × opportunity
  await supabase
    .from("opportunity_questions")
    .delete()
    .eq("opportunity_id", id)
    .eq("org_id", orgId);

  const rows = body.questions.map((q) => ({
    opportunity_id: id,
    org_id: orgId,
    question_text: q.question_text,
    section_ref: q.section_ref ?? null,
    question_type: q.question_type ?? "general",
    word_limit: q.word_limit ?? null,
    is_mandatory: q.is_mandatory ?? true,
    answer_status: "unanswered",
  }));

  const { data, error } = await supabase
    .from("opportunity_questions")
    .insert(rows)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ questions: data ?? [] });
}
