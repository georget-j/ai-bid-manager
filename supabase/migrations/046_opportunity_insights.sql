-- 046: opportunity insights (org-scoped, additive, idempotent)
--
-- Derived AI context for an opportunity profile: an executive summary, key scope points,
-- a feasibility note, and the key gaps a bidder must address. Stored org-scoped (the
-- global `opportunities` catalog is never written) so the real public catalog stays
-- clean. Mirrors the org RLS of opportunity_questions / rfp_reevaluations (migration 025).

create table if not exists opportunity_insights (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  org_id         uuid not null references orgs(id) on delete cascade,
  summary        text not null,
  key_points     jsonb not null default '[]'::jsonb,
  feasibility    text,
  gaps           jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists opportunity_insights_opp_org_idx
  on opportunity_insights (opportunity_id, org_id, created_at desc);

alter table opportunity_insights enable row level security;

drop policy if exists "opp_insights_org" on opportunity_insights;
create policy "opp_insights_org" on opportunity_insights
  for all
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
  );
