export const maxDuration = 60;

import { NextRequest } from "next/server";
import * as z from "zod";
import { retrieveChunks } from "@/lib/retrieval";
import { generateRFPResponse } from "@/lib/generation";
import { verifyCitations } from "@/lib/citations";
import { getServiceSupabase } from "@/lib/supabase-service";
import { checkRateLimit } from "@/lib/rate-limit";
import { computeRoutingCandidates } from "@/lib/review-routing";
import { getRequestOrgId } from "@/lib/org";
import { withWordLimit } from "@/lib/prompts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AnswerBatchQuestionSchema } from "@/lib/schema";
import type { RFPContext, RFPResponse } from "@/lib/schema";

const BatchRequestSchema = z.object({
  rfp_title: z.string().optional(),
  rfp_run_id: z.string().uuid().optional(), // supply to resume an interrupted batch
  opportunity_id: z.string().uuid().optional(), // link run to a procurement opportunity
  grant_id: z.string().uuid().optional(), // grant draft -> include the grant's scoped KB collection

  // Per-question word_limit / mandatory / priority are optional extras
  // (see AnswerBatchQuestionSchema) — existing clients are unaffected.
  questions: z.array(AnswerBatchQuestionSchema).min(1).max(100),
});

type Question = z.infer<typeof BatchRequestSchema>["questions"][number];

const encoder = new TextEncoder();
const CONCURRENCY = 5;

type CompletedAnswer = {
  queryId: string;
  questionText: string;
  section: string;
  topic: string;
  riskLevel: string;
  response: RFPResponse;
};

function sseEvent(type: string, payload: unknown): Uint8Array {
  return encoder.encode(
    `data: ${JSON.stringify({ type, ...(payload as object) })}\n\n`,
  );
}

