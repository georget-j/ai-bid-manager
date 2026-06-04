-- Migration 025: Opportunity questions
--
-- Stores ITT/tender questions extracted from an opportunity, per org.
-- Each org gets its own question list for a given opportunity (not shared).
-- answer_status tracks: unanswered → drafted → needs-review → approved.

create table opportunity_questions (
  id               uuid primary key default gen_random_uuid(),
  opportunity_id   uuid not null references opportunities(id) on delete cascade,
  org_id           uuid not null references orgs(id) on delete cascade,
  question_text    text not null,
  section_ref      text,
  question_type    text,  -- 'technical' | 'experience' | 'financial' | 'social-value' | 'general'
  word_limit       integer,
  is_mandatory     boolean not null default true,
  ai_draft         text,
  answer_status    text not null default 'unanswered',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table opportunity_questions enable row level security;

-- Org members can read and write their own questions
create policy "oq_org"
  on opportunity_questions for all
  to authenticated
  using (
    org_id = (
      select om.org_id
      from org_memberships om
      where om.user_id = auth.uid()
      limit 1
    )
  )
  with check (
    org_id = (
      select om.org_id
      from org_memberships om
      where om.user_id = auth.uid()
      limit 1
    )
  );

create index oq_opportunity_org_idx on opportunity_questions (opportunity_id, org_id);
