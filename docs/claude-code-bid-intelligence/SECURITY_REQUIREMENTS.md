# Security Requirements

Security is the number one priority.

---

## Mandatory controls

- Server-side authentication on all protected routes.
- Server-side authorisation on all organisation-owned data.
- Tenant isolation for documents, document_chunks, queries, query_results, RFP runs, review items, answer library entries, opportunities, profile data, pipeline records, generated answers, citations, and embeddings.
- No secrets in code or browser bundles.
- Uploaded files private by default.
- Signed URLs or authenticated download routes for private files.
- RAG retrieval scoped to the authenticated organisation's documents only.
- Citations scoped to authorised documents only.
- Admin routes protected server-side via `requireAdmin()`.
- Source sync routes protected server-side.
- User/source-provided content safely rendered to prevent XSS.
- Input validation on all API routes.
- Rate limits on upload, sync, extraction, and AI endpoints.
- Audit logging for important admin, upload, review, sync, and RFP actions.
- Do not log sensitive document contents, secrets, embeddings, or complete bid responses.

---

## Known gaps — must fix before multi-tenant launch

### CRITICAL — RESOLVED

**GAP-001: RAG retrieval is not org-scoped** ✓ FIXED 2026-06-04

- `lib/retrieval.ts` calls `hybrid_search_chunks` RPC using the service role client.
- The `hybrid_search_chunks` SQL function has no `org_id` or `user_id` filter.
- RLS is bypassed by the service role, so document_chunks from all orgs are searched.
- **Risk:** A user from Org A retrieves and cites documents uploaded by Org B.
- **Fix needed:** Pass `p_org_id` parameter to `hybrid_search_chunks` and filter `document_chunks` by joining to `documents` where `org_id = p_org_id`. Update `retrieveChunks()` to accept and pass orgId.

**GAP-002: Conflicting RLS policies — `auth_all_*` from migration 011 overrides org-scoped policies from 012** ✓ FIXED 2026-06-04

- Migration 011 creates `auth_all_documents`, `auth_all_queries`, `auth_all_review_requests` with `using(true)`.
- Migration 012 creates `org_documents`, `org_queries`, `org_review_requests` with org-membership subquery.
- Postgres RLS ORs multiple permissive policies — any authenticated user satisfies `using(true)` and gains access to all rows.
- **Risk:** Org-scoped RLS policies are silently bypassed for any client using the anon/authenticated key.
- **Fix needed:** Drop the broad `auth_all_*` policies for tables that have org-scoped alternatives. Keep them only for tables where org scoping is not yet implemented (and document that gap).

### HIGH — RESOLVED

**GAP-003: Export routes have no authentication** ✓ FIXED 2026-06-04

- `POST /api/export/docx`, `/api/export/html`, `/api/export/rfp-batch`, `/api/export/rfp-batch-html` have no auth check.
- Middleware protects them (session required for pages), but the routes themselves do no server-side auth.
- The routes generate documents from POST body content (no DB read) but should still require auth to prevent misuse.
- **Fix needed:** Add `const limited = await checkRateLimit(req, "export")` and optionally verify session.

**GAP-004: `orgs_insert` RLS policy is unrestricted** ✓ FIXED 2026-06-04

- Any authenticated user can `INSERT` into the `orgs` table (`with check (true)`).
- **Risk:** Spam org creation; privilege escalation in future multi-org models.
- **Fix needed:** Restrict org creation to the auth callback flow only (use service role from server) and remove the broad insert policy, or add a stricter `with check`.

### MEDIUM

**GAP-005: `CRON_SECRET` is optional — cron endpoint publicly callable if unset**

- `/api/cron/escalate` checks `CRON_SECRET` only if the env var is set.
- If unset, any caller can trigger `escalateOverdueReviews()`.
- **Fix needed:** Require `CRON_SECRET` to be set in production (document this). Add a startup warning if missing.

**GAP-006: MIME type from `file.type` is client-supplied**

- Upload validation uses `file.type` (browser-provided) for MIME type.
- Extension allowlist is enforced, which mitigates most risk.
- **Fix needed (medium priority):** Add magic-byte / file-header validation for the top file types (PDF, DOCX, XLSX) as an additional defence.

**GAP-007: Several tables not yet org-scoped in RLS**

- `document_chunks`, `query_results`, `routing_config`, `approved_answers`, `integration_settings`, `rate_limits`, `review_comments`, `review_audit_log`, `rfp_run_questions` have broad `using(true)` policies.
- All application-level access goes through the service role (RLS bypassed), so no immediate data leak via the API.
- **Risk:** If Supabase Realtime, Storage, or a client-side SDK ever uses the authenticated role, data leaks across orgs.
- **Fix needed (Phase 2):** Add org_id to remaining tables and update RLS policies.

---

## Security checks required before completing each phase

For every phase, answer:

1. Did this phase add or modify protected data?
2. Are all reads/writes scoped by user and organisation?
3. Are all new API routes protected server-side?
4. Are admin-only actions protected server-side?
5. Are uploaded or generated documents private?
6. Can any user access another user's data?
7. Could source-provided content create XSS?
8. Are secrets kept out of code and client bundles?
9. Are expensive or sensitive endpoints rate-limited?
10. Are security-relevant actions auditable?

Do not mark a phase complete until these questions are answered.

---

## Security acceptance criteria for Phase 1 (rebrand + nav scaffold)

- No new routes expose protected data without auth.
- No new routes modify org-owned data without org scoping.
- No hardcoded secrets introduced.
- Existing auth middleware still protects all new routes.
- GAP-001 (retrieval not org-scoped) must be fixed before enabling multi-tenant document upload.
- GAP-003 (export routes unprotected) must be fixed before shipping to real users.
