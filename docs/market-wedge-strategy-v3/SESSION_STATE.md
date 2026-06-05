# Session State

This file captures the exact working state. Update it at the end of every session or after every commit.

---

## Last updated

2026-06-05

## Current phase

Phase 5 in progress. Scoped RAG + fit scoring persistence shipped.

## What was just done

Phase 5 — scoped RAG + fit scoring (commit `cc77f01`):

**Scoped RAG per client:**
- Migration 034: `hybrid_search_chunks` RPC extended with `p_client_id`; includes shared org docs + client-specific docs when set
- `retrieveChunks()`: accepts `clientId?`, passes to RPC
- `answer-all` route: looks up `bid_pipeline.client_id` for the opportunity before answering — AI now draws from the correct client's evidence vault
- `ask` route: accepts optional `client_id` in request body
- `rfp/answer-batch`: migrated to `supabase-service`

**Fit score persistence:**
- Migration 035: `bid_pipeline` gains `fit_score`, `readiness_score`, `recommended_action`, `score_reasons[]`, `score_risks[]`, `scored_at`
- `analyse` route: saves scores to `bid_pipeline` row after scoring (so scores persist without re-running)
- Pipeline page: shows recommended_action badge + `fit N · ready N` chip on each card

## What to do next

### Option A — Phase 1 (founder, not code)

Talk to 10 bid agencies before building more.
Use `MARKET_WEDGE_VALIDATION_AND_GTM_v3.md` interview guide.
Key question: IT/cyber vs facilities? Would they pay £500–£2k/month?

### Option B — Phase 5: Readiness score on client detail

Evidence vault is live. Next: compute a readiness score from evidence items against a vertical checklist.
Show score on `/clients/[id]` and flag expiring/missing items.

### Option C — Phase 6: Evidence gap engine

For a given opportunity + client, compare extracted requirements against evidence vault.
Output: per-requirement coverage (strong / weak / missing), risk level, evidence request draft.

### Option D — Phase 10: Find a Tender live connector

`sources` and `raw_notices` tables exist. Wire up the FTS API to auto-populate opportunities.

## Last commit

`cc77f01` — feat(phase5): scoped RAG per client + fit score persistence

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
