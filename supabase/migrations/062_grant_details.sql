-- 062: deep grant detail enrichment (additive, idempotent).
--
-- Open grants are ingested from listing data (summary fields). This stores the rich
-- detail pulled from each source's detail page — eligibility, objectives, how to apply,
-- key dates, plus extracted links and downloadable documents — in a flexible jsonb blob.
-- enriched_at lets us refresh stale enrichments and skip already-enriched grants.

alter table grants
  add column if not exists details jsonb,
  add column if not exists enriched_at timestamptz;

-- Find open grants still needing enrichment (cheap, partial).
create index if not exists grants_enrich_pending_idx
  on grants (source_name, enriched_at)
  where details is null;
