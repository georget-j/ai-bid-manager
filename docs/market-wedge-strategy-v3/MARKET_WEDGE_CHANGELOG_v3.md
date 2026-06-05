# Market Wedge Changelog v3

## 2026-06-05 — Phases 3+4 complete: client wiring + evidence vault

### Added (commit e007270)

**Phase 3 — client_id wired into existing flows:**

- OpportunityActions: client selector before "Save opportunity"; client_id persisted to bid_pipeline; restored from pipeline-status on load
- add-to-pipeline route + addToPipeline(): accept and save client_id
- pipeline-status route: returns client_id alongside saved flag
- Pipeline page: client filter dropdown; client name badge on each card linking to /clients/[id]
- DocumentUpload: "Scope to client" dropdown; passes client_id in FormData
- documents/upload route + ingestDocument: accept and persist client_id on documents

**Phase 4 — evidence vault:**

- Migration 033: `evidence_items` table (org_id + client_id FKs, 7-value type enum, status auto-set by BEFORE trigger from expires_at)
- GET/POST `/api/clients/[id]/evidence` + PATCH/DELETE `/api/clients/[id]/evidence/[eid]`
- `/clients/[id]/evidence` page: status summary chips (valid/expiring_soon/expired), type filter pills, inline add form, per-item inline edit, delete with confirm
- `/clients/[id]` detail: evidence vault placeholder replaced with live link card

---

## 2026-06-05 — Phase 3 foundation shipped

### Added (commit b674c7d)

- Migration 031: `clients` table — org_id FK, vertical enum, status, website, notes; RLS scoped to org_memberships
- Migration 032: nullable `client_id` FK on documents, opportunity_questions, bid_pipeline, compliance_matrices with partial indexes
- `GET/POST /api/clients` + `GET/PATCH/DELETE /api/clients/[id]` — org-scoped CRUD with Zod validation; DELETE is soft-archive
- `/clients` list page — inline create form, status filter, hover cards
- `/clients/[id]` detail page — inline edit, archive confirmation, vertical/status badges, placeholder cards for Phase 4
- Clients nav item added to sidebar and topbar breadcrumb map
- 3 client isolation tests added to `tests/tenant-isolation.test.ts`

### Architecture

Clients modelled as a separate table linked to agency org (Option A / ADR-005). Existing single-org constraint preserved. client_id is nullable on all tables — no migration impact on existing data.

---

## 2026-06-05 — Phase 2 security fixes complete

### Security (commit 83573dc)

- S-001: `tender_doc_cache` — added `org_id` column + RLS policy via migration 030; storage path now org-prefixed
- S-002: `/api/admin/integrations` GET — added `requireAdmin()` check; previously any authenticated user could read webhook credentials
- S-003: `CRON_SECRET` — made required; returns 500 if unset instead of being publicly accessible
- S-004: `lib/supabase-service.ts` created; service role key moved out of `lib/supabase.ts`; anon client now isolated in that file
- S-005: `tests/tenant-isolation.test.ts` — 5 cross-tenant tests across documents, opportunity_questions, tender_doc_cache, answer_library; run via `npm run test:isolation`
- S-006: Rate limit fail-open now logs `console.error` so DB errors are visible in production logs

Phase gate cleared. Safe to onboard real organisations.

---

## 2026-06-05 — Phase 0 complete

### Added

- `MARKET_WEDGE_REPO_STATE_v3.md` — full snapshot of repo: stack, all routes, all DB tables, RAG pipeline, what exists vs what is missing
- `MARKET_WEDGE_SECURITY_PLAN_v3.md` — updated with audit findings: 14 security risks documented and classified (S-001 to S-014), phase gate defined

### Changed

- `MARKET_WEDGE_EXECUTION_TRACKER_v3.md` — Phase 0 marked complete; all checklist items ticked; Phase 2 checklist populated with actual gaps found
- `MARKET_WEDGE_NEXT_ACTIONS_v3.md` — replaced placeholder with concrete Phase 2 tasks (S-001 to S-006) with exact file paths and code changes needed
- `MARKET_WEDGE_ARCHITECTURE_DECISIONS_v3.md` — added ADR-004 through ADR-010 based on audit findings

### Security

- 3 critical risks identified: tender_doc_cache has no RLS, admin integrations GET is unprotected, CRON_SECRET is optional
- 3 high risks identified: supabase client split needed, no cross-tenant tests, rate limit fail-open
- 8 medium/low risks documented
- Phase gate written: do not onboard real orgs until S-001 through S-006 resolved

### Repo state summary

The product already substantially implements Phases 5, 7, 8, and 9 from the build plan (opportunity workflow, compliance matrices, AI answer drafting, review queue, DOCX export). The main gaps before production use are the security fixes above and the agency/client workspace model (Phase 3).

---

## Created (initial)

### Added

- Unique market-wedge strategy v3 folder
- Unique internal filenames
- Strategy build plan
- Execution tracker
- Security plan
- Product requirements
- Validation and GTM plan
- Next actions
- Architecture decisions

### Security

- Security remains the number one priority
