# Session State

This file captures the exact working state. Update it at the end of every session or after every commit.

---

## Last updated

2026-06-05

## Current phase

Phases 5 + 6 core features shipped.

## What was just done

Phase 5 readiness score + Phase 6 evidence gap engine (commit `2703a03`):

**Readiness score:**
- `lib/readiness.ts`: IT/Cyber (9-item) and Facilities (7-item) checklists; keyword + type matching; weighted score 0-100
- `GET /api/clients/[id]/readiness`: full ReadinessScore response
- `/clients/[id]` page: ReadinessWidget — circular gauge, checklist rows with coverage icons, "Add missing evidence →" link

**Evidence gap engine:**
- `lib/evidence-gap.ts`: 14 requirement signal patterns; fast keyword-based matching (no AI tokens); coverage: covered / partial / expired / missing
- `GET /api/opportunities/[id]/evidence-gaps?clientId=`: maps tender requirements → client evidence
- New "Evidence Gaps" tab on every opportunity detail page
- `/opportunities/[id]/gaps` page: client selector (auto-loads from pipeline), score gauge, coverage filter pills, colour-coded requirement cards, risk badges, links to evidence vault

## What to do next

### Option A — Phase 1 (founder, not code)

Talk to 10 bid agencies before building more. This is now the most valuable next step.
Use `MARKET_WEDGE_VALIDATION_AND_GTM_v3.md` interview guide.
Key questions: IT/cyber vs facilities? £500–£2k/month viable?

### Option B — Phase 7: Compliance matrix improvements

Phase 7 checklist has 3 remaining items:
- owner/status fields on compliance_requirements
- risk filtering on matrix UI
- export/copy to spreadsheet

### Option C — Phase 10: Find a Tender live connector

`sources` and `raw_notices` tables exist. Wire up the FTS (Find a Tender Service) API.
Key endpoint: `https://www.find-tender.service.gov.uk/api/1.0/ocds/`
Requires: API key from CCS, connector in `lib/procurement/sync.ts`, admin trigger UI.

### Option D — Bid pack export improvements (Phase 9)

Current DOCX export works. Remaining: include evidence gap report + unresolved risks.
Evidence gap data is now available — wire it into the export.

## Last commit

`2703a03` — feat(phase5+6): readiness score + evidence gap engine

## Branch

`main`

## Open security risks (non-blocking)

S-007 through S-014 in `MARKET_WEDGE_SECURITY_PLAN_v3.md`. None block production use.

## Key files

| Purpose                | File                                                                      |
| ---------------------- | ------------------------------------------------------------------------- |
| Strategy build plan    | `docs/market-wedge-strategy-v3/MARKET_WEDGE_STRATEGY_BUILD_PLAN_v3.md`    |
| Phase tracker          | `docs/market-wedge-strategy-v3/MARKET_WEDGE_EXECUTION_TRACKER_v3.md`      |
| Next tasks             | `docs/market-wedge-strategy-v3/MARKET_WEDGE_NEXT_ACTIONS_v3.md`           |
| Security risks         | `docs/market-wedge-strategy-v3/MARKET_WEDGE_SECURITY_PLAN_v3.md`          |
| Re-entry prompt        | `docs/market-wedge-strategy-v3/MARKET_WEDGE_CLAUDE_CODE_PROMPTS_v3.md`    |
