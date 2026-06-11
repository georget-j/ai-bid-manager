/**
 * Answer-batch pipeline tests (POST /api/rfp/answer-batch).
 *
 * Pins the SSE contract end to end with OpenAI, the AI SDK, embeddings and
 * Supabase mocked out:
 *   - 'done' is ALWAYS the final event — success, timeout and thrown error —
 *     with { partial, unanswered_ids, reason? } on top of the existing fields;
 *   - the sliding-window pool means one slow question never blocks the rest;
 *   - the batch path skips the LLM rerank (hybrid top-6 used directly);
 *   - 'delta' events stream the accumulated draft text, throttled per question
 *     (createDeltaThrottle tested as a pure helper).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import type { RetrievedChunk, RFPResponse } from "@/lib/schema";

const mocks = vi.hoisted(() => ({
  // openai SDK (rerank + non-streaming generation)
  parse: vi.fn(),
  // AI SDK streamObject (streaming generation)
  streamObject: vi.fn(),
  getServiceSupabase: vi.fn(),
  getRequestOrgId: vi.fn(),
  checkRateLimit: vi.fn(),
  computeRoutingCandidates: vi.fn(),
  generateEmbedding: vi.fn(),
}));

vi.mock("@/lib/openai", () => ({
  openai: { chat: { completions: { parse: mocks.parse } } },
  aiOpenAI: vi.fn(() => "mock-model"),
  CHAT_MODEL: "test-model",
  EMBEDDING_MODEL: "test-embedding",
  EMBEDDING_DIMENSIONS: 4,
}));

vi.mock("ai", () => ({ streamObject: mocks.streamObject }));

vi.mock("@/lib/embeddings", () => ({
  generateEmbedding: mocks.generateEmbedding,
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceSupabase: mocks.getServiceSupabase,
}));

vi.mock("@/lib/org", () => ({ getRequestOrgId: mocks.getRequestOrgId }));

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));

vi.mock("@/lib/review-routing", () => ({
  computeRoutingCandidates: mocks.computeRoutingCandidates,
}));

import { POST } from "@/app/api/rfp/answer-batch/route";
import { streamRFPResponse, createDeltaThrottle } from "@/lib/generation";
import { retrieveChunks } from "@/lib/retrieval";

const ORG_ID = "11111111-2222-3333-4444-555555555555";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const stubResponse: RFPResponse = {
  draft_answer: "We hold ISO 27001 certification.",
  executive_summary: "Certified since 2024.",
  supporting_evidence: [],
  citations: [
    {
      source_title: "Security Pack",
      chunk_id: "chunk-1",
      excerpt: "ISO 27001 certified.",
      relevance: "Direct evidence.",
    },
  ],
  missing_information: [],
  confidence: { level: "high", reason: "Direct evidence." },
  suggested_next_actions: [],
};

function makeChunks(n: number): RetrievedChunk[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `chunk-${i + 1}`,
    document_id: `doc-${i + 1}`,
    document_title: `Doc ${i + 1}`,
    content: `Content ${i + 1}`,
    similarity: 1 - i * 0.05,
    metadata: null,
  }));
}

const question = (id: number, text: string) => ({
  id,
  section: "Security",
  text,
});

// ── Test doubles ─────────────────────────────────────────────────────────────

type ChainCall = { method: string; table: string; args: unknown[] };

/**
 * Chainable thenable Supabase stub. Awaiting any chain resolves per-table:
 * inserts into `queries` return a fresh id, the checkpoint select returns
 * `checkpointRows`, everything else returns empty success. Every call is
 * recorded for assertions. `rpc` feeds retrieval `rpcRows` candidates.
 */
function makeSupabase(
  opts: {
    checkpointRows?: unknown[];
    rpcRows?: RetrievedChunk[];
    fromThrows?: boolean;
  } = {},
) {
  const calls: ChainCall[] = [];
  let queryN = 0;

  const from = vi.fn((table: string) => {
    if (opts.fromThrows) throw new Error("db exploded");
    const local: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {};
    for (const m of [
      "select",
      "insert",
      "update",
      "upsert",
      "eq",
      "single",
      "abortSignal",
    ]) {
      chain[m] = (...args: unknown[]) => {
        calls.push({ method: m, table, args });
        local.push(m);
        return chain;
      };
    }
    chain.then = (
      onF?: (v: unknown) => unknown,
      onR?: (e: unknown) => unknown,
    ) => {
      let result: unknown = { data: null, error: null };
      if (table === "queries")
        result = { data: { id: `query-${++queryN}` }, error: null };
      else if (table === "rfp_run_questions" && local.includes("select"))
        result = { data: opts.checkpointRows ?? [], error: null };
      return Promise.resolve(result).then(onF, onR);
    };
    return chain;
  });

  const rpc = vi.fn(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      abortSignal: () => chain,
      then: (onF?: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
        Promise.resolve({
          data: opts.rpcRows ?? makeChunks(8),
          error: null,
        }).then(onF, onR),
    };
    return chain;
  });

  return { client: { from, rpc }, calls };
}

