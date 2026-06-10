# Market Wedge Next Actions v3

> **Sources Hardening initiative — code COMPLETE (2026-06-08), all 5 phases pushed.**
> State → `MARKET_WEDGE_SOURCES_HARDENING_v3.md`. Design → `.claude/plans/on-the-opportunity-rfp-snoopy-crane.md`.
> **Outstanding:** apply migrations **050** (cosmetic) + **051** (enables Wales) by hand;
> verify Scotland/Wales counts go 0 → > 0 after the next 23:59 cron run / "Sync now".
> Sell2Wales provider was down at build time (cert/backend) — self-heals on recovery.
> (Prior 7-epic product uplift also COMPLETE; see `MARKET_WEDGE_UPLIFT_TRACKER_v3.md`.)

## Current objective

**Grants feature — COMPLETE (2026-06-10).** All "do all" work shipped: strategy doc; data spine
(mig 058); 360Giving connector + admin/cron; list/detail/Funding nav; eligibility profile +
`scoreGrant` + register auto-enrich + `/my-grants` (mig 059); KB-grounded applications + `/funders`
(mig 060); **GOV.UK Find a Grant open-call connector** (112 real open grants ingested);
**grant alerts** (mig 061, reuse alert_rules); **investor programmes feed** (`/programmes`, curated).
Catalogue: 112 open (GOV.UK) + 100 awarded (360Giving). Pipelines verified live.

### GRANTS — how it's built (orientation for future work)

Parallel to tenders, under `lib/grants/`. Tables: `grants` / `grant_sources` / `raw_grant_notices` /
`grant_matches` (mig 058) / `grant_alert_matches` (mig 061). Engine: `lib/grants/sync.ts`
(`syncGrantSource` + `seedGrantSources`). Connectors implement `GrantSourceConnector`
(`lib/grants/types.ts`), registered in `lib/grants/connectors/index.ts`:

- `threesixtygiving.ts` — awarded grants (funder intel + browse).
- `govuk-find-a-grant.ts` — OPEN calls; reads the service's own `__NEXT_DATA__` JSON (no public API),
  maps applicant types → scoring org-type tokens, derives status from open/close dates.
- `innovate-uk.ts` — OPEN innovation competitions; server-rendered GDS HTML, `fetchSince` enriches each
  list item with its overview page (opens/closes dates, funding type, funder).
  Scoring `lib/grants/scoring.ts`; alerts `lib/grants/alerts.ts`; data `lib/grants/data.ts`.
  Deep enrichment: `lib/grants/enrich.ts` (`enrichGrant` lazy-on-view + `enrichPendingGrants` cron) +
  each connector's `fetchDetail()` (GOV.UK Contentful rich-text via `lib/grants/richtext.ts`; Innovate
  UK GDS `<h2>` sections) → `grants.details` jsonb rendered on the detail page.
  UI: `app/grants`, `app/my-grants`, `app/funders`, `app/programmes`, `app/grant-sources`.
  Migrations 058–062 **applied**; next free number is **063**. Verify connectors live with a throwaway
  `.mjs` in the repo root (resolves node_modules; delete after).

### Optional grants follow-ons (not required — feature is functionally complete)

- **Config keys (user):** free `COMPANIES_HOUSE_API_KEY` + `CHARITY_COMMISSION_API_KEY` enable the
  profile "Auto-fill from registers" (`/api/profile/enrich`). Scoring + everything else work without them.
- **Live investor-event data at scale** — Eventbrite's public event-search API was removed Feb 2020
  (not viable); needs a **paid** provider (Dealroom / Crunchbase) + a data agreement. `/programmes` is
  curated in `lib/programmes/data.ts` (edit there to add/maintain entries).
- **More open-call sources** — both tractable UK gov sources are now connected (GOV.UK Find a Grant +
  Innovate UK). UKRI funding finder (Ajax Load More) + EU/Horizon are larger lifts if ever wanted.

Prior (all COMPLETE): DB query perf review (mig 056/057); org roles & teams · responses workspace ·
review concurrency (mig 054/055); opportunity docs · buyer web research · profile buildout · UX review.

Last commits (2026-06-10):

- `91951ed` — feat(grants): Innovate UK open-call connector (25 live competitions)
- `d3bf50b` — feat(grants): investor programmes feed — curated accelerators (Phase 6)
- `d1da157` — feat(grants): grant alerts — reuse alert rules, match on sync (mig 061)
- `ec392ee` — feat(grants): GOV.UK Find a Grant open-call connector (112 live grants)
- `003d5c4` — feat(grants): KB-grounded applications + funder directory (mig 060)
- `d40e066` — feat(grants): eligibility profile + register auto-enrich + grant fit scoring (mig 059)
- earlier: `203b232` list/detail/nav · `45cbbb1` 360Giving connector · `1ea1b9c` data spine (mig 058) · `1247be4` strategy

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
