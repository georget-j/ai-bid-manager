# Market Wedge — Product Uplift Tracker v3 (ACTIVE INITIATIVE)

> **This is the live recovery anchor for the 7-epic product uplift.**
> If context compacted, re-read this file and resume from the **Current pointer** below —
> do not work from memory. Every phase ends in a git commit + push (a checkpoint).
> Full design rationale: `.claude/plans/on-the-opportunity-rfp-snoopy-crane.md`.

## Current pointer

- **Current epic:** Epic 1 — RFP response
- **Current phase:** 1.2 (importance ranking, mig 044) — NEXT
- **Last commit:** `fix(rfp): surface generation failures + maxDuration guard`
- **Updated:** 2026-06-06

## How to resume after compaction

1. Read this file's Current pointer.
2. Read the matching epic/phase block below for goal + files + commit message.
3. Read `.claude/plans/on-the-opportunity-rfp-snoopy-crane.md` for full detail.
4. Continue from the first unticked box. Do not restart completed phases.

## Update rule (run after EVERY phase)

Tick the box → update Current pointer (epic/phase/last commit) → add a
`MARKET_WEDGE_CHANGELOG_v3.md` entry → `git commit` + `git push`.

---

## Decisions (locked)

- Execution: autonomous, checkpoint per phase.
- Buyer charts: custom SVG, zero new deps (reuse `ReadinessWidget`).
- Ingestion: robust & safe (overlap lookback, cursor resume, higher caps, monitoring).
- Profile data: derive + cross-link + seed ONE demo; never alter real notices.
- Models stay `gpt-4o-mini` / `text-embedding-3-small`. Migrations idempotent + additive.
- Pre-allocated migrations: **044** Epic 1 · **045** Epic 2 · **046** Epic 5 · **047** Epic 6 · **048** Epic 7.

---

## Epic 1 — RFP response (Task 3)

- [x] 1.1 Harden `answer-all` (maxDuration=60; catch writes `confidence_reason`, no blank card); verified mig 043 live on 5-arg overload · `fix(rfp): surface generation failures + maxDuration guard`
- [ ] 1.2 Importance ranking: mig 044 `priority` col + extract/prompt + pills + sort · `feat(rfp): AI importance ranking + priority pills (mig 044)`
- [ ] 1.3 Ungate evaluation in UI (eval allowed once ≥1 drafted) · `feat(rfp): evaluate without approving all`

## Epic 2 — Opportunities browse filters (Task 1)

- [ ] 2.1 Render region/buyer + add live/source/value/CPV filters (mig 045 indexes) · `feat(opportunities): working filters + value/CPV/source/status (mig 045)`
- [ ] 2.2 Pagination + result counts · `feat(opportunities): pagination + result counts`

## Epic 3 — Recommendations live/upcoming (Task 2)

- [ ] 3.1 Live/upcoming only + urgency-aware ranking · `feat(recommendations): live/upcoming only + urgency ranking`
- [ ] 3.2 "Recommended for you" surfacing · `feat(recommendations): clearer "recommended for you" surfacing`

## Epic 4 — Evidence gaps rebuild (Task 4)

- [ ] 4.1 Requirement-only analysis + honest empty states · `fix(gaps): requirement-only analysis + honest empty states`
- [ ] 4.2 UX rebuild + auto-refresh + suggestions · `feat(gaps): rebuilt UX with auto-refresh + suggestions`

## Epic 5 — Opportunity profile + KB cross-link (Task 6)

- [ ] 5.1 Mig 046 `opportunity_insights` (org-scoped) + AI summary route · `feat(profile): derived AI insights store (mig 046)`
- [ ] 5.2 Bidirectional KB cross-referencing · `feat(profile): bidirectional KB cross-referencing`
- [ ] 5.3 Seed one fully-populated demo opportunity · `chore(profile): seed one fully-populated demo opportunity`

## Epic 6 — Buyers tab redo with charts (Task 5)

- [ ] 6.1 Mig 047 buyer-aggregate RPC + `/buyers/[buyer]` drill-down · `feat(buyers): aggregate RPC + buyer drill-down page (mig 047)`
- [ ] 6.2 Custom SVG charts (donut/bars/sparkline + ring) · `feat(buyers): SVG charts + richer buyer view`

## Epic 7 — Contracts Finder ingestion robustness (Task 7)

- [ ] 7.1 Overlap window + cursor resume + time budget · `fix(ingest): overlap window + cursor resume`
- [ ] 7.2 Mig 048 sync-health monitoring + error surfacing · `feat(ingest): sync-health monitoring + error surfacing (mig 048)`
- [ ] 7.3 Bounded rolling catch-up · `feat(ingest): bounded rolling catch-up for missed windows`

---

## Per-phase verification gates

- `npx tsc --noEmit` clean + `npm run lint` after every phase.
- `npm run test:isolation` after any migration touching RLS/org-scoped tables.
- Each migration applied by hand to Supabase (idempotent), smoke-tested on one real
  record before committing dependent code.
