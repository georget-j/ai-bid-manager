-- 071: grant sync run history (additive, idempotent).
--
-- One row per syncGrantSource run (cron, manual, or sync-all sweep) so operators
-- can audit what each sync actually did: pages walked, items fetched/stored/
-- upserted, duplicates, prunes, errors, and the cursor before/after the run —
-- a stranded cursor (audit finding: a disabled source got manually synced and
-- left one behind) was invisible before this.
--
-- Service-role only: RLS is enabled with NO policies on purpose. The sync engine
-- writes rows and any admin surface reads them through the service client; no
-- end-user (authenticated/anon) access path exists.

create table if not exists grant_sync_runs (
  id            uuid primary key default gen_random_uuid(),
  source_name   text not null,
  started_at    timestamptz not null,
  finished_at   timestamptz,
  pages         int,
  fetched       int,
  raw_stored    int,
  upserted      int,
  duplicates    int,
  pruned        int,
  errors        jsonb default '[]',
  cursor_before text,
  cursor_after  text,
  trigger       text -- 'cron' | 'manual' | 'sync-all'
);

create index if not exists grant_sync_runs_source_started_idx
  on grant_sync_runs (source_name, started_at desc);

alter table grant_sync_runs enable row level security;

-- No RLS policies: with RLS enabled and zero policies, authenticated/anon roles
-- are denied everything; only the service role (which bypasses RLS) can touch it.