/** streamObject result whose partials and final object resolve immediately. */
function instantStream(partials: string[] = ["Working…"]) {
  return {
    partialObjectStream: (async function* () {
      for (const p of partials) yield { draft_answer: p };
    })(),
    object: Promise.resolve(stubResponse),
  };
}

/** streamObject result that never resolves until the signal aborts. */
function hangingStream(abortSignal: AbortSignal | undefined) {
  const never = new Promise<never>((_, reject) => {
    abortSignal?.addEventListener("abort", () => reject(new Error("aborted")));
  });
  return {
    partialObjectStream: (async function* () {
      await never;
    })(),
    object: never,
  };
}

function makeRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/rfp/answer-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

type SseEvent = { type: string } & Record<string, unknown>;

async function readSse(res: Response): Promise<SseEvent[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const events: SseEvent[] = [];
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const messages = buffer.split("\n\n");
    buffer = messages.pop() ?? "";
    for (const msg of messages) {
      if (!msg.startsWith("data: ")) continue;
      events.push(JSON.parse(msg.slice(6)) as SseEvent);
    }
  }
  return events;
}

const ofType = (events: SseEvent[], type: string) =>
  events.filter((e) => e.type === type);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkRateLimit.mockResolvedValue(null);
  mocks.getRequestOrgId.mockResolvedValue(ORG_ID);
  mocks.computeRoutingCandidates.mockResolvedValue([]);
  mocks.generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3, 0.4]);
  mocks.streamObject.mockImplementation(() => instantStream());
  mocks.getServiceSupabase.mockReturnValue(makeSupabase().client);
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Terminal 'done': success path ────────────────────────────────────────────

describe("POST /api/rfp/answer-batch — success", () => {
  it("streams start/delta/result per question and ends with done partial:false", async () => {
    const res = await POST(
      makeRequest({
        rfp_title: "Test RFP",
        questions: [question(1, "Q one"), question(2, "Q two")],
      }),
    );
    expect(res.status).toBe(200);
    const events = await readSse(res);

    // start preserved with its existing shape
    expect(
      ofType(events, "start")
        .map((e) => e.question_id)
        .sort(),
    ).toEqual([1, 2]);

    // delta carries the accumulated text so far for that question
    const deltas = ofType(events, "delta");
    expect(deltas.length).toBeGreaterThanOrEqual(2);
    for (const d of deltas) {
      expect([1, 2]).toContain(d.question_id);
      expect(d.text).toBe("Working…");
    }

    // result keeps its existing shape
    const results = ofType(events, "result");
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.question_text).toBeTypeOf("string");
      expect(r.section).toBe("Security");
      expect((r.response as RFPResponse).draft_answer).toBe(
        stubResponse.draft_answer,
      );
      // batch path: hybrid top-6 slice, no rerank
      expect(r.retrieved_chunks).toHaveLength(6);
    }

    // done is ALWAYS the final event
    const last = events.at(-1)!;
    expect(last.type).toBe("done");
    expect(last).toMatchObject({
      total: 2,
      completed_from_cache: 0,
      pending_review: [],
      rfp_title: "Test RFP",
      partial: false,
      unanswered_ids: [],
    });
    expect(last.rfp_run_id).toBeTypeOf("string");
    expect(last.reason).toBeUndefined();
  });

  it("skips the LLM rerank on the batch path", async () => {
    const res = await POST(makeRequest({ questions: [question(1, "Q one")] }));
    await readSse(res);
    // 8 candidates came back from hybrid search (> FINAL_COUNT), yet no
    // gpt-4o-mini rerank call was made.
    expect(mocks.parse).not.toHaveBeenCalled();
  });

  it("replays checkpointed answers and leaves them out of unanswered_ids", async () => {
    const stub = makeSupabase({
      checkpointRows: [
        {
          question_index: 0,
          result: { response: stubResponse, retrieved_chunks: [] },
        },
      ],
    });
    mocks.getServiceSupabase.mockReturnValue(stub.client);

    const res = await POST(
      makeRequest({
        rfp_run_id: "8d9c1f7e-4b2a-4c3d-9e8f-1a2b3c4d5e6f",
        questions: [question(1, "Cached"), question(2, "Fresh")],
      }),
    );
    const events = await readSse(res);

    const results = ofType(events, "result");
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.question_id === 1)?.from_cache).toBe(true);
    // only the fresh question hit the model
    expect(mocks.streamObject).toHaveBeenCalledTimes(1);

    const done = events.at(-1)!;
    expect(done).toMatchObject({
      type: "done",
      completed_from_cache: 1,
      partial: false,
      unanswered_ids: [],
    });
  });
});

