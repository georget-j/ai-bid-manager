# Market Wedge Changelog v3

## 2026-06-06 — Epic 3.1: recommendations are live-only + urgency-ranked

- `recommendations/route.ts`: candidate pool is now `status=active` AND `deadline=open`
  (future or null). Previously `status=active` alone surfaced 139 expired tenders (359
  active → 212 live). Defensive re-check drops any deadline that slipped past. Ranking is
  fit-score desc, then urgency (soonest deadline first). SAMPLE_SIZE 150 → 300 to cover
  the full live pool. Response now also returns `readiness_score` + `missing` so the UI
  can prompt "add evidence to improve fit".

## 2026-06-06 — Epic 2.2: opportunity pagination (Epic 2 complete)

- `app/opportunities/page.tsx`: `page` query param → offset; prev/next controls that
  preserve all active filters; header now shows "T opportunities · showing N–M".
  `listOpportunities` already supported `offset` + exact `total`. Submitting the filter
  form resets to page 1 (no page field in the form).

## 2026-06-06 — Epic 2.1: opportunity browse filters

- Migration `045_opportunity_filter_support.sql` (applied): btree indexes on
  `value_amount` + `source_name`; a `cpv_search` text column (space-padded CPV codes,
  maintained by a BEFORE INSERT/UPDATE trigger + one-time backfill) with a pg_trgm GIN
  index. (A generated column couldn't use `array_to_string` — not treated as immutable —
  so a trigger maintains it instead.)
- `listOpportunities` gains filters: deadline status (open/soon/closed, dot-free
  timestamp in the PostgREST `or`), source (`source_name`), sector (CPV division prefix
  via `cpv_search ilike '% NN%'`), value min/max, and region switched to `ilike`.
- `app/opportunities/page.tsx` renders the full filter bar (search, deadline [default
  Open], sector, source, stage, status, buyer, value min/max). Buyer was previously
  read but never rendered.
- **Region filter deferred to Epic 7:** `opportunities.region` and `buyer_region` are
  100% empty in the current Contracts Finder data, so a region control would always
  return nothing. Param plumbing kept; control hidden until ingestion populates it.
- Live-tested all filters via `tests/opportunity-filters.test.ts` (open 272 / soon 83 /
  closed 2950 / sector-72 321 / value-range 1779 — all valid queries, sector returns
  only matching CPVs).

## 2026-06-06 — Epic 1.3: evaluate without approving all (Epic 1 complete)

- The reevaluate API + section already accepted drafted (non-approved) items; made it
  explicit. `RfpReevaluationSection` now fetches the answered (drafted) count itself,
  enables "Evaluate response" as soon as ≥1 item has a draft, and disables with a hint
  otherwise (no more confusing server-side "draft some answers" error). Copy now states
  plainly that approval is not required — drafts are evaluated too. Parent prop renamed
  `answeredCount` → `itemCount` (it was always the total item count, not answered).

## 2026-06-06 — Epic 1.2: RFP importance ranking

- Migration `044_question_priority.sql` (applied): `opportunity_questions.priority`
  (`high|medium|low`, NOT NULL default `medium`, CHECK constraint).
- `lib/rfp-extract.ts`: extraction schema + prompt now assign `priority`; post-map keeps
  it coherent (mandatory ⇒ high, guidance ⇒ low). `extract-all` stamps it on each row.
- `QuestionsSection` + `RequirementsSection`: lists now sort by importance
  (mandatory first, then priority high→low, stable) and show a priority pill (High =
  amber, Low = muted) that complements the existing red Mandatory badge.
- `app/rfp/page.tsx` pre-populated questions default `priority: "medium"`.

## 2026-06-06 — Epic 1.1: harden RFP answer generation

- `answer-all/route.ts`: added `export const maxDuration = 60` (the default serverless
  timeout was silently truncating the SSE batch mid-flight, leaving later questions
  unwritten). The `catch` now records `confidence_reason` (+ low confidence) so a failed
  generation shows _why_ on the card (RequirementsSection + QuestionsSection both render
  `confidence_reason`) instead of a blank "needs-review". Both sections share this route.
