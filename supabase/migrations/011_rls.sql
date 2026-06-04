-- Phase 0: Enable Row Level Security on all tables.
--
-- Strategy:
--   - service_role bypasses RLS by default (all server-side ops are safe)
--   - anon role: no access (all data access goes through API routes)
--   - authenticated role: full access now; narrowed to org scope in Phase 1
--
-- Run this in the Supabase SQL editor AFTER migrations 001-010.

-- ── Enable RLS ────────────────────────────────────────────────────────────────

alter table documents              enable row level security;
alter table document_chunks        enable row level security;
alter table queries                enable row level security;
alter table query_results          enable row level security;
alter table routing_config         enable row level security;
alter table review_requests        enable row level security;
alter table approved_answers       enable row level security;
alter table integration_settings   enable row level security;
alter table rate_limits            enable row level security;
alter table review_comments        enable row level security;
alter table review_audit_log       enable row level security;

-- ── Authenticated users: full access (tightened to org scope in Phase 1) ──────

create policy "auth_all_documents"
  on documents for all
  to authenticated
  using (true)
  with check (true);

create policy "auth_all_document_chunks"
  on document_chunks for all
  to authenticated
  using (true)
  with check (true);

create policy "auth_all_queries"
  on queries for all
  to authenticated
  using (true)
  with check (true);

create policy "auth_all_query_results"
  on query_results for all
  to authenticated
  using (true)
  with check (true);

create policy "auth_all_routing_config"
  on routing_config for all
  to authenticated
  using (true)
  with check (true);

create policy "auth_all_review_requests"
  on review_requests for all
  to authenticated
  using (true)
  with check (true);

create policy "auth_all_approved_answers"
  on approved_answers for all
  to authenticated
  using (true)
  with check (true);

create policy "auth_all_integration_settings"
  on integration_settings for all
  to authenticated
  using (true)
  with check (true);

create policy "auth_all_rate_limits"
  on rate_limits for all
  to authenticated
  using (true)
  with check (true);

create policy "auth_all_review_comments"
  on review_comments for all
  to authenticated
  using (true)
  with check (true);

create policy "auth_all_review_audit_log"
  on review_audit_log for all
  to authenticated
  using (true)
  with check (true);
