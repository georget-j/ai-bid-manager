-- 055: persisted RFP response drafts (additive, idempotent).
--
-- Today the RFP processor is in-memory only — navigating away loses the work. A draft
-- is an org-owned, resumable snapshot of a response in progress (title, extracted
-- questions, selection, and generated answers). The immutable run log
-- (queries/query_results/rfp_run_questions) is unchanged; a draft soft-links its
-- latest run via latest_rfp_run_id.

create table if not exists response_drafts (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references orgs(id) on delete cascade,
  opportunity_id        uuid references opportunities(id) on delete set null,
  rfp_title             text not null default 'Untitled response',
  status                text not null default 'draft'
                          check (status in ('draft', 'answering', 'completed', 'archived')),
  extracted_questions   jsonb not null default '[]',
  selected_question_ids jsonb not null default '[]',
  answers               jsonb not null default '{}',
  question_count        integer not null default 0,
  answered_count        integer not null default 0,
  latest_rfp_run_id     text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists response_drafts_org_idx on response_drafts (org_id);
create index if not exists response_drafts_opp_idx on response_drafts (opportunity_id);

alter table response_drafts enable row level security;

drop policy if exists "response_drafts_org" on response_drafts;
create policy "response_drafts_org" on response_drafts for all to authenticated
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
  );
