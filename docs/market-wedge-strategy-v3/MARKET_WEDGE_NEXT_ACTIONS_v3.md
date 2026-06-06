# Market Wedge Next Actions v3

## Current objective

All core product phases shipped. Product is ready to show to real agencies. The RFP
Response workflow was reworked into a single 7-step tab (2026-06-06).

Last commits (2026-06-06):

- `ffe2192` — RFP: answers visible after generation; export updates on approval
- `b4a9589` — RFP: delete QuestionsPanel (1778 lines) — workflow moved to RFP tab
- `76e8bde` — RFP: requirements + questions + export sections (7-step workflow)
- `772f2c3` — Gaps: AI semantic gap matching with confidence reasons (migration 039)

---

## Completed phases (all done as of 2026-06-05)

- [x] Phase 0 — Security and repo audit
- [x] Phase 2 — Production security foundation (S-001 through S-006 cleared)
- [x] Phase 3 — Agency/client workspace (clients table, list/detail pages, isolation tests)
- [x] Phase 4 — Evidence vault (evidence_items, expiry tracking, status dashboard)
- [x] Phase 5 — Opportunity intake and analysis (scoped RAG, fit scoring persistence)
- [x] Phase 6 — Evidence gap engine (REQUIREMENT_SIGNALS, gap tab, DOCX appendix)
- [x] Phase 7 — Compliance matrix generator (extract requirements, matrix UI, markdown copy)
- [x] Phase 8 — Evidence-backed response drafting (draft answers, citations, confidence, routing)
- [x] Phase 9 — Review workflow and bid pack export (approve/edit/reject, DOCX export)
- [x] Phase 10 — Find a Tender connector (daily cron, all 4 connectors seeded, sources page)
- [x] Phase 2B — Client account provisioning (invite flow, auth callback, admin UI)
- [x] Phase UX — AI answer visibility fix + admin access control
- [x] Phase UX2 — RFP Response workflow rework (7-step tab) + evidence gap engine UX (2026-06-06)
- [x] Phase UX3 — RFP deep rework: central tender doc store + dedup (mig 040), unified
      "Get all details" extraction + provenance (mig 041), per-card provenance/unapprove +
      mandatory export gate, response re-evaluation + scoring visual (mig 042). 4 phases,
      commits d3e8c41 / 25dacac / 69d7ddc / Phase 4 (2026-06-06)

---

## What to do next

### Option A — Phase 1: Founder outreach (not code — highest value now)

The product demonstrates the full workflow end-to-end. This is the right moment to talk to bid agencies.

Target: 10 discovery calls with UK bid agencies serving SME suppliers.

Questions to answer:

- Do bid agencies want a workspace tool for client evidence?
- What evidence formats do they manage (Word, PDF, ISO certs)?
- Is IT/Cyber the right first vertical, or is Facilities Management better?
- Would they pay £500–£2,000/month for this?
- Would they want to provision logins for their clients?

Use interview guide in `MARKET_WEDGE_VALIDATION_AND_GTM_v3.md`.

---

### Option B — Phase 11: Pilot workflow setup

Prepare the product for a first paid pilot:

- Create a demo client workspace with realistic sample evidence (certs, policies, case studies)
- Run a backfill of recent Find a Tender notices via Sources admin → "Sync now"
- Document step-by-step pilot onboarding for an agency
- Add a simple feedback capture on generated answers ("Was this useful?")
- Ensure CRON_SECRET and NEXT_PUBLIC_APP_URL are set and working in Vercel (done)

---

### Option C — Phase 12: Productisation / onboarding

Make the product self-serve for new agencies:

- Guided onboarding flow for new organisations (profile setup wizard)
- Empty states with helpful CTAs on all key pages
- "Getting started" checklist on dashboard
- Vertical selector on org setup (IT/Cyber, Facilities, Construction, etc.)
- Error boundary + friendly error pages (app/error.tsx exists, check coverage)

---

### Option D — Phase 13: Bid memory (answer bank)

Build a reusable answer layer on top of the approved answers flow:

- Store approved answers as reusable entries in `answer_library`
- Link approved answers to evidence items used
- Show "previously used N times" on each answer in the question panel
- Surface the answer library as a searchable page

---

### Option E — Technical polish (carried over from 2026-06-06 handover)

Concrete code follow-ups flagged after the RFP rework:

1. **Answer quality — move generation off `gpt-4o-mini`.** `CHAT_MODEL` in `lib/openai.ts`
   drives answer generation, extraction, and reranking. Switching `lib/generation.ts` /
   `lib/retrieval.ts` to Claude (e.g. `claude-sonnet-4-6`) is the single highest-leverage
   quality win for RFP answers. Highest value of the technical items.
2. **Streaming preview during "Answer all".** The simplified SSE loop only shows a progress
   counter; answers appear after the whole batch finishes. Update cards optimistically from
   SSE preview text — needs careful state management in `RFPWorkflow.tsx`.
3. ~~**Buyer briefing tab** verify end-to-end~~ — DONE 2026-06-06. Verified end-to-end
   (page renders, routes auth-gate, AI briefing generates grounded content against real
   data). Fixed a real bug: "Regenerate" returned cached text — now supports `?refresh=true`
   cache-bypass. Remaining: still on `gpt-4o-mini` (see item 1); no auth-session HTTP test
   harness exists, so the authenticated route path was validated via code + replicated logic.
4. **Drop `tender_doc_cache`** — Phase 1 of the RFP rework left the old per-org
   `tender_doc_cache` table + `${org_id}/...` storage paths in place as a dormant fallback.
   Once the central `tender_documents` store is proven in production, ship a migration to
   drop the table and clean the old storage prefix. (Deliberately deferred; not urgent.)

---

## Do not do yet

- Do not build automatic tender submission
- Do not build a marketplace or supplier directory
- Do not expand connectors before validating which sources agencies actually use
- Do not build buyer intelligence pages until the core workflow is validated with a pilot
- Do not add real organisations without confirming the pilot terms first

---

## Open security items (non-blocking)

S-007 through S-014 tracked in `MARKET_WEDGE_SECURITY_PLAN_v3.md`. None block production use. Phase gate cleared.

---

## After completing the next objective

- Update SESSION_STATE.md with what changed and the last commit
- Update MARKET_WEDGE_CHANGELOG_v3.md with a new entry
- Update MARKET_WEDGE_EXECUTION_TRACKER_v3.md — tick completed items
- Update MARKET_WEDGE_ARCHITECTURE_DECISIONS_v3.md if a new ADR was made
- Update MARKET_WEDGE_SECURITY_PLAN_v3.md if new risks were found
