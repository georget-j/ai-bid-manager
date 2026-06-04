# Changelog

## 2026-06-04 (Buyers page + Dashboard enhancements)

### Buyers page

- `app/buyers/page.tsx` — replaced placeholder with live server component; aggregates opportunities by `buyer_name` in JS (up to 2000 rows, top 100 buyers); table shows region, notices, open count, award count, avg value, last seen; links to `/opportunities?buyer=<name>`

### Dashboard

- `app/page.tsx` — `getDashboardStats()` now fetches upcoming deadlines (active opps due within 14 days, `days_left` pre-computed server-side) and sources table for sync status
- "Upcoming deadlines" section: conditionally rendered list of upcoming deadline opps; red label when ≤ 3 days remaining
- "Data sources" section: compact grid of source sync status cards (OK / Error / Never synced / Disabled); conditionally rendered

---

## 2026-06-04 (Security hardening + Dashboard)

### Security

- `lib/admin-auth.ts` — added `requireAuth()` helper (returns 401 in non-demo mode if no valid session)
- `app/api/export/docx/route.ts` — `requireAuth()` added; closes unauthenticated document export gap
- `app/api/export/html/route.ts` — same fix
- `app/api/export/rfp-batch/route.ts` — same fix
- `app/api/export/rfp-batch-html/route.ts` — same fix
- `supabase/migrations/021_tighten_rls.sql` — org-scoped policies for `document_chunks`, `query_results`, `approved_answers`, `review_comments`, `review_audit_log`; `org_id` column added to `rfp_run_questions`
- `app/api/rfp/answer-batch/route.ts` — `org_id` now stored in `rfp_run_questions` rows

### Dashboard

- `app/page.tsx` — KPI row now shows live counts: opportunities, deadlines-this-week, active pipeline, and unseen alert matches (all org-scoped, 2.5s timeout). "New alerts" card replaces "Status" with link to `/alerts`.

---

## 2026-06-04 (Phases 8–10)

### Phase 10 — Public marketing and resources layer

- `middleware.ts` — added `/how-it-works`, `/industries`, `/resources`, `/pricing`, `/services`, `/contact` to `PUBLIC_PAGES` (no auth required)
- `app/(public)/layout.tsx` — public layout with sticky nav (brand mark, nav links, Sign in CTA) and footer; uses `(public)` route group so it gets a different layout from the authenticated app shell
- `/how-it-works` — 5-step product workflow explanation with CTA to sign in / pricing
- `/industries` — 9-sector grid (technology, consultancy, construction, care, education, housing, environment, transport, nonprofit) with CPV ranges
- `/resources` — 3-category guide library: getting started (Find a Tender, Contracts Finder, CPV codes), bid management (bid/no-bid checklist, compliance matrix, social value), evidence library (case study template, cyber checklist, modern slavery)
- `/pricing` — 3-plan pricing table (Starter free, Professional £149/mo, Team £399/mo) with feature lists and Most popular badge
- `/services` — 8-service breakdown: opportunity discovery, fit scoring, pipeline management, compliance matrix, RFP batch processing, review workflow, alerts, export
- `/contact` — email contact card + mailto-based contact form

---

## 2026-06-04 (Phases 8–9)

### Phase 8 — Additional connectors

- `lib/procurement/connectors/contracts-finder.ts` — Contracts Finder OCDS API connector
- `lib/procurement/connectors/public-contracts-scotland.ts` — Public Contracts Scotland OCDS connector
- `lib/procurement/connectors/sell2wales.ts` — Sell2Wales OCDS connector
- All 4 connectors (incl. Find a Tender) registered in `POST /api/sources/[name]/sync`
- `POST /api/sources/sync-all` — syncs all enabled sources concurrently; returns per-source summary
- Sources page: "Sync all enabled sources" button added; CONNECTOR_AVAILABLE set extended to all 4 sources; strategy note updated
- `seedSources()` updated to mark contracts-finder, public-contracts-scotland, sell2wales as enabled (connectors ready)

### Phase 9 — Alerts and saved searches

