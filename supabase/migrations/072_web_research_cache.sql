-- 072: shared cache for paid web research (additive, idempotent).
--
-- The OpenAI web_search tool is paid per call, so grounded research results are
-- cached and served to everyone instead of re-searching on every click. Research
-- subjects are public information (funders, buyers), so the cache is global —
-- not org-scoped — exactly like opportunities.buyer_web_research (migration 052).
-- Rows are read/written with the service client only.

create table if not exists web_research_cache (
  cache_key   text primary key,            -- e.g. 'funder:the national lottery community fund'
  payload     jsonb not null,              -- { text, citations, generatedAt }
  created_at  timestamptz not null default now()
);

alter table web_research_cache enable row level security;
-- No policies: service-role only.
