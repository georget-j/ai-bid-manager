# Handover — ai-rfp-agent

**Date:** 2026-06-06  
**Previous model:** claude-sonnet-4-6  
**Continuing with:** claude-opus-4-8  
**Live demo:** https://ai-rfp-agent-ten.vercel.app  
**Repo:** georget-j/ai-rfp-agent (main branch, auto-deploys to Vercel)

---

## What this project is

A UK public-sector bid operating system for bid agencies serving SME suppliers. The strategic wedge is the IT/cyber vertical. It ingests procurement opportunities (Find-a-Tender, Contracts Finder etc.), helps users assess fit, and produces polished tender responses.

**Read before coding:**

1. `docs/market-wedge-strategy-v3/MARKET_WEDGE_EXECUTION_TRACKER_v3.md`
2. `docs/market-wedge-strategy-v3/MARKET_WEDGE_NEXT_ACTIONS_v3.md`
3. `docs/market-wedge-strategy-v3/MARKET_WEDGE_SECURITY_PLAN_v3.md`

**Stack:** Next.js App Router, TypeScript, Supabase (Postgres + pgvector), OpenAI (`gpt-4o-mini` + `text-embedding-3-small`), Vercel

---

## What was built in this session

### 1. Evidence Gaps improvements (3 phases, all shipped)

`app/opportunities/[id]/gaps/page.tsx` + `lib/evidence-gap.ts`

- **Phase 1:** Gap results now sorted by risk (mandatory missing → expiring → covered). Mandatory badge on each card. Expiry dates shown inline on matched evidence pills. Amber "Expiring soon" callout. "We looked for: X, Y" hints on missing cards.
- **Phase 2:** Inline "Quick add evidence" form on missing/expired cards — POSTs to existing `/api/clients/[id]/evidence`, auto-refreshes gap analysis. Pre-fills evidence type from detected signal.
- **Phase 3:** "Analyse with AI" button — POST `/api/opportunities/[id]/ai-gap-match` sends all requirements + evidence vault to GPT-4o-mini, returns per-requirement coverage + confidence + one-sentence reason. Cached in `bid_pipeline.ai_gap_analysis` JSONB (migration 039, applied). "Clear" button forces regen.

### 2. RFP Response workflow — complete rework (4 phases, all shipped)

The old `QuestionsPanel.tsx` (1778 lines on the Details tab) is **deleted**. The full workflow now lives on the **RFP Response tab** (`/opportunities/[id]/rfp`).

**New files:**

- `app/opportunities/[id]/rfp/RFPWorkflow.tsx` — main client component, 7 sequential sections
- `app/opportunities/[id]/rfp/RequirementsSection.tsx` — compliance requirements section
- `app/opportunities/[id]/rfp/QuestionsSection.tsx` — questions section + ExportSection
- `app/api/opportunities/[id]/summarise/route.ts` — streams 3-bullet AI tender summary

**Deleted files:**

- `app/opportunities/[id]/QuestionsPanel.tsx`
- `app/opportunities/[id]/rfp/RFPResponseContent.tsx`

**The 7-step workflow:**

1. Tender overview (title, buyer, deadline, value, CPV, links)
2. What this tender wants (description + "Summarise with AI" → streams 3 bullets)
3. Tender documents (per-doc extract rows, drag-drop fallback, extract-all, manual upload)
4. Extract from description (preview before save, re-extract with confirmation)
5. Compliance requirements — AI drafts a compliance statement per requirement; fit badge (High/Review/Gap) from confidence_level; edit/approve/regenerate; citations
6. Questions to answer — progress bar, filter pills, "Answer all" SSE, approve-all-high-confidence, per-card edit/approve/regenerate/word-count
7. Review & export — live approved counts, mandatory-item warnings, "Export approved only" / "Export all answered" DOCX buttons

**Details tab** (`app/opportunities/[id]/page.tsx`) now only shows opportunity metadata + a compact "Work on response →" card linking to the RFP tab.

### 3. Bug fixes shipped this session

- `refreshCounts()` in RFPWorkflow was treating `{ questions: [] }` API response as a raw array → counts always 0 after extraction → requirements/questions sections never appeared. Fixed.
- `answerAll()` / `draftAll()` were doing `await fetch(all questions)` inside the SSE loop per event → race conditions, answers not showing. Fixed: SSE loop now only reads progress counters; single `loadQuestions()` reload after stream ends.
- `ExportSection` only re-fetched on total count changes, not on individual approvals. Fixed: added `approvalKey` counter in `RFPWorkflow`, incremented on every approval, passed to `ExportSection` as a `useEffect` dependency.

---

## Key architecture

### Database tables (relevant to recent work)

- `opportunity_questions` — `id, opportunity_id, org_id, question_text, question_class (question|requirement|guidance), section_ref, is_mandatory, word_limit, ai_draft, answer_status (unanswered|drafted|needs-review|approved), confidence_level, confidence_score, confidence_reason, citations`
- `bid_pipeline` — `opportunity_id, org_id, client_id, ai_gap_analysis (jsonb, keyed by client_id)`
- `evidence_items` — `id, org_id, client_id, title, evidence_type, status, expires_at, ...`
- `opportunities` — `buyer_briefing (text)` column added (migration 038)

### API routes added this session

- `POST /api/opportunities/[id]/summarise` — streams 3-bullet tender summary
- `POST /api/opportunities/[id]/ai-gap-match` — AI semantic gap matching (cached)
- `DELETE /api/opportunities/[id]/ai-gap-match?clientId=X` — clear cache

### Supabase migrations applied this session

- `038_buyer_briefing.sql` — `buyer_briefing text` on opportunities
- `039_ai_gap_analysis.sql` — `ai_gap_analysis jsonb` on bid_pipeline

### Auth / secrets

- Supabase token: `source ~/.secrets/tokens.sh` then `supabase db query --linked -f <migration>`
- All sensitive tables have `org_id` + RLS policies

---

## Current known issues / potential next work

1. **Answer quality** — all AI calls use `gpt-4o-mini`. Switching `lib/generation.ts` and `lib/retrieval.ts` to Claude (e.g. `claude-sonnet-4-6`) would improve RFP answer quality. The `CHAT_MODEL` constant in `lib/openai.ts` controls the model used for answer generation, extraction, and reranking.

2. **No streaming preview during "Answer all"** — the simplified SSE approach shows a progress counter but answers only appear after the whole batch completes. Could be improved by updating cards optimistically from SSE preview text, but needs careful state management.

3. **Buyer briefing tab** — `app/opportunities/[id]/buyer/page.tsx` exists and works (buyer history + AI briefing), but is not heavily tested.

4. **Tracking docs** — `MARKET_WEDGE_EXECUTION_TRACKER_v3.md` and `MARKET_WEDGE_NEXT_ACTIONS_v3.md` have not been updated to reflect this session's work. Update them before planning next steps.

---

## Useful commands

```bash
# Run dev server
npm run dev

# Typecheck
npx tsc --noEmit

# Apply a migration
source ~/.secrets/tokens.sh
supabase db query --linked -f supabase/migrations/<file>.sql

# Deploy (auto on push to main)
git push
```
