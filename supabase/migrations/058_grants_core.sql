-- 058: Grants domain core (additive, idempotent).
--
-- Parallel to the procurement engine (mig 017/048/049) but grant-shaped. Grants +
-- grant_sources + raw_grant_notices are platform-level open data (readable by all
-- authenticated users; service-role writes). grant_matches is org-scoped.
-- pg_trgm is already enabled (mig 045).

-- ── Grant sources (mirror of `sources` incl. sync-health + backfill) ────────────
create table if not exists grant_sources (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null unique,
  display_name             text not null,
  type                     text not null,
  base_url                 text,
  enabled                  boolean not null default true,
  last_successful_sync_at  timestamptz,
  last_cursor              text,
  last_error               text,
  last_run_at              timestamptz,
  last_fetched_count       integer,
  last_pages               integer,
  last_normalize_errors    integer,
  backfill_watermark       timestamptz,
  backfill_complete        boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

alter table grant_sources enable row level security;
drop policy if exists "grant_sources_read" on grant_sources;
create policy "grant_sources_read" on grant_sources for select to authenticated using (true);

-- ── Raw grant notices (mirror of `raw_notices`) ─────────────────────────────────
create table if not exists raw_grant_notices (
  id               uuid primary key default gen_random_uuid(),
  source_id        uuid references grant_sources(id) on delete set null,
  source_name      text not null,
  source_notice_id text not null,
  external_id      text,
  raw_payload      jsonb not null,
  content_hash     text not null,
  fetched_at       timestamptz not null,
  parser_version   text not null default '1',
  created_at       timestamptz not null default now(),
  unique (source_name, source_notice_id, content_hash)
);

create index if not exists raw_grant_notices_source_idx  on raw_grant_notices(source_name, source_notice_id);
create index if not exists raw_grant_notices_fetched_idx on raw_grant_notices(fetched_at desc);

alter table raw_grant_notices enable row level security;

-- ── Grants (grant-shaped normalized rows) ───────────────────────────────────────
create table if not exists grants (
  id                    uuid primary key default gen_random_uuid(),
  source_name           text not null,
  source_notice_id      text not null,
  source_url            text,
  application_url       text,
  title                 text not null,
  description           text,
  funder_name           text,
  funder_id             text,
  funder_region         text,
  funding_type          text,                                   -- grant | loan | award | prize | other
  amount_min            numeric,
  amount_max            numeric,
  currency              text default 'GBP',
  open_at               timestamptz,
  deadline_at           timestamptz,
  status                text not null default 'unknown',        -- open | forthcoming | closed | rolling | unknown
  themes                text[] not null default '{}',
  sectors               text[] not null default '{}',
  regions               text[] not null default '{}',           -- geographic scope
  eligibility_text      text,
  eligible_org_types    text[] not null default '{}',           -- charity | sme | university | individual | ...
  match_funding_required boolean not null default false,
  beneficiaries         text[] not null default '{}',
  documents             jsonb,
  raw_json              jsonb,
  published_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (source_name, source_notice_id)
);

create index if not exists grants_deadline_idx     on grants(deadline_at);
create index if not exists grants_status_idx       on grants(status);
create index if not exists grants_funder_idx       on grants(funder_name);
create index if not exists grants_status_deadline_idx on grants(status, deadline_at);
create index if not exists grants_title_trgm       on grants using gin (title gin_trgm_ops);
create index if not exists grants_funder_trgm      on grants using gin (funder_name gin_trgm_ops);

alter table grants enable row level security;
drop policy if exists "grants_read" on grants;
create policy "grants_read" on grants for select to authenticated using (true);

-- ── Grant matches (mirror of `opportunity_matches`, org-scoped) ─────────────────
create table if not exists grant_matches (
  id                    uuid primary key default gen_random_uuid(),
  grant_id              uuid not null references grants(id) on delete cascade,
  org_id                uuid not null references orgs(id) on delete cascade,
  fit_score             int not null,
  readiness_score       int not null,
  recommended_action    text not null,
  eligible              boolean not null default true,
  reasons               text[] not null default '{}',
  risks                 text[] not null default '{}',
  missing_requirements  text[] not null default '{}',
  created_at            timestamptz not null default now(),
  unique (grant_id, org_id)
);

create index if not exists grant_matches_org_idx   on grant_matches(org_id);
create index if not exists grant_matches_grant_idx on grant_matches(grant_id);

alter table grant_matches enable row level security;
drop policy if exists "grant_matches_own" on grant_matches;
create policy "grant_matches_own" on grant_matches for all to authenticated
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));
