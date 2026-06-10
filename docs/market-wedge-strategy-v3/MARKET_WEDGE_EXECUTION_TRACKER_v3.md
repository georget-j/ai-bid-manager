# Market Wedge Execution Tracker v3

> **GRANTS GUIDED-UX OVERHAUL — COMPLETE (2026-06-10, no new migration; next free still 068).**
> The grant view→understand→respond journey is now a guided, plain-English step-by-step flow for
> non-technical users: `lib/grants/application-flow.ts` (single source of truth) +
> `app/rfp/drafts/[id]/GrantApplicationFlow.tsx` (sticky 6-step spine reusing the existing panels).
> Grant detail one-CTA + auto-surfaced guide; discover cross-links + deadlines; budget in DOCX
> export; profile `#grant-eligibility` + grant fields in completeness. 5 phases `096548e`→`b68b890`.
> See CHANGELOG + ADR-grants-guided-flow. Optional remaining: a robust extra open-call source; config
> keys (Companies House / Charity Commission / Resend).
>
> **GRANTS FEATURE — COMPLETE (2026-06-10)** (migs 058–061). Discovery (list/detail) + confidence
> scoring (eligibility card + `/my-grants`) + KB-grounded applications + funder directory +
> **open-call connectors** (GOV.UK Find a Grant 112 + Innovate UK 25) + **grant alerts** (reuse
> alert_rules, mig 061) + **investor programmes feed** (`/programmes`, curated). Catalogue: ~137 open +
> 100 awarded. **Optional follow-ons only:** Companies House + Charity Commission API keys (register
> auto-enrich); paid investor-event data (Eventbrite search API dead since Feb 2020 → needs
> Dealroom/Crunchbase + data agreement).
> See `MARKET_WEDGE_GRANTS_STRATEGY_v3.md` + `MARKET_WEDGE_NEXT_ACTIONS_v3.md`.
>
> **PRIOR (2026-06-09): Database query performance review** — 4 phases COMPLETE & pushed
> (`43cac95` indexes mig 056, `78f701b` narrow selects, `b448922` bulk-action N+1, `c637ab0` RLS
> consistency mig 057). Right-sized to live data (8k opportunities); headline list `title ILIKE`
> 419ms→0.3ms. Perf follow-ups only past ~100k rows (estimated counts, materialized KPIs).
> Prior (same day): **Org roles & teams · responses workspace · review concurrency**
> (`55acdb5`, `8055e23`, `106001e`; migs 054 + 055) — follow-ups: invite-email, real-time co-edit,
> review locking UI.
> Prior: opportunity docs · buyer web research · profile buildout · UX review (2026-06-08);
> **Sources Hardening** → `MARKET_WEDGE_SOURCES_HARDENING_v3.md`.
> (7-epic product uplift COMPLETE → `MARKET_WEDGE_UPLIFT_TRACKER_v3.md`.)

## Current strategic phase

- [x] Phase 0 — Security and repo audit ← COMPLETED 2026-06-05
- [ ] Phase 1 — Wedge validation assets
- [x] Phase 2 — Production security foundation ← CRITICAL FIXES DONE 2026-06-05
- [x] Phase 3 — Agency/client workspace foundation ← COMPLETE 2026-06-05
- [x] Phase 4 — Evidence vault and readiness ← FOUNDATION SHIPPED 2026-06-05
- [x] Phase 5 — Opportunity intake and analysis ← CORE FEATURES SHIPPED 2026-06-05
- [x] Phase 6 — Evidence gap engine ← CORE SHIPPED 2026-06-05
- [x] Phase 7 — Compliance matrix generator ← CORE SHIPPED 2026-06-05
- [ ] Phase 8 — Evidence-backed response drafting
- [x] Phase 9 — Review workflow and bid pack export ← CORE SHIPPED 2026-06-05
- [x] Phase 10 — Find a Tender connector ← DAILY CRON + SEEDED 2026-06-05
- [ ] Phase 11 — Paid pilot workflow
- [ ] Phase 12 — Productisation
- [ ] Phase 13 — Bid memory and evidence graph
- [ ] Phase 14 — Growth and agency expansion

