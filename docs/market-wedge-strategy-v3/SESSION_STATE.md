# Session State

This file captures the exact working state. Update it at the end of every session or after every commit.

---

## Last updated

2026-06-05

## Current phase

Phases 3 + 4 complete. Evidence vault live.

## What was just done

Phase 3 client_id wiring + Phase 4 evidence vault (commit `e007270`):

- OpportunityActions: client selector — saves client_id to pipeline row; restored on load
- Pipeline page: client filter dropdown + client name badge per card linking to /clients/[id]
- DocumentUpload: "Scope to client" selector; client_id saved on documents row
- ingestDocument / upload route: accept and persist client_id
- Migration 033: evidence_items table with auto-expiry trigger (valid/expiring_soon/expired)
- GET/POST `/api/clients/[id]/evidence` + PATCH/DELETE `/api/clients/[id]/evidence/[eid]`
- `/clients/[id]/evidence` — vault UI: status summary, type filter pills, add/edit/delete forms
- `/clients/[id]` detail — evidence vault card links live to the vault page

## What to do next

### Option A — Phase 1 (founder, not code)

Talk to 10 bid agencies before building more.
Use `MARKET_WEDGE_VALIDATION_AND_GTM_v3.md` interview guide.
Key question: IT/cyber vs facilities? Would they pay £500–£2k/month?

### Option B — Phase 5: Opportunity fit scoring

Remaining Phase 5 gaps:

- Numeric fit score badge on opportunity detail page
- Bid/no-bid recommendation label (analysis already runs, just no visible badge)

### Option C — Phase 5: Scoped RAG per client

When running Ask or answering ITT questions, scope retrieval to the selected client's documents.
Requires updating `hybrid_search_chunks` RPC with optional `p_client_id`, and passing it through
all `retrieveChunks` callers when a client context is known.

## Last commit

`e007270` — feat(phase3+4): wire client_id + evidence vault

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
| Repo snapshot          | `docs/market-wedge-strategy-v3/MARKET_WEDGE_REPO_STATE_v3.md`             |
| Architecture decisions | `docs/market-wedge-strategy-v3/MARKET_WEDGE_ARCHITECTURE_DECISIONS_v3.md` |
| Changelog              | `docs/market-wedge-strategy-v3/MARKET_WEDGE_CHANGELOG_v3.md`              |
| Re-entry prompt        | `docs/market-wedge-strategy-v3/MARKET_WEDGE_CLAUDE_CODE_PROMPTS_v3.md`    |
