-- 070: business profile + org-scoped evidence (additive, idempotent).
--
-- The organisation profile becomes the single place an org keeps the business
-- credentials buyers and funders ask for, so answers can cite them instead of
-- asking the user again:
--   website / vat_number / registered_address / incorporation_date /
--   sic_codes / trading_names   – registered-company details (Companies House shape;
--                                 registered_address is {line1,line2,city,postcode,country})
--   employee_count / key_people – team facts ([{name,role,bio?}])
--   memberships                 – trade-body memberships (e.g. techUK, CREST)
--   frameworks                  – framework places ([{name,reference?,expires_at?}])
--   policies                    – named policy documents ([{name,last_reviewed?,document_id?}])
--   carbon_reduction_plan       – PPN 06/21 carbon-reduction-plan yes/no
--
-- insurance (jsonb, migration 017) keeps its keys (professional_indemnity /
-- public_liability / employers_liability) but values may now be objects
-- {amount, insurer?, policy_number?, expires_at?}. Older rows hold plain
-- numbers; readers must go through normaliseInsurance (lib/procurement/types.ts)
-- which handles both shapes.

alter table organisation_profiles
  add column if not exists website               text,
  add column if not exists vat_number            text,
  add column if not exists registered_address    jsonb,
  add column if not exists incorporation_date    date,
  add column if not exists sic_codes             text[] not null default '{}',
  add column if not exists trading_names         text[] not null default '{}',
  add column if not exists employee_count        integer,
  add column if not exists key_people            jsonb not null default '[]',
  add column if not exists memberships           text[] not null default '{}',
  add column if not exists frameworks            jsonb not null default '[]',
  add column if not exists policies              jsonb not null default '[]',
  add column if not exists carbon_reduction_plan boolean;

-- ── Evidence items become org-scoped ──────────────────────────────────────────
--
-- evidence_items (migration 033) required a client_id, which made the vault
-- agency-only. Orgs bidding for themselves keep credentials with client_id
-- null; org_id (+ existing RLS policy) still scopes every row.

alter table evidence_items
  alter column client_id drop not null;

-- Widen the evidence_type list: insurance and membership join the vault.
-- Drop-and-recreate (033 declared the check inline, so Postgres auto-named it
-- evidence_items_evidence_type_check) so re-runs converge on this definition.

alter table evidence_items
  drop constraint if exists evidence_items_evidence_type_check;

alter table evidence_items
  add constraint evidence_items_evidence_type_check check (evidence_type in (
    'certification',    -- ISO 27001, Cyber Essentials, etc.
    'accreditation',    -- G-Cloud, Crown Commercial, etc.
    'insurance',        -- PI / PL / EL cover schedules
    'policy',           -- GDPR policy, security policy, etc.
    'membership',       -- trade bodies (techUK, CREST, ...)
    'case_study',       -- past project / reference
    'financial',        -- accounts, turnover proof
    'reference',        -- client reference letter
    'other'
  ));