// ── Sliding window ───────────────────────────────────────────────────────────

describe("POST /api/rfp/answer-batch — sliding-window pool", () => {
  it("a slow question does not block the sixth question (no lock-step waves)", async () => {
    mocks.streamObject.mockImplementation(
      ({ messages }: { messages: { role: string; content: string }[] }) => {
        const user = messages.find((m) => m.role === "user")?.content ?? "";
        if (!user.includes("SLOW")) return instantStream();
        const object = new Promise<RFPResponse>((resolve) =>
          setTimeout(() => resolve(stubResponse), 40),
        );
        return {
          partialObjectStream: (async function* () {
            await object;
            yield { draft_answer: stubResponse.draft_answer };
          })(),
          object,
        };
      },
    );

    const res = await POST(
      makeRequest({
        questions: [
          question(1, "SLOW question"),
          question(2, "Q2"),
          question(3, "Q3"),
          question(4, "Q4"),
          question(5, "Q5"),
          question(6, "Q6"),
        ],
      }),
    );
    const events = await readSse(res);

    const resultOrder = ofType(events, "result").map((e) => e.question_id);
    expect(resultOrder).toHaveLength(6);
    // With lock-step waves of 5, question 6 could only start after the slow
    // question 1 finished. The pool lets it overtake.
    expect(resultOrder.indexOf(6)).toBeLessThan(resultOrder.indexOf(1));

    const done = events.at(-1)!;
    expect(done).toMatchObject({
      type: "done",
      partial: false,
      unanswered_ids: [],
    });
  });
});

// ── Terminal 'done': timeout path ────────────────────────────────────────────

describe("POST /api/rfp/answer-batch — timeout", () => {
  it("aborts hung generations and emits done partial:true reason:'timeout' with unanswered_ids", async () => {
    vi.useFakeTimers();
    const stub = makeSupabase();
    mocks.getServiceSupabase.mockReturnValue(stub.client);
    mocks.streamObject.mockImplementation(
      ({
        messages,
        abortSignal,
      }: {
        messages: { role: string; content: string }[];
        abortSignal?: AbortSignal;
      }) => {
        const user = messages.find((m) => m.role === "user")?.content ?? "";
        return user.includes("HANG")
          ? hangingStream(abortSignal)
          : instantStream();
      },
    );

    const res = await POST(
      makeRequest({
        questions: [
          question(1, "Fast"),
          question(2, "HANG one"),
          question(3, "HANG two"),
        ],
      }),
    );
    const eventsPromise = readSse(res);
    await vi.advanceTimersByTimeAsync(56_000);
    const events = await eventsPromise;

    // the fast question still answered before the deadline
    expect(ofType(events, "result").map((e) => e.question_id)).toEqual([1]);

    const last = events.at(-1)!;
    expect(last.type).toBe("done");
    expect(last).toMatchObject({
      partial: true,
      reason: "timeout",
      unanswered_ids: ["2", "3"],
      total: 3,
    });

    // aborted questions stay 'pending' for resume — never marked failed
    const failedUpdates = stub.calls.filter(
      (c) =>
        c.method === "update" &&
        (c.args[0] as { status?: string })?.status === "failed",
    );
    expect(failedUpdates).toHaveLength(0);
    // and no question_error events were sent for them
    expect(ofType(events, "question_error")).toHaveLength(0);
  });
});

// ── Terminal 'done': thrown error path ───────────────────────────────────────

describe("POST /api/rfp/answer-batch — thrown error", () => {
  it("emits done partial:true reason:'error' even when the pipeline throws", async () => {
    mocks.getServiceSupabase.mockReturnValue(
      makeSupabase({ fromThrows: true }).client,
    );

    const res = await POST(
      makeRequest({ questions: [question(1, "Q one"), question(2, "Q two")] }),
    );
    expect(res.status).toBe(200);
    const events = await readSse(res);

    const last = events.at(-1)!;
    expect(last.type).toBe("done");
    expect(last).toMatchObject({
      partial: true,
      reason: "error",
      unanswered_ids: ["1", "2"],
      total: 2,
    });
  });

  it("counts per-question failures in unanswered_ids with reason:'error'", async () => {
    mocks.streamObject.mockImplementation(
      ({ messages }: { messages: { role: string; content: string }[] }) => {
        const user = messages.find((m) => m.role === "user")?.content ?? "";
        if (user.includes("BROKEN")) {
          return {
            partialObjectStream: (async function* () {
              throw new Error("model exploded");
            })(),
            object: Promise.reject(new Error("model exploded")),
          };
        }
        return instantStream();
      },
    );

    const res = await POST(
      makeRequest({
        questions: [question(1, "Fine"), question(2, "BROKEN")],
      }),
    );
    const events = await readSse(res);

    expect(ofType(events, "result").map((e) => e.question_id)).toEqual([1]);
    expect(ofType(events, "question_error").map((e) => e.question_id)).toEqual([
      2,
    ]);

    const last = events.at(-1)!;
    expect(last.type).toBe("done");
    expect(last).toMatchObject({
      partial: true,
      reason: "error",
      unanswered_ids: ["2"],
    });
  });
});

