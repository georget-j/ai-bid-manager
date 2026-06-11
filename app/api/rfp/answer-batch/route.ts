export const maxDuration = 60;

import { NextRequest } from "next/server";
import * as z from "zod";
import { retrieveChunks } from "@/lib/retrieval";
import { streamRFPResponse, createDeltaThrottle } from "@/lib/generation";
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

// The serverless function is killed at maxDuration (60s). All model work
// stops at 55s so there is ALWAYS time to flush a terminal 'done' event —
// the client must never be left hanging on a stream that just dies.
const RUN_BUDGET_MS = 55_000;

// Don't start a question when less than this remains: a generation that
// cannot finish before the deadline only burns budget and produces nothing.
// The question is reported in unanswered_ids instead (and stays 'pending'
// in the checkpoint table, so a resumed run picks it up).
const MIN_START_BUDGET_MS = 12_000;

// At most one 'delta' event per question per this interval.
const DELTA_INTERVAL_MS = 400;

type CompletedAnswer = {
  queryId: string;
  questionText: string;
  section: string;
  topic: string;
  riskLevel: string;
  response: RFPResponse;
};

type Emit = (type: string, payload: unknown) => void;

function sseEvent(type: string, payload: unknown): Uint8Array {
  return encoder.encode(
    `data: ${JSON.stringify({ type, ...(payload as object) })}\n\n`,
  );
}