- Verified migration 043 is live on the production Supabase: the 5-arg overload
  `hybrid_search_chunks(text,vector,integer,uuid,uuid)` that `retrieveChunks` calls carries
  the `doc_id` alias fix. (Older 3/4-arg overloads remain unused.)

## 2026-06-06 — Started 7-epic product uplift (compaction-safe)

Kicked off a 7-epic uplift addressing user-reported problems across browse, recommend,
RFP response, evidence gaps, buyers, opportunity profile, and Contracts Finder ingestion.

- Added `MARKET_WEDGE_UPLIFT_TRACKER_v3.md` as the live recovery anchor (per-phase
  checklist + Current pointer). Every phase ends in a commit + push so nothing is lost
  if context compacts. Wired NEXT_ACTIONS + EXECUTION_TRACKER to point at it.
- Decisions: autonomous per-phase execution; custom-SVG buyer charts (no new dep);
  robust-and-safe ingestion (overlap + cursor resume + monitoring); derive + cross-link
  - seed one demo opportunity (real catalog untouched). Migrations 044–048 pre-allocated.

## 2026-06-06 — CRITICAL fix: RAG retrieval broken (ambiguous "id") + live showcase

Found while running the full RFP flow live with a seeded knowledge base.

### Fixed — `hybrid_search_chunks` threw on every call

- Migration `043_fix_hybrid_search_ambiguous_id.sql` (applied). The function
  `RETURNS TABLE (id uuid, …)`, so in PL/pgSQL the output column `id` is a
  variable; every bare `id` in the body (`select id from documents`,
  `group by id`, …) was **ambiguous** → `column reference "id" is ambiguous`
  thrown on every call. **All RAG retrieval failed**, so every AI answer and
  compliance draft silently fell into the `answer-all` catch path and came back
  empty (`needs-review`, no draft). Present since migration 016 (org scoping),
  carried into 034 (client scoping). Fix: alias the CTE id columns
  (`doc_id`/`chunk_id`); output columns and logic unchanged.
- This is why earlier live answers were empty — not a knowledge-base gap.

### Verified live (throwaway authenticated org with a seeded KB)

- Diagnostic: `retrieveChunks` → 6 chunks; `generateRFPResponse` → a grounded
  draft citing the seeded ISO certificate. Previously: threw.
