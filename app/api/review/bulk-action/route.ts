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

  for (const id of ids) {
    try {
      const { data: reviewRequest, error: rrError } = await supabase
        .from("review_requests")
        .select("id, query_id, topic, assigned_to")
        .eq("id", id)
        .in("status", ["pending", "assigned"])
        .single();

      if (rrError || !reviewRequest) {
        failed.push(id);
        continue;
      }

      if (action === "reject") {
        await supabase
          .from("review_requests")
          .update({ status: "rejected", updated_at: new Date().toISOString() })
          .eq("id", id);
        void logReviewAction(
          id,
          actorEmail ?? reviewRequest.assigned_to,
          "rejected",
          { bulk: true },
        );
        processed++;
        continue;
      }

      const { data: queryData, error: qError } = await supabase
        .from("queries")
        .select("query_text, rfp_context, query_results(answer)")
        .eq("id", reviewRequest.query_id)
        .single();

      if (qError || !queryData) {
        failed.push(id);
        continue;
      }

      const originalAnswer = (
        queryData.query_results as Array<{ answer: Record<string, unknown> }>
      )?.[0]?.answer;
      const approvedText = (originalAnswer?.draft_answer as string) ?? "";

      let ingestedDocumentId: string | null = null;
      try {
        const today = new Date().toISOString().slice(0, 10);
        const shortQ = queryData.query_text.slice(0, 80);
        const result = await ingestDocument({
          text: `Q: ${queryData.query_text}\n\nA: ${approvedText}\n\nApproved on: ${today}`,
          title: `Approved Answer: ${shortQ}`,
          sourceType: "upload",
        });
        ingestedDocumentId = result.document_id;
      } catch {
        // ingestion failure doesn't block approval
      }

      await supabase.from("approved_answers").insert({
        review_request_id: id,
        query_id: reviewRequest.query_id,
        original_question: queryData.query_text,
        approved_answer: approvedText,
        approved_by: actorEmail ?? reviewRequest.assigned_to,
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

      void logReviewAction(
        id,
        actorEmail ?? reviewRequest.assigned_to,
        "approved",
        { bulk: true },
      );
      processed++;
    } catch {
      failed.push(id);
    }
  }

  return NextResponse.json({ processed, failed });
}
