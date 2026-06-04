-- Link RFP run questions to procurement opportunities.
-- Allows runs started from an opportunity detail page to be traced back.

alter table rfp_run_questions
  add column if not exists opportunity_id uuid references opportunities(id) on delete set null;

create index if not exists rfp_run_questions_opp_idx on rfp_run_questions(opportunity_id);
