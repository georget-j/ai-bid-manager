-- 045: opportunity browse filter support.
--
-- Backs the new browse filters (value range, source, sector/CPV) with indexes and a
-- searchable CPV text column. `cpv_search` is the codes joined and space-padded
-- (" 72212000 48000000 ") so a sector "starts-with-division" match is a reliable
-- substring test: ilike '% 72%' matches a code that begins with 72 (preceded by a
-- space) without false-matching "72" mid-code.
--
-- A generated column can't use array_to_string here (not treated as immutable), so the
-- column is maintained by a BEFORE INSERT/UPDATE trigger + a one-time backfill.
-- Additive + idempotent.

create extension if not exists pg_trgm;

create index if not exists opportunities_value_amount_idx
  on opportunities (value_amount);

create index if not exists opportunities_source_name_idx
  on opportunities (source_name);

alter table opportunities
  add column if not exists cpv_search text;

create or replace function set_opportunity_cpv_search()
returns trigger
language plpgsql
as $$
begin
  new.cpv_search := ' ' || coalesce(array_to_string(new.cpv_codes, ' '), '') || ' ';
  return new;
end;
$$;

drop trigger if exists trg_set_opportunity_cpv_search on opportunities;
create trigger trg_set_opportunity_cpv_search
  before insert or update of cpv_codes on opportunities
  for each row execute function set_opportunity_cpv_search();

-- Backfill existing rows.
update opportunities
set cpv_search = ' ' || coalesce(array_to_string(cpv_codes, ' '), '') || ' '
where cpv_search is null;

create index if not exists opportunities_cpv_search_trgm
  on opportunities using gin (cpv_search gin_trgm_ops);