async function processQuestion(
  question: Question,
  questionIndex: number,
  controller: ReadableStreamDefaultController,
  supabase: SupabaseClient,
  rfpRunId: string,
  rfpTitle: string | undefined,
  completed: CompletedAnswer[],
  orgId: string | null,
  collection: string | null,
  rfpContext: RFPContext | undefined,
) {
  controller.enqueue(sseEvent("start", { question_id: question.id }));
  try {
    const [{ data: queryRecord }, retrievedChunks] = await Promise.all([
      supabase
        .from("queries")
        .insert({
          query_text: question.text,
          rfp_context: {
            section: question.section,
            rfp_run_id: rfpRunId,
            rfp_title: rfpTitle,
            topic: question.topic ?? "general",
            risk_level: question.risk_level ?? "low",
            ...(question.word_limit != null
              ? { word_limit: question.word_limit }
              : {}),
            ...(question.mandatory != null
              ? { mandatory: question.mandatory }
              : {}),
            ...(question.priority ? { priority: question.priority } : {}),
          },
          org_id: orgId ?? null,
        })
        .select("id")
        .single(),
      retrieveChunks(question.text, orgId, null, collection),
    ]);

    // Mirror reevaluate: surface any stated word limit to the model so the
    // draft stays within the funder's/buyer's limit.
    const rawResponse = await generateRFPResponse(
      withWordLimit(question.text, question.word_limit),
      retrievedChunks,
      rfpContext,
    );
    const retrievedIds = new Set(retrievedChunks.map((c) => c.id));
    const { response } = verifyCitations(rawResponse, retrievedIds);

    if (queryRecord) {
      await supabase.from("query_results").insert({
        query_id: queryRecord.id,
        answer: response,
        retrieved_chunk_ids: [...retrievedIds],
      });

      completed.push({
        queryId: queryRecord.id,
        questionText: question.text,
        section: question.section,
        topic: question.topic ?? "general",
        riskLevel: question.risk_level ?? "low",
        response,
      });

      // Persist checkpoint
      await supabase
        .from("rfp_run_questions")
        .update({
          status: "completed",
          query_id: queryRecord.id,
          result: { response, retrieved_chunks: retrievedChunks },
        })
        .eq("rfp_run_id", rfpRunId)
        .eq("question_index", questionIndex);
    }

    controller.enqueue(
      sseEvent("result", {
        question_id: question.id,
        question_text: question.text,
        section: question.section,
        response,
        retrieved_chunks: retrievedChunks,
      }),
    );
  } catch (err) {
    await supabase
      .from("rfp_run_questions")
      .update({ status: "failed" })
      .eq("rfp_run_id", rfpRunId)
      .eq("question_index", questionIndex);

    controller.enqueue(
      sseEvent("question_error", {
        question_id: question.id,
        message: err instanceof Error ? err.message : "Unknown error",
      }),
    );
  }
}

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, "ask");
  if (limited) return limited;

  let questions: Question[];
  let rfpTitle: string | undefined;
  let clientRunId: string | undefined;
  let opportunityId: string | null = null;
  let collection: string | null = null;
  let rfpContext: RFPContext | undefined;
  try {
    const body = await request.json();
    const parsed = BatchRequestSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Invalid request";
      return new Response(JSON.stringify({ error: msg }), { status: 400 });
    }
    questions = parsed.data.questions;
    rfpTitle = parsed.data.rfp_title;
    clientRunId = parsed.data.rfp_run_id;
    opportunityId = parsed.data.opportunity_id ?? null;
    collection = parsed.data.grant_id ? `grant:${parsed.data.grant_id}` : null;
    // Grant drafts are written in the applicant's voice for the funder —
    // grant_id is the switch that selects the grant-application prompt.
    rfpContext = parsed.data.grant_id
      ? { response_type: "grant-application" }
      : undefined;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
    });
  }

  const rfpRunId = clientRunId ?? crypto.randomUUID();
  const supabase = getServiceSupabase();
  const orgId = await getRequestOrgId();
  const completed: CompletedAnswer[] = [];

  // Upsert all questions as pending — existing completed rows are untouched
  const { error: upsertErr } = await supabase.from("rfp_run_questions").upsert(
    questions.map((q, i) => ({
      rfp_run_id: rfpRunId,
      question_index: i,
      question_text: q.text,
      section: q.section,
      topic: q.topic ?? null,
      risk_level: q.risk_level ?? null,
      status: "pending",
      opportunity_id: opportunityId,
      org_id: orgId ?? null,
    })),
    { onConflict: "rfp_run_id,question_index", ignoreDuplicates: true },
  );
  if (upsertErr)
    console.error("[answer-batch] checkpoint upsert failed:", upsertErr);

  // Load already-completed question indexes for this run
  const { data: checkpointed } = await supabase
    .from("rfp_run_questions")
    .select("question_index, result")
    .eq("rfp_run_id", rfpRunId)
    .eq("status", "completed");

  const completedIndexes = new Set(
    (checkpointed ?? []).map((r) => r.question_index as number),
  );
  const cachedByIndex = new Map<
    number,
    { response: RFPResponse; retrieved_chunks: unknown[] }
  >(
    (checkpointed ?? [])
      .filter((r) => r.result)
      .map((r) => [
        r.question_index as number,
        r.result as { response: RFPResponse; retrieved_chunks: unknown[] },
      ]),
  );

  const abort = new AbortController();
  const timeoutId = setTimeout(
    () => abort.abort(new Error("Batch timeout")),
    55_000,
  );
  request.signal.addEventListener("abort", () => {
    clearTimeout(timeoutId);
    abort.abort();
  });

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Replay cached results so the client can render them immediately
        for (const [idx, cached] of cachedByIndex) {
          const q = questions[idx];
          if (!q) continue;
          controller.enqueue(
            sseEvent("result", {
              question_id: q.id,
              question_text: q.text,
              section: q.section,
              response: cached.response,
              retrieved_chunks: cached.retrieved_chunks,
              from_cache: true,
            }),
          );
        }

        // Process only questions that are not already complete
        const pending = questions.filter((_, i) => !completedIndexes.has(i));

        for (let i = 0; i < pending.length; i += CONCURRENCY) {
          if (abort.signal.aborted) break;
          const batch = pending.slice(i, i + CONCURRENCY);
          await Promise.all(
            batch.map((q) => {
              const originalIndex = questions.indexOf(q);
              return processQuestion(
                q,
                originalIndex,
                controller,
                supabase,
                rfpRunId,
                rfpTitle,
                completed,
                orgId,
                collection,
                rfpContext,
              );
            }),
          );
        }

        const pendingReview = await computeRoutingCandidates(completed).catch(
          (err) => {
            console.error("[answer-batch] routing check error:", err);
            return [];
          },
        );

        controller.enqueue(
          sseEvent("done", {
            total: questions.length,
            completed_from_cache: completedIndexes.size,
            pending_review: pendingReview,
            rfp_run_id: rfpRunId,
            rfp_title: rfpTitle ?? "RFP",
          }),
        );
        controller.close();
      } finally {
        clearTimeout(timeoutId);
      }
    },
    cancel() {
      clearTimeout(timeoutId);
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
