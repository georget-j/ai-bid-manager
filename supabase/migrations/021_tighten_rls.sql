-- Migration 021: Replace remaining broad auth_all_* policies with org-scoped ones.
--
-- Context:
--   Migration 011 created broad using(true) policies for all tables as a Phase 0
--   placeholder. Migration 015 dropped the three policies where org-scoped alternatives
--   already existed (documents, queries, review_requests).
--
--   This migration finishes the job for the remaining tables where all server-side
--   access goes through the service role (which bypasses RLS), so these policies are
--   defence-in-depth only — they prevent data leakage if a client ever obtained the
--   anon key and queried the DB directly.
--
--   Not changed:
--     routing_config, integration_settings, rate_limits — no org_id; admin-only config
--     accessed exclusively via service_role. Kept as auth_all_* for now.

-- ── 1. document_chunks — scoped via documents.org_id ─────────────────────────

drop policy if exists "auth_all_document_chunks" on document_chunks;

create policy "document_chunks_own"
  on document_chunks for all
  to authenticated
  using (
    document_id in (
      select id from documents
      where org_id in (select org_id from org_memberships where user_id = auth.uid())
         or org_id is null
    )
  )
  with check (
    document_id in (
      select id from documents
      where org_id in (select org_id from org_memberships where user_id = auth.uid())
    )
  );

-- ── 2. query_results — scoped via queries.org_id ─────────────────────────────

drop policy if exists "auth_all_query_results" on query_results;

create policy "query_results_own"
  on query_results for all
  to authenticated
  using (
    query_id in (
      select id from queries
      where org_id in (select org_id from org_memberships where user_id = auth.uid())
         or org_id is null
    )
  )
  with check (
    query_id in (
      select id from queries
      where org_id in (select org_id from org_memberships where user_id = auth.uid())
    )
  );

-- ── 3. approved_answers — has org_id directly (added in migration 012) ────────

drop policy if exists "auth_all_approved_answers" on approved_answers;

create policy "approved_answers_own"
  on approved_answers for all
  to authenticated
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or org_id is null
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
  );

-- ── 4. review_comments — scoped via review_requests.org_id ───────────────────

drop policy if exists "auth_all_review_comments" on review_comments;

create policy "review_comments_own"
  on review_comments for all
  to authenticated
  using (
    review_request_id in (
      select id from review_requests
      where org_id in (select org_id from org_memberships where user_id = auth.uid())
         or org_id is null
    )
  )
  with check (
    review_request_id in (
      select id from review_requests
      where org_id in (select org_id from org_memberships where user_id = auth.uid())
    )
  );

-- ── 5. review_audit_log — scoped via review_requests.org_id ──────────────────

drop policy if exists "auth_all_review_audit_log" on review_audit_log;

create policy "review_audit_log_own"
  on review_audit_log for all
  to authenticated
  using (
    review_request_id in (
      select id from review_requests
      where org_id in (select org_id from org_memberships where user_id = auth.uid())
         or org_id is null
    )
  )
  with check (
    review_request_id in (
      select id from review_requests
      where org_id in (select org_id from org_memberships where user_id = auth.uid())
    )
  );

-- ── 6. rfp_run_questions — add org_id + scoped policy ────────────────────────

alter table rfp_run_questions
  add column if not exists org_id uuid references orgs(id);

create index if not exists rfp_run_questions_org_idx on rfp_run_questions(org_id);

drop policy if exists "auth_all_rfp_run_questions" on rfp_run_questions;

create policy "rfp_run_questions_own"
  on rfp_run_questions for all
  to authenticated
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
    or org_id is null
  )
  with check (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
  );
