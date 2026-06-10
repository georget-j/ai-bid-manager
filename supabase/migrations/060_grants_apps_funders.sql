-- 060: grant applications + funder intelligence (additive, idempotent).
--
-- Reuse the responses workspace for grant applications by letting a response draft
-- link to a grant. Add a funder-aggregates RPC (mirror of buyer_aggregates, mig 047)
-- to power funder profiles.

-- Link a response draft to a grant (applications reuse response_drafts + RFPProcessor).
alter table response_drafts
  add column if not exists grant_id uuid references grants(id) on delete set null;

create index if not exists response_drafts_grant_idx on response_drafts (grant_id);

-- Funder aggregates for the Funders directory.
create or replace function funder_aggregates(p_limit int default 200)
returns table (
  funder_name   text,
  funder_region text,
  grant_count   bigint,
  total_amount  numeric,
  last_seen     timestamptz
)
language sql
stable
as $$
  select
    g.funder_name,
    (array_agg(g.funder_region) filter (where g.funder_region is not null))[1] as funder_region,
    count(*) as grant_count,
    coalesce(
      sum(coalesce(g.amount_max, g.amount_min))
        filter (where coalesce(g.amount_max, g.amount_min) > 0),
      0
    ) as total_amount,
    max(g.published_at) as last_seen
  from grants g
  where g.funder_name is not null and btrim(g.funder_name) <> ''
  group by g.funder_name
  order by count(*) desc
  limit p_limit;
$$;
