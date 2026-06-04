-- Alert rules: user-defined saved searches that match new opportunities.
-- Org-scoped. Matched alerts are stored in alert_matches and surfaced on the dashboard.

create table if not exists alert_rules (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references orgs(id) on delete cascade,
  name              text not null,
  keywords          text[] not null default '{}',
  cpv_codes         text[] not null default '{}',
  regions           text[] not null default '{}',
  buyers            text[] not null default '{}',
  min_value         numeric,
  max_value         numeric,
  stages            text[] not null default '{}',
  enabled           boolean not null default true,
  channel           text not null default 'in-app',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists alert_rules_org_idx on alert_rules(org_id);

alter table alert_rules enable row level security;

create policy "alert_rules_own"
  on alert_rules for all
  to authenticated
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));

-- Matched opportunities for a given alert rule
create table if not exists alert_matches (
  id              uuid primary key default gen_random_uuid(),
  alert_rule_id   uuid not null references alert_rules(id) on delete cascade,
  opportunity_id  uuid not null references opportunities(id) on delete cascade,
  org_id          uuid not null references orgs(id) on delete cascade,
  seen            boolean not null default false,
  matched_at      timestamptz not null default now(),
  unique (alert_rule_id, opportunity_id)
);

create index if not exists alert_matches_org_idx   on alert_matches(org_id);
create index if not exists alert_matches_seen_idx  on alert_matches(org_id, seen);
create index if not exists alert_matches_rule_idx  on alert_matches(alert_rule_id);

alter table alert_matches enable row level security;

create policy "alert_matches_own"
  on alert_matches for all
  to authenticated
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));
