-- 056: query-performance indexes (additive, idempotent).
--
-- Targets the hot paths found in the query audit. Plain CREATE INDEX (fast at current
-- scale; brief lock acceptable). pg_trgm is already enabled (mig 045 cpv_search).
-- Note: bid_pipeline(opportunity_id) is intentionally omitted — it is already covered
-- by the unique (opportunity_id, org_id) key whose leftmost column is opportunity_id.

-- ── Unindexed foreign keys (joins + cascade deletes) ────────────────────────────
create index if not exists document_chunks_document_id_idx
  on document_chunks (document_id);
create index if not exists query_results_query_id_idx
  on query_results (query_id);
create index if not exists approved_answers_review_request_idx
  on approved_answers (review_request_id);
create index if not exists approved_answers_query_idx
  on approved_answers (query_id);
create index if not exists opp_tender_docs_tender_document_idx
  on opportunity_tender_documents (tender_document_id);

-- ── Filter/sort composites for the hottest predicates ───────────────────────────
-- Opportunities list: WHERE status = ? ORDER BY deadline_at; dashboard deadline count.
create index if not exists opportunities_status_deadline_idx
  on opportunities (status, deadline_at);
-- Bid pipeline dashboard: WHERE org_id = ? AND status IN (...).
create index if not exists bid_pipeline_org_status_idx
  on bid_pipeline (org_id, status);

-- ── Trigram indexes for the opportunities-list ILIKE('%…%') filters ─────────────
create index if not exists opportunities_title_trgm
  on opportunities using gin (title gin_trgm_ops);
create index if not exists opportunities_buyer_name_trgm
  on opportunities using gin (buyer_name gin_trgm_ops);
create index if not exists opportunities_region_trgm
  on opportunities using gin (region gin_trgm_ops);
