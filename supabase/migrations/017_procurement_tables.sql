-- Procurement tables for UK Bid Intelligence Agent.
--
-- All application-level data access goes through the service role (RLS bypassed).
-- Opportunities, sources, buyers, and raw_notices are platform-level data
-- (public procurement records) — not org-confidential — so they are readable
-- by all authenticated users.  Write access is restricted to service role.
--
-- Organisation-private tables (organisation_profiles, opportunity_matches,
-- bid_pipeline) are org-scoped from the start.

-- ── Sources ───────────────────────────────────────────────────────────────────

create table if not exists sources (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null unique,
  display_name             text not null,
  type                     text not null,
  base_url                 text,
  enabled                  boolean not null default true,
  last_successful_sync_at  timestamptz,
  last_cursor              text,
  last_error               text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

alter table sources enable row level security;

create policy "sources_read"
  on sources for select
  to authenticated
  using (true);

-- ── Raw notices ───────────────────────────────────────────────────────────────

create table if not exists raw_notices (
  id               uuid primary key default gen_random_uuid(),
  source_id        uuid references sources(id) on delete set null,
  source_name      text not null,
  source_notice_id text not null,
  ocid             text,
  raw_payload      jsonb not null,
  content_hash     text not null,
  fetched_at       timestamptz not null,
  parser_version   text not null default '1',
  created_at       timestamptz not null default now(),
  unique (source_name, source_notice_id, content_hash)
);

create index if not exists raw_notices_source_idx    on raw_notices(source_name, source_notice_id);
create index if not exists raw_notices_ocid_idx      on raw_notices(ocid);
create index if not exists raw_notices_fetched_idx   on raw_notices(fetched_at desc);

alter table raw_notices enable row level security;

-- Raw notices are admin-only reads (sensitive source payloads).
-- Service role bypasses this; no policy needed for authenticated read.

-- ── Opportunities ─────────────────────────────────────────────────────────────

create table if not exists opportunities (
  id                uuid primary key default gen_random_uuid(),
  canonical_ocid    text,
  source_name       text not null,
  source_notice_id  text not null,
  source_url        text,
  submission_url    text,
  title             text not null,
  description       text,
  buyer_name        text,
  buyer_identifier  text,
  buyer_region      text,
  notice_type       text,
  procurement_stage text not null default 'unknown',
  status            text not null default 'unknown',
  cpv_codes         text[] not null default '{}',
  region            text,
  value_amount      numeric,
  value_currency    text default 'GBP',
  published_at      timestamptz,
  deadline_at       timestamptz,
  contract_start_at timestamptz,
  contract_end_at   timestamptz,
  framework_flag    boolean not null default false,
  lots              jsonb,
  documents         jsonb,
  raw_json          jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (source_name, source_notice_id)
);

create index if not exists opportunities_deadline_idx  on opportunities(deadline_at);
create index if not exists opportunities_status_idx    on opportunities(status);
create index if not exists opportunities_stage_idx     on opportunities(procurement_stage);
create index if not exists opportunities_buyer_idx     on opportunities(buyer_name);
create index if not exists opportunities_ocid_idx      on opportunities(canonical_ocid);

alter table opportunities enable row level security;

create policy "opportunities_read"
  on opportunities for select
  to authenticated
  using (true);

-- ── Buyers ────────────────────────────────────────────────────────────────────

create table if not exists buyers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  identifiers jsonb,
  address     jsonb,
  region      text,
  website     text,
  source_refs jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists buyers_name_idx on buyers(name);

alter table buyers enable row level security;

create policy "buyers_read"
  on buyers for select
  to authenticated
  using (true);

-- ── Organisation profiles ─────────────────────────────────────────────────────

create table if not exists organisation_profiles (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references orgs(id) on delete cascade,
  name                 text not null,
  organisation_type    text,
  sectors              text[] not null default '{}',
  services             text[] not null default '{}',
  keywords             text[] not null default '{}',
  cpv_codes            text[] not null default '{}',
  regions              text[] not null default '{}',
  certifications       text[] not null default '{}',
  accreditations       text[] not null default '{}',
  insurance            jsonb,
  min_contract_value   numeric,
  max_contract_value   numeric,
  preferred_buyers     text[] not null default '{}',
  excluded_buyers      text[] not null default '{}',
  excluded_keywords    text[] not null default '{}',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (org_id)
);

create index if not exists org_profiles_org_idx on organisation_profiles(org_id);

alter table organisation_profiles enable row level security;

create policy "org_profiles_read_own"
  on organisation_profiles for all
  to authenticated
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));

-- ── Opportunity matches ───────────────────────────────────────────────────────

create table if not exists opportunity_matches (
  id                    uuid primary key default gen_random_uuid(),
  opportunity_id        uuid not null references opportunities(id) on delete cascade,
  org_id                uuid not null references orgs(id) on delete cascade,
  fit_score             int not null,
  readiness_score       int not null,
  recommended_action    text not null,
  reasons               text[] not null default '{}',
  risks                 text[] not null default '{}',
  missing_requirements  text[] not null default '{}',
  created_at            timestamptz not null default now(),
  unique (opportunity_id, org_id)
);

create index if not exists opp_matches_org_idx on opportunity_matches(org_id);
create index if not exists opp_matches_opp_idx on opportunity_matches(opportunity_id);

alter table opportunity_matches enable row level security;

create policy "opp_matches_own"
  on opportunity_matches for all
  to authenticated
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));

-- ── Bid pipeline ──────────────────────────────────────────────────────────────

create table if not exists bid_pipeline (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references opportunities(id) on delete cascade,
  org_id          uuid not null references orgs(id) on delete cascade,
  status          text not null default 'new-match',
  owner           text,
  bid_decision    text,
  decision_notes  text,
  next_action     text,
  due_date        timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (opportunity_id, org_id)
);

create index if not exists pipeline_org_idx    on bid_pipeline(org_id);
create index if not exists pipeline_status_idx on bid_pipeline(status);

alter table bid_pipeline enable row level security;

create policy "pipeline_own"
  on bid_pipeline for all
  to authenticated
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));
