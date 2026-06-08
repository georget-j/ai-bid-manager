-- 052: cache for grounded buyer/people web research (additive, idempotent).
--
-- Online research uses the OpenAI web_search tool, which is paid per call, so the
-- generated brief (buyer summary + per-person summaries + the source citations) is
-- cached on the opportunity. A `?refresh=true` request regenerates and overwrites it.
-- Shape: { buyer: { summary, citations[] }, people: [{ name, role, summary, citations[] }], generatedAt }.

alter table opportunities
  add column if not exists buyer_web_research jsonb;
