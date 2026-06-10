import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { getServiceSupabase } from "@/lib/supabase";
import { getRequestOrgId } from "@/lib/org";
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
  // Optimistic-concurrency token: the updated_at the reviewer last saw.
  expected_updated_at: z.string().optional(),
});

// Statuses from which an approve/reject transition is allowed.
const ACTIONABLE = ["pending", "assigned", "escalated"];

function conflict() {
  return NextResponse.json(
    {
      error:
        "This item was already actioned by another reviewer. Refresh to see the latest.",
    },
    { status: 409 },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await checkRateLimit(req, "review_action");
  if (limited) return limited;

  const { id } = await params;
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let action: string;
  let editedAnswer: string | undefined;
  let expectedUpdatedAt: string | undefined;
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
    expectedUpdatedAt = parsed.data.expected_updated_at;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  // Org-scoped via the parent query (queries.org_id) — cross-org ids 404.
  const { data: reviewRequest, error: rrError } = await supabase
    .from("review_requests")
    .select(
      "id, query_id, topic, risk_level, rfp_run_id, assigned_to, status, updated_at, queries!inner(org_id)",
    )
    .eq("id", id)
    .eq("queries.org_id", orgId)
    .single();

  if (rrError || !reviewRequest) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Already finalised by someone else?
  if (
    reviewRequest.status === "approved" ||
    reviewRequest.status === "rejected"
  ) {
    return conflict();
  }

  // In auth mode use the session user's email; in demo mode fall back to assigned_to
  let actorEmail: string = reviewRequest.assigned_to ?? "unknown";
  if (!isDemoMode) {
    const user = await getAuthUser();
    actorEmail = user?.email ?? actorEmail;
  }

  const { data: queryData, error: qError } = await supabase
    .from("queries")
    .select("query_text, rfp_context, query_results(answer)")
    .eq("id", reviewRequest.query_id)
    .eq("org_id", orgId)
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
    let rejectQuery = supabase
      .from("review_requests")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", id)
      .in("status", ACTIONABLE);
    if (expectedUpdatedAt)
      rejectQuery = rejectQuery.eq("updated_at", expectedUpdatedAt);
    const { data: claimed } = await rejectQuery.select("id");
    if (!claimed || claimed.length === 0) return conflict();

    void logReviewAction(id, actorEmail, "rejected");

    return NextResponse.json({ success: true, action: "rejected" });
  }

  // Approve — claim the transition atomically BEFORE any side-effects, so two
  // reviewers can't both approve (which would double-ingest + double-record).
  let claimQuery = supabase
    .from("review_requests")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ACTIONABLE);
  if (expectedUpdatedAt)
    claimQuery = claimQuery.eq("updated_at", expectedUpdatedAt);
  const { data: claimedApprove } = await claimQuery.select("id");
  if (!claimedApprove || claimedApprove.length === 0) return conflict();

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
      orgId,
    });
    ingestedDocumentId = result.document_id;
  } catch (err) {
    console.error("[review/action] ingestion failed:", err);
  }

  await supabase.from("approved_answers").insert({
    review_request_id: id,
    org_id: orgId,
    query_id: reviewRequest.query_id,
    original_question: queryData.query_text,
    approved_answer: approvedText,
    approved_by: actorEmail,
    topic: reviewRequest.topic,
    source_rfp:
      ((queryData.rfp_context as Record<string, unknown> | null)
        ?.rfp_title as string) ?? null,
    ingested_as_document_id: ingestedDocumentId,
    reusable: true,
  });

  // Status was already set to "approved" by the atomic claim above.
  void logReviewAction(id, actorEmail, "approved", {
    edited: !!editedAnswer?.trim(),
    ingested: !!ingestedDocumentId,
  });

  return NextResponse.json({
    success: true,
    action: "approved",
    ingested: !!ingestedDocumentId,
  });
}
