-- 051: enable Sell2Wales and point it at the Proactis OCDS API host (idempotent).
--
-- Sell2Wales was seeded disabled with a www base_url that 404s the OCDS path. The
-- connector now uses the api host (with a monthly bulk-download fallback). Enabling
-- it lets the cron sync Welsh notices. Additive, non-destructive.

update sources
   set base_url = 'https://api.sell2wales.gov.wales',
       enabled = true,
       updated_at = now()
 where name = 'sell2wales';
