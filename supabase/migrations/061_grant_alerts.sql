-- 061: grant alert matches (additive, idempotent).
--
-- Reuse the existing alert_rules for grants too (one alerting system across tenders +
-- grants). Grant hits land in a separate table so we don't touch alert_matches' NOT NULL
-- opportunity_id / conflict target. Mirrors alert_matches (mig 020) + grant_matches RLS.

create table if not exists grant_alert_matches (
  id              uuid primary key default gen_random_uuid(),
  alert_rule_id   uuid not null references alert_rules(id) on delete cascade,
  grant_id        uuid not null references grants(id) on delete cascade,
  org_id          uuid not null references orgs(id) on delete cascade,
  seen            boolean not null default false,
  matched_at      timestamptz not null default now(),
  unique (alert_rule_id, grant_id)
);

create index if not exists grant_alert_matches_org_idx  on grant_alert_matches(org_id, matched_at desc);
create index if not exists grant_alert_matches_seen_idx on grant_alert_matches(org_id, seen);
create index if not exists grant_alert_matches_rule_idx on grant_alert_matches(alert_rule_id);

alter table grant_alert_matches enable row level security;

drop policy if exists "grant_alert_matches_own" on grant_alert_matches;
create policy "grant_alert_matches_own"
  on grant_alert_matches for all
  to authenticated
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));