- Full showcase (sector-matched evidence, real login): `extract-all` 200 (49
  items); **real grounded drafts** (e.g. "facilitated a regional community
  energy network of 60 groups… 40% growth…", confidence high, with citations);
  approve; **re-evaluation overall 85** with per-item scores + suggestions;
  `export` 200 + DOCX. Test data cleaned up.

---

## 2026-06-06 — Fix: DOCX export 404 (non-existent source_id column)

Found during a live end-to-end test (real login against the deployed app).

- `export-response/route.ts` selected `opportunities.source_id`, which does not
  exist (the table has `source_name` / `source_notice_id`). Selecting a missing
  column returned null → the route 404'd "Opportunity not found", so **both DOCX
  export buttons were broken in production**. Switched to `source_notice_id`
  (used as the tender reference on the cover page).
- Pre-existing bug, unrelated to the RFP rework; surfaced by the live test.

### Live test (throwaway authenticated user, against ai-rfp-agent-ten.vercel.app)

- Real Supabase login → valid session cookie → `auth/me` 200.
- `extract-all`: **200 — 45 items (30 requirements / 12 questions / 3 guidance)
  from 5 sources, all 45 provenance-tagged, 29 mandatory.** The step-3 fix is
  confirmed working in production.
- approve / unapprove: 200 each.
- Note: answers came back empty because the throwaway org has no knowledge base
  (expected — a real org with evidence drafts normally); re-eval correctly
  returned 400 ("nothing to evaluate") as a result. Export 404 was the source_id
  bug fixed above.

---

## 2026-06-06 — RFP rework Phase 4: response re-evaluation + scoring visual

Final step of the RFP workflow: score the drafted/approved response against the
original tender and show what to improve.

### Added

- Migration `042_rfp_reevaluation.sql` (additive): `rfp_reevaluations`
  (opportunity_id, org_id, overall_score, results jsonb, created_at), org-scoped
  RLS mirroring `opportunity_questions`. Applied to Supabase.
- `GET/POST /api/opportunities/[id]/reevaluate`: POST scores every **answered**
  item (drafted + needs-review + approved, excluding guidance) against the tender
  description + linked documents' text via `gpt-4o-mini` → per-item `score`
  (0-100) + `strengths[]` + `suggestions[]` + an `overall_score`; persists the
  result. GET returns the latest stored evaluation.
- `RfpReevaluationSection.tsx` (Step 7 in RFPWorkflow): "Evaluate response"
  button, an overall score gauge (cloned from `ReadinessWidget`: 72px ring,
  thresholds `#059669/#d97706/#dc2626`), and a per-item list (weakest first) with
  score bars, improvement suggestions, and strengths.

### Verified

- Typecheck clean; RFP tab renders (200); both routes auth-gate (401). End-to-end
  scoring smoke: a strong ISO-27001 answer scored high with strengths, a weak
  "We monitor" answer scored 20 with a concrete suggestion, overall 60 persisted
  to `rfp_reevaluations` and read back.

---

## 2026-06-06 — RFP rework Phase 3: provenance, unapprove, mandatory export gate

Per-card enhancements in the existing Requirements + Questions sections (kept as
two sections per the agreed design).

### Added

- **Provenance chip** on every requirement/question card showing `source_document`
  ("Opportunity description" or the document title) — "where this came from".
- **Unapprove** button on approved cards (PATCH `answer_status:'drafted'`) →
  sends the item back to drafting; refreshes export counts.
- **Mandatory export gate**: "Export approved only" is disabled in the UI until
  every mandatory (non-guidance) item is approved, with a list of what's
  outstanding. `export-response?mode=approved` also returns **409** server-side
  (defense in depth). "Export all answered" remains available.

### Notes

- Requirement fit-eval was already provided by the existing flow (KB-grounded
  compliance statement via `answer-all` + High fit/Review/Gap badge with score% +
  needs-review reason for "what to add"), so no new route was needed.
- Per-card AI actions (Question → "Generate answer"; Requirement → "Draft
  statement") already call `answer-all` with `questionIds:[id]`, grounded in the
  knowledge base via `retrieveChunks → generateRFPResponse`.

### Verified

- Typecheck clean; RFP tab renders (200); export route auth-gates (401). Unapprove
  uses the existing PATCH (no state guard); provenance reads from the `*` select.

---

## 2026-06-06 — RFP rework Phase 2: unified "Get all details" extraction + provenance

Fixes the step-3 bug. The opportunity RFP tab had two conflicting extraction paths
(`extract-questions` description-only, `extract-from-document` per-doc) plus a racy
per-doc loop with an `append` flag. Phase 2 replaces them with one button that
extracts from the description **and** all tender documents into the existing two
sections, each item tagged with its source.

### Added

- Migration `041_question_provenance.sql` (additive): `source_document` +
  `source_document_id` on `opportunity_questions`. Applied to Supabase.
- `POST /api/opportunities/[id]/extract-all` — single endpoint: warms + links
  accessible docs (central store), reads description + all linked docs' text, runs
  extraction per source (bounded concurrency), dedups by normalized text, and does
  one atomic delete+insert with provenance. Returns counts by class + source list.
- `POST /api/opportunities/[id]/tender-documents/upload` — manual upload for
  portal-locked docs → stored in the central store + linked, then picked up by
  extract-all. Backed by new `uploadTenderDoc()` in `lib/tender-docs.ts`.
- `collectOpportunityDocUrls()` + `getOpportunityTenderTexts()` helpers.

### Changed

- `lib/rfp-extract.ts`: extraction now returns `word_limit` and an explicit
  tender-derived `mandatory` flag (pass/fail / "must" / minimum), replacing the
  old `risk_level !== "low"` proxy. Guidance items are never mandatory.
- `RFPWorkflow.tsx`: steps 3 (extract-all docs) and 4 (extract from description)
  collapsed into one "Get all details" step (no per-doc race, no stale UI). Steps
  renumbered (requirements 4, questions 5, export 6). `DocExtractRow` removed.
- `extract-from-document` now persists `mandatory` + `word_limit`.

### Verified

- Typecheck clean. End-to-end smoke against a real opportunity with Contracts
  Finder docs: 25 items extracted from 3 sources (description + 2 docs), 17/25
  mandatory (not all — flag works), provenance stamped correctly, provenance
  columns accept the insert. RFP tab renders (200); both new routes auth-gate (401).

---

## 2026-06-06 — RFP rework Phase 1: central tender document store + dedup

Part of the RFP response workflow rework (plan: 4 phases). Phase 1 establishes a
**global, deduped** store of tender documents so the same tender is never
re-downloaded or re-extracted, and its text is persisted for reuse by extraction
and (Phase 4) re-evaluation.

### Added

- Migration `040_tender_documents_central.sql` (additive, idempotent): global
  `tender_documents` (content-hash dedup; stores bytes path + `extracted_text` +
  page/word counts) and `opportunity_tender_documents` link table. RLS: `SELECT`
  for authenticated users, writes via service role only — same trust class as the
  global `opportunities` catalog (public buyer material). Applied to Supabase.
- `lib/tender-docs.ts` — `getOrFetchTenderDoc(url, opportunityId, title?)`: URL
  fast-path (no download) → content-hash dedup (no re-upload/re-extract) → store +
  link. Typed `TenderDocError` + `tenderDocErrorResponse` for route mapping.
- ADR-011 in `MARKET_WEDGE_ARCHITECTURE_DECISIONS_v3.md`.

### Changed

- `extract-from-document/route.ts` now delegates fetch/cache/extract to
  `getOrFetchTenderDoc` (per-org `tender_doc_cache` left as dormant fallback; a
  later migration drops it once prod-proven).
- `fetch-documents/route.ts` warms + links accessible docs into the central store
  (non-fatal, `maxDuration=60`).

### Tests

- `tests/tenant-isolation.test.ts`: added `beforeAll`/`afterAll` to seed + tear
  down the two test orgs + a test opportunity. The suite previously could not run
  on a fresh instance (FK violations); now **9/9 pass**, confirming
  `opportunity_questions` org-isolation is unaffected by the new global tables.
- Verified the dedup path end-to-end against a real Contracts Finder attachment
  (download → store → extract → link → 2nd-call `fromCache=true`).

---

## 2026-06-06 — Buyer briefing tab: verified + regenerate fix (commit f10247d)

### Fixed — "Regenerate" now actually regenerates

- `app/api/opportunities/[id]/buyer-research/route.ts`: the POST handler returned the
  cached `buyer_briefing` whenever one existed, so the "Regenerate" button only ever
  re-streamed the same text. Added a `?refresh=true` cache-bypass (matching the
  ai-gap-match clear pattern); the cached path is now `if (opp.buyer_briefing && !refresh)`.
  Renamed `_req` → `req` to read the query param.
- `app/opportunities/[id]/buyer/page.tsx`: `generateBriefing(force = false)` appends
  `?refresh=true` when forced; "Regenerate" calls `generateBriefing(true)`. Both buttons
  wrapped in arrow functions so the click event is not passed as `force`.

### Verified end-to-end

- Typecheck clean; buyer page renders (HTTP 200); both routes auth-gate correctly (401)
  with no crash; `?refresh=true` parses.
- Ran the route's data→prompt→OpenAI-stream pipeline against a real opportunity
  (Department for Education, 81 tenders): pulled 10 prior tenders for context, streamed a
  grounded 3-paragraph briefing, cache write-back confirmed. Buyer history aggregation
  validated against real data (MoJ 105 tenders, DfE 81/9 open).
- Note: `opportunities` is an intentionally central/global catalog (migration 023), so the
  absence of `org_id` filtering in these routes is by design, not a leak.

---

## 2026-06-06 — Evidence gap engine UX + RFP Response workflow rework

### Added — Evidence Gaps improvements (commits eecc39f, dee6ff8, 772f2c3)

**Phase 1 — gap visibility (`app/opportunities/[id]/gaps/page.tsx`, `lib/evidence-gap.ts`):**

- Gap results sorted by risk: mandatory-missing → expiring → covered
- Mandatory badge per card; expiry dates inline on matched evidence pills
- Amber "Expiring soon" callout; "We looked for: X, Y" hints on missing cards

**Phase 2 — inline quick-add:**

- Inline "Quick add evidence" form on missing/expired cards; POSTs to existing `/api/clients/[id]/evidence`, auto-refreshes gap analysis; pre-fills evidence type from detected signal

**Phase 3 — AI semantic matching:**

- `POST /api/opportunities/[id]/ai-gap-match` — sends all requirements + evidence vault to GPT-4o-mini; returns per-requirement coverage + confidence + one-sentence reason
- Cached in `bid_pipeline.ai_gap_analysis` JSONB (migration 039, applied); `DELETE ...?clientId=X` clears cache; "Clear" button forces regen

---

### Changed — RFP Response workflow complete rework (commits 6851785, 76e8bde, b4a9589)

The old `QuestionsPanel.tsx` (1778 lines on the Details tab) is **deleted**. The full workflow now lives on the **RFP Response tab** (`/opportunities/[id]/rfp`) as 7 sequential sections.

**New files:**

- `app/opportunities/[id]/rfp/RFPWorkflow.tsx` — main client component, 7 sections
- `app/opportunities/[id]/rfp/RequirementsSection.tsx` — compliance requirements
- `app/opportunities/[id]/rfp/QuestionsSection.tsx` — questions section + ExportSection
- `POST /api/opportunities/[id]/summarise` — streams a 3-bullet AI tender summary

**Deleted files:**

- `app/opportunities/[id]/QuestionsPanel.tsx`
- `app/opportunities/[id]/rfp/RFPResponseContent.tsx`

**The 7 steps:** (1) tender overview, (2) what this tender wants + "Summarise with AI", (3) tender documents per-doc extract, (4) extract from description with preview, (5) compliance requirements with AI statement + fit badge, (6) questions to answer with progress/filters/"Answer all" SSE/approve-all, (7) review & export DOCX.

The Details tab now shows only opportunity metadata + a compact "Work on response →" card linking to the RFP tab.

**Migration:** `038_buyer_briefing.sql` — `buyer_briefing text` on opportunities.

---

### Fixed — RFP workflow bugs (commits 6d8b172, ffe2192)

- `refreshCounts()` treated `{ questions: [] }` response as a raw array → counts always 0 → requirements/questions sections never appeared. Fixed.
- `answerAll()` / `draftAll()` did `await fetch(all questions)` inside the SSE loop per event → race conditions, answers not showing. Fixed: SSE loop reads only progress counters; single `loadQuestions()` after stream ends.
- `ExportSection` only re-fetched on total-count changes, not individual approvals. Fixed: `approvalKey` counter incremented on every approval, passed as a `useEffect` dependency.

---

## 2026-06-05 — Admin access control, client invite flow, answer visibility

### Fixed (commit 9a7291b)

**Admin-only restrictions:**

- `components/AppSidebar.tsx`: Clients nav item marked `adminOnly: true` — hidden for non-admin accounts (same pattern as Sources)
- `middleware.ts`: `ADMIN_PAGES` extended with `/clients` and `/admin` — direct URL navigation by non-admins redirects to `/`

---

### Added (commit 39fcf2e)

**Client account provisioning — invite flow:**

- Migration 037: `invited_email`, `invite_sent_at`, `client_org_id` (FK → orgs) on `clients` table; partial index on invited_email
- `POST /api/clients/[id]/invite`: org-scoped; calls `supabase.auth.admin.inviteUserByEmail` with `redirectTo` containing `client_id`; records invite on client row
- `app/auth/callback/route.ts`: links `client_org_id = newOrgId` after invite accepted; email-match check prevents URL spoofing; `IS NULL` guard prevents re-linking
- `lib/org.ts`: import corrected to `@/lib/supabase-service`
- `/clients/[id]`: invite status chips (green "Active account" / amber "Invite pending"), inline invite form
- `components/ClientsAdmin.tsx`: create client + optional email invite in one step; shown in `/admin` under "Client accounts"
- `app/admin/page.tsx`: "Client accounts" section added at top
- Vercel: `NEXT_PUBLIC_APP_URL` set for Production and Development

---

### Fixed (commit e233a2c)

**AI answer visibility + export button:**

- `QuestionsPanel.tsx`: replaced `<textarea rows={5}>` with full-height pre-wrap `<div>` — entire answer visible without scrolling
- Edit mode via `editingIds: Set<string>` — click answer or "Edit" button; textarea + Save/Discard appear
- Green dismissible banner after "Answer All": "✓ N answers generated — scroll down to review, edit, and approve"; auto-dismisses 8s
- Export button always rendered: DOCX link with count when answers exist, plain hint when none

---

## 2026-06-05 — Phases 7+9+10: matrix filter, gap DOCX export, source cron

### Added (commit 171a120)

**Phase 9 — Gap report in DOCX:**

- `ExportGapReport` type + `gapReportSection()` appendix in `lib/export-response-docx.ts`
- Export route automatically runs `analyseGaps()` when a client is linked via pipeline; appends gap table to DOCX

**Phase 7 — Compliance matrix UX:**

- Status filter dropdown + Mandatory-only checkbox (client-side, no extra requests)
- "Copy as Markdown" button — copies filtered requirements as pipe table to clipboard
- Empty state message when filter returns no rows

**Phase 10 — Find a Tender daily sync:**

- Migration 036: seeds all 4 source rows (find-tender, contracts-finder, public-contracts-scotland, sell2wales)
- `/api/cron/sync-sources`: daily sync at 06:00 UTC via vercel.json cron
- All remaining `@/lib/supabase` → `@/lib/supabase-service` migration complete (S-004 cleanup done)

---

## 2026-06-05 — Phases 5+6: readiness score + evidence gap engine

### Added (commit 2703a03)

**Phase 5 — readiness score:**

- `lib/readiness.ts`: IT/Cyber and Facilities vertical checklists; keyword + evidence_type matching; weighted scoring (3/2/1); expiring = 0.5 weight; returns 0-100 score + per-item coverage
- `GET /api/clients/[id]/readiness`: org-scoped, returns ReadinessScore or "unsupported vertical" message
- `/clients/[id]` ReadinessWidget: circular SVG gauge, progress bar, checklist rows with coverage icons (✓/⚠/✕/–), weight labels, "Add missing evidence →" link

**Phase 6 — evidence gap engine:**

- `lib/evidence-gap.ts`: 14 REQUIREMENT_SIGNALS mapping bid phrases (ISO 27001, GDPR, PI insurance, case studies, etc.) → evidence_type + keywords; coverage: covered/partial/expired/missing; no AI tokens
- `GET /api/opportunities/[id]/evidence-gaps?clientId=`: maps requirement-class questions → client evidence; falls back to all non-guidance questions; returns GapReport with counts and per-item results
- `OpportunityTabs`: added "Evidence Gaps" tab at `/opportunities/[id]/gaps`
- `/opportunities/[id]/gaps` page: auto-selects client from pipeline; score gauge; coverage filter pills; colour-coded requirement cards with left border, risk badge, "Add →" link

---

## 2026-06-05 — Phase 5: scoped RAG + fit scoring persistence

### Added (commit cc77f01)

**Scoped RAG per client:**

- Migration 034: `hybrid_search_chunks` extended with `p_client_id`; retrieval includes client-specific docs + shared org docs when set, all org docs when null
- `retrieveChunks()`: new optional `clientId` param forwarded to RPC
- `answer-all` route: reads `bid_pipeline.client_id` for the opportunity+org, scopes AI retrieval to that client's evidence
- `ask` route: accepts optional `client_id` in request body, scopes retrieval; UI can pass it when in a client context
- `rfp/answer-batch`: imports from `supabase-service` (cleanup)

**Fit score persistence:**

- Migration 035: `bid_pipeline` gains `fit_score`, `readiness_score`, `recommended_action`, `score_reasons[]`, `score_risks[]`, `scored_at`
- `analyse` route: updates `bid_pipeline` row with scores after analysis so pipeline page shows scores without re-running
- Pipeline page: `ACTION_STYLES` lookup added; recommended_action badge (Bid/Maybe/Needs review/Do not bid) + `fit N · ready N` monospace chip on each card

---

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
