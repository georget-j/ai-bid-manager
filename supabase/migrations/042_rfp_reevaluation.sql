-- 042: RFP response re-evaluation (additive, idempotent)
--
-- Stores the result of scoring a drafted/approved response against the original
-- tender. Org-scoped (bid-private), mirroring opportunity_questions (migration 025).

create table if not exists rfp_reevaluations (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  org_id         uuid not null references orgs(id) on delete cascade,
  overall_score  integer not null,
  results        jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists rfp_reevaluations_opp_org_idx
  on rfp_reevaluations (opportunity_id, org_id, created_at desc);

alter table rfp_reevaluations enable row level security;

drop policy if exists "rfp_reeval_org" on rfp_reevaluations;
create policy "rfp_reeval_org" on rfp_reevaluations
  for all
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
  );
