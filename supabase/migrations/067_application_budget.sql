-- 067: grant application project budget (additive, idempotent).
--
-- response_drafts gain a jsonb budget: { costs: [{id,label,amount}], funding: [...] }.
-- Only grant applications surface the builder; tender responses ignore it.

alter table response_drafts
  add column if not exists budget jsonb;
