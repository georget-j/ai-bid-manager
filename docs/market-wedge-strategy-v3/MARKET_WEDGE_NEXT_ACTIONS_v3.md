# Market Wedge Next Actions v3

> **Sources Hardening initiative — code COMPLETE (2026-06-08), all 5 phases pushed.**
> State → `MARKET_WEDGE_SOURCES_HARDENING_v3.md`. Design → `.claude/plans/on-the-opportunity-rfp-snoopy-crane.md`.
> **Outstanding:** apply migrations **050** (cosmetic) + **051** (enables Wales) by hand;
> verify Scotland/Wales counts go 0 → > 0 after the next 23:59 cron run / "Sync now".
> Sell2Wales provider was down at build time (cert/backend) — self-heals on recovery.
> (Prior 7-epic product uplift also COMPLETE; see `MARKET_WEDGE_UPLIFT_TRACKER_v3.md`.)

## Current objective

**Grants feature — core COMPLETE (Phases 0–5, 2026-06-10).** Shipped: strategy doc; data spine
(mig 058); 360Giving connector + admin/cron; list/detail/Funding nav; eligibility profile +
`scoreGrant` + register auto-enrich + `/my-grants` (mig 059); KB-grounded applications (reuse
responses workspace) + `/funders` directory (mig 060). 100 real grants ingested; pipeline verified.

### GRANTS — RESUME GUIDE (remaining work, in priority order)

**How the grants domain is built (orient here first):** parallel to tenders, under `lib/grants/`.
Tables: `grants` / `grant_sources` / `raw_grant_notices` / `grant_matches` (mig 058). Engine:
`lib/grants/sync.ts` (`syncGrantSource` + `seedGrantSources`) — adapted from `lib/procurement/sync.ts`.
Connectors implement `GrantSourceConnector` (`lib/grants/types.ts`) and register in
`lib/grants/connectors/index.ts`. **Reference connector: `lib/grants/connectors/threesixtygiving.ts`**
(verified live). Scoring `lib/grants/scoring.ts`; data `lib/grants/data.ts`. UI: `app/grants`,
`app/my-grants`, `app/funders`, `app/grant-sources`. Migrations 058/059/060 **applied**; next free
number is **061**. Verify connectors live with a throwaway `.mjs` against the real API (delete after);
DB insert-shape via a `begin; insert …; rollback;` (guard-bash blocks `DELETE`).

**1. Open-call connectors (HIGH — populates `/my-grants` with applyable calls).** The catalogue is
currently awarded grants only (`status:'awarded'`). Add connectors that ingest OPEN calls
(`status:'open'|'forthcoming'|'rolling'`, set `deadline_at`, `application_url`):

- **GOV.UK Find a Grant** — `find-government-grants.service.gov.uk`. No API. First **fetch
  `/robots.txt`** + check ToS; then a guardrailed scraper (identifying User-Agent via
  `GRANTS_USER_AGENT`, ≥0.5s/req, structured fields only, **no personal data**). New file
  `lib/grants/connectors/govuk-find-a-grant.ts`; register it; then flip the seeded `govuk-find-a-grant`
  source to `enabled:true`.
- **UKRI funding finder / Innovate UK** — check `apply-for-innovation-funding.service.gov.uk/competition/search`
  and `ukri.org/opportunity/` for a JSON endpoint (try `?format=json` / network XHR) BEFORE
  scraping. Add a NEW source (e.g. `ukri-funding-finder`) — note the seeded `ukri-gtr` is Gateway
  to Research = **awarded/historical**, not open calls (no connector built for it yet).
- For each: implement `fetchSince` + `normalize`, register in `connectors/index.ts`; the admin
  "Sync now" (`/grant-sources`) + cron (`/api/cron/sync-grants`) pick it up automatically.

**2. Grant alerts.** New `lib/grants/alerts.ts`: `matchAlertsForGrants(grantIds)` + a grant-aware
matcher (mirror `lib/procurement/alerts.ts` `matchesRule` but read grant fields: themes/sectors/
regions/amount_min/max). Add a `grant_alert_matches` table (or `grant_id` on `alert_matches`) =
**migration 061**. Wire into `syncGrantSource` (collect upserted grant ids via `.select("id")` on the
grants upsert — currently not collected — then call the matcher). Surface in the alerts UI.

**3. Phase 6 vision — investor events.** `lib/grants/connectors/eventbrite.ts` (Eventbrite API,
`EVENTBRITE_API_TOKEN`) for funding/pitch/demo-day events + a curated accelerator list
(YC/Techstars/EF/Seedcamp/Antler — guardrailed public-page scrape, no PII). Surface as an
Events/Programmes feed. Dealroom/Crunchbase/F6S/Gust = paid/partnership, not without a data agreement.

**Config to add (user):** free `COMPANIES_HOUSE_API_KEY` + `CHARITY_COMMISSION_API_KEY` enable the
profile "Auto-fill from registers" (`/api/profile/enrich`); `EVENTBRITE_API_TOKEN` for Phase 6.
Scoring + the rest work without them.

Prior (all COMPLETE): DB query perf review (mig 056/057); org roles & teams · responses workspace ·
review concurrency (mig 054/055); opportunity docs · buyer web research · profile buildout · UX review.

Last commits (2026-06-10):

- `003d5c4` — feat(grants): KB-grounded applications + funder directory (mig 060)
- `d40e066` — feat(grants): eligibility profile + register auto-enrich + grant fit scoring (mig 059)
- `203b232` — feat(grants): grants list + detail + Funding nav
- `45cbbb1` — feat(grants): 360Giving connector + sync cron + admin sources
- `1ea1b9c` — feat(grants): data spine + sync engine (mig 058); `1247be4` — grants strategy doc

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
