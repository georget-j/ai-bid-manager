-- One-time backfill: populate opportunities.region / buyer_region from the stored OCDS
-- raw payloads. region was always null because the normalizer read release.buyer.address
-- (a bare stub); the address actually lives on the parties[] entry with the 'buyer' role.
-- Best available location: address.region → locality → countryName (CF has no NUTS region).
-- Idempotent: only fills rows where region is currently null. Safe to re-run.

with addr as (
  select distinct on (rn.source_name, rn.source_notice_id)
    rn.source_name,
    rn.source_notice_id,
    (
      select coalesce(
        p->'address'->>'region',
        p->'address'->>'locality',
        p->'address'->>'countryName'
      )
      from jsonb_array_elements(coalesce(rn.raw_payload->'parties', '[]'::jsonb)) p
      where p->'roles' @> '["buyer"]'
        and p ? 'address'
      limit 1
    ) as region
  from raw_notices rn
  order by rn.source_name, rn.source_notice_id, rn.fetched_at desc
)
update opportunities o
set region = addr.region,
    buyer_region = coalesce(o.buyer_region, addr.region),
    updated_at = now()
from addr
where o.source_name = addr.source_name
  and o.source_notice_id = addr.source_notice_id
  and addr.region is not null
  and o.region is null;
