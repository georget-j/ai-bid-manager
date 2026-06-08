-- 050: point Public Contracts Scotland at the working Proactis OCDS API host (idempotent).
--
-- The connector reads its host from a BASE_URL const, but the admin /sources page shows
-- sources.base_url — keep it consistent. The old value (www.publiccontractsscotland.gov.uk)
-- 404s the OCDS path; the OCDS feed lives on the api host. Additive, non-destructive.

update sources
   set base_url = 'https://api.publiccontractsscotland.gov.uk',
       updated_at = now()
 where name = 'public-contracts-scotland';