## Status legend

```text
Not started
Planned
In progress
Blocked
Implemented
Tested
Documented
Shipped
```

## Current objective

All core product phases shipped. The opportunity RFP workflow was reworked end-to-end
in a 4-phase effort (2026-06-06) fixing the step-3 bug and adding central document
storage, provenance, unapprove, a mandatory export gate, and response re-evaluation.

RFP rework commits (2026-06-06):

- `d3e8c41` — Phase 1: central tender document store + dedup (migration 040)
- `25dacac` — Phase 2: unified "Get all details" extraction + provenance (migration 041)
- `69d7ddc` — Phase 3: provenance chips, unapprove, mandatory export gate
- Phase 4: response re-evaluation + scoring visual (migration 042)

Migrations 040–043 applied to Supabase. Tenant-isolation suite made runnable
(seeds test orgs) — 9/9 pass.

Live end-to-end testing (real login against the deployed app) surfaced and fixed
two pre-existing production bugs:

- DOCX export 404 — `export-response` selected a non-existent `source_id` column
  (commit cb82ab1, deployed).
- **RAG retrieval broken** — `hybrid_search_chunks` threw "column reference id is
  ambiguous" on every call, so all AI answers came back empty. Fixed in migration
  043 (applied). Verified live: real grounded drafts + re-evaluation now work.

Next: Phase 1 (founder outreach — no code needed) or Phase 11 (pilot workflow setup).
See MARKET_WEDGE_NEXT_ACTIONS_v3.md for options.

## Current blocker

None. Phase gate conditions met.

## Next action

See MARKET_WEDGE_NEXT_ACTIONS_v3.md.

---

## Detailed checklist

### Phase 0 — Security and repo audit

- [x] Inspect package.json
- [x] Inspect app routes
- [x] Inspect API routes
- [x] Inspect Supabase migrations
- [x] Inspect RAG logic
- [x] Inspect document upload flow
- [x] Inspect embedding/vector search flow
- [x] Inspect review queue
- [x] Inspect admin routes
- [x] Inspect tests
- [x] Document auth status
- [x] Document RLS status
- [x] Document tenant isolation gaps
- [x] Document document privacy gaps
- [x] Document service role key usage
- [x] Document RAG scoping risk
- [x] Document source sync/admin risk
- [x] Update tracker and next actions

**Output files:**

- `MARKET_WEDGE_REPO_STATE_v3.md` — full repo snapshot
- `MARKET_WEDGE_SECURITY_PLAN_v3.md` — security risks S-001 to S-014

---

### Phase 1 — Wedge validation assets

- [ ] Create customer interview script
- [ ] Create ICP scorecard
- [ ] Create pilot offer
- [ ] Create validation tracker
- [ ] Define first vertical
- [ ] Define target list fields
- [ ] Track 30 interviews
- [ ] Track paid pilot interest

---

### Phase 2 — Production security foundation

Critical security fixes (must complete before onboarding real orgs):

- [x] S-001: Add org_id + RLS to tender_doc_cache (migration 030)
- [x] S-002: Add requireAdmin() to /api/admin/integrations GET
- [x] S-003: Make CRON_SECRET required — 401 if missing
- [x] S-004: Split lib/supabase.ts into client + server files
- [x] S-005: Add cross-tenant retrieval tests (tests/tenant-isolation.test.ts)
- [x] S-006: Fix rate limit fail-open logging

Then:

