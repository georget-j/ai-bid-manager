-- ONE-TIME, DESTRUCTIVE cleanup for the Free-plan catalog.
-- Run only after the compact-catalog application commit is deployed.
-- This discards historical raw source payloads and the duplicate raw_json
-- columns. It does not delete normalized opportunities, grants, investor
-- events, uploaded documents, bids, responses, or their links.
-- Export the historical raw tables first if you need their audit trail.

-- Run this first block in the Supabase SQL Editor. TRUNCATE releases the
-- raw tables' storage immediately; the app will refill only small hash
-- receipts on subsequent syncs.
begin;
truncate table public.raw_notices, public.raw_grant_notices,
  public.raw_event_notices;

-- DROP + ADD is metadata-only here; it avoids rewriting 109,000 rows into
-- dead tuples just to set raw_json to NULL. The subsequent VACUUM FULL
-- rewrites the tables to reclaim their old TOAST storage.
alter table public.opportunities drop column raw_json;
alter table public.opportunities add column raw_json jsonb;
alter table public.grants drop column raw_json;
alter table public.grants add column raw_json jsonb;
commit;

-- The separate VACUUM commands and verification query are in the companion
-- cleanup guide; do not expect this transaction alone to reclaim raw_json's
-- old physical storage.