async function processQuestion(
  question: Question,
  questionIndex: number,
  emit: Emit,
  supabase: SupabaseClient,
  rfpRunId: string,
  rfpTitle: string | undefined,
  completed: CompletedAnswer[],
  orgId: string | null,
  collection: string | null,
  rfpContext: RFPContext | undefined,
  signal: AbortSignal,
): Promise<"ok" | "failed" | "aborted"> {
  emit("start", { question_id: question.id });
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
        .abortSignal(signal)
        .single(),
      // Batch path skips the LLM rerank (see RetrieveOptions in lib/retrieval)
      // — saves an extra model call per question while racing the deadline.
      retrieveChunks(question.text, orgId, null, collection, {
        rerank: false,
        signal,
      }),
    ]);

    // Stream the draft as it is written so the user sees progress instead of
    // a 12–25s blank wait. 'delta' carries the FULL text so far (not a diff).
    const throttle = createDeltaThrottle(DELTA_INTERVAL_MS);
    // Mirror reevaluate: surface any stated word limit to the model so the
    // draft stays within the funder's/buyer's limit.
    const rawResponse = await streamRFPResponse(
      withWordLimit(question.text, question.word_limit),
      retrievedChunks,
      rfpContext,
      {
        signal,
        onDraftAnswer: (text) => {
          if (throttle.shouldEmit()) {
            emit("delta", { question_id: question.id, text });
          }
        },
      },
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

    emit("result", {
      question_id: question.id,
      question_text: question.text,
      section: question.section,
      response,
      retrieved_chunks: retrievedChunks,
    });
    return "ok";
  } catch (err) {
    // Run deadline hit (or client gone) mid-question: leave the checkpoint
    // row 'pending' so a resumed run retries it, and report it unanswered.
    if (signal.aborted) return "aborted";

    await supabase
      .from("rfp_run_questions")
      .update({ status: "failed" })
      .eq("rfp_run_id", rfpRunId)
      .eq("question_index", questionIndex);

    emit("question_error", {
      question_id: question.id,
      message: err instanceof Error ? err.message : "Unknown error",
    });
    return "failed";
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

  // One deadline for the whole run; the derived signal reaches every OpenAI
  // call and Supabase fetch so nothing keeps running past the budget.
  const deadline = Date.now() + RUN_BUDGET_MS;
  const abort = new AbortController();
  const timeoutId = setTimeout(
    () => abort.abort(new Error("Batch timeout")),
    RUN_BUDGET_MS,
  );
  request.signal.addEventListener("abort", () => {
    clearTimeout(timeoutId);
    abort.abort();
  });

  const stream = new ReadableStream({
    async start(controller) {
      // Once the client disconnects, enqueue throws — swallow it so the
      // pipeline can still persist checkpoints for completed work.
      let closed = false;
      const emit: Emit = (type, payload) => {
        if (closed) return;
        try {
          controller.enqueue(sseEvent(type, payload));
        } catch {
          closed = true;
        }
      };

      const completed: CompletedAnswer[] = [];
      // Question ids with a result delivered this run (fresh or replayed).
      const answeredIds = new Set<Question["id"]>();
      let completedFromCache = 0;
      let deadlineHit = false;

      try {
        // Upsert all questions as pending — existing completed rows are untouched
        const { error: upsertErr } = await supabase
          .from("rfp_run_questions")
          .upsert(
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
              r.result as {
                response: RFPResponse;
                retrieved_chunks: unknown[];
              },
            ]),
        );

        // Replay cached results so the client can render them immediately
        for (const [idx, cached] of cachedByIndex) {
          const q = questions[idx];
          if (!q) continue;
          emit("result", {
            question_id: q.id,
            question_text: q.text,
            section: q.section,
            response: cached.response,
            retrieved_chunks: cached.retrieved_chunks,
            from_cache: true,
          });
          answeredIds.add(q.id);
        }
        completedFromCache = completedIndexes.size;

        // Process only questions that are not already complete. Pair each
        // question with its original index up front (no O(n²) indexOf).
        const pending = questions
          .map((q, index) => ({ q, index }))
          .filter(({ index }) => !completedIndexes.has(index));

        // Sliding-window worker pool: each worker pulls the next question as
        // soon as it finishes its current one, so one slow question never
        // holds up an entire wave of five.
        let nextItem = 0;
        const workers = Array.from(
          { length: Math.min(CONCURRENCY, pending.length) },
          async () => {
            while (!abort.signal.aborted) {
              if (deadline - Date.now() < MIN_START_BUDGET_MS) {
                deadlineHit = true;
                return;
              }
              const i = nextItem++;
              if (i >= pending.length) return;
              const { q, index } = pending[i];
              const status = await processQuestion(
                q,
                index,
                emit,
                supabase,
                rfpRunId,
                rfpTitle,
                completed,
                orgId,
                collection,
                rfpContext,
                abort.signal,
              );
              if (status === "ok") answeredIds.add(q.id);
            }
          },
        );
        await Promise.all(workers);
      } catch (err) {
        // Anything thrown outside a single question (checkpoint I/O, bugs)
        // must still end in a terminal 'done' — never a silent dead stream.
        console.error(
          "[answer-batch] run error:",
          err instanceof Error ? err.message : err,
        );
      }

      const pendingReview = await computeRoutingCandidates(completed).catch(
        (err) => {
          console.error("[answer-batch] routing check error:", err);
          return [];
        },
      );

      // ALWAYS the final event — even after a timeout or a crash.
      // unanswered_ids are stringified per the SSE contract.
      const unansweredIds = questions
        .filter((q) => !answeredIds.has(q.id))
        .map((q) => String(q.id));
      const partial = unansweredIds.length > 0;
      // Out of time (abort fired, or we stopped starting questions because
      // the budget floor was hit) reads as 'timeout'; anything else that
      // left questions unanswered is an 'error'.
      const reason: "timeout" | "error" | undefined = !partial
        ? undefined
        : abort.signal.aborted || deadlineHit
          ? "timeout"
          : "error";

      emit("done", {
        total: questions.length,
        completed_from_cache: completedFromCache,
        pending_review: pendingReview,
        rfp_run_id: rfpRunId,
        rfp_title: rfpTitle ?? "RFP",
        partial,
        unanswered_ids: unansweredIds,
        ...(reason ? { reason } : {}),
      });
      try {
        controller.close();
      } catch {
        // Stream already closed by a client disconnect — nothing to do.
      }
      clearTimeout(timeoutId);
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
