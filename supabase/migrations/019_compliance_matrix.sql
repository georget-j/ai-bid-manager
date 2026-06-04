-- Compliance matrix tables for UK Bid Intelligence Agent.
-- A compliance matrix is generated from a tender document and
-- tracks each requirement with its draft answer, evidence status, and review state.

create table if not exists compliance_matrices (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid references opportunities(id) on delete cascade,
  rfp_run_id      text,
  org_id          uuid not null references orgs(id) on delete cascade,
  title           text not null,
  status          text not null default 'draft',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists cm_org_idx on compliance_matrices(org_id);
create index if not exists cm_opp_idx on compliance_matrices(opportunity_id);

alter table compliance_matrices enable row level security;

create policy "cm_own"
  on compliance_matrices for all
  to authenticated
  using (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));

create table if not exists compliance_requirements (
  id                   uuid primary key default gen_random_uuid(),
  compliance_matrix_id uuid not null references compliance_matrices(id) on delete cascade,
  requirement_text     text not null,
  section_reference    text,
  mandatory            boolean not null default true,
  evidence_needed      text,
  response_owner       text,
  draft_answer         text,
  confidence           int,
  source_citations     jsonb,
  status               text not null default 'not-started',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists cr_matrix_idx on compliance_requirements(compliance_matrix_id);

alter table compliance_requirements enable row level security;

-- Access via parent matrix — join enforces org isolation
create policy "cr_via_matrix"
  on compliance_requirements for all
  to authenticated
  using (
    compliance_matrix_id in (
      select id from compliance_matrices
      where org_id in (select org_id from org_memberships where user_id = auth.uid())
    )
  )
  with check (
    compliance_matrix_id in (
      select id from compliance_matrices
      where org_id in (select org_id from org_memberships where user_id = auth.uid())
    )
  );
