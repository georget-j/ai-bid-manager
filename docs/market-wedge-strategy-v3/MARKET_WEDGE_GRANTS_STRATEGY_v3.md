# UK Grants — Market Analysis & Strategy v3

**Date:** 2026-06-09 · **Status:** strategy/reference for the Grants initiative.
Companion to the build plan (`.claude/plans/on-the-opportunity-rfp-snoopy-crane.md`).

We are adding a **Grants** domain beside the existing public-sector **Tenders** product: admin
sources grants from many feeds; users get a **fit/confidence score** (eligibility + closeness) and
draft **applications** grounded in their knowledge base. Vision end-state: investor open days /
demo days / accelerators / online funding applications.

## 0. The key insight + architecture

**360Giving is the grants equivalent of OCDS.** Just as the tenders product is built on the Open
Contracting Data Standard (Find a Tender, Contracts Finder…), grants have an open data standard —
the **360Giving Data Standard** — with 320+ UK funders publishing free, GDPR-clean JSON/CSV. This
means grants can reuse our proven ingestion engine (sources → connector → sync → normalize → score
→ KB-grounded AI responses → alerts → funder intelligence) almost wholesale.

**Architecture decision: parallel grants domain** (not a generalised `kind` column). The tenders
`opportunities` table is heavily OCDS-shaped (CPV codes, buyer, procurement stage, lots); grants
diverge (funder, themes, eligibility, match funding, beneficiaries). New `grants` / `grant_sources`
/ `raw_grant_notices` / `grant_matches` tables + grant connectors + a grant sync **reuse the engine
patterns**, while **reusing the user-facing surfaces as-is**: response-drafts (applications),
KB/RAG retrieval, alerts, the org profile, and funder ("buyer") intelligence.

---

## 1. Grant data sources — ranked for integration

### Tier 1 — official open data / APIs (integrate first)

| Source                       | Access                                                                                                                    | Format / auth                      | Freshness     | Coverage / notes                                                                                                                                                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **360Giving / GrantNav**     | `grantnav.threesixtygiving.org/developers` (bulk JSON/CSV); 360Giving API; **no auth**, ~0.5s/req                         | 360Giving Data Standard (JSON/CSV) | daily–monthly | **The grants OCDS.** 320+ funders incl. National Lottery Community Fund, Wellcome, Arts Council, Nesta, local authorities. Standard fields: funder, recipient, amount, date, title, description, funding type, beneficiary location, objectives, duration. **GDPR-clean** (funders validate pre-publish). |
| **UKRI Gateway to Research** | `gtr.ukri.org/api/` (`/projects`, `/organisations`, `/search/{type}`)                                                     | JSON, paginated                    | quarterly     | All UKRI/Innovate UK funded research + innovation competitions. Strong for R&D-intensive grants. Innovate UK live competitions at `apply-for-innovation-funding.service.gov.uk`.                                                                                                                          |
| **GOV.UK Find a Grant**      | `find-government-grants.service.gov.uk` — **no clean public API yet** (register API exists via Cabinet Office on request) | HTML portal                        | continuous    | £9.4bn live UK gov funding, 238k+ users. **v1 = guardrailed scrape** (structured fields only, no PII); negotiate Cabinet Office API later.                                                                                                                                                                |

### Tier 2 — mostly arrive via 360Giving

National Lottery Community Fund (publishes to 360Giving since 2004), Wellcome, Arts Council England,
Nesta — already covered by the 360Giving feed; no separate integration needed initially.

### Eligibility enrichment (free official APIs)

- **Companies House API** (`developer.company-information.service.gov.uk`) — legal form, incorporation
  date, latest accounts (turnover/headcount). Free, API key.
- **Charity Commission Register API** (`api-portal.charitycommission.gov.uk`) — charity registration,
  trustees, finances. Free, API key.

### Tier 3 — later / optional

EU Horizon Europe / Funding & Tenders Portal SEDIA API; US grants.gov REST API; devolved portals
(Funding Scotland, Welsh Gov) which are fragmented and lack unified APIs.

---

## 2. Competitor analysis → must-have feature set

**Players:** Instrumentl (full-cycle, US-centric, match scoring + AI), Grantable (AI drafting from a
content library, no discovery), OpenGrants (low-cost discovery + pipeline), Candid/Foundation
Directory (foundation research), Swoop Funding (UK business grants), Beauhurst (UK company/investment
intelligence), Idox GrantFinder (UK mid-market discovery), Grantboost/GrantedAI (AI grant writing).

**The mature grants feature set:**

1. **Eligibility quiz / hard pre-filter** (charity status, size, location, sector) — _gap for us_.
2. **Match / confidence scoring** — _we have the engine (tender fit scoring)_.
3. **Deadline tracking + alerts** — _we have alerts_.
4. **AI application drafting from a content library** — _we have KB/RAG + RFP drafting_.
5. **Funder CRM / funder profiles** — _partial (buyer intelligence → funder)_.
6. **Collaboration / multi-user** — _we have teams + responses workspace_.
7. **Post-award reporting / acquittal** — _gap; fast-follow_.

**Our gaps for grants specifically:** hard-eligibility pre-filtering, grant-shaped fields/themes,
funder profiles, and (later) acquittal/reporting. Everything else reuses what tenders already has.

---

## 3. Eligibility / confidence scoring model

Grants gate on attributes the current org profile lacks. Model = **hard-stops then weighted soft fit**.

**Org attributes (drive eligibility):** legal form / charity status (Charity Commission no.),
SME size band (EU/UK definition), annual turnover, trading history (years), primary location +
beneficiary geography, sector/theme alignment, match-funding capacity, prior funding, beneficiaries.

