-- 048: sync-health columns on sources (additive, idempotent).
--
-- Surfaces ingestion health so silent shortfalls/failures are visible: how many notices
-- the last run fetched, how many pages, when it ran, and how many normalisation errors
-- were swallowed. last_cursor (already present) being non-null means a backlog remains
-- and will resume on the next run.

alter table sources
  add column if not exists last_run_at            timestamptz,
  add column if not exists last_fetched_count      integer,
  add column if not exists last_pages              integer,
  add column if not exists last_normalize_errors   integer;
