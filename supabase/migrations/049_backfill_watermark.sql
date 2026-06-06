-- 049: rolling historical backfill watermark (additive, idempotent).
--
-- The forward sync (overlap + cursor resume) keeps NEW notices complete. This watermark
-- drives a bounded, automatic backward sweep of HISTORY: each cron run advances one source
-- a fixed window further back, until `backfill_complete`. backfill_watermark = the date
-- before which history still needs sweeping (null = not started → starts at now).

alter table sources
  add column if not exists backfill_watermark timestamptz,
  add column if not exists backfill_complete   boolean not null default false;
