import OpenAI from "openai";

// Grounded web research via OpenAI's Responses API `web_search` tool. Every summary
// comes back with the source URLs the model actually cited, so callers can keep
// answers evidence-grounded and reviewable (never ungrounded model recall).

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// gpt-4o-mini supports the web_search tool via the Responses API. Override-able so the
// model can be bumped without a code change.
export const WEB_SEARCH_MODEL =
  process.env.OPENAI_WEBSEARCH_MODEL ?? "gpt-4o-mini";

export interface Citation {
  title: string;
  url: string;
}

export interface WebSearchResult {
  text: string;
  citations: Citation[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

/**
 * Run a single grounded web search and return the model's written summary plus the
 * de-duplicated list of web sources it cited. Returns empty text/citations on failure
 * (callers decide how to surface that) — never throws into the request path.
 */
export async function webSearchSummary(opts: {
  query: string;
  instructions?: string;
  maxOutputTokens?: number;
  contextSize?: "low" | "medium" | "high";
}): Promise<WebSearchResult> {
  const {
    query,
    instructions,
    maxOutputTokens = 500,
    contextSize = "medium",
  } = opts;

  const input = instructions ? `${instructions}\n\n${query}` : query;

  const response = await openai.responses.create({
    model: WEB_SEARCH_MODEL,
    tools: [{ type: "web_search", search_context_size: contextSize }],
    input,
    max_output_tokens: maxOutputTokens,
  });

  const text = (response.output_text ?? "").trim();

  const citations: Citation[] = [];
  const seen = new Set<string>();
  for (const item of (response.output ?? []) as AnyRecord[]) {
    if (item.type !== "message") continue;
    for (const content of (item.content ?? []) as AnyRecord[]) {
      if (content.type !== "output_text") continue;
      for (const ann of (content.annotations ?? []) as AnyRecord[]) {
        if (ann.type === "url_citation" && ann.url && !seen.has(ann.url)) {
          seen.add(ann.url);
          citations.push({ title: ann.title || ann.url, url: ann.url });
        }
      }
    }
  }

  return { text, citations };
}
