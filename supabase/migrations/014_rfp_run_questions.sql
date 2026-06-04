-- Per-question state for RFP batch runs.
-- Allows checkpoint/resume: a failed or timed-out batch can be resubmitted
-- with the same rfp_run_id and completed questions are skipped.

create table if not exists rfp_run_questions (
  id              uuid primary key default gen_random_uuid(),
  rfp_run_id      text not null,
  question_index  integer not null,
  question_text   text not null,
  section         text not null,
  topic           text,
  risk_level      text,
  status          text not null default 'pending'
                  check (status in ('pending', 'completed', 'failed')),
  result          jsonb,
  query_id        uuid references queries(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (rfp_run_id, question_index)
);

create index if not exists rfp_run_questions_run_idx    on rfp_run_questions(rfp_run_id);
create index if not exists rfp_run_questions_status_idx on rfp_run_questions(status);

create trigger rfp_run_questions_updated_at
  before update on rfp_run_questions
  for each row execute function set_updated_at();

alter table rfp_run_questions enable row level security;

create policy "auth_all_rfp_run_questions"
  on rfp_run_questions for all
  to authenticated
  using (true)
  with check (true);
