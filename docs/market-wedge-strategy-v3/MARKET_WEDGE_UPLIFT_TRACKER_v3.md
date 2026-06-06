# Market Wedge — Product Uplift Tracker v3 (ACTIVE INITIATIVE)

> **This is the live recovery anchor for the 7-epic product uplift.**
> If context compacted, re-read this file and resume from the **Current pointer** below —
> do not work from memory. Every phase ends in a git commit + push (a checkpoint).
> Full design rationale: `.claude/plans/on-the-opportunity-rfp-snoopy-crane.md`.

## Current pointer

- **Current epic:** Epic 7 — Contracts Finder ingestion robustness
- **Current phase:** 7.1 (overlap window + cursor resume + populate region) — NEXT
- **Last commit:** `feat(buyers): SVG charts + richer buyer view`
- **Updated:** 2026-06-06
- **Demo opp id:** aab42d69-be4c-4e50-b9aa-400d48b9d249 (`/opportunities/aab42d69-...`)
- **Build:** `npm run build` passes (checkpoint after Epic 6).

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
- [x] 1.2 Importance ranking: mig 044 `priority` col + extract/prompt + pills + sort (mandatory⇒high) · `feat(rfp): AI importance ranking + priority pills (mig 044)`
- [x] 1.3 Ungate evaluation in UI (eval allowed once ≥1 drafted; copy: approval not required) · `feat(rfp): evaluate without approving all` ✅ **EPIC 1 COMPLETE**

## Epic 2 — Opportunities browse filters (Task 1)

- [x] 2.1 Rendered buyer + live/source/value/CPV-sector filters (mig 045: cpv_search + indexes); live-tested. Region deferred → Epic 7 (region/buyer_region are 100% empty in CF data) · `feat(opportunities): working filters + value/CPV/source/status (mig 045)`
- [x] 2.2 Pagination (page param, prev/next preserving filters) + "showing N–M of T" counts · `feat(opportunities): pagination + result counts` ✅ **EPIC 2 COMPLETE**

## Epic 3 — Recommendations live/upcoming (Task 2)

- [x] 3.1 Live-only pool (active + deadline open; was surfacing 139 expired), rank by fit then urgency, pass readiness_score + missing · `feat(recommendations): live/upcoming only + urgency ranking`
- [x] 3.2 Surfacing: "live still-open" subtitle, action chip (Strong fit/Worth a look/Review), "add evidence to improve fit" hint when readiness-limited · `feat(recommendations): clearer "recommended for you" surfacing` ✅ **EPIC 3 COMPLETE**

## Epic 4 — Evidence gaps rebuild (Task 4)

- [x] 4.1 Requirement-only analysis (dropped non-guidance fallback that skewed score); `state` = no-questions/no-requirements/no-evidence/ok + `evidence_count` · `fix(gaps): requirement-only analysis + honest empty states`
- [x] 4.2 State-aware empty states w/ CTAs (add-evidence / go-to-RFP); AI cache invalidated + recomputed on evidence add. (Per-gap type pre-fill + "we looked for" already existed; kept the bar+counts coverage viz.) · `feat(gaps): rebuilt UX with auto-refresh + suggestions` ✅ **EPIC 4 COMPLETE**

## Epic 5 — Opportunity profile + KB cross-link (Task 6)

- [x] 5.1 Mig 046 `opportunity_insights` (org-scoped) + insights route (GET cached / POST generate: summary, key_points, feasibility, gaps) + `OpportunityInsights` rendered on profile · `feat(profile): derived AI insights store (mig 046)`
- [x] 5.2 `kb-cross-ref` route + `OpportunityKnowledgeBase` panel: tender docs → Add to KB, docs already in KB, and related org-KB content via retrieveChunks (opp→KB) · `feat(profile): bidirectional KB cross-referencing`
- [x] 5.3 Seeded `[DEMO]` MDR tender (scripts/seed-demo-opportunity.sql, idempotent, source=demo) — id aab42d69; live/open, rich desc+lots+doc+CPV · `chore(profile): seed one fully-populated demo opportunity` ✅ **EPIC 5 COMPLETE**

## Epic 6 — Buyers tab redo with charts (Task 5)

- [x] 6.1 Mig 047 `buyer_aggregates` RPC (accurate across whole catalog, was capped at 2000) + index switched to RPC + `/buyers/[buyer]` drill-down (KPIs, status + sector breakdown, recent notices) · `feat(buyers): aggregate RPC + buyer drill-down page (mig 047)`
- [x] 6.2 Zero-dep SVG charts (`components/Charts.tsx`: Donut, BarList, Sparkbars) → drill-down status donut + sector bars + 12-month activity; index mini volume bars · `feat(buyers): SVG charts + richer buyer view` ✅ **EPIC 6 COMPLETE**

## Epic 7 — Contracts Finder ingestion robustness (Task 7)

- [ ] 7.1 Overlap window + cursor resume + time budget. **Also: populate `buyer_region`/`region` from the OCDS payload** (currently 100% empty → blocks the region filter, Epic 2) · `fix(ingest): overlap window + cursor resume`
- [ ] 7.2 Mig 048 sync-health monitoring + error surfacing · `feat(ingest): sync-health monitoring + error surfacing (mig 048)`
- [ ] 7.3 Bounded rolling catch-up · `feat(ingest): bounded rolling catch-up for missed windows`

---

## Per-phase verification gates

- `npx tsc --noEmit` clean + `npm run lint` after every phase.
- `npm run test:isolation` after any migration touching RLS/org-scoped tables.
- Each migration applied by hand to Supabase (idempotent), smoke-tested on one real
  record before committing dependent code.