- `supabase/migrations/020_alert_rules.sql` — `alert_rules` and `alert_matches` tables, both org-scoped with RLS
- `lib/procurement/alerts.ts` — `matchesRule()` matching engine (keywords, CPV, region, buyer, value range, stage); `matchAlertsForOpportunities()` runs against all enabled rules after each sync
- Sync engine (`lib/procurement/sync.ts`) wired to call `matchAlertsForOpportunities` after upserts; collects upserted IDs via `.select("id").single()`
- `GET/POST /api/alerts` — list rules with match/unseen counts; create rule
- `PATCH/DELETE /api/alerts/[id]` — update (name, keywords, enabled, etc.); delete (org-verified)
- `GET /api/alerts/matches` — latest 50 matches joined with rule and opportunity; returns unseen_total
- `POST /api/alerts/matches` — mark specific IDs or all as seen
- `/alerts` — Matches tab (new/seen indicator, mark-all-seen) and Rules tab (create form with keyword/CPV/region/value inputs, pause/enable/delete per rule)
- Alerts added to sidebar ("Intelligence" group) and topbar crumb map

---

## 2026-06-04 (Phases 1–7)

### Phase 1 — Rebrand and navigation scaffold

- App rebranded to "UK Bid Intelligence Agent" across metadata, sidebar, topbar, and homepage
- Homepage updated with procurement positioning and quick-action cards
- Sidebar reorganised into "Intelligence" and "Respond" nav groups with group labels
- 5 new authenticated routes scaffolded: `/opportunities`, `/pipeline`, `/buyers`, `/sources`, `/profile`

### Phase 2 — Data model and seed data

- `lib/procurement/types.ts` — full TypeScript types for all procurement entities (camelCase for connectors, snake_case for DB rows)
- `lib/procurement/seed.ts` — 10 realistic UK public-sector seed opportunities
- `lib/procurement/data.ts` — data-access helpers with in-memory seed fallback for demo mode
- `supabase/migrations/017_procurement_tables.sql` — 6 new tables: sources, raw_notices, opportunities, buyers, organisation_profiles, opportunity_matches, bid_pipeline (all RLS-scoped from the start)
- `/opportunities` list page with search/filter, seed fallback, deadline urgency indicators
- `/opportunities/[id]` detail page with lots, documents, and action buttons
- `POST /api/opportunities/seed` — seed loader (admin only)

### Phase 3 — Organisation profile and scoring engine

- `lib/procurement/scoring.ts` — full scoring engine: CPV match, keyword match, region, buyer preference, contract value, evidence heuristic, deadline feasibility, exclusion enforcement
- `/profile` — real form with tag inputs, region picker, value range; saves to `organisation_profiles` via `/api/profile`
- `POST /api/opportunities/[id]/analyse` — scores opportunity against org profile, persists to `opportunity_matches`
- `POST /api/opportunities/[id]/add-to-pipeline` — creates or upserts a `bid_pipeline` row
- `OpportunityActions` client component on detail page — Analyse fit, Add to pipeline (both live), scoring result panel

### Phase 4 — Bid pipeline

- `GET /api/pipeline` — returns pipeline items joined with opportunity data
- `PATCH/DELETE /api/pipeline/[id]` — update status, owner, notes; delete item (both org-verified)
- `/pipeline` — real pipeline page: status summary chips, tab filtering (Active/Decided/Archived), inline status dropdown, remove button

### Phase 5 — Find a Tender connector

- `lib/procurement/hash.ts` — SHA-256 content hashing for deduplication
- `lib/procurement/normalizers/ocds.ts` — OCDS release → NormalizedOpportunity mapper (handles lots, documents, CPV codes, stage/status derivation)
- `lib/procurement/connectors/find-tender.ts` — Find a Tender OCDS API connector with cursor pagination
- `lib/procurement/sync.ts` — sync engine: fetch raw → store raw_notices (content-hash dedup) → normalise → upsert opportunities → update source status; `seedSources()` helper
- `POST /api/sources/[name]/sync` — admin-only manual sync trigger
- `GET /api/sources` — lists sources with auto-seed on first access, enriched with opportunity/raw counts
- `/sources` — live sources page with connector status, sync button, result summary

### Phase 6 — RFP run integration

- `supabase/migrations/018_rfp_opportunity_link.sql` — `opportunity_id` column on `rfp_run_questions`
- `answer-batch` route updated to accept and store `opportunity_id`
- `RFPProcessor` updated to accept `initialTitle` and `initialOpportunityId` props
- `/rfp` page reads `?title=&opportunityId=` query params and passes them to processor; shows opportunity context banner
- `OpportunityActions` "Start RFP response" link pre-fills title and opportunity ID

### Phase 7 — Compliance matrix generator

