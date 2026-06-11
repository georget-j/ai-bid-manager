import { zodResponseFormat } from "openai/helpers/zod";
import { getServiceSupabase } from "./supabase-service";
import { generateEmbedding } from "./embeddings";
import { openai, CHAT_MODEL } from "./openai";
import { buildRerankPrompt } from "./prompts";
import { RerankResponseSchema, type RetrievedChunk } from "./schema";

const RERANK_FORMAT = zodResponseFormat(RerankResponseSchema, "rerank");
const CANDIDATE_COUNT = 14;
const FINAL_COUNT = 6;

export type RetrieveOptions = {
  /**
   * When false, skip the LLM rerank and return the hybrid-search (RRF) top-6
   * directly.
   *
   * Trade-off: the rerank costs one extra gpt-4o-mini call (~1.5–3s) per
   * question. For the batch answering path — many questions racing a hard
   * 60s function deadline — that latency is worth more than the marginal
   * relevance gain, because the RRF hybrid ranking is already strong and the
   * rerank fails open to the same top-6 slice anyway. The single-question
   * /api/ask path keeps the rerank for maximum answer quality.
   */
  rerank?: boolean;
  /** Aborts in-flight retrieval work (DB query + rerank LLM call). */
  signal?: AbortSignal;
};

export async function retrieveChunks(
  queryText: string,
  orgId?: string | null,
  clientId?: string | null,
  // When set (e.g. "grant:<id>"), the search additionally includes that grant's scoped
  // collection. When null, grant-scoped collections are excluded from results so a
  // grant's imported context never affects other responses.
  collection?: string | null,
  options?: RetrieveOptions,
): Promise<RetrievedChunk[]> {
  const signal = options?.signal;
  signal?.throwIfAborted();

  // generateEmbedding does not take a signal; it is the fastest call in the
  // pipeline (~hundreds of ms), so we bail out before and after it instead.
  const queryEmbedding = await generateEmbedding(queryText);
  signal?.throwIfAborted();

  const supabase = getServiceSupabase();

  let rpc = supabase.rpc("hybrid_search_chunks", {
    query_text: queryText,
    query_embedding: queryEmbedding,
    match_count: CANDIDATE_COUNT,
    p_org_id: orgId ?? null,
    p_client_id: clientId ?? null,
    p_collection: collection ?? null,
  });
  if (signal) rpc = rpc.abortSignal(signal);
  const { data, error } = await rpc;

  if (error) throw new Error(`Hybrid search failed: ${error.message}`);

  const candidates = (data ?? []) as RetrievedChunk[];
  if (candidates.length <= FINAL_COUNT) return candidates;

  if (options?.rerank === false) return candidates.slice(0, FINAL_COUNT);

  return rerankChunks(queryText, candidates, signal);
}

async function rerankChunks(
  query: string,
  chunks: RetrievedChunk[],
  signal?: AbortSignal,
): Promise<RetrievedChunk[]> {
  try {
    const completion = await openai.chat.completions.parse(
      {
        model: CHAT_MODEL,
        messages: [{ role: "user", content: buildRerankPrompt(query, chunks) }],
        response_format: RERANK_FORMAT,
        temperature: 0,
      },
      signal ? { signal } : undefined,
    );

    const parsed = completion.choices[0]?.message?.parsed;
    if (!parsed) return chunks.slice(0, FINAL_COUNT);

    const idToChunk = new Map(chunks.map((c) => [c.id, c]));
    const reranked = parsed.top_chunk_ids
      .filter((id) => idToChunk.has(id))
      .slice(0, FINAL_COUNT)
      .map((id) => idToChunk.get(id)!);

    return reranked.length >= FINAL_COUNT
      ? reranked
      : chunks.slice(0, FINAL_COUNT);
  } catch (err) {
    // An abort means the whole run is out of time — propagate it so the
    // caller can stop, rather than pretending retrieval succeeded.
    if (signal?.aborted) throw err;
    // Fail open — return top-k by original RRF score
    return chunks.slice(0, FINAL_COUNT);
  }
}
