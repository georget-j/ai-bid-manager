import { zodResponseFormat } from "openai/helpers/zod";
import { streamObject } from "ai";
import { openai, aiOpenAI, CHAT_MODEL } from "./openai";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";
import {
  RFPResponseSchema,
  type RFPResponse,
  type RetrievedChunk,
  type RFPContext,
} from "./schema";

const RESPONSE_FORMAT = zodResponseFormat(RFPResponseSchema, "rfp_response");

export type GenerateOptions = {
  /** Aborts the in-flight LLM call (e.g. when the run deadline is hit). */
  signal?: AbortSignal;
};

export async function generateRFPResponse(
  query: string,
  chunks: RetrievedChunk[],
  rfpContext?: RFPContext,
  options?: GenerateOptions,
): Promise<RFPResponse> {
  const systemPrompt = buildSystemPrompt(rfpContext);
  const userPrompt = buildUserPrompt(query, chunks, rfpContext);

  const completion = await openai.chat.completions.parse(
    {
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: RESPONSE_FORMAT,
      temperature: 0.2,
    },
    options?.signal ? { signal: options.signal } : undefined,
  );

  const message = completion.choices[0]?.message;
  if (!message) throw new Error("No response from LLM");

  if (message.refusal) {
    throw new Error(`LLM refused to answer: ${message.refusal}`);
  }

  if (!message.parsed) {
    // Fall back to parsing the raw content
    const raw = message.content;
    if (!raw) throw new Error("Empty response from LLM");
    return RFPResponseSchema.parse(JSON.parse(raw));
  }

  return message.parsed;
}

// ── Streaming variant ────────────────────────────────────────────────────────

export type StreamRFPOptions = GenerateOptions & {
  /**
   * Called with the FULL draft answer text accumulated so far (not a diff)
   * each time the model extends it. Callers throttle this themselves —
   * see createDeltaThrottle.
   */
  onDraftAnswer?: (text: string) => void;
};

/**
 * Streaming twin of generateRFPResponse, using the same streamObject /
 * partial-object pattern as /api/ask. The structured response streams in
 * field by field; draft_answer is the long human-readable field, so we
 * surface it as it grows and resolve with the final schema-validated object.
 *
 * Non-streaming generateRFPResponse stays for callers that only need the
 * final object (reevaluate, compliance matrix, answer-all).
 */
export async function streamRFPResponse(
  query: string,
  chunks: RetrievedChunk[],
  rfpContext?: RFPContext,
  options?: StreamRFPOptions,
): Promise<RFPResponse> {
  const systemPrompt = buildSystemPrompt(rfpContext);
  const userPrompt = buildUserPrompt(query, chunks, rfpContext);

  const { partialObjectStream, object: objectPromise } = streamObject({
    model: aiOpenAI(CHAT_MODEL),
    schema: RFPResponseSchema,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    maxOutputTokens: 1500,
    abortSignal: options?.signal,
  });

  // If the partial stream throws (abort/timeout), the object promise rejects
  // too but is never awaited — observe it so the rejection is not unhandled.
  objectPromise.catch(() => {});

  for await (const partial of partialObjectStream) {
    const draft = partial?.draft_answer;
    if (typeof draft === "string" && draft.length > 0) {
      options?.onDraftAnswer?.(draft);
    }
  }

  return objectPromise;
}

/**
 * Tiny pure rate-limiter for streaming delta events: the first call always
 * passes, then at most one call per intervalMs passes. One instance per
 * question, so a slow question can't starve a fast one of updates.
 * `now` is injectable for tests.
 */
export function createDeltaThrottle(
  intervalMs = 400,
  now: () => number = Date.now,
): { shouldEmit: () => boolean } {
  let last: number | null = null;
  return {
    shouldEmit() {
      const t = now();
      if (last === null || t - last >= intervalMs) {
        last = t;
        return true;
      }
      return false;
    },
  };
}