// ── Retrieval: rerank toggle ─────────────────────────────────────────────────

describe("retrieveChunks — rerank option", () => {
  beforeEach(() => {
    mocks.getServiceSupabase.mockReturnValue(
      makeSupabase({ rpcRows: makeChunks(8) }).client,
    );
  });

  it("rerank:false returns the hybrid RRF top-6 with no LLM call", async () => {
    const chunks = await retrieveChunks("query", ORG_ID, null, null, {
      rerank: false,
    });
    expect(chunks.map((c) => c.id)).toEqual([
      "chunk-1",
      "chunk-2",
      "chunk-3",
      "chunk-4",
      "chunk-5",
      "chunk-6",
    ]);
    expect(mocks.parse).not.toHaveBeenCalled();
  });

  it("default path still reranks with the LLM", async () => {
    mocks.parse.mockResolvedValue({
      choices: [
        {
          message: {
            parsed: {
              top_chunk_ids: [
                "chunk-8",
                "chunk-7",
                "chunk-6",
                "chunk-5",
                "chunk-4",
                "chunk-3",
              ],
            },
          },
        },
      ],
    });
    const chunks = await retrieveChunks("query", ORG_ID);
    expect(mocks.parse).toHaveBeenCalledTimes(1);
    expect(chunks.map((c) => c.id)).toEqual([
      "chunk-8",
      "chunk-7",
      "chunk-6",
      "chunk-5",
      "chunk-4",
      "chunk-3",
    ]);
  });

  it("rejects immediately when the signal is already aborted", async () => {
    await expect(
      retrieveChunks("query", ORG_ID, null, null, {
        rerank: false,
        signal: AbortSignal.abort(),
      }),
    ).rejects.toThrow();
    expect(mocks.generateEmbedding).not.toHaveBeenCalled();
  });
});

// ── Streaming generation helper ──────────────────────────────────────────────

describe("streamRFPResponse", () => {
  it("reports the accumulated draft_answer and resolves the final object", async () => {
    mocks.streamObject.mockReturnValue({
      partialObjectStream: (async function* () {
        yield { draft_answer: "We" };
        yield { executive_summary: "no draft yet" };
        yield { draft_answer: "We hold ISO" };
        yield { draft_answer: stubResponse.draft_answer };
      })(),
      object: Promise.resolve(stubResponse),
    });

    const seen: string[] = [];
    const result = await streamRFPResponse("Q", makeChunks(2), undefined, {
      onDraftAnswer: (text) => seen.push(text),
    });

    expect(seen).toEqual(["We", "We hold ISO", stubResponse.draft_answer]);
    expect(result).toEqual(stubResponse);
  });

  it("passes the abort signal through to streamObject", async () => {
    mocks.streamObject.mockReturnValue(instantStream());
    const controller = new AbortController();
    await streamRFPResponse("Q", makeChunks(1), undefined, {
      signal: controller.signal,
    });
    expect(mocks.streamObject).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: controller.signal }),
    );
  });
});

// ── Delta throttle (pure helper) ─────────────────────────────────────────────

describe("createDeltaThrottle", () => {
  it("always passes the first call, then at most one per interval", () => {
    let t = 0;
    const throttle = createDeltaThrottle(400, () => t);

    expect(throttle.shouldEmit()).toBe(true); // first call always emits
    t = 100;
    expect(throttle.shouldEmit()).toBe(false);
    t = 399;
    expect(throttle.shouldEmit()).toBe(false);
    t = 400;
    expect(throttle.shouldEmit()).toBe(true);
    t = 401;
    expect(throttle.shouldEmit()).toBe(false);
    t = 900;
    expect(throttle.shouldEmit()).toBe(true);
  });

  it("throttles independently per instance (per question)", () => {
    let t = 0;
    const a = createDeltaThrottle(400, () => t);
    const b = createDeltaThrottle(400, () => t);
    expect(a.shouldEmit()).toBe(true);
    expect(b.shouldEmit()).toBe(true); // b's first call unaffected by a
    t = 200;
    expect(a.shouldEmit()).toBe(false);
    expect(b.shouldEmit()).toBe(false);
  });
});
