-- 047: buyer aggregates RPC (read-only, additive, idempotent)
--
-- Aggregates the global opportunities catalog by buyer for the Buyers tab. Computed in
-- SQL so the index is accurate across the WHOLE catalog (the previous in-memory version
-- capped at 2000 rows). Read-only / STABLE; respects the caller's RLS on opportunities.

create or replace function buyer_aggregates(p_limit int default 200)
returns table (
  buyer_name   text,
  buyer_region text,
  opp_count    bigint,
  open_count   bigint,
  award_count  bigint,
  total_value  numeric,
  value_count  bigint,
  avg_value    numeric,
  last_seen    timestamptz,
  first_seen   timestamptz
)
language sql
stable
as $$
  select
    o.buyer_name,
    (array_agg(o.buyer_region) filter (where o.buyer_region is not null))[1]
      as buyer_region,
    count(*)                                                   as opp_count,
    count(*) filter (where o.status = 'active')                as open_count,
    count(*) filter (where o.procurement_stage = 'award')      as award_count,
    coalesce(sum(o.value_amount) filter (where o.value_amount > 0), 0)
      as total_value,
    count(*) filter (where o.value_amount > 0)                 as value_count,
    coalesce(avg(o.value_amount) filter (where o.value_amount > 0), 0)
      as avg_value,
    max(o.created_at)                                          as last_seen,
    min(o.created_at)                                          as first_seen
  from opportunities o
  where o.buyer_name is not null and btrim(o.buyer_name) <> ''
  group by o.buyer_name
  order by count(*) desc
  limit p_limit;
$$;
