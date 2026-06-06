-- 044: importance ranking for opportunity_questions.
--
-- Adds a coarse AI-assigned `priority` (high|medium|low) so extracted questions and
-- requirements can be ranked by how important they are to winning the bid. Mandatory
-- items are always 'high'. Lists render in (mandatory desc, priority desc, order) so the
-- items that decide the bid surface first. Additive + idempotent.

alter table opportunity_questions
  add column if not exists priority text not null default 'medium';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'opportunity_questions_priority_chk'
  ) then
    alter table opportunity_questions
      add constraint opportunity_questions_priority_chk
      check (priority in ('high', 'medium', 'low'));
  end if;
end $$;
