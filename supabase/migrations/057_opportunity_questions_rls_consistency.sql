-- 057: align opportunity_questions RLS with the standard membership pattern.
--
-- Migration 025 gated rows with `org_id = (select … limit 1)` — a single-org
-- assumption that became fragile once multi-user teams landed (mig 054). Every other
-- org-scoped table uses `org_id in (select org_id from org_memberships where
-- user_id = auth.uid())`; align this one for correctness + consistency. Idempotent.

drop policy if exists "oq_org" on opportunity_questions;
create policy "oq_org"
  on opportunity_questions for all
  to authenticated
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
  );
