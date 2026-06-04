-- Organisations and memberships.
-- Phase 1 uses a single-org model: first sign-in creates the org,
-- subsequent sign-ins auto-join it.  Multi-org management comes in Phase 2.

create table if not exists orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists org_memberships (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  user_id     uuid not null,
  email       text not null,
  role        text not null default 'member' check (role in ('owner', 'member')),
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);

create index if not exists org_memberships_user_idx on org_memberships(user_id);
create index if not exists org_memberships_org_idx  on org_memberships(org_id);

-- Add org_id to all data tables.
-- Nullable so existing demo data remains accessible without an org.
alter table documents            add column if not exists org_id uuid references orgs(id);
alter table queries              add column if not exists org_id uuid references orgs(id);
alter table review_requests      add column if not exists org_id uuid references orgs(id);
alter table approved_answers     add column if not exists org_id uuid references orgs(id);
alter table routing_config       add column if not exists org_id uuid references orgs(id);
alter table integration_settings add column if not exists org_id uuid references orgs(id);

create index if not exists documents_org_idx         on documents(org_id);
create index if not exists queries_org_idx           on queries(org_id);
create index if not exists review_requests_org_idx   on review_requests(org_id);

-- RLS: allow authenticated users to read/write rows belonging to their org
-- (or rows with no org, which are demo/legacy rows visible to all).

create policy "org_documents"
  on documents for all
  to authenticated
  using (org_id is null or org_id in (
    select org_id from org_memberships where user_id = auth.uid()
  ))
  with check (org_id is null or org_id in (
    select org_id from org_memberships where user_id = auth.uid()
  ));

create policy "org_queries"
  on queries for all
  to authenticated
  using (org_id is null or org_id in (
    select org_id from org_memberships where user_id = auth.uid()
  ))
  with check (org_id is null or org_id in (
    select org_id from org_memberships where user_id = auth.uid()
  ));

create policy "org_review_requests"
  on review_requests for all
  to authenticated
  using (org_id is null or org_id in (
    select org_id from org_memberships where user_id = auth.uid()
  ))
  with check (org_id is null or org_id in (
    select org_id from org_memberships where user_id = auth.uid()
  ));

-- Orgs and memberships: members can read their own org; only owners can modify
create policy "orgs_read"
  on orgs for select
  to authenticated
  using (id in (select org_id from org_memberships where user_id = auth.uid()));

create policy "orgs_insert"
  on orgs for insert
  to authenticated
  with check (true);

create policy "memberships_read"
  on org_memberships for select
  to authenticated
  using (user_id = auth.uid() or org_id in (
    select org_id from org_memberships where user_id = auth.uid()
  ));

create policy "memberships_insert"
  on org_memberships for insert
  to authenticated
  with check (org_id in (
    select org_id from org_memberships where user_id = auth.uid() and role = 'owner'
  ) or user_id = auth.uid());

alter table orgs            enable row level security;
alter table org_memberships enable row level security;
