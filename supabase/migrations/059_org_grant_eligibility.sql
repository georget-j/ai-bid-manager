-- 059: organisation grant-eligibility fields (additive, idempotent).
--
-- Grant fit/eligibility scoring needs attributes the procurement profile lacks:
-- legal form / charity status (hard eligibility), match-funding capacity, the
-- beneficiaries served, and grant themes of interest. Existing year_established /
-- annual_turnover / company_size_band / social_value are reused.

alter table organisation_profiles
  add column if not exists legal_form            text,      -- charity | cic | company | sole-trader | partnership | university | public-body | other
  add column if not exists is_registered_charity boolean,
  add column if not exists charity_number        text,
  add column if not exists company_number        text,
  add column if not exists match_funding_capacity numeric,  -- £ the org can co-fund
  add column if not exists beneficiaries         text[] not null default '{}',
  add column if not exists grant_themes          text[] not null default '{}';
