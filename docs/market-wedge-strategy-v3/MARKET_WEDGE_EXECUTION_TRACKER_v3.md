# Market Wedge Execution Tracker v3

## Current strategic phase

- [x] Phase 0 — Security and repo audit ← COMPLETED 2026-06-05
- [ ] Phase 1 — Wedge validation assets
- [x] Phase 2 — Production security foundation ← CRITICAL FIXES DONE 2026-06-05
- [ ] Phase 3 — Agency/client workspace foundation
- [ ] Phase 4 — Evidence vault and readiness
- [ ] Phase 5 — Opportunity intake and analysis
- [ ] Phase 6 — Evidence gap engine
- [ ] Phase 7 — Compliance matrix generator
- [ ] Phase 8 — Evidence-backed response drafting
- [ ] Phase 9 — Review workflow and bid pack export
- [ ] Phase 10 — Find a Tender connector
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

Phase 2 critical security fixes complete. Phase gate cleared for real org onboarding.

Next: Phase 1 (founder outreach to bid agencies) in parallel with Phase 3 (agency/client workspace design).

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

- [ ] Decide agency/client schema
- [ ] Create client workspace model
- [ ] Add clients page
- [ ] Add client detail page
- [ ] Add client profile page
- [ ] Add permissions
- [ ] Add client data isolation tests

---

### Phase 4 — Evidence vault and readiness

- [ ] Create evidence item model
- [ ] Create evidence types for first vertical
- [ ] Add evidence dashboard
- [ ] Add evidence upload/linking
- [ ] Add expiry tracking
- [ ] Add readiness score
- [ ] Add missing evidence view
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

- [ ] Map requirements to evidence types
- [ ] Detect missing evidence
- [ ] Detect expired evidence
- [ ] Assign risk levels
- [ ] Show evidence coverage score
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
