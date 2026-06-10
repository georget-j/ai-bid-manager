import { zodResponseFormat } from "openai/helpers/zod";
import { getServiceSupabase } from "./supabase-service";
import { generateEmbedding } from "./embeddings";
import { openai, CHAT_MODEL } from "./openai";
import { buildRerankPrompt } from "./prompts";
import { RerankResponseSchema, type RetrievedChunk } from "./schema";

const RERANK_FORMAT = zodResponseFormat(RerankResponseSchema, "rerank");
const CANDIDATE_COUNT = 14;
const FINAL_COUNT = 6;

export async function retrieveChunks(
  queryText: string,
  orgId?: string | null,
  clientId?: string | null,
  // When set (e.g. "grant:<id>"), the search additionally includes that grant's scoped
  // collection. When null, grant-scoped collections are excluded from results so a
  // grant's imported context never affects other responses.
  collection?: string | null,
): Promise<RetrievedChunk[]> {
  const queryEmbedding = await generateEmbedding(queryText);
  const supabase = getServiceSupabase();

  const { data, error } = await supabase.rpc("hybrid_search_chunks", {
    query_text: queryText,
    query_embedding: queryEmbedding,
    match_count: CANDIDATE_COUNT,
    p_org_id: orgId ?? null,
    p_client_id: clientId ?? null,
    p_collection: collection ?? null,
  });

  if (error) throw new Error(`Hybrid search failed: ${error.message}`);

  const candidates = (data ?? []) as RetrievedChunk[];
  if (candidates.length <= FINAL_COUNT) return candidates;

  return rerankChunks(queryText, candidates);
}

async function rerankChunks(
  query: string,
  chunks: RetrievedChunk[],
): Promise<RetrievedChunk[]> {
  try {
    const completion = await openai.chat.completions.parse({
      model: CHAT_MODEL,
      messages: [{ role: "user", content: buildRerankPrompt(query, chunks) }],
      response_format: RERANK_FORMAT,
      temperature: 0,
    });

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
  } catch {
    // Fail open — return top-k by original RRF score
    return chunks.slice(0, FINAL_COUNT);
  }
}