- [ ] Implement/confirm auth ← Already implemented
- [ ] Create organisation model ← Already implemented
- [ ] Create membership model ← Already implemented
- [ ] Add roles ← Partial (email-list admin; needs DB role for Phase 3)
- [ ] Add organisation_id to sensitive tables ← Mostly done; gaps documented
- [ ] Add RLS policies ← Mostly done; gaps documented
- [ ] Scope RAG retrieval ← Done
- [ ] Scope citations ← Done
- [ ] Protect admin routes ← Mostly done; S-002 outstanding
- [ ] Protect uploads ← Done
- [ ] Add upload validation ← Done
- [ ] Add audit logging ← Partial
- [ ] Add rate limits ← Done; S-006 outstanding
- [ ] Add tenant isolation tests ← Not done (S-005)

---

### Phase 3 — Agency/client workspace foundation

- [x] Decide agency/client schema (Option A: clients as separate table)
- [x] Create client workspace model (clients table, migration 031)
- [x] Add clients page (/clients list with create form)
- [x] Add client detail page (/clients/[id] with edit + archive)
- [x] Add client profile page (placeholder; Phase 4 fills this)
- [ ] Add permissions (email-list admin for now; DB role in Phase 4)
- [x] Add client data isolation tests (tenant-isolation.test.ts — 3 tests)
- [x] Wire client_id into opportunity/documents UI (filter by client)

---

### Phase 4 — Evidence vault and readiness

- [x] Create evidence item model (evidence_items table, migration 033)
- [x] Create evidence types for first vertical (certification, policy, case_study, financial, accreditation, reference, other)
- [x] Add evidence dashboard (/clients/[id]/evidence with status summary + type filters)
- [x] Add evidence upload/linking (add form with dates, issuer, reference; document_id FK for future)
- [x] Add expiry tracking (auto-trigger sets valid/expiring_soon/expired based on expires_at)
- [ ] Add readiness score (Phase 5 — requires vertical checklist to score against)
- [ ] Add missing evidence view (Phase 5 — requires vertical evidence checklist)
- [ ] Add evidence access tests

---

### Phase 5 — Opportunity intake and analysis

Already partially implemented:

- [x] Add opportunity model
- [x] Add manual opportunity creation (via admin)
- [x] Add tender document attachment
- [x] Add opportunity detail page
- [ ] Add fit scoring (partial — analysis exists, no numeric score)
- [ ] Add readiness scoring
- [ ] Add recommendation labels
- [x] Add pipeline action

---

### Phase 6 — Evidence gap engine

- [x] Map requirements to evidence types (REQUIREMENT_SIGNALS + AI semantic match)
- [x] Detect missing evidence
- [x] Detect expired evidence (expiry dates surfaced on matched pills)
- [x] Assign risk levels (sort by risk: mandatory-missing → expiring → covered)
- [x] Show evidence coverage score (coverage counts + AI confidence per requirement)
- [ ] Create evidence request draft

---

### Phase 7 — Compliance matrix generator

Partially implemented:

- [x] Extract requirements from tender docs (via opportunity_questions)
- [x] Create compliance matrix model
- [x] Add matrix UI
- [ ] Add owner/status fields (partial)
- [ ] Add risk filtering
- [ ] Add export/copy support

---

### Phase 8 — Evidence-backed response drafting

Substantially implemented:

- [x] Generate draft answers
- [x] Include citations
- [x] Show confidence
- [x] Show missing evidence (in generation output; not surfaced in bid pack)
- [x] Route risky answers to review
- [ ] Store approved answers linked to evidence vault

---

### Phase 9 — Review workflow and export

Substantially implemented:

- [x] Extend review items with opportunity context
- [x] Add approve/edit/reject actions
- [x] Add bid pack export (DOCX)
- [ ] Include unresolved risks in export
- [ ] Store final approved answer versions in bid memory

---

### Phase 10 — Find a Tender connector

- [ ] Create source model ← sources table exists
- [ ] Create raw notice model ← raw_notices table exists
- [ ] Implement connector
- [ ] Store raw payloads
- [ ] Hash payloads
- [ ] Normalise notices
- [ ] Deduplicate opportunities
- [ ] Protect sync route
- [ ] Add sync status UI
