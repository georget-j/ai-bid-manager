# Market Wedge Next Actions v3

## Current objective

All core product phases shipped. Product is ready to show to real agencies.

Last three commits (2026-06-05):

- `9a7291b` — Admin-only restriction for /clients and /admin (sidebar + middleware)
- `39fcf2e` — Client account provisioning: migration 037, invite API, auth callback linking, ClientsAdmin component
- `e233a2c` — QuestionsPanel answer visibility fix: full-height answer blocks, edit toggle, answers-ready banner, always-visible export button

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
