-- 069: Investor events domain core (additive, idempotent).
--
-- UK investor meetings on a map — pitch nights, demo days, angel-network meetings,
-- VC office hours, conferences and webinars that founders can attend. Parallel to
-- the grants engine (mig 058): investor_event_sources + raw_event_notices are
-- service-role-only ingestion plumbing (RLS on, NO policies — never readable from
-- the browser); investor_organizers + investor_events are platform-level open data
-- (readable by all authenticated users; service-role writes), same catalog pattern
-- as grant_sources/grants in mig 058.

-- ── Event sources (sync-health state, keyed by name) ────────────────────────────
create table if not exists investor_event_sources (
  name                     text primary key,
  display_name             text not null,
  base_url                 text,
  enabled                  boolean not null default true,
  last_run_at              timestamptz,
  last_successful_sync_at  timestamptz,
  last_error               text,
  last_cursor              text,
  last_fetched_count       integer,
  created_at               timestamptz not null default now()
);

alter table investor_event_sources enable row level security;
-- No policies: service-role only.

-- ── Raw event notices (raw-before-normalise audit trail) ────────────────────────
create table if not exists raw_event_notices (
  id              uuid primary key default gen_random_uuid(),
  source_name     text not null,
  source_event_id text not null,
  content_hash    text not null,
  payload         jsonb not null,
  fetched_at      timestamptz not null default now(),
  unique (source_name, source_event_id, content_hash)
);

alter table raw_event_notices enable row level security;
-- No policies: service-role only.

-- ── Investor organizers (curated global catalog) ────────────────────────────────
create table if not exists investor_organizers (
  id                 uuid primary key default gen_random_uuid(),
  slug               text unique not null,
  name               text not null,
  organizer_type     text not null default 'other',  -- angel-network | vc | accelerator | university | government | community | corporate | other
  website            text,
  eventbrite_org_id  text,
  description        text,
  focus_sectors      text[] not null default '{}',
  regions            text[] not null default '{}',
  links              jsonb not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table investor_organizers enable row level security;
drop policy if exists "investor_organizers_read" on investor_organizers;
create policy "investor_organizers_read" on investor_organizers for select to authenticated using (true);

-- ── Investor events (normalized rows, global catalog) ───────────────────────────
create table if not exists investor_events (
  id                uuid primary key default gen_random_uuid(),
  source_name       text not null,
  source_event_id   text not null,
  organizer_id      uuid references investor_organizers(id) on delete set null,
  title             text not null,
  description       text,
  event_url         text,
  starts_at         timestamptz,
  ends_at           timestamptz,
  is_virtual        boolean not null default false,
  virtual_platform  text,                            -- zoom | google-meet | teams | webex | null
  venue_name        text,
  address           text,
  city              text,
  postcode          text,
  region            text,
  latitude          double precision,
  longitude         double precision,
  event_type        text not null default 'other',   -- pitch-night | demo-day | angel-network | vc-office-hours | conference | networking | accelerator | webinar | other
  organizer_name    text,
  organizer_url     text,
  price_text        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (source_name, source_event_id)
);

create index if not exists investor_events_starts_idx    on investor_events(starts_at);
create index if not exists investor_events_type_idx      on investor_events(event_type);
create index if not exists investor_events_virtual_idx   on investor_events(is_virtual);
create index if not exists investor_events_organizer_idx on investor_events(organizer_id);

alter table investor_events enable row level security;
drop policy if exists "investor_events_read" on investor_events;
create policy "investor_events_read" on investor_events for select to authenticated using (true);
