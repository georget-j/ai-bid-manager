-- Fix conflicting RLS policies.
--
-- Migration 011 added broad `auth_all_*` policies with `using(true)`.
-- Migration 012 added org-scoped policies for documents, queries, and
-- review_requests.  Because Postgres ORs multiple permissive policies,
-- the `using(true)` policy wins and org scoping is not enforced.
--
-- This migration drops the broad policies for the three tables that now have
-- org-scoped alternatives.  The remaining `auth_all_*` policies (document_chunks,
-- query_results, routing_config, approved_answers, integration_settings,
-- rate_limits, review_comments, review_audit_log) are kept — those tables
-- do not yet have org-scoped alternatives and all access goes through the
-- service role (which bypasses RLS entirely).
--
-- Also drops the unrestricted `orgs_insert` policy.  Org creation happens
-- server-side via the service role in lib/org.ts; the authenticated role
-- does not need insert access on the orgs table.

drop policy if exists "auth_all_documents"       on documents;
drop policy if exists "auth_all_queries"          on queries;
drop policy if exists "auth_all_review_requests"  on review_requests;
drop policy if exists "orgs_insert"               on orgs;
