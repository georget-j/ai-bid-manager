import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase-service";
import { createResponseDraft } from "@/lib/responses/drafts";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

const TYPE_TO_TOPIC: Record<string, string> = {
  technical: "technical",
  experience: "commercial",
  financial: "pricing",
  "social-value": "general",
  general: "general",
};

/**
 * POST — snapshot this opportunity's extracted questions into a persisted response
 * draft (linked via opportunity_id) so it can be worked on in the Responses workspace.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = getServiceSupabase();

  const [{ data: opp }, { data: questions }] = await Promise.all([
    supabase.from("opportunities").select("title").eq("id", id).maybeSingle(),
    supabase
      .from("opportunity_questions")
      .select("question_text, section_ref, question_type")
      .eq("opportunity_id", id)
      .eq("org_id", orgId)
      .order("created_at", { ascending: true }),
  ]);

  if (!questions || questions.length === 0) {
    return NextResponse.json(
      { error: "No extracted questions to save. Extract questions first." },
      { status: 400 },
    );
  }

  const extracted = questions.map((q, i) => ({
    id: i + 1,
    text: q.question_text as string,
    section: (q.section_ref as string | null) ?? "",
    topic: TYPE_TO_TOPIC[q.question_type as string] ?? "general",
    risk_level: "medium",
    question_class: "question",
    word_limit: null,
    mandatory: false,
    priority: "medium",
  }));

  const draft = await createResponseDraft(orgId, {
    rfp_title: `${opp?.title ?? "Opportunity"} — Response`,
    opportunity_id: id,
    status: "draft",
    extracted_questions: extracted,
    selected_question_ids: extracted.map((q) => q.id),
  });

  return NextResponse.json({ draftId: draft.id });
}
