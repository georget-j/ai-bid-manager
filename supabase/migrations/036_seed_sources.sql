-- Seed procurement source rows (idempotent).
-- The application's syncSource() function reads these rows to know which feeds
-- are enabled and where to resume. The admin /sources page lets an admin
-- enable/disable and trigger manual syncs.

INSERT INTO sources (name, display_name, type, base_url, enabled)
VALUES
  ('find-tender',               'Find a Tender',              'OCDS API', 'https://www.find-tender.service.gov.uk',        true),
  ('contracts-finder',          'Contracts Finder',           'OCDS API', 'https://www.contractsfinder.service.gov.uk',    true),
  ('public-contracts-scotland', 'Public Contracts Scotland',  'OCDS API', 'https://www.publiccontractsscotland.gov.uk',    true),
  ('sell2wales',                'Sell2Wales',                 'OCDS API', 'https://www.sell2wales.gov.wales',              false)
ON CONFLICT (name) DO NOTHING;
