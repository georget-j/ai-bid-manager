import { NextRequest } from "next/server";
import { getRequestOrgId } from "@/lib/org";
import { getServiceSupabase } from "@/lib/supabase";
import { retrieveChunks } from "@/lib/retrieval";
import { generateRFPResponse } from "@/lib/generation";
import { verifyCitations } from "@/lib/citations";

interface Params {
  params: Promise<{ id: string }>;
}

const encoder = new TextEncoder();

function sseEvent(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: NextRequest, { params }: Params) {
  const orgId = await getRequestOrgId();
  if (!orgId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  const { id } = await params;

  // Optional filter: only answer specific question IDs (used by per-row Answer button)
  let questionIds: string[] | null = null;
  try {
    const body = (await request.json()) as { questionIds?: string[] };
    if (Array.isArray(body.questionIds) && body.questionIds.length > 0) {
      questionIds = body.questionIds;
    }
  } catch {
    // no body — answer all unanswered
  }

  const supabase = getServiceSupabase();

  let query = supabase
    .from("opportunity_questions")
    .select("id, question_text, answer_status")
    .eq("opportunity_id", id)
    .eq("org_id", orgId);

  if (questionIds) {
    query = query.in("id", questionIds);
  } else {
    query = query.eq("answer_status", "unanswered");
  }

  const { data: questions, error } = await query;

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }

  if (!questions || questions.length === 0) {
    return new Response(
      encoder.encode(
        `event: done\ndata: ${JSON.stringify({ total: 0, answered: 0 })}\n\n`,
      ),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      },
    );
  }

  const total = questions.length;
  let answered = 0;

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(sseEvent("start", { total }));

      const CONCURRENCY = 3;
      for (let i = 0; i < questions.length; i += CONCURRENCY) {
        const batch = questions.slice(i, i + CONCURRENCY);

        await Promise.allSettled(
          batch.map(async (q) => {
            try {
              const chunks = await retrieveChunks(q.question_text, orgId);
              const rawResponse = await generateRFPResponse(
                q.question_text,
                chunks,
              );
              const retrievedIds = new Set(chunks.map((c) => c.id));
              const { response } = verifyCitations(rawResponse, retrievedIds);

              const confLevel = response.confidence?.level ?? "low";
              const confScore =
                confLevel === "high" ? 85 : confLevel === "medium" ? 60 : 35;

              await supabase
                .from("opportunity_questions")
                .update({
                  ai_draft: response.draft_answer,
                  answer_status: confScore >= 60 ? "drafted" : "needs-review",
                  updated_at: new Date().toISOString(),
                })
                .eq("id", q.id);

              answered++;
              controller.enqueue(
                sseEvent("progress", {
                  questionId: q.id,
                  status: "drafted",
                  preview: response.draft_answer?.slice(0, 120) ?? "",
                  answered,
                  total,
                }),
              );
            } catch {
              await supabase
                .from("opportunity_questions")
                .update({
                  answer_status: "needs-review",
                  updated_at: new Date().toISOString(),
                })
                .eq("id", q.id);

              answered++;
              controller.enqueue(
                sseEvent("progress", {
                  questionId: q.id,
                  status: "needs-review",
                  preview: "",
                  answered,
                  total,
                }),
              );
            }
          }),
        );
      }

      controller.enqueue(sseEvent("done", { total, answered }));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
