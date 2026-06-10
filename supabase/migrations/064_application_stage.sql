-- 064: application pipeline stage (additive, idempotent).
--
-- response_drafts (shared by tender + grant responses) gain a lifecycle stage so the
-- "My applications" board can track each application: drafting -> submitted ->
-- awarded / unsuccessful. submitted_at records when it was marked submitted.

alter table response_drafts
  add column if not exists stage text not null default 'drafting',
  add column if not exists submitted_at timestamptz;

create index if not exists response_drafts_stage_idx
  on response_drafts (org_id, stage);
