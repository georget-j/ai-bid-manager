import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { getServiceSupabase } from "@/lib/supabase";
import { ingestDocument } from "@/lib/documents";
import { logReviewAction } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAuthUser } from "@/lib/supabase-server";

const isDemoMode = process.env.DEMO_MODE === "true";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ActionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  edited_answer: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await checkRateLimit(req, "review_action");
  if (limited) return limited;

  const { id } = await params;

  let action: string;
  let editedAnswer: string | undefined;
  try {
    const body = await req.json();
    const parsed = ActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }
    action = parsed.data.action;
    editedAnswer = parsed.data.edited_answer;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  const { data: reviewRequest, error: rrError } = await supabase
    .from("review_requests")
    .select("id, query_id, topic, risk_level, rfp_run_id, assigned_to")
    .eq("id", id)
    .single();

  if (rrError || !reviewRequest) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: queryData, error: qError } = await supabase
    .from("queries")
    .select("query_text, rfp_context, query_results(answer)")
    .eq("id", reviewRequest.query_id)
    .single();

  if (qError || !queryData) {
    return NextResponse.json({ error: "Query not found" }, { status: 404 });
  }

  const originalAnswer = (
    queryData.query_results as Array<{ answer: Record<string, unknown> }>
  )?.[0]?.answer;
  const draftAnswer = (originalAnswer?.draft_answer as string) ?? "";
  const approvedText = editedAnswer?.trim() || draftAnswer;

  if (action === "reject") {
    await supabase
      .from("review_requests")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", id);

    void logReviewAction(id, reviewRequest.assigned_to, "rejected");

    return NextResponse.json({ success: true, action: "rejected" });
  }

  let ingestedDocumentId: string | null = null;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const shortQ = queryData.query_text.slice(0, 80);
    const docTitle = `Approved Answer: ${shortQ}`;
    const content = `Q: ${queryData.query_text}\n\nA: ${approvedText}\n\nApproved on: ${today}`;

    const result = await ingestDocument({
      text: content,
      title: docTitle,
      sourceType: "upload",
    });
    ingestedDocumentId = result.document_id;
  } catch (err) {
    console.error("[review/action] ingestion failed:", err);
  }

  await supabase.from("approved_answers").insert({
    review_request_id: id,
    query_id: reviewRequest.query_id,
    original_question: queryData.query_text,
    approved_answer: approvedText,
    approved_by: reviewRequest.assigned_to,
    topic: reviewRequest.topic,
    source_rfp:
      ((queryData.rfp_context as Record<string, unknown> | null)
        ?.rfp_title as string) ?? null,
    ingested_as_document_id: ingestedDocumentId,
    reusable: true,
  });

  await supabase
    .from("review_requests")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .eq("id", id);

  void logReviewAction(id, reviewRequest.assigned_to, "approved", {
    edited: !!editedAnswer?.trim(),
    ingested: !!ingestedDocumentId,
  });

  return NextResponse.json({
    success: true,
    action: "approved",
    ingested: !!ingestedDocumentId,
  });
}
