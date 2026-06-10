-- 066: post-award grant reporting (additive, idempotent).
--
-- Once an application is awarded, funders require monitoring/acquittal reports. This
-- tracks those report milestones per application (response_drafts) with a due date and
-- status. Org-scoped RLS mirrors grant_matches (mig 058).

create table if not exists grant_reports (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  draft_id    uuid not null references response_drafts(id) on delete cascade,
  grant_id    uuid references grants(id) on delete set null,
  title       text not null,
  due_at      timestamptz,
  status      text not null default 'not-started',
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists grant_reports_draft_idx on grant_reports (draft_id);
create index if not exists grant_reports_org_due_idx on grant_reports (org_id, due_at);

alter table grant_reports enable row level security;

drop policy if exists "grant_reports_own" on grant_reports;
create policy "grant_reports_own"
  on grant_reports for all
  to authenticated
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));