- `supabase/migrations/019_compliance_matrix.sql` — `compliance_matrices` and `compliance_requirements` tables, both org-scoped via RLS
- `POST /api/compliance-matrix` — generates matrix: creates matrix record, inserts requirements, runs RAG generation for each (CONCURRENCY=5), maps confidence level to numeric score
- `GET /api/compliance-matrix` — lists org's matrices with requirement summaries
- `GET /api/compliance-matrix/[id]` — fetches single matrix with all requirements
- `PATCH /api/compliance-requirements/[id]` — edit draft answer, status, owner (org-verified via matrix join)
- `/compliance` — list page showing all matrices with stats
- `/compliance/[id]` — detail page: expandable requirements, inline status dropdown, edit draft answer inline
- "Generate compliance matrix" button added to `OpportunityActions`; links to result on completion
- Compliance Matrices added to sidebar nav ("Respond" group) and topbar crumb map

---

## 2026-06-04 (security fixes)

### Fixed

- **GAP-001 (CRITICAL):** `hybrid_search_chunks` now accepts `p_org_id uuid default null`; filters document_chunks to the caller's org (or shared demo rows). `retrieveChunks()` signature updated to `(queryText, orgId?)`. Both callers (`/api/ask`, `/api/rfp/answer-batch`) pass orgId. Migration: `016_retrieval_org_scope.sql`.
- **GAP-002 (CRITICAL):** Dropped `auth_all_documents`, `auth_all_queries`, `auth_all_review_requests` RLS policies that OR-overrode org-scoped policies from migration 012. Org scoping is now enforced by RLS for authenticated clients on these three tables. Migration: `015_fix_rls_conflicts.sql`.
- **GAP-003 (HIGH):** Added `checkRateLimit(request, "export")` to all 4 export route handlers (`/api/export/docx`, `/api/export/html`, `/api/export/rfp-batch`, `/api/export/rfp-batch-html`).
- **GAP-004 (HIGH):** Dropped `orgs_insert` RLS policy (unrestricted `with check (true)`). Org creation is server-side via service role; authenticated role insert access was unnecessary. Bundled in migration 015.

### Verification

- TypeScript: 0 errors
- ESLint: 0 warnings
- Build: clean

---

## 2026-06-04 (Phase 0 audit)

### Added

- Merge-safe Claude Code planning pack in `docs/claude-code-bid-intelligence/`.
- Root addendum file: `CLAUDE_BID_INTELLIGENCE_ADDENDUM.md`.
- Phase 0 repo audit and security assessment completed.
- Bid Intelligence Addendum section appended to `CLAUDE.md` (existing content preserved).
- `IMPLEMENTATION_STATE.md` populated with full repo findings: stack, routes, DB schema, RLS status, security gaps.
- `SECURITY_REQUIREMENTS.md` updated with 7 identified security gaps (2 critical, 2 high, 3 medium).
- `NEXT_ACTIONS.md` updated with prioritised Phase 0 security fixes and Phase 1 task list.
- `ARCHITECTURE_DECISIONS.md` updated with ADR-004 through ADR-008 (stack and security decisions).

### Security

- Security established as the number one priority.
- Phase-gating security checklist created.
- **GAP-001 identified (CRITICAL):** RAG retrieval (`hybrid_search_chunks`) not org-scoped — all users search all orgs' documents. Fix required before multi-tenant document upload.
- **GAP-002 identified (CRITICAL):** `auth_all_*` RLS policies from migration 011 use `using(true)` and OR-override org-scoped policies from migration 012. Effective RLS org isolation is not currently enforced.
- **GAP-003 identified (HIGH):** Four export routes have no auth guard in the route handler itself.
- **GAP-004 identified (HIGH):** `orgs_insert` RLS policy is unrestricted (`with check (true)`).
- **GAP-005 identified (MEDIUM):** `CRON_SECRET` is optional; if unset, the cron endpoint is publicly callable.
- **GAP-006 identified (MEDIUM):** MIME type validation relies on client-supplied `file.type`.
- **GAP-007 identified (MEDIUM):** Several tables not yet org-scoped in RLS (document_chunks, query_results, etc.).

### Notes for future Claude sessions

- Do not overwrite existing repo files blindly.
- Always read continuity files before planning or coding.
- If context compacts, re-read `docs/claude-code-bid-intelligence/` before continuing.
- Phase 0 security fixes (0-S1 through 0-S4) must be completed before Phase 1 is marked done.
- All API routes use the service role client — RLS bypassed for all current DB ops. Data isolation is entirely application-level (org_id filtering in queries).
- The existing RFP/RAG/review/history/admin workflows are working and must not be broken.
