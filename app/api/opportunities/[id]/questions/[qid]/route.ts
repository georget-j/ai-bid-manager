import { NextRequest, NextResponse } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase";

interface Params {
  params: Promise<{ id: string; qid: string }>;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: opportunityId, qid } = await params;

  const body = (await request.json()) as {
    ai_draft?: string;
    answer_status?: string;
  };

  if (body.ai_draft === undefined && body.answer_status === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.ai_draft !== undefined) update.ai_draft = body.ai_draft;
  if (body.answer_status !== undefined)
    update.answer_status = body.answer_status;

  const { data, error } = await supabase
    .from("opportunity_questions")
    .update(update)
    .eq("id", qid)
    .eq("opportunity_id", opportunityId)
    .eq("org_id", orgId)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ question: data });
}
