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

const BulkActionSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
  action: z.enum(["approve", "reject"]),
});

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "review_action");
  if (limited) return limited;

  let ids: string[];
  let action: "approve" | "reject";
  try {
    const raw = await req.json();
    const parsed = BulkActionSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }
    ids = parsed.data.ids;
    action = parsed.data.action;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Resolve actor identity once for the entire batch
  let actorEmail: string | null = null;
  if (!isDemoMode) {
    const user = await getAuthUser();
    actorEmail = user?.email ?? null;
  }

  const supabase = getServiceSupabase();
  const failed: string[] = [];
  let processed = 0;
  const now = new Date().toISOString();

  // Batch-read the requested review requests once (avoids a per-id round-trip).
  const { data: rrs } = await supabase
    .from("review_requests")
    .select("id, query_id, topic, assigned_to, status")
    .in("id", ids);
  type RR = {
    id: string;
    query_id: string;
    topic: string;
    assigned_to: string;
  };
  const rrMap = new Map<string, RR>((rrs ?? []).map((r) => [r.id, r as RR]));

  // Atomically claim ALL actionable items in a single guarded update — the rows
  // returned are the ones this request won (still pending/assigned).
  const targetStatus = action === "reject" ? "rejected" : "approved";
  const { data: claimedRows } = await supabase
    .from("review_requests")
    .update({ status: targetStatus, updated_at: now })
    .in("id", ids)
    .in("status", ["pending", "assigned"])
    .select("id");
  const claimedIds = new Set<string>((claimedRows ?? []).map((c) => c.id));
  for (const id of ids) if (!claimedIds.has(id)) failed.push(id);

  if (action === "reject") {
    for (const id of claimedIds) {
      void logReviewAction(
        id,
        actorEmail ?? rrMap.get(id)?.assigned_to ?? "unknown",
        "rejected",
        { bulk: true },
      );
      processed++;
    }
    return NextResponse.json({ processed, failed });
  }

  // Approve: batch-read the source queries for the claimed items, then ingest +
  // collect the approved_answers rows for a single bulk insert.
  const claimed = [...claimedIds]
    .map((id) => rrMap.get(id))
    .filter((r): r is RR => Boolean(r));
  const queryIds = [...new Set(claimed.map((r) => r.query_id))];
  const { data: queries } = queryIds.length
    ? await supabase
        .from("queries")
        .select("id, query_text, rfp_context, query_results(answer)")
        .in("id", queryIds)
    : { data: [] as unknown[] };
  type Q = {
    id: string;
    query_text: string;
    rfp_context: Record<string, unknown> | null;
    query_results: Array<{ answer: Record<string, unknown> }> | null;
  };
  const qMap = new Map<string, Q>(
    (queries ?? []).map((q) => [(q as Q).id, q as Q]),
  );

  const answerRows: Record<string, unknown>[] = [];
  for (const rr of claimed) {
    const q = qMap.get(rr.query_id);
    if (!q) {
      failed.push(rr.id);
      continue;
    }
    const approvedText =
      (q.query_results?.[0]?.answer?.draft_answer as string) ?? "";

    let ingestedDocumentId: string | null = null;
    try {
      const today = now.slice(0, 10);
      const result = await ingestDocument({
        text: `Q: ${q.query_text}\n\nA: ${approvedText}\n\nApproved on: ${today}`,
        title: `Approved Answer: ${q.query_text.slice(0, 80)}`,
        sourceType: "upload",
      });
      ingestedDocumentId = result.document_id;
    } catch {
      // ingestion failure doesn't block approval
    }

    answerRows.push({
      review_request_id: rr.id,
      query_id: rr.query_id,
      original_question: q.query_text,
      approved_answer: approvedText,
      approved_by: actorEmail ?? rr.assigned_to,
      topic: rr.topic,
      source_rfp: (q.rfp_context?.rfp_title as string) ?? null,
      ingested_as_document_id: ingestedDocumentId,
      reusable: true,
    });
    void logReviewAction(rr.id, actorEmail ?? rr.assigned_to, "approved", {
      bulk: true,
    });
    processed++;
  }

  if (answerRows.length > 0) {
    await supabase.from("approved_answers").insert(answerRows);
  }

  return NextResponse.json({ processed, failed });
}
