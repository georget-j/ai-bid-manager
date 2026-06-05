# Session State

This file captures the exact working state. Update it at the end of every session or after every commit.

---

## Last updated

2026-06-05

## Current phase

Phase 3 foundation shipped. Clients model live.

Next: Phase 1 (founder outreach — parallel) + continue Phase 3 (link clients to opportunities/documents in UI).

## What was just done

Phase 3 agency/client workspace foundation:

- Migration 031: `clients` table (org_id, name, vertical, status, website, notes) + RLS
- Migration 032: nullable `client_id` FK added to documents, opportunity_questions, bid_pipeline, compliance_matrices
- API: `GET/POST /api/clients` + `GET/PATCH/DELETE /api/clients/[id]` (org-scoped, Zod-validated)
- UI: `/clients` list page + `/clients/[id]` detail page with inline edit, archive, placeholder Phase 4 cards
- Clients nav item added to sidebar (top of Intelligence section)
- 3 new isolation tests in `tests/tenant-isolation.test.ts`

All committed (`b674c7d`) and pushed.

## What to do next

### Option A — Phase 1 (founder, not code)

Talk to 10 bid agencies before building more.
See `MARKET_WEDGE_VALIDATION_AND_GTM_v3.md` for interview guide.
Key question: Is IT/cyber the right vertical? Would they pay £500–£2k/month?

### Option B — Continue Phase 3

Wire `client_id` into the opportunity/documents UI so agency users can filter by client.
Steps:

1. Add client selector to opportunity detail page (set `client_id` on opportunity_questions and bid_pipeline rows)
2. Add client filter to `/pipeline` page
3. Add client selector to document upload

### Option C — Phase 4: Evidence vault

Start the evidence item model (certifications, policies, case studies) for a selected client.
Design needed first: evidence types for IT/cyber vertical.

## Last commit

`b674c7d` — feat(phase3): agency/client workspace foundation

## Branch

`main`

## Open security risks (non-blocking)

S-007 through S-014 are documented in `MARKET_WEDGE_SECURITY_PLAN_v3.md`.
None block production use. Address in future sprints.

## Key files

| Purpose                | File                                                                      |
| ---------------------- | ------------------------------------------------------------------------- |
| Strategy build plan    | `docs/market-wedge-strategy-v3/MARKET_WEDGE_STRATEGY_BUILD_PLAN_v3.md`    |
| Phase tracker          | `docs/market-wedge-strategy-v3/MARKET_WEDGE_EXECUTION_TRACKER_v3.md`      |
| Next tasks             | `docs/market-wedge-strategy-v3/MARKET_WEDGE_NEXT_ACTIONS_v3.md`           |
| Security risks         | `docs/market-wedge-strategy-v3/MARKET_WEDGE_SECURITY_PLAN_v3.md`          |
| Repo snapshot          | `docs/market-wedge-strategy-v3/MARKET_WEDGE_REPO_STATE_v3.md`             |
| Architecture decisions | `docs/market-wedge-strategy-v3/MARKET_WEDGE_ARCHITECTURE_DECISIONS_v3.md` |
| Changelog              | `docs/market-wedge-strategy-v3/MARKET_WEDGE_CHANGELOG_v3.md`              |
| Re-entry prompt        | `docs/market-wedge-strategy-v3/MARKET_WEDGE_CLAUDE_CODE_PROMPTS_v3.md`    |