**Algorithm:**

- **Hard-stops (veto → ineligible):** wrong legal form/org type; location out of funder scope;
  turnover outside the funder's band; trading history below minimum.
- **Soft fit (0–100):** theme/sector/keyword alignment (NLP/text), size fit, geography bonus,
  prior-success signal, match-funding availability, deadline feasibility.
- **Output:** confidence % (green ≥70 / amber 40–69 / red <40) + verdict
  (eligible / conditional / ineligible) + reasons + **missing items to fix** (e.g. "add match-funding
  commitment", "confirm beneficiary postcodes"). Mirrors our tender `ScoringResult` shape, plus an
  `eligible` flag.

This is the **primary differentiator** vs simple keyword search, and why we auto-enrich the profile
from Companies House + Charity Commission.

---

## 4. Investor / open days / demo days / accelerators (vision phase)

Fragmented ecosystem; realistic strategy = **official APIs first, curated scrape second, paid third**.

| Source                                                     | Data                             | Access                                    | Risk                               |
| ---------------------------------------------------------- | -------------------------------- | ----------------------------------------- | ---------------------------------- |
| **Eventbrite API**                                         | funding/pitch/demo-day events    | official API (free tier)                  | 🟢 green                           |
| **Companies House / Charity Commission**                   | org verification                 | official APIs                             | 🟢 green                           |
| **Crunchbase / Dealroom**                                  | investors, rounds, accelerators  | official APIs, **paid** (~$250–2k/mo)     | 🟢 green (paid)                    |
| **Curated accelerators** (YC/Techstars/EF/Seedcamp/Antler) | programmes, demo days, deadlines | public program pages (guardrailed scrape) | 🟡 amber                           |
| **F6S / Gust**                                             | accelerators, angel networks     | partnership / B2B API                     | 🟡 amber / 🔴 red (scrape)         |
| **UKBAA**                                                  | UK angel networks                | directory / contact for data              | 🟡 amber                           |
| **LinkedIn / contact directories**                         | named people, emails             | —                                         | 🔴 red (PII / ToS) — do not scrape |

**Realistic v-phase slice:** Eventbrite API + a curated accelerator list → an "Events/Programmes"
feed surfaced alongside grants, matched against the org profile. Investor databases are a paid
follow-on requiring a data agreement.

---

## 5. Scraping legality & guardrails (green / amber / red)

Web scraping is **not inherently illegal** but is bounded by GDPR, ToS, copyright, and technical
blocks. Ignoring robots.txt is treated as bad faith in the legitimate-interest balancing test;
public personal data still has GDPR protection.

**Principles (apply to every connector):**

1. **Official API / bulk download first.** Only scrape where no API exists (e.g. GOV.UK Find a Grant).
2. **Respect robots.txt + ToS;** identify with a real User-Agent; rate-limit (≥0.5s/req); cache + TTL.
3. **No personal data.** Extract structured grant fields only (title, funder, amount, deadline,
   eligibility) — exclude names/emails/phone. If PII is inadvertently captured, drop it at ingestion.
4. **Data minimisation + retention.** Store only what the feature needs; refresh on a schedule.

**Risk ranking by source type:** official APIs (360Giving, UKRI, Companies House, Charity Commission,
Eventbrite, grants.gov) = 🟢; public gov pages (Find a Grant) + structured data (JSON-LD/RSS/sitemaps)
= 🟡 (guardrails + prefer negotiating an API); closed platforms (F6S/Gust/Crunchbase scrape) + any
PII/contact directories = 🔴 (use the API or a data agreement, never scrape).

---

## 6. Build roadmap (summary)

0. **This doc** (analysis).
1. **Data spine** — `grants`/`grant_sources`/`raw_grant_notices`/`grant_matches` + a grant sync
   engine (adapted from the tenders engine).
2. **Connectors** — 360Giving + UKRI GtR + guardrailed GOV.UK Find a Grant; cron + admin sources.
3. **List + detail + nav** — Grants list/detail (Details · Application · Eligibility · Funder) under
   a new **Funding** nav group.
4. **Eligibility + scoring** — grant-eligibility profile fields + Companies House/Charity Commission
   auto-enrich + `scoreGrant` + recommendations + the Eligibility tab.
5. **Applications + funder intel + alerts** — KB-grounded grant application drafting (reuse the
   responses workspace), funder profiles, grant alerts.
6. **Vision** — investor events / accelerators (Eventbrite + curated), deferred until core proves out.

**Config the user must add:** `COMPANIES_HOUSE_API_KEY`, `CHARITY_COMMISSION_API_KEY` (free);
`EVENTBRITE_API_TOKEN` (vision); Dealroom/Crunchbase (paid, later).

---

## Sources

360Giving: `360giving.org`, `standard.threesixtygiving.org`, `grantnav.threesixtygiving.org/developers`.
UKRI GtR: `gtr.ukri.org/resources/api.html`. GOV.UK Find a Grant: `find-government-grants.service.gov.uk`;
gov grants data `gov.uk/government/collections/government-grants-data-and-statistics`. Registers:
`developer.company-information.service.gov.uk`, `api-portal.charitycommission.gov.uk`. EU:
`ec.europa.eu/info/funding-tenders/opportunities/portal`. US: `grants.gov/api`. Competitors:
instrumentl.com, grantable.co, opengrants.io, learning.candid.org, swoopfunding.com, beauhurst.com.
Investor/events: f6s.com, gust.com, data.crunchbase.com, dealroom.co/products/dealroom-api,
eventbrite.com/platform/api, ukbaa.org.uk. Scraping/GDPR: ICO/CNIL guidance, robots.txt status.
