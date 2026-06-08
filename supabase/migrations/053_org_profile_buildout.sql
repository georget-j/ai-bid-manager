-- 053: organisation_profiles buildout (additive, idempotent).
--
-- Adds capability/capacity fields that improve opportunity-fit recommendations:
--   company_size_band  – e.g. 'Micro (0-9)', 'Small (10-49)', 'Medium (50-249)', 'Large (250+)'
--   annual_turnover    – most recent annual turnover (£); used for financial-standing checks
--   year_established   – year the organisation was founded
--   delivery_models    – how services are delivered: on-site / remote / hybrid / nationwide
--   social_value       – social-value commitments (e.g. Net Zero, local employment, SME supply chain)
-- (existing `insurance` jsonb and `sectors` text[] are reused, not re-added.)

alter table organisation_profiles
  add column if not exists company_size_band text,
  add column if not exists annual_turnover   numeric,
  add column if not exists year_established  integer,
  add column if not exists delivery_models   text[] not null default '{}',
  add column if not exists social_value      text[] not null default '{}';
