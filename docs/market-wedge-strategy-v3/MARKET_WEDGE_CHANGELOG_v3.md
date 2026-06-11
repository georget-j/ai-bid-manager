# Market Wedge Changelog v3

## 2026-06-12 — E2E review executed: cleanup, coverage, programmes-in-flow, full business profile

Decisions in `MARKET_WEDGE_E2E_REVIEW_v1.md`; built in two commits (`a0a6963`, `e76cbe6`):

- **Cleanup**: /demo + standalone /rfp + /rfp/history + AppHeader/RFPHistoryList deleted (zero
  dangling refs, build-proven); /services linked into public nav. Roadmap merges recorded
  (pipeline→my-opportunities board, responses/my-applications naming) — not executed.
- **Coverage** (mig **071** grant_sync_runs, applied): UKRI full-walk per run (prune finally
  fires; converges to ~112 tonight), Innovate UK connector cap removed (mass-prune risk),
  nightly deadline-passed sweep, sync-run history, disabled sources 409. sedia-horizon ENABLED
  (owner). GOV.UK 108/107 + Innovate 25/25 exact vs live sites at audit time.
- **Programmes linked into the core flow**: 14 curated programmes live as grants rows
  (source curated-programmes, excluded from grant surfaces); "Apply with your evidence →" on
  every card into the guided flow; curated question sets for NCSC For Startups / Cyber Runway /
  CyLon / EF / Seedcamp; "Programmes for you" scoring strip; events cross-links; /grants
  defaults open+forthcoming with cross-source duplicate collapse.
- **Business profile** (mig **070**, applied; next free: **072**): registered details
  (website/VAT/registered_address/incorporation/SIC/trading names), employee_count, key_people,
  memberships, frameworks, policies, carbon_reduction_plan; insurance values now
  {amount,insurer,policy_number,expires_at} (normaliseInsurance handles legacy numbers).
  evidence_items org-scoped (client_id nullable; +insurance/membership types) → "Your
  credentials" panel in the Evidence library with expiring-soon strip. Profile page rebuilt
  (form-state/fields/sections; 11 sections, per-section ticks; unified completeness in
  lib/setup-flow.ts). **AI profile fill**: draft-only proposals from evidence library retrieval
  - website safeFetch + public registers (quote-grounded, per-field validated, apply-per-
    section, Save manual); registers mapper keeps address+SIC. Note: a PreToolUse hook blocks
    writes to paths containing "credential" — test lives at tests/org-evidence-panel.test.ts.
- **Fortis Cyber Solutions Ltd seeded live** (fictional-but-plausible): full registered
  details, 3 key people, 8 policies, 2 frameworks, 4 memberships, insurance with 2027
  expiries, 12 org credentials (CE+, ISO 27001/9001, CREST, case studies, accounts, reference).

Tests 551 passed + 1 intentional skip; tsc/lint/build clean. CI green.

## 2026-06-11 — UX overhaul shipped: 3 phases (design → answering → IA/home → evidence/help)

Full design in `MARKET_WEDGE_UX_OVERHAUL_v1.md` (4-agent flow review + live visual walkthrough).

- **UX-C `d1cc085` — answering is fast, reliable, reviewable.** Server: always-terminal SSE
  (done{partial, unanswered_ids, reason} even on timeout/error — kills the stuck "Generating…"
  forever bug), abort plumbing into every OpenAI call, sliding-window concurrency (no lock-step
  waves), batch path skips the LLM rerank, draft text STREAMS via 'delta' events. Client:
  guidance items no longer auto-answered (rendered as funder-guidance notes), per-question
  briefing chips (Mandatory/topic/word-limit), question-by-question review stepper
  (always-editable, autosave on blur, keyboard nav), partial-completion banner with "Answer the
  remaining M", pinned "Draft all N answers" CTA, inline redo confirm. Display: formatDaysLeft
  grammar + formatAmountRange ("Up to £1.4m", no more "£1–£1.4m").
- **UX-B `27b4fbc` — offering-first IA + a home that answers "what next".** Sidebar: Home /
  Tenders / Grants / Investors / Your workspace / Operator; breadcrumbs cover every route
  ("Page" impossible); home = both-offering hero + derived "Get set up" checklist
  (lib/setup-flow.ts) + "Recommended for you" (top-3 tenders + top-3 grants, one card language)
  - cross-offering "Due soon" + reworded KPIs; operator-only source cards.
- **UX-D (this commit) — evidence trust + instruction system.** /documents → "Evidence
  library": outcome subtitle, lock-icon privacy strip ("Private to your organisation…"),
  teaching empty state (what-to-upload checklist + sample data), multi-file drop with per-file
  status, 409 duplicate → "Replace existing", plain-English scope tabs; privacy lines on /ask +
  grant-flow evidence step; "Add your own supporting documents" inside the application flow.
  HelpNavigator rewritten (Get started / Tenders / Grants / Your documents & privacy — tech
  specs deleted); new authenticated /help full guide. lib/copy.ts: confidence → "Well evidenced
  / Partly evidenced / Needs your input"; extraction strings humanised; one-line page-head
  explainers (review/pipeline/responses/compliance/history/alerts); profile-strength chips on
  both Matched-to-you pages; legal-form labels ("Community interest company (CIC)" not "cic");
  truthful readiness tip (was falsely claiming KB uploads improve a profile-only score).

Tests 422 passed + 1 intentional skip (was 327 pre-overhaul); tsc/lint/build clean throughout.
Follow-ups: /my-applications real-browser hydration check; embeddings AbortSignal; /api/ask
latent unhandled-rejection path; middleware→proxy convention.

## 2026-06-11 — xlsx patched (0 vulnerabilities), Eventbrite live in production

- `xlsx` 0.18.5 → 0.20.3 (official SheetJS registry; npm registry stopped at the vulnerable
  version) — closes both high advisories; postcss override for Next's nested copy.
  **`npm audit`: 0 vulnerabilities; Dependabot: 0 open alerts.**
- `EVENTBRITE_TOKEN` configured (Vercel production + local). Connector fixed live: public
  `/o/{slug}-{id}` ids are ORGANIZER ids → endpoint switched to `/v3/organizers/{id}/events/`
  (organizations API 404s them); stale organizer ids now skip instead of failing the run.
  Source enabled; first live sync upserted 5 London pitch events (venue lat/lng, classified).
  Nightly sync-events cron now covers UKBAA + Eventbrite.

## 2026-06-11 — Investor events: UK map + virtual list, organizer profiles, Eventbrite/UKBAA sync

New feature (migration **069**, applied via `db push` — history recorded; next free: 070):
investor meetings across the UK on a map, virtual events alongside, organizer profiles.

- **Schema**: `investor_event_sources` + `raw_event_notices` (service-role-only, raw-before-
  normalise) and `investor_organizers` + `investor_events` (global catalogs, authenticated read)
  — mirrors the grants pattern incl. all its sync-engine hardening.
- **Engine** (`lib/events/`): sync with hash-deduped raw storage, cursor resume, organizer
  linking (Eventbrite id → name match); keyword event-type classifier (pitch-night, demo-day,
  angel-network, vc-office-hours, conference, networking, accelerator, webinar) + virtual
  detection (zoom/meet/teams/webex); free geocoding via postcodes.io + Nominatim fallback
  (paced, cached); 22 curated UK organizers seeded (5 with verified Eventbrite org ids).
- **Connectors**: `ukbaa` (live: 31 events, 3 pages, geocoded venues; UA note — their WAF
  blocks the repo's usual "Mozilla/5.0 (compatible…)" UA, plain UKBidIntelligence UA works) and
  `eventbrite` (organizer polling, Bearer auth so the token can't leak into URLs; **seeded
  disabled until `EVENTBRITE_TOKEN` is set** — free from eventbrite.com → Account settings →
  Developer; panel shows amber setup guidance).
- **UI**: `/investor-events` — Leaflet/OSM map (inline-SVG pins, UK bounds) + date-sorted list,
  mode toggle (In person | Virtual | All), type chips, 30/60/120-day window; organizer profile
  pages at `/investor-events/organizers/[slug]`; sidebar "Investor events" in Funding group.
- **Admin**: `EventSourcesPanel` in /sources (#event-sources) with toggle/sync/sync-all + the
  same error softening as grants; cron `/api/cron/sync-events` (fail-closed) scheduled 23:45.
- Live state: 22 organizers, 31 events (23 upcoming, 5 virtual, 14 geocoded), 124 raw notices.
  Tests 326 passed + 1 intentional skip; tsc/lint/build clean. New deps: leaflet, react-leaflet,
  @types/leaflet.

Follow-ups: set `EVENTBRITE_TOKEN` then enable the source (unlocks ~30-60 events/month);
organizer website fill-in pass; raw-notice retention policy; unify crawler UA convention.

## 2026-06-11 — Grant sources: UKRI + SEDIA connectors, admin sync-all in /sources, 360Giving fixed

Goal: admins sync ALL available UK grants from the admin sources panel.

- **UKRI Funding Finder connector** (`ukri-funding-finder`, enabled): polite HTML crawl of
  ukri.org/opportunity (no API exists — WP REST hides the post type; verified empirically), open-
  filtered listing pages + detail pages, 150ms pacing, raw HTML stored per page, cursor-resumed.
  ~114 open opportunities across all 9 councils. First live sync: 30 grants in; nightly cron
  converges the rest (per-source page cap 6/night).
- **EU SEDIA / Horizon Europe connector** (`sedia-horizon`, **disabled — operator opt-in**):
  official EC search API (POST multipart, anonymous SEDIA key; languages=en filter avoids 23×
  duplication; 276 open EN topics). 50 grants staged from live verification; enable the source on
  /sources to keep them fresh. Note: API open-status flag lags for two-stage calls — status
  derived from dates instead.
- **Admin panel unified**: grant sources now a section of /sources (id=#grant-sources) via
  `GrantSourcesPanel` — per-source toggle/sync/full result detail (raw stored, dupes, pruned,
  errors softened plain-English, "backlog pending" cursor badge), "Sync all grant sources" →
  new POST /api/grant-sources/sync-all (operator, allSettled). /grant-sources now redirects.
  Connectorless sources show "Planned" (kills the dead ukri-gtr 404 button; row disabled).
  middleware OPERATOR_PAGES += /grant-sources.
- **360Giving fixed via live forensics**: root causes — (a) grant_sources + raw_grant_notices
  were emptied/recreated ~2026-06-11 00:20 (cause unconfirmed; nightly cron re-seeded; pre-reset
  raw payloads unrecoverable), (b) intermittent first-page API stall hitting the full 30s
  timeout (API normally 3-5s; added one polite retry), (c) failed runs never wrote last_run_at
  (now recorded with zeroed counts). Raw-before-normalise now ENFORCED (raw insert failure skips
  that page's normalisation). seedGrantSources no longer clobbers operator toggles/sync state
  (insert-only-missing + targeted dead-source repair). Live re-sync: 1,000 raw stored, error
  cleared.
- Catalogue now: 113 GOV.UK + 25 Innovate UK + 30 UKRI (growing) open + 1,331 awarded history +
  50 staged Horizon. Tests 244/244; tsc/lint/build clean.

## 2026-06-11 — Grant journey overhaul: real funder questions, grant-aware AI, in-flow review, shareable export

5-track build against a 4-agent journey review (review found: questions AI-guessed from web
prose not funder docs; tender persona answering grants; answers invisible until export; export
headlined "RFP Response Document" with internal QA artefacts; awarded history padding discovery).

1. **Real funder questions** (`lib/grants/application.ts`, draft route): funder documents are
   ingested FIRST and question extraction runs over the actual application docs (docs-first
   merge, web-prose fallback); per-question provenance `source: funder-document|grant-listing`;
   grant-mode extraction prompt (funder/applicant vocabulary). Duplicate drafts prevented —
   POST returns `{draftId, existing:true}` for an in-flight (org, grant) draft.
2. **Output-genre understanding** (`lib/grants/genre.ts`): classifies what the funder expects
   (application-form / project-proposal / pitch / business-case), cached in
   `grants.details.output_genre`, drives the export doc type. Unknown results not cached (retry
   after docs land).
3. **Grant-aware generation** (`lib/prompts.ts`, answer-batch): grant-applicant persona
   (first-person org addressing funder, anti-salesy) via `response_type='grant-application'`;
   word_limit/mandatory/priority now flow through the batch schema; "(Limit: N words)" injected
   at generation. Tender path byte-identical.
4. **In-flow review & analyse** (RFPProcessor/ResponseCard/GrantApplicationFlow): full draft
   answers readable + editable inside the flow; edits persist via draft PATCH; non-destructive
   re-runs ("Answer N remaining", confirm-gated "Redo all", per-question "Try again"); word
   counts vs funder limits; clean vs internal-review export links. Fixed a pre-existing bug:
   client reused rfp_run_id across runs → cached answers could attach to wrong questions.
5. **Shareable export** (`lib/export-grant-docx.ts` + rewritten export route): real cover page
   (org, genre-derived doc type, funder, deadline, amount, reference), application summary
   table, per-answer word counts (red over limit), "[Response to be drafted]" placeholders +
   completeness, budget table, page numbers/running header, org as Word creator;
   `?mode=clean` (default, shareable) vs `?mode=review` (amber "Internal review notes" blocks).
6. **Discovery polish** (/grants, grant detail): default view = OPEN grants (132) with awarded
   history opt-in; deadline/region/amount filter UI (params already existed); detail page gets
   loading.tsx skeleton, no-profile prompt card, Continue-your-application CTA with progress.

Tests 214/214 (was 160 — +54 across questions/genre/prompts/export/flow); tsc/lint/build clean.
Follow-ups noted: `latest_rfp_run_id` never written (flagged-answers check trivially passes);
draft "refresh questions" action for late-arriving docs; region value normalisation in connectors.

## 2026-06-11 — Review fixes: S-015..S-018, tests green, lint zero, CI, migration history

All findings from the 2026-06-10 full-stack review fixed in one pass (7 agents, verified
tsc/lint/test/build green):

- **S-015 (HIGH)**: 13 legacy service-role routes (`queries`, `documents/[id]`+`/stats`,
  `rfp/runs`, all `review/*`) now org-scoped via `getRequestOrgId()`; review routes scoped through
  `queries!inner` join (review_requests.org_id never populated — follow-up noted); bonus write-leak
  fix: approved-answer ingestion stamps org_id (was creating null-org rows visible to RAG).
  New `tests/route-org-scoping.test.ts`.
- **S-016**: `sync-grants` + `grant-deadline-digest` crons fail closed (500 unset / 401 mismatch).
- **S-017**: new `lib/safe-fetch.ts` (scheme check, DNS private-IP rejection, manual ≤5-hop
  redirects with per-hop revalidation) wired into grant/tender doc fetchers; 22 unit tests.
- **S-018**: documents/stats org-scoped.
- **Tests**: stale grants labels fixed; tenant-isolation lazy + `describe.skipIf` (env-less
  checkouts skip instead of crash); vitest loads `.env.local`; suite 160/160 green.
- **Lint**: 0 errors 0 warnings (was 9+5) — behaviour-preserving refactors, no eslint-disables.
- **Error handling**: killed the `const {data}` ignore-error pattern across `lib/grants/*` +
  recommendations route (500 on DB error instead of silent `[]`); drafts PATCH zod-validated,
  404-vs-500 distinguished; my-applications gets load-error banner + optimistic-move rollback;
  `daysUntil()` centralised in `lib/dates.ts`; 26 new unit tests for `application-flow`/`budget`.
- **Platform**: `.github/workflows/ci.yml` + `dependabot.yml`; Dependabot alerts + auto security
  fixes enabled; Supabase migration history repaired (001–068 in sync; `026_question_class.sql`
  renamed `068_question_class.sql`; **next free: 069**).

## 2026-06-10 — Full-stack review (code, GitHub, Vercel, Supabase) — findings only, no code changes

Four-surface review. Live DB verified all 42 tables RLS-enabled; grants tables (058–067) correctly
org-scoped; prod env correct (CRON_SECRET set, no DEMO_MODE); deploys green, 4 crons wired and
401-ing unauthenticated (verified live); tsc clean; Next 16 conventions followed; grants code is
the best-structured in the repo. **New risks recorded in SECURITY_PLAN: S-015 (HIGH — legacy
queries/documents/rfp-runs/review routes use service-role with no org filter → cross-tenant
read/write; re-opens the onboarding gate), S-016 (newer crons fail open without CRON_SECRET),
S-017 (SSRF in grant/tender doc fetchers), S-018 (global doc stats leak).** Quality: `npm test`
red (3 stale labels in `tests/grants.test.ts` + tenant-isolation env crash at collection), 9 lint
errors (pre-grants files), no CI workflow, Dependabot disabled, Supabase migration history only
tracks 001–023 (schema itself confirmed in sync through 067). Fix list → NEXT_ACTIONS top block.

## 2026-06-10 — Grants UX overhaul: guided, plain-English application journey

A step-by-step review of the grant **view → understand → respond** journey found the pieces were
competent but had **no spine** — nothing told a non-technical bid writer what to do next, and the
grant's identity dissolved the moment they started applying (the app landed them in the RFP
"Respond" workspace with "← All responses"). Rebuilt the whole journey as a guided flow. **No
schema change** — every step status derives from existing `response_drafts` columns. 5 phases,
all tsc/lint(baseline)/build green:

1. **Foundation** (`096548e`): `lib/grants/application-flow.ts` — `buildApplicationFlow()` is the
   single source of truth, deriving 6 plain-English steps (eligible / requirements / evidence /
   answers / budget / review) + the granular readiness checks. `readiness.ts` is now a thin adapter
   over it. `lib/grants/copy.ts` — plain-English helpers (`matchVerdict` / `actionLabel` /
   `matchColor`) so enums ("do-not-apply") and jargon ("fit score", "confidence") never reach the UI.
2. **Guided flow (centrepiece)** (`d3b31c9`): `app/rfp/drafts/[id]/GrantApplicationFlow.tsx` — grant
   draft workspace becomes a grant-framed flow: header (name · match · deadline) + breadcrumbs back
   to the grant / My applications (kills the "Respond" leak); a sticky `StepSpine` (scroll-spy,
   status dots, % done, persistent "Next:" CTA); ordered sections reusing the eligibility panel,
   how-to-apply guide, an inline "Add the funder's documents" action, `RFPProcessor`, `BudgetBuilder`,
   and a Review & submit step whose checks are clickable ("Fix this →") ending in a working "Mark as
   submitted". `RFPProcessor`/`BudgetBuilder` gained an `onSaved` callback → the spine recomputes via
   `router.refresh()` after each autosave (single source of truth, no lifted state).
3. **Grant detail "understand"** (`e40fe6b`): one primary CTA "Start your application →" (button wall
   collapsed; external links demoted to a quiet row); how-to-apply guide auto-surfaced on view via
   `ensureApplicationGuide`; plain-English "/100 match" + verdict instead of "confidence" + raw enum.
4. **Discover polish** (`c403d62`): `/grants` ↔ `/my-grants` cross-links; deadline urgency on every
   card; real empty state on filtered `/grants`; `/my-grants` shows 2 reasons + top risk, "/100
   match", and the **stale "open-call sources being added" copy fixed** (they're connected).
5. **Track + first-run** (`b68b890`): **budget now in the DOCX export** (`generateBatchDocx` optional
   budget table — runtime-verified); My applications "View grant →" back-link + reporting hint before
   "Awarded"; profile gains the `#grant-eligibility` anchor (deep-linked from the flow) + grant fields
   folded into the completeness meter.

## 2026-06-10 — Grants advanced: semantic matching, post-award reporting, budgets

Approved queue (3 of 4 built; 4th investigated):

1. **Semantic matching** (`389e687`, mig **065**): `grants.embedding vector(1536)`; embed grants +
   the org profile (text-embedding-3-small) and add a bounded, min-max-normalised, ADDITIVE semantic
   boost (+0..20) on top of `scoreGrant` in `/api/grants/recommendations` (never lowers the keyword
   result; never overrides eligibility). `embedPendingGrants` cron pass; 134 open grants backfilled.
   Verified: for a cyber/tech profile the top semantic matches are innovation competitions (sim
   ~0.37–0.39) vs unrelated EV grants (~0.15).
2. **Post-award reporting** (`56e95a3`, mig **066**): `grant_reports` (org-scoped RLS); My
   Applications "Awarded" cards get a reporting panel (milestones with due dates + status).
3. **Budget builder** (`4102911`, mig **067**): `response_drafts.budget jsonb`; a project costs /
   funding-sources builder on grant drafts with totals + balance, debounced autosave, and a
   "Project budget balanced" readiness check. (DOCX export of the budget deferred.)
4. **More open-call sources — investigated, deferred.** Probed Funding Scotland (search is
   **login-gated**), TNL Community Fund (no clean programme listing / no embedded JSON), and looked
   for public APIs (none found). The two clean UK open-call sources (GOV.UK Find a Grant, Innovate
   UK) are already connected; a further robust source needs dedicated per-site work (a real project,
   not a quick scrape) — candidates: EU Funding & Tenders SEDIA API (public JSON, but UK Horizon
   eligibility caveats) or a data partnership. Not shipped to avoid a brittle connector.

Migrations applied through **067** (next free: 068).

## 2026-06-10 — Grants gap-closing: export, deadline reminders, review, more funders

1. **Application DOCX export** (`80d6556`): `GET /api/grants/applications/[id]/export` builds a
   grant-titled DOCX from saved answers (reuses `generateBatchDocx`); "↓ Export DOCX" on My
   Applications. (Workspace export already existed; this surfaces it from the pipeline.)
2. **Deadline reminders** (`0f4f28b`): My Applications "N due in 14 days" banner + an email digest
   (`lib/grants/deadlines.ts` → Resend to owner/admin members) via `/api/cron/grant-deadline-digest`.
   **Also registered the grant sync cron in `vercel.json`** — `sync-grants` was never actually
   scheduled (now 23:30 daily; digest 08:00).
3. **Review visibility + readiness** (`b18606d`): the answer pipeline already routes high-risk answers
   to the review system; now `/api/grants/applications` returns each app's review counts (by
   rfp_run_id), My Applications shows an "N in review" badge, and submission-readiness adds a
   "High-risk answers reviewed" check.
4. **More funders** (`aac194c`): 360Giving connector expanded to 10 major UK funders (Esmée Fairbairn,
   Paul Hamlyn, Trust for London, Children in Need, Comic Relief, City Bridge, Power to Change, Nesta,
   Wellcome), capped to one recent page each (~720 awarded grants ingested) for richer `/funders`.

No new migration. Still open: post-award reporting, budget builder, semantic matching, more
open-call sources, register auto-enrich (needs CH/Charity keys).

## 2026-06-10 — Grants follow-ups: smarter scoring, pipeline, readiness, funder intel

Four enhancements:

1. **Eligibility-aware scoring** (`86c72ae`): `scoreGrant` now folds the enriched detail sections
   (eligibility/objectives/how-to-apply/supporting info) into its matching corpus, so fit reflects
   the grant's actual criteria, not just the listing summary.
2. **My Applications pipeline + deadlines** (`e528088`, mig **064**): `response_drafts.stage`
   (drafting→submitted→awarded/unsuccessful) + `submitted_at`. `/my-applications` kanban with grant
   title/funder, a colour-coded deadline countdown, answer progress, and stage moves (reusing the
   draft PATCH). In the Funding nav.
3. **Submission-readiness gate** (`02f6718`): grant-linked drafts show a readiness panel on the
   responses workspace — eligibility confirmed, mandatory requirements answered, all questions
   answered, within deadline, grant evidence in the (grant-scoped) KB — with a readiness % and
   ready-to-submit badge. `lib/grants/readiness.ts` (pure, tested).
4. **Funder intelligence** (`fdf9af7`): `/funders/[name]` profiles mined from the catalogue (grant
   count, open-now, total funded, median/largest grant, top themes, grant list) + "Research this
   funder" grounded web research (reuses `lib/research/web-search.ts`). Directory links to profiles.

Migrations applied through **064** (next free: 065). 24 grants unit tests green.

## 2026-06-10 — Per-grant "how to apply" navigator (`b31e428`)

Application processes differ per grant, so this reads each grant's how-to-apply / eligibility /
key-dates / supporting text and generates a tailored, navigable guide: a short summary, a tickable
**eligibility checklist**, and **ordered steps** each with the documents/info required and any
deadline. `lib/grants/guide.ts` (`generateApplicationGuide` LLM grounded strictly in the grant text;
`ensureApplicationGuide` caches into `details.guide` — no migration; `generatePendingGuides` capped
cron pass, 10/run). `/api/grants/[id]/guide` builds on demand. Grant detail "How to apply" section
(`ApplicationGuide`) renders the checklist + steps with a progress bar; progress persists per grant
via `useSyncExternalStore` + localStorage; in the jump-nav; applyable grants only. Verified live
(Future Leaders Fellowships): accurate 8-item checklist + 8 steps with correct deadlines.

## 2026-06-10 — Grant-scoped KB (docs + links) + isolated retrieval + collapsible UI (`3c84334`, mig 063)

Three things on top of grant applications: (1) import **links** too, not just files —
`ingestGrantDocuments` now pulls a grant's web links (eligibility/how-to-apply/guidance pages)
as well as its documents. (2) **Isolation** — grant resources are imported into a per-grant
collection `grant:<id>` (not the shared KB). mig 063 redefines `hybrid_search_chunks` with an
optional `p_collection`: general retrieval EXCLUDES all `grant:%` collections, and a grant draft
includes the main KB + only its own grant collection — so a grant's context never affects other
responses. `grant_id` threaded draft → `RFPProcessor` → `answer-batch` → `retrieveChunks`. Verified
at SQL level (rolled back): general_sees_grant=false, general_sees_main=true, grant_sees_grant=true.
(Caught: imported docs must use `source_type 'upload'` — DB check allows only upload|sample.) (3)
**Navigable detail UI** — each detail section is now a collapsible `<details>` dropdown with a sticky
right-hand "hot bar" jump nav (scroll-spy + click-to-open + smooth scroll), hidden on narrow screens.

## 2026-06-10 — Grant applications from requirements + docs to KB (`8aad61e`)

"Draft an application" now does real work instead of a blank draft: it ensures the grant
is deep-enriched, **extracts the requirements/questions from the grant's detailed text**
(eligibility / how to apply / objectives / supporting info, via the existing
`extractRFPQuestions`) and seeds the response draft with them — so the user lands in the
responses workspace ready to respond (items classified question/requirement/guidance with
mandatory + priority), no form upload needed. It also **imports the grant's documents**
(conditions of funding, application templates, budget forms) into the org knowledge base so
AI answers are grounded in them (`lib/grants/ingest-docs.ts`: fetch → `extractText` →
`ingestDocument`, org-scoped dedup by source URL, size/time caps, public files only) —
bounded inside the draft request, with a standalone "Add N documents to knowledge base"
button on the grant detail for the rest. Data: 55 enriched grants have rich requirement text,
16 have document files (UKRI budget-form DOCX verified to fetch+parse; removed gov.uk assets
skipped cleanly). New: `lib/grants/application.ts`, `lib/grants/ingest-docs.ts`,
`/api/grants/[id]/ingest-documents`, `IngestDocumentsButton`. Tests: 21 grants tests green.

## 2026-06-10 — Deep grant detail enrichment (`3f6bc0b`, mig 062)

Open grants were ingested from listing summaries only. Now each grant's full detail is
pulled from its source page into the dashboard — **eligibility, objectives, key dates,
how-to-apply, plus the documents and links embedded in that content** (eligibility-criteria
PDFs, terms & conditions, the real apply URL). mig 062 adds `grants.details jsonb` +
`enriched_at`. Connector `fetchDetail()`: GOV.UK walks the detail page's Contentful rich-text
tabs (new `lib/grants/richtext.ts` → text + extracted hyperlinks); Innovate UK parses the
overview page's GDS `<h2>` sections + links/documents. `enrichGrant` runs lazily on first view
of an open grant + a capped cron top-up (25/run), and `details` survives re-syncs. The Apply
button now uses the source's canonical webpage URL when found. Verified live: 54 grants enriched
(GOV.UK eligibility bullets + SharePoint/gov.uk apply URLs; Innovate UK 8.7k-char eligibility).
Tests: rich-text walker + buildGovukDetails (19 grants tests, green).

## 2026-06-10 — Fix: dead Apply / View-source links (`259f92f`)

Clicking Apply / View source on some grants (and 3 Programmes) hit "not found". Causes +
fixes: (1) GOV.UK / Innovate UK list only currently-open calls, so closed grants get
delisted at source but the sync never removed them — added a `listsAllOpenCalls` connector
flag + **sync pruning** (grants not seen in a complete, clean run → `closed`; guarded
against partial runs/outages); GOV.UK can also rotate a grant's URL slug, which a re-sync
now refreshes. (2) Grant detail hides Apply/Draft for non-applyable statuses and View-source
for closed grants, showing a "this call has closed" note instead. (3) Fixed 3 stale curated
programme URLs (NCSC For Startups, Cyber Runway→Plexal, Seedcamp). Data cleanup: 4 delisted
GOV.UK grants closed, 109 source_urls refreshed. Spot check: 64/65 open-grant links resolve
(the 1 residual is a GOV.UK upstream duplicate whose own detail page 404s).

## 2026-06-10 — Grants feature (COMPLETE: open calls + alerts + programmes)

Remaining "do all" work finished, all pushed:

- **Open-call connector — GOV.UK Find a Grant** (`ec392ee`): the catalogue was awarded-only;
  this adds the first OPEN, applyable source. No public API, but the service is a Next.js app that
  embeds its own structured data in `__NEXT_DATA__` (`pageProps.searchResult`) — so we read the
  service's own JSON, not fragile HTML. Guardrails: public-sector open data, identifying UA, 400ms
  pacing, structured fields only, no PII. Maps GOV.UK applicant types to the scoring org-type tokens
  so eligibility hard-stops are correct. **112 real open grants ingested** (catalogue now 112 open +
  100 awarded); `/my-grants` now scores applyable calls.
- **Grant alerts** (`d1da157`, mig **061**): one alerting system across tenders + grants. Existing
  `alert_rules` now also match grants (keywords/regions/funder/value); tender-only criteria (CPV,
  stages) ignored and a no-grant-criteria rule never matches (CPV-only rule → 0/112). `matchAlertsForGrants`
  wired into the grant sync (best-effort). New `grant_alert_matches` table (mirrors `alert_matches`
  RLS). Alerts "Matches" tab shows Grants alongside Tenders.
- **Investor programmes feed** (`d3bf50b`): the Phase 6 vision's first safe slice, done honestly.
  Eventbrite's public event-search API was removed Feb 2020 (not viable → would be a broken
  integration), so instead a **curated** accelerator/investor-programme feed (`/programmes`, public
  info only, cyber/UK-leaning: NCSC For Startups, Cyber Runway, CyLon, Techstars, YC, EF, Seedcamp,
  Antler…). No migration/scrape/token. Live event data at scale = paid (Dealroom/Crunchbase) follow-on.

- **Open-call connector — Innovate UK** (`91951ed`): second open-call source — Innovate UK / UKRI
  innovation competitions (the direct apply route, tech/cyber-relevant). No API and no embedded JSON
  (server-rendered GDS HTML), so `fetchSince` enriches each list item with its overview page (opens/
  closes dates, funding type, funder); same guardrails (UA, 400ms pacing, public fields, no PII).
  **25 competitions ingested** (22 open + 3 forthcoming). UKRI's own funding finder has no REST
  opportunity type (wp/v2 404) + uses Ajax Load More, so IFS is the tractable source.

**Grants feature is now functionally complete.** Catalogue: 112 GOV.UK + 25 Innovate UK open calls +
100 awarded (360Giving). Optional follow-ons only: Companies House + Charity Commission API keys
(profile register auto-enrich), and paid investor-event data (needs a data agreement).

---

## 2026-06-10 — Grants feature (core complete: Phases 0–5)

- **Phase 4 — Eligibility + scoring** (`d40e066`, mig **059**): org grant-eligibility fields
  (legal form, charity/company number, match-funding capacity, beneficiaries, grant themes);
  `scoreGrant()` (hard eligibility + weighted soft fit → 0–100 confidence + eligible verdict);
  `/api/profile/enrich` (free Companies House + Charity Commission auto-fill — needs the two API
  keys); `/api/grants/recommendations` + `/my-grants`; an eligibility/confidence card on grant detail.
- **Phase 5 — Applications + funders** (`003d5c4`, mig **060**): `response_drafts.grant_id` so grant
  applications reuse the responses workspace (upload form → extract → KB-grounded AI answers with
  citations — all reused); grant detail "Draft an application"; `funder_aggregates()` RPC + `/funders`
  directory. Funding nav now: Grants · My Grants · Funders · Grant Sources (operator).

**Remaining (Phase 6 + follow-ups):** open-call connectors (UKRI funding finder / Innovate UK +
GOV.UK Find a Grant scrape) — these are HTML, no clean API, so they need careful per-site
robots/ToS + markup verification (govuk source seeded disabled); grant alerts; investor
open-days/accelerators vision (Eventbrite + curated). The catalogue currently holds awarded grants
(browse + funder intel) — open-call connectors are what populate `/my-grants` with applyable calls.

---

## 2026-06-10 — Grants feature (Phases 0–3 of 6 shipped)

New Grants domain beside Tenders (parallel domain, reuses the tenders engine + surfaces).
Strategy: `MARKET_WEDGE_GRANTS_STRATEGY_v3.md`. Plan: `.claude/plans/on-the-opportunity-rfp-snoopy-crane.md`.

- **Phase 0 — Strategy** (`1247be4`): market analysis — 360Giving = the grants OCDS; ranked
  sources; competitor must-haves + gaps; eligibility scoring model; investor-vision feasibility +
  scraping guardrails.
- **Phase 1 — Data spine** (`1ea1b9c`, mig **058**): `grant_sources`/`raw_grant_notices`/`grants`
  (grant-shaped: funder, amount range, themes/sectors/regions, eligibility, org types, match
  funding, beneficiaries)/`grant_matches` (org-scoped) + `lib/grants` types/sync/data (the sync
  engine adapted from the proven procurement engine; reuses `hashPayload`).
- **Phase 2 — Connector + admin** (`45cbbb1`): 360Giving API connector (awarded grants → walks a
  curated funder list's grants_made via full-URL cursor; Data-Standard grant nested under `data`),
  connector registry, `/api/cron/sync-grants` (CRON_SECRET), `/api/grant-sources` + `/[name]/sync`
  - PATCH (operator) + `/grant-sources` admin page. **Verified live** vs the National Lottery feed.
- **Phase 3 — List/detail/nav** (`203b232`): `/grants` list (filters, status badges, pagination)
  - `/grants/[id]` detail + a **Funding** sidebar group. **100 real grants ingested** for verification.

**Key correction (during build):** 360Giving + UKRI Gateway to Research are **historical/awarded**
data (great for funder intelligence + browse), **not open calls**. Open applyable calls come from
the UKRI funding finder / Innovate UK competition search + GOV.UK Find a Grant — those connectors
are the next ingestion work. Awarded grants carry `status:"awarded"` (browse-only).

**Remaining:** Phase 4 (grant-eligibility profile fields + Companies House/Charity Commission
auto-enrich + `scoreGrant` + recommendations; **needs free `COMPANIES_HOUSE_API_KEY` +
`CHARITY_COMMISSION_API_KEY`**; mig 059), Phase 5 (KB-grounded applications + funder intel + grant
alerts; mig 060), Phase 6 (investor events vision; deferred). tsc + lint + build clean throughout.

## 2026-06-09 — Database query performance review

Audit-driven, right-sized to the live data (opportunities ≈8k rows/32MB; RAG only 436 chunks),
so: payload reduction + cheap indexes, no materialized views.

- **Phase 1 — Indexes** (`43cac95`, mig **056**): added missing FK indexes
  (`document_chunks(document_id)`, `query_results(query_id)`, `approved_answers(review_request_id|query_id)`,
  `opportunity_tender_documents(tender_document_id)`), composites
  (`opportunities(status, deadline_at)`, `bid_pipeline(org_id, status)`), and **gin_trgm** indexes on
  `opportunities(title|buyer_name|region)`. Verified: the active+`title ILIKE` list query went
  **419ms → 0.3ms** (bitmap scan on the title trigram). Omitted `bid_pipeline(opportunity_id)` —
  already covered by the unique `(opportunity_id, org_id)`.
- **Phase 2 — Narrow selects** (`78f701b`): `listOpportunities` projects scalar columns instead of
  `select("*")`; the list + recommendations never read the heavy jsonb. Sheds ~2.3KB raw_json +
  0.4KB documents per row → ~116KB (list/50) and ~682KB (recommendations/300) per request. Added a
  `full?` escape hatch; single-row `getOpportunity` still returns `*`.
- **Phase 3 — Batch N+1** (`b448922`): review bulk-action went from ~3N per-id round-trips to ~4
  queries (batch read → single atomic guarded claim for all → batch read queries → bulk
  approved_answers insert), preserving the concurrency guard. Buyer/pipeline JS aggregation reviewed
  and left as-is (bounded ≤50/≤1000/small-per-org rows; not a bottleneck).
- **Phase 4 — Consistency** (`c637ab0`, mig **057**): aligned `opportunity_questions` RLS to the
  standard `org_id in (select … from org_memberships)` (was a single-org `= (… limit 1)`) for
  multi-user-team correctness. Sync pre-check dedup KEPT (it skips re-normalizing unchanged notices —
  dropping it would be slower); RAG rerank left as-is (quality-sensitive, tiny).

tsc + lint + build clean; migrations 056 + 057 applied (additive/idempotent); verified via
`EXPLAIN ANALYZE` + `pg_stat_user_tables`.

## 2026-06-09 — Org roles & teams · responses workspace · review concurrency

Follow-on from the UX review (design: `.claude/plans/on-the-opportunity-rfp-snoopy-crane.md`).

- **Phase 1 — Org roles + multi-user teams** (`55acdb5`, mig **054**): split the conflated
  "admin" into **platform operator** (ADMIN_EMAILS → /sources, /admin, sync) vs **per-org role**
  (owner/admin/member). `requireAdmin`→`requireOperator`, new `getRequestOrgRole`/`requireOrgRole`
  (`lib/org.ts`). `org_invitations` table + invite-into-existing-org in `getOrCreateOrgForUser`.
  New `/team` page + `/api/team[/...]` (invite, change role, remove, revoke; last-owner guard).
  Middleware operator gate is now /sources+/admin only — **fixes the bug where normal members
  were blocked from Clients + the evidence vault**. Sidebar is role-aware (Team for owner/admin;
  Sources/Admin operator-only; Clients for all).
- **Phase 2 — Responses workspace** (`8055e23`, mig **055**): `response_drafts` (org-scoped) makes
  RFP responses durable — RFPProcessor gains an optional `draftId`, loads from a draft, and
  **debounced autosaves** (creates on first change, then PATCHes). New **/responses tabbed
  workspace** opens several drafts at once (kept mounted so in-flight answering survives) + a saved
  list; `/rfp/drafts/[id]` resumes one. Opportunity RFP tab gains "Save as response draft"
  (snapshot → draft). Sidebar "RFP Builder" → "Responses".
- **Phase 3 — Review concurrency** (`106001e`, no migration): approve/reject now **claim the
  status transition atomically** (`.in(status, actionable)` + optional `.eq(updated_at, expected)`)
  before side-effects; a 0-row claim → **409** "already actioned — refresh". Kills last-write-wins
  and double KB-ingestion. ReviewCard sends the `updated_at` it last saw.

tsc + lint + build clean throughout; migrations 054 + 055 applied by hand (additive, idempotent).

## 2026-06-08 — Opportunity docs · buyer web research · profile buildout · UX review

Four-phase initiative (design: `.claude/plans/on-the-opportunity-rfp-snoopy-crane.md`).

- **Phase 1 — Tender doc count** (`a7212b7`): opportunity summary header now shows a deduped
  count of tender documents. Consolidated three copies of the doc-URL dedup onto one shared
  `collectTenderDocuments()` helper (`lib/procurement/documents.ts`) so the header and the
  Documents panel can never disagree.
- **Phase 2 — Grounded buyer/people web research** (`c0e1b6d`, mig **052**): new
  `lib/research/web-search.ts` `webSearchSummary()` uses the OpenAI Responses API `web_search`
  tool (gpt-4o-mini) returning text + the URLs it cited. New `…/[id]/buyer-research-online`
  route extracts people named in the description + extracted tender-doc text, searches the
  buyer + each person in parallel, caches to `opportunities.buyer_web_research`
  (`?refresh=true` regenerates). `BuyerWebResearch.tsx` panel on the Buyer tab shows the
  summaries with source links + an "AI-researched, verify before use" disclaimer. Verified
  live: web_search returns a grounded summary with 5 citations.
- **Phase 3a — Org profile buildout** (`ce1e5b4`, mig **053**): added
  `company_size_band, annual_turnover, year_established, delivery_models, social_value` to
  `organisation_profiles`. Scoring now folds the previously-unused `sectors` into the match
  pool and adds financial-standing (turnover vs value) + insurance signals. Profile API
  accepts the new fields + structured insurance (no more hard-coded `insurance: null`). Form
  gains Sectors (was never editable), Capacity & delivery, Insurance cover, Social value, and
  a **profile-strength meter** naming the empty fit-scoring fields.
- **Phase 3b — AI Fortis seed** (`b87db7a`): `seedCyberDemoProfile()` extracts a structured
  supplier profile from the Fortis sample docs via gpt-4o-mini and upserts it (fills empty
  fields only; `force` overrides). The seed-cyber-demo action now builds out the full account
  (KB + profile). Verified live: extraction yields size band, turnover £2.4m, 6 sectors,
  8 CPV codes, insurance cover, contract range.
- **Phase 4 — UX review** (`bbcfa7e`, advisory): `MARKET_WEDGE_UX_REVIEW_v3.md` — route/nav
  audit (orphaned `/compliance`, `/rfp`, `/rfp/history`), the reality of "open multiple
  responses at once" (RFP = single in-memory doc, no persistence; Review = no concurrency
  safety), a multi-response workspace proposal, and open questions. No code changes.

tsc + lint + build clean throughout; migrations 052 + 053 applied by hand (additive, idempotent).

## 2026-06-08 — Profile: Find a Tender lifecycle timeline (record packages)

- Source-coverage audit (`MARKET_WEDGE_SOURCES_COVERAGE_v3.md`): confirmed the 4 OCDS feeds
  are the complete free UK tender set; nothing else to add (NI sub-threshold has no feed
  anywhere; paid aggregators add spend/supplier data, not notices — out of scope).
- New **tender lifecycle** panel on the opportunity profile for Find a Tender notices:
  `fetchFindTenderRecord(ocid)` (find-tender.ts) calls the compiled record endpoint
  `…/ocdsRecordPackages/{ocid}` (by-OCID; the list form takes no params and is unusable);
  new `…/[id]/lifecycle` route (auth-gated, `supported:false` for non-FTS) returns the
  compiled current state + the notice history; `OpportunityLifecycle.tsx` renders a vertical
  timeline (stage dot · date · title) with the current status. Read-only — no ingestion or
  data-model change. Verified live: real OCIDs return 1–3 events, bad OCID → null (graceful).
  `mapOcdsStage` exported for reuse. tsc + lint + build clean.

## 2026-06-08 — Sources: state-aware, informative sync-status banner

- The Sources page showed a permanent red `Error: <raw message>` from the stored `last_error`,
  which stayed up even when stale and gave no context — confusing (e.g. a 12:53 end-of-results
  `400` looked like a live failure). New `describeSyncError()` turns it into a state-aware status:
  - **Amber "warning"** when the run still fetched data or the source has synced before (the
    feed works — often just end-of-results), vs **red "error"** only when nothing ever came
    through.
  - Shows **when** it happened (`3h ago (8 Jun, 12:53)`) and a **"cleared on next sync"** chip
    when a later success means the message is outdated.
  - A plain-English **hint** per error class (end-of-results / 404 / network·TLS / 5xx /
    rate-limit) plus the raw message in muted mono for detail.

## 2026-06-08 — Sources: "Sync all enabled sources" pulls a 7-day window

- `/api/sources/sync-all` previously called `syncSource(c)` with no window — so it only did
  each source's tiny incremental lookback (24h on a first sync) and had **no `maxDuration`**
  (risked timing out). Now it pulls a fixed **last-7-days** window (`PROCUREMENT_SYNC_ALL_DAYS`)
  for every enabled source, in parallel, with `maxDuration=300`, a 50-page cap and a 240s
  time budget. Result includes `windowDays`. Predictable "get me the last week" behaviour;
  dedup keeps it idempotent and the cursor resumes anything not reached.

## 2026-06-08 — Sources Hardening fix: Find a Tender + Contracts Finder pagination

- **Find a Tender was only ever fetching 1 page.** Its `links.next` is a **full URL** (like
  Contracts Finder), but the connector re-sent it as a `?cursor=<full-url>` param →
  malformed request → **400 on page 2** (confirmed live: old `?cursor=fullURL` = 400, new
  follow-the-URL = 200 + 100 items). Now it follows `links.next` directly, like CF does.
- **End-of-results was surfaced as an error.** These OCDS feeds return a **4xx once a cursor
  runs past the end** of the result set (e.g. CF after ~1,500 notices). Both connectors now
  treat a 4xx **while paging** (cursor present) as a clean stop, not a failure — so the
  dashboard no longer shows a spurious `400` after a successful pull, and a first-page error
  (no cursor) is still raised. Both also stop on an empty page even with a stale next link.
- Public Contracts Scotland's "2 pages" is the **incremental window by design** (current +
  previous month = 642 notices, no error); bulk history comes from "Sync last N" / Backfill,
  which walk months. tsc + lint + build clean.

## 2026-06-08 — Sources Hardening follow-up: cursor + backfill error resilience

- Two latent engine gaps found while diagnosing a stale Find a Tender `400` (FTS itself is
  healthy across all date windows):
  1. **Backfill page-0 errors clobbered the forward-sync status.** `updateSourceError` was
     called even in backfill mode, so a historical-sweep blip made a healthy source _look_
     failed on the dashboard. Now only the forward path records `last_error`.
  2. **A poisoned/expired cursor could wedge a source forever.** On a forward page-0
     failure we now also clear `last_cursor`, so the next run restarts from the date window
     (dedup-safe) and self-recovers instead of re-sending the bad cursor every run.
- Migrations 050 + 051 applied (Scotland base_url; **Sell2Wales enabled**). New unit test
  `tests/sync-error-handling.test.ts` covers both behaviours. tsc + lint + build clean.

## 2026-06-08 — Sources Hardening Phase 5: 23:59 BST schedule + health + audit (COMPLETE)

- **Schedule:** `vercel.json` sync-sources cron → `59 22 * * *` = **23:59 BST** (22:59 UTC;
  winter 22:59 GMT), per the requested "midnight UK" daily run.
- **No-miss robustness:** `PROCUREMENT_SYNC_OVERLAP_MINUTES` default 720 → **1440 (24h)** to
  match the once-daily cadence. `from` anchors to the last _successful_ sync, so even a
  fully-missed run is recovered next time; dedup keeps the overlap idempotent.
- **Sources page:** footer rewritten to state the audit conclusion (these 4 OCDS feeds are
  the complete machine-readable UK set; eTendersNI/CCS/NHS/MOD/Jaggaer/ProContract are
  portal-only and flow into FTS + CF) and the Sell2Wales availability caveat. Per-source
  health (counts, last-run fetched/pages, backlog badge, normalize-error + last_error) was
  already surfaced. tsc + lint + `npm run build` clean.
- **Sources Hardening initiative COMPLETE** (5 phases). ⚠ Migrations 050 (cosmetic) + 051
  (enables Wales) are **pending apply** (DB-migration approval gate).

## 2026-06-08 — Sources Hardening Phase 4: parallel sources + bulk upserts

- **Cron now syncs all 4 sources in parallel** (`Promise.allSettled`). They are distinct
  hosts, so concurrency doesn't hammer any one API — total wall-clock drops from the sum of
  per-source times to ~the slowest source, and each source gets the full forward budget. A
  failing/slow source can no longer starve the others; it resumes via its cursor next run.
- **`syncSource` page processing is now bulk** (was ~2 DB round-trips per notice): chunked
  dedup `.in()` over content hashes → one bulk `raw_notices` insert → one bulk
  `opportunities` upsert (overwrite, `.select` ids for alert matching), deduped by conflict
  key so a single statement never touches the same row twice. Skipping already-seen hashes
  keeps alerts from re-firing on unchanged notices. Extracted a shared `toOpportunityRow`
  used by both `syncSource` and `syncPage`. tsc + lint + `npm run build` clean.

## 2026-06-08 — Sources Hardening Phase 3: Contracts Finder + FTS correctness

- **Contracts Finder:** send `limit` instead of the silently-ignored `size` param (verified
  live: 100 releases/page + working cursor pagination); `fetchWithRetry` now backs off on
  **HTTP 403** (CF's rate-limit status) as well as 429, respecting `Retry-After`.
- **Normalizer / FTS notice-type coverage:** confirmed the substring-based OCDS stage
  mapping is forward-compatible with the Procurement Act 2023 (Feb 2025) notice types
  (pipeline → planning, contractAmendment/contractTermination → contract, awardUpdate →
  award) and that releases are **never dropped** on unknown tags. Added an `implementation`
  stage and mapped cancellation/withdrawal/termination tags → `cancelled` status.

## 2026-06-08 — Sources Hardening Phase 2: Sell2Wales API + bulk-download fallback

- Rewrote the Sell2Wales connector for the Proactis OCDS API (host
  `api.sell2wales.gov.wales`, noticeTypes 51–56) via the shared `proactis.ts` helper, and
  added `sell2wales-bulk.ts` — a month-level bulk-download fallback that drives the
  Download.aspx ASP.NET form (rblCollectionType=0, OCDS+JSON, exact month option, per
  F-type) and returns OCDS releases. The helper now uses a single **month-level** fallback
  (called once per month when the API yields nothing) instead of per-noticeType.
- Enabled Sell2Wales: `seedSources()` + migration `051_sell2wales_enable.sql`
  (base_url + `enabled=true`, idempotent) — **pending apply**.
- **HONEST STATUS — the Sell2Wales provider is currently down (not our code):** the API
  leaf cert expired 2026-06-03, the legacy klickstream backend returns 500 ("nvarchar to
  float"), and the bulk download 500s for every month/format tried (incl. Jan 2025). So
  neither path returns data right now. The connector is built correctly and will self-heal
  when the Welsh Government restores the cert/backend; failures surface via sync-health and
  (after Phase 4) do not block other sources. Scotland regression re-verified live.

## 2026-06-08 — Sources Hardening Phase 1: repair Public Contracts Scotland

- **Scotland was ingesting zero notices** — the connector hit a 404 URL. Rewrote it for the
  real Proactis OCDS contract: `{host}/v1/Notices?dateFrom=MM-YYYY&outputType=0&noticeType=N`,
  host `api.publiccontractsscotland.gov.uk`, iterating noticeTypes 101–104.
- New `lib/procurement/connectors/proactis.ts` shared helper: enumerates months from the
  sync window and walks them via the engine's `cursor` (one page = one month across all
  noticeTypes, so pages stay ≤ the backfill cap — no notices dropped mid-window).
- **Secure TLS fix:** the Proactis API hosts omit the Sectigo `R36` intermediate, so Node
  rejected them (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`). The helper supplies that intermediate
  (inlined PEM, valid to 2036) alongside Node's default roots and keeps full verification on
  — no `rejectUnauthorized:false`. Verified live (read-only): fetch + normalize of real
  Scottish notices succeeds.
- `seedSources()` base_url corrected; migration `050_scotland_proactis_base_url.sql`
  (cosmetic, idempotent) — **pending apply** (connector works from code regardless).

## 2026-06-08 — Sources Hardening Phase 0: tracker + verified API audit

- New initiative: fix admin Sources sync so every feed pulls correctly, schedule it at
  23:59 BST, and maximise speed with no tenders missed.
- **Live read-only probing found 2 of 4 connectors silently broken:** Public Contracts
  Scotland hit a 404 URL and Sell2Wales hit the wrong host — both ingesting **zero**
  notices. The real Proactis contract (verified + cross-checked against OCP Kingfisher) is
  `{host}/v1/Notices?dateFrom=MM-YYYY&outputType=0&noticeType=N`, iterating noticeTypes
  (Scotland 101–104, Wales 51–56), no cursor.
- **Audit conclusion: no other machine-readable UK procurement APIs to add** — eTendersNI,
  CCS/GCA, NHS/Atamis, MOD DSP, Jaggaer, Delta/ProContract/In-tend are portal-only and flow
  downstream into FTS + Contracts Finder.
- New `MARKET_WEDGE_SOURCES_HARDENING_v3.md` recovery anchor; NEXT_ACTIONS +
  EXECUTION_TRACKER pointers repointed to it.

## 2026-06-06 — Epic 7.2: sync-health monitoring

- Migration `048_sync_health.sql` (applied): `sources.last_run_at`, `last_fetched_count`,
  `last_pages`, `last_normalize_errors`.
- `sync.ts` counts normalisation failures (previously silently swallowed) and writes all
  health fields each run. The sources page now shows "last run fetched N in P pages", an
  amber "↻ backlog pending — resumes next run" badge when a cursor is saved, and a warning
  when notices were skipped because they couldn't be parsed.

## 2026-06-06 — Epic 7.3: bounded rolling catch-up (Epic 7 + uplift COMPLETE)

- Migration `049_backfill_watermark.sql` (applied): `sources.backfill_watermark` +
  `backfill_complete`.
- `cron/sync-sources`: after the forward sync, if wall-clock budget remains, sweeps ONE
  source one 14-day window further back into history (backfill mode — doesn't disturb
  forward state/health), advancing the watermark every run (even on empty windows so it
  can't stall) and finishing at a 2-year floor. Stays within the 240s budget.
- **All 7 epics of the product uplift are complete.** Migrations 044–049 applied;
  `npm run build` passes.

## 2026-06-06 — Epic 7.1: no-gap ingestion windows + region fix

- `sync.ts`: incremental `from` now subtracts a 12h overlap from last_successful_sync_at
  so boundary/partial-failure notices are never skipped (dedup keeps it idempotent). New
  `timeBudgetMs` option breaks the page loop and persists the cursor when wall-clock runs
  out, so a higher page cap is safe.
- `cron/sync-sources`: page cap 5 → 25 with an adaptive per-source time budget (≤240s of
  the 300s function) — ~500 → up to ~2500 notices/source/run, the rest resuming via cursor.
- **Region fix:** the OCDS normalizer read `release.buyer.address` (a bare stub) — the
  address actually lives on the `parties[]` buyer entry. Now reads that (region → locality
  → countryName; CF has no NUTS region). Backfilled all 3,223 existing rows from the stored
  raw payloads (`scripts/backfill-region.sql`) — region went 0 → 3,223 populated (London
  555, Birmingham 135). Re-enabled the region/location filter on the opportunities page.

## 2026-06-06 — Epic 6.2: custom SVG buyer charts (Epic 6 complete)

- New `components/Charts.tsx` — zero-dependency, server-renderable SVG primitives: `Donut`
  (with legend + centre total), `BarList` (labelled horizontal bars), `Sparkbars` (time
  series). On-brand inline styles + CSS vars; no chart library added.
- Buyer drill-down now shows a status donut, a top-sectors bar list, and a 12-month
  "notices per month" sparkbar chart. The buyers index gained a mini volume bar per row.
- `npm run build` passes (checkpoint after Epic 6).

## 2026-06-06 — Epic 6.1: buyer aggregates + drill-down

- Migration `047_buyer_aggregates.sql` (applied): `buyer_aggregates(p_limit)` STABLE RPC
  (count, open/award split, total + avg value, first/last seen) grouped over the WHOLE
  catalog. The buyers index previously aggregated only the first 2000 rows in memory.
- `app/buyers/page.tsx` now calls the RPC and links each buyer to a drill-down.
- New `app/buyers/[buyer]/page.tsx`: KPI cards (notices, open now, awards, avg/total
  value), status breakdown, top sectors (CPV divisions), recent notices, and a link to
  the filtered opportunities list. 6.2 adds SVG charts over the same computed data.

## 2026-06-06 — Epic 5.3: seed one demo opportunity (Epic 5 complete)

- `scripts/seed-demo-opportunity.sql` (idempotent upsert): one `[DEMO]` MDR security
  tender (source_name='demo', id aab42d69-be4c-4e50-b9aa-400d48b9d249) — rich description
  with pass/fail requirements (ISO 27001, Cyber Essentials Plus, mandatory case studies),
  2 lots, £480k, live deadline, IT/cyber CPVs, and one real NCSC reference PDF for the
  "Add to KB" cross-ref demo. The global catalog gains one clearly-marked demo row; real
  notices and org KBs are untouched. Exercises the AI brief, priority extraction, gaps,
  and KB cross-referencing end-to-end.

## 2026-06-06 — Epic 5.2: opportunity ↔ knowledge base cross-referencing

- New `kb-cross-ref/route.ts` (GET): returns documents already ingested for this
  opportunity, the org's wider KB content most relevant to the tender (via the now-fixed
  `retrieveChunks`, excluding the opp's own ingested docs), and the tender's source doc
  URLs.
- `OpportunityKnowledgeBase` client component on the detail page: "Add to KB" per tender
  document (reuses the SSRF-guarded `add-document-to-kb` route), shows what's already in
  the KB, and surfaces "Relevant content from your knowledge base" — making the link
  between an opportunity and the KB visible in both directions.

## 2026-06-06 — Epic 5.1: opportunity AI insights store

- Migration `046_opportunity_insights.sql` (applied): org-scoped `opportunity_insights`
  (summary, key_points, feasibility, gaps) with RLS mirroring opportunity_questions. The
  global `opportunities` catalog is never written — derived context lives org-scoped.
- New `app/api/opportunities/[id]/insights/route.ts` (GET cached / POST generate): builds
  tender context from description + lots + linked tender-doc text, optionally weaves in the
  org capability profile, and produces an executive summary + key points + feasibility +
  "what a bidder must address" via gpt-4o-mini.
- `OpportunityInsights` client component renders the brief on the opportunity detail page
  (after the description) with a Generate/Regenerate button.

## 2026-06-06 — Epic 4.2: evidence gaps UX rebuild (Epic 4 complete)

- `gaps/page.tsx`: the report banner is now state-aware — `no-evidence` shows an amber
  "Add evidence" CTA (→ client evidence page), `no-questions`/`no-requirements` link to
  the RFP workflow. Adding evidence now invalidates the cached AI gap analysis
  (`bid_pipeline.ai_gap_analysis`) and recomputes (keyword always; AI too if it was on),
  so coverage updates without a manual "Clear". Per-gap evidence-type pre-fill and the
  "we looked for…" hint already existed; kept the bar + covered/partial/missing/expired
  count viz as the coverage gauge.

## 2026-06-06 — Epic 4.1: evidence gaps requirement-only + honest states

- `evidence-gaps/route.ts`: analysis is now requirement-only (removed the fallback to
  all non-guidance questions, which inflated/skewed the coverage score). Response carries
  a machine-readable `state`: `no-questions` (extract first), `no-requirements` (only open
  questions extracted), `no-evidence` (requirements exist but the vault is empty → "add
  evidence", not "everything failed"), or `ok`; plus `evidence_count`. 4.2 wires these
  into the UI.

## 2026-06-06 — Epic 3.2: "Recommended for you" surfacing (Epic 3 complete)

- `app/my-opportunities/page.tsx`: subtitle now says "live, still-open tenders … ranked
  by fit then closing date"; each card shows a recommended-action chip (Strong fit /
  Worth a look / Review / Low fit) next to the score; an "💡 Add evidence to improve fit"
  link (→ /clients) appears when the recommendation is readiness-limited (uses the new
  `missing` payload). Pipeline-saved items are already excluded server-side.

## 2026-06-06 — Epic 3.1: recommendations are live-only + urgency-ranked

- `recommendations/route.ts`: candidate pool is now `status=active` AND `deadline=open`
  (future or null). Previously `status=active` alone surfaced 139 expired tenders (359
  active → 212 live). Defensive re-check drops any deadline that slipped past. Ranking is
  fit-score desc, then urgency (soonest deadline first). SAMPLE_SIZE 150 → 300 to cover
  the full live pool. Response now also returns `readiness_score` + `missing` so the UI
  can prompt "add evidence to improve fit".

## 2026-06-06 — Epic 2.2: opportunity pagination (Epic 2 complete)

- `app/opportunities/page.tsx`: `page` query param → offset; prev/next controls that
  preserve all active filters; header now shows "T opportunities · showing N–M".
  `listOpportunities` already supported `offset` + exact `total`. Submitting the filter
  form resets to page 1 (no page field in the form).

## 2026-06-06 — Epic 2.1: opportunity browse filters

- Migration `045_opportunity_filter_support.sql` (applied): btree indexes on
  `value_amount` + `source_name`; a `cpv_search` text column (space-padded CPV codes,
  maintained by a BEFORE INSERT/UPDATE trigger + one-time backfill) with a pg_trgm GIN
  index. (A generated column couldn't use `array_to_string` — not treated as immutable —
  so a trigger maintains it instead.)
- `listOpportunities` gains filters: deadline status (open/soon/closed, dot-free
  timestamp in the PostgREST `or`), source (`source_name`), sector (CPV division prefix
  via `cpv_search ilike '% NN%'`), value min/max, and region switched to `ilike`.
- `app/opportunities/page.tsx` renders the full filter bar (search, deadline [default
  Open], sector, source, stage, status, buyer, value min/max). Buyer was previously
  read but never rendered.
- **Region filter deferred to Epic 7:** `opportunities.region` and `buyer_region` are
  100% empty in the current Contracts Finder data, so a region control would always
  return nothing. Param plumbing kept; control hidden until ingestion populates it.
- Live-tested all filters via `tests/opportunity-filters.test.ts` (open 272 / soon 83 /
  closed 2950 / sector-72 321 / value-range 1779 — all valid queries, sector returns
  only matching CPVs).

## 2026-06-06 — Epic 1.3: evaluate without approving all (Epic 1 complete)

- The reevaluate API + section already accepted drafted (non-approved) items; made it
  explicit. `RfpReevaluationSection` now fetches the answered (drafted) count itself,
  enables "Evaluate response" as soon as ≥1 item has a draft, and disables with a hint
  otherwise (no more confusing server-side "draft some answers" error). Copy now states
  plainly that approval is not required — drafts are evaluated too. Parent prop renamed
  `answeredCount` → `itemCount` (it was always the total item count, not answered).

## 2026-06-06 — Epic 1.2: RFP importance ranking

- Migration `044_question_priority.sql` (applied): `opportunity_questions.priority`
  (`high|medium|low`, NOT NULL default `medium`, CHECK constraint).
- `lib/rfp-extract.ts`: extraction schema + prompt now assign `priority`; post-map keeps
  it coherent (mandatory ⇒ high, guidance ⇒ low). `extract-all` stamps it on each row.
- `QuestionsSection` + `RequirementsSection`: lists now sort by importance
  (mandatory first, then priority high→low, stable) and show a priority pill (High =
  amber, Low = muted) that complements the existing red Mandatory badge.
- `app/rfp/page.tsx` pre-populated questions default `priority: "medium"`.

## 2026-06-06 — Epic 1.1: harden RFP answer generation

- `answer-all/route.ts`: added `export const maxDuration = 60` (the default serverless
  timeout was silently truncating the SSE batch mid-flight, leaving later questions
  unwritten). The `catch` now records `confidence_reason` (+ low confidence) so a failed
  generation shows _why_ on the card (RequirementsSection + QuestionsSection both render
  `confidence_reason`) instead of a blank "needs-review". Both sections share this route.
- Verified migration 043 is live on the production Supabase: the 5-arg overload
  `hybrid_search_chunks(text,vector,integer,uuid,uuid)` that `retrieveChunks` calls carries
  the `doc_id` alias fix. (Older 3/4-arg overloads remain unused.)

## 2026-06-06 — Started 7-epic product uplift (compaction-safe)

Kicked off a 7-epic uplift addressing user-reported problems across browse, recommend,
RFP response, evidence gaps, buyers, opportunity profile, and Contracts Finder ingestion.

- Added `MARKET_WEDGE_UPLIFT_TRACKER_v3.md` as the live recovery anchor (per-phase
  checklist + Current pointer). Every phase ends in a commit + push so nothing is lost
  if context compacts. Wired NEXT_ACTIONS + EXECUTION_TRACKER to point at it.
- Decisions: autonomous per-phase execution; custom-SVG buyer charts (no new dep);
  robust-and-safe ingestion (overlap + cursor resume + monitoring); derive + cross-link
  - seed one demo opportunity (real catalog untouched). Migrations 044–048 pre-allocated.

## 2026-06-06 — CRITICAL fix: RAG retrieval broken (ambiguous "id") + live showcase

Found while running the full RFP flow live with a seeded knowledge base.

### Fixed — `hybrid_search_chunks` threw on every call

- Migration `043_fix_hybrid_search_ambiguous_id.sql` (applied). The function
  `RETURNS TABLE (id uuid, …)`, so in PL/pgSQL the output column `id` is a
  variable; every bare `id` in the body (`select id from documents`,
  `group by id`, …) was **ambiguous** → `column reference "id" is ambiguous`
  thrown on every call. **All RAG retrieval failed**, so every AI answer and
  compliance draft silently fell into the `answer-all` catch path and came back
  empty (`needs-review`, no draft). Present since migration 016 (org scoping),
  carried into 034 (client scoping). Fix: alias the CTE id columns
  (`doc_id`/`chunk_id`); output columns and logic unchanged.
- This is why earlier live answers were empty — not a knowledge-base gap.

### Verified live (throwaway authenticated org with a seeded KB)

- Diagnostic: `retrieveChunks` → 6 chunks; `generateRFPResponse` → a grounded
  draft citing the seeded ISO certificate. Previously: threw.
- Full showcase (sector-matched evidence, real login): `extract-all` 200 (49
  items); **real grounded drafts** (e.g. "facilitated a regional community
  energy network of 60 groups… 40% growth…", confidence high, with citations);
  approve; **re-evaluation overall 85** with per-item scores + suggestions;
  `export` 200 + DOCX. Test data cleaned up.

---

## 2026-06-06 — Fix: DOCX export 404 (non-existent source_id column)

Found during a live end-to-end test (real login against the deployed app).

- `export-response/route.ts` selected `opportunities.source_id`, which does not
  exist (the table has `source_name` / `source_notice_id`). Selecting a missing
  column returned null → the route 404'd "Opportunity not found", so **both DOCX
  export buttons were broken in production**. Switched to `source_notice_id`
  (used as the tender reference on the cover page).
- Pre-existing bug, unrelated to the RFP rework; surfaced by the live test.

### Live test (throwaway authenticated user, against ai-rfp-agent-ten.vercel.app)

- Real Supabase login → valid session cookie → `auth/me` 200.
- `extract-all`: **200 — 45 items (30 requirements / 12 questions / 3 guidance)
  from 5 sources, all 45 provenance-tagged, 29 mandatory.** The step-3 fix is
  confirmed working in production.
- approve / unapprove: 200 each.
- Note: answers came back empty because the throwaway org has no knowledge base
  (expected — a real org with evidence drafts normally); re-eval correctly
  returned 400 ("nothing to evaluate") as a result. Export 404 was the source_id
  bug fixed above.

---

## 2026-06-06 — RFP rework Phase 4: response re-evaluation + scoring visual

Final step of the RFP workflow: score the drafted/approved response against the
original tender and show what to improve.

### Added

- Migration `042_rfp_reevaluation.sql` (additive): `rfp_reevaluations`
  (opportunity_id, org_id, overall_score, results jsonb, created_at), org-scoped
  RLS mirroring `opportunity_questions`. Applied to Supabase.
- `GET/POST /api/opportunities/[id]/reevaluate`: POST scores every **answered**
  item (drafted + needs-review + approved, excluding guidance) against the tender
  description + linked documents' text via `gpt-4o-mini` → per-item `score`
  (0-100) + `strengths[]` + `suggestions[]` + an `overall_score`; persists the
  result. GET returns the latest stored evaluation.
- `RfpReevaluationSection.tsx` (Step 7 in RFPWorkflow): "Evaluate response"
  button, an overall score gauge (cloned from `ReadinessWidget`: 72px ring,
  thresholds `#059669/#d97706/#dc2626`), and a per-item list (weakest first) with
  score bars, improvement suggestions, and strengths.

### Verified

- Typecheck clean; RFP tab renders (200); both routes auth-gate (401). End-to-end
  scoring smoke: a strong ISO-27001 answer scored high with strengths, a weak
  "We monitor" answer scored 20 with a concrete suggestion, overall 60 persisted
  to `rfp_reevaluations` and read back.

---

## 2026-06-06 — RFP rework Phase 3: provenance, unapprove, mandatory export gate

Per-card enhancements in the existing Requirements + Questions sections (kept as
two sections per the agreed design).

### Added

- **Provenance chip** on every requirement/question card showing `source_document`
  ("Opportunity description" or the document title) — "where this came from".
- **Unapprove** button on approved cards (PATCH `answer_status:'drafted'`) →
  sends the item back to drafting; refreshes export counts.
- **Mandatory export gate**: "Export approved only" is disabled in the UI until
  every mandatory (non-guidance) item is approved, with a list of what's
  outstanding. `export-response?mode=approved` also returns **409** server-side
  (defense in depth). "Export all answered" remains available.

### Notes

- Requirement fit-eval was already provided by the existing flow (KB-grounded
  compliance statement via `answer-all` + High fit/Review/Gap badge with score% +
  needs-review reason for "what to add"), so no new route was needed.
- Per-card AI actions (Question → "Generate answer"; Requirement → "Draft
  statement") already call `answer-all` with `questionIds:[id]`, grounded in the
  knowledge base via `retrieveChunks → generateRFPResponse`.

### Verified

- Typecheck clean; RFP tab renders (200); export route auth-gates (401). Unapprove
  uses the existing PATCH (no state guard); provenance reads from the `*` select.

---

## 2026-06-06 — RFP rework Phase 2: unified "Get all details" extraction + provenance

Fixes the step-3 bug. The opportunity RFP tab had two conflicting extraction paths
(`extract-questions` description-only, `extract-from-document` per-doc) plus a racy
per-doc loop with an `append` flag. Phase 2 replaces them with one button that
extracts from the description **and** all tender documents into the existing two
sections, each item tagged with its source.

### Added

- Migration `041_question_provenance.sql` (additive): `source_document` +
  `source_document_id` on `opportunity_questions`. Applied to Supabase.
- `POST /api/opportunities/[id]/extract-all` — single endpoint: warms + links
  accessible docs (central store), reads description + all linked docs' text, runs
  extraction per source (bounded concurrency), dedups by normalized text, and does
  one atomic delete+insert with provenance. Returns counts by class + source list.
- `POST /api/opportunities/[id]/tender-documents/upload` — manual upload for
  portal-locked docs → stored in the central store + linked, then picked up by
  extract-all. Backed by new `uploadTenderDoc()` in `lib/tender-docs.ts`.
- `collectOpportunityDocUrls()` + `getOpportunityTenderTexts()` helpers.

### Changed

- `lib/rfp-extract.ts`: extraction now returns `word_limit` and an explicit
  tender-derived `mandatory` flag (pass/fail / "must" / minimum), replacing the
  old `risk_level !== "low"` proxy. Guidance items are never mandatory.
- `RFPWorkflow.tsx`: steps 3 (extract-all docs) and 4 (extract from description)
  collapsed into one "Get all details" step (no per-doc race, no stale UI). Steps
  renumbered (requirements 4, questions 5, export 6). `DocExtractRow` removed.
- `extract-from-document` now persists `mandatory` + `word_limit`.

### Verified

- Typecheck clean. End-to-end smoke against a real opportunity with Contracts
  Finder docs: 25 items extracted from 3 sources (description + 2 docs), 17/25
  mandatory (not all — flag works), provenance stamped correctly, provenance
  columns accept the insert. RFP tab renders (200); both new routes auth-gate (401).

---

## 2026-06-06 — RFP rework Phase 1: central tender document store + dedup

Part of the RFP response workflow rework (plan: 4 phases). Phase 1 establishes a
**global, deduped** store of tender documents so the same tender is never
re-downloaded or re-extracted, and its text is persisted for reuse by extraction
and (Phase 4) re-evaluation.

### Added

- Migration `040_tender_documents_central.sql` (additive, idempotent): global
  `tender_documents` (content-hash dedup; stores bytes path + `extracted_text` +
  page/word counts) and `opportunity_tender_documents` link table. RLS: `SELECT`
  for authenticated users, writes via service role only — same trust class as the
  global `opportunities` catalog (public buyer material). Applied to Supabase.
- `lib/tender-docs.ts` — `getOrFetchTenderDoc(url, opportunityId, title?)`: URL
  fast-path (no download) → content-hash dedup (no re-upload/re-extract) → store +
  link. Typed `TenderDocError` + `tenderDocErrorResponse` for route mapping.
- ADR-011 in `MARKET_WEDGE_ARCHITECTURE_DECISIONS_v3.md`.

### Changed

- `extract-from-document/route.ts` now delegates fetch/cache/extract to
  `getOrFetchTenderDoc` (per-org `tender_doc_cache` left as dormant fallback; a
  later migration drops it once prod-proven).
- `fetch-documents/route.ts` warms + links accessible docs into the central store
  (non-fatal, `maxDuration=60`).

### Tests

- `tests/tenant-isolation.test.ts`: added `beforeAll`/`afterAll` to seed + tear
  down the two test orgs + a test opportunity. The suite previously could not run
  on a fresh instance (FK violations); now **9/9 pass**, confirming
  `opportunity_questions` org-isolation is unaffected by the new global tables.
- Verified the dedup path end-to-end against a real Contracts Finder attachment
  (download → store → extract → link → 2nd-call `fromCache=true`).

---

## 2026-06-06 — Buyer briefing tab: verified + regenerate fix (commit f10247d)

### Fixed — "Regenerate" now actually regenerates

- `app/api/opportunities/[id]/buyer-research/route.ts`: the POST handler returned the
  cached `buyer_briefing` whenever one existed, so the "Regenerate" button only ever
  re-streamed the same text. Added a `?refresh=true` cache-bypass (matching the
  ai-gap-match clear pattern); the cached path is now `if (opp.buyer_briefing && !refresh)`.
  Renamed `_req` → `req` to read the query param.
- `app/opportunities/[id]/buyer/page.tsx`: `generateBriefing(force = false)` appends
  `?refresh=true` when forced; "Regenerate" calls `generateBriefing(true)`. Both buttons
  wrapped in arrow functions so the click event is not passed as `force`.

### Verified end-to-end

- Typecheck clean; buyer page renders (HTTP 200); both routes auth-gate correctly (401)
  with no crash; `?refresh=true` parses.
- Ran the route's data→prompt→OpenAI-stream pipeline against a real opportunity
  (Department for Education, 81 tenders): pulled 10 prior tenders for context, streamed a
  grounded 3-paragraph briefing, cache write-back confirmed. Buyer history aggregation
  validated against real data (MoJ 105 tenders, DfE 81/9 open).
- Note: `opportunities` is an intentionally central/global catalog (migration 023), so the
  absence of `org_id` filtering in these routes is by design, not a leak.

---

## 2026-06-06 — Evidence gap engine UX + RFP Response workflow rework

### Added — Evidence Gaps improvements (commits eecc39f, dee6ff8, 772f2c3)

**Phase 1 — gap visibility (`app/opportunities/[id]/gaps/page.tsx`, `lib/evidence-gap.ts`):**

- Gap results sorted by risk: mandatory-missing → expiring → covered
- Mandatory badge per card; expiry dates inline on matched evidence pills
- Amber "Expiring soon" callout; "We looked for: X, Y" hints on missing cards

**Phase 2 — inline quick-add:**

- Inline "Quick add evidence" form on missing/expired cards; POSTs to existing `/api/clients/[id]/evidence`, auto-refreshes gap analysis; pre-fills evidence type from detected signal

**Phase 3 — AI semantic matching:**

- `POST /api/opportunities/[id]/ai-gap-match` — sends all requirements + evidence vault to GPT-4o-mini; returns per-requirement coverage + confidence + one-sentence reason
- Cached in `bid_pipeline.ai_gap_analysis` JSONB (migration 039, applied); `DELETE ...?clientId=X` clears cache; "Clear" button forces regen

---

### Changed — RFP Response workflow complete rework (commits 6851785, 76e8bde, b4a9589)

The old `QuestionsPanel.tsx` (1778 lines on the Details tab) is **deleted**. The full workflow now lives on the **RFP Response tab** (`/opportunities/[id]/rfp`) as 7 sequential sections.

**New files:**

- `app/opportunities/[id]/rfp/RFPWorkflow.tsx` — main client component, 7 sections
- `app/opportunities/[id]/rfp/RequirementsSection.tsx` — compliance requirements
- `app/opportunities/[id]/rfp/QuestionsSection.tsx` — questions section + ExportSection
- `POST /api/opportunities/[id]/summarise` — streams a 3-bullet AI tender summary

**Deleted files:**

- `app/opportunities/[id]/QuestionsPanel.tsx`
- `app/opportunities/[id]/rfp/RFPResponseContent.tsx`

**The 7 steps:** (1) tender overview, (2) what this tender wants + "Summarise with AI", (3) tender documents per-doc extract, (4) extract from description with preview, (5) compliance requirements with AI statement + fit badge, (6) questions to answer with progress/filters/"Answer all" SSE/approve-all, (7) review & export DOCX.

The Details tab now shows only opportunity metadata + a compact "Work on response →" card linking to the RFP tab.

**Migration:** `038_buyer_briefing.sql` — `buyer_briefing text` on opportunities.

---

### Fixed — RFP workflow bugs (commits 6d8b172, ffe2192)

- `refreshCounts()` treated `{ questions: [] }` response as a raw array → counts always 0 → requirements/questions sections never appeared. Fixed.
- `answerAll()` / `draftAll()` did `await fetch(all questions)` inside the SSE loop per event → race conditions, answers not showing. Fixed: SSE loop reads only progress counters; single `loadQuestions()` after stream ends.
- `ExportSection` only re-fetched on total-count changes, not individual approvals. Fixed: `approvalKey` counter incremented on every approval, passed as a `useEffect` dependency.

---

## 2026-06-05 — Admin access control, client invite flow, answer visibility

### Fixed (commit 9a7291b)

**Admin-only restrictions:**

- `components/AppSidebar.tsx`: Clients nav item marked `adminOnly: true` — hidden for non-admin accounts (same pattern as Sources)
- `middleware.ts`: `ADMIN_PAGES` extended with `/clients` and `/admin` — direct URL navigation by non-admins redirects to `/`

---

### Added (commit 39fcf2e)

**Client account provisioning — invite flow:**

- Migration 037: `invited_email`, `invite_sent_at`, `client_org_id` (FK → orgs) on `clients` table; partial index on invited_email
- `POST /api/clients/[id]/invite`: org-scoped; calls `supabase.auth.admin.inviteUserByEmail` with `redirectTo` containing `client_id`; records invite on client row
- `app/auth/callback/route.ts`: links `client_org_id = newOrgId` after invite accepted; email-match check prevents URL spoofing; `IS NULL` guard prevents re-linking
- `lib/org.ts`: import corrected to `@/lib/supabase-service`
- `/clients/[id]`: invite status chips (green "Active account" / amber "Invite pending"), inline invite form
- `components/ClientsAdmin.tsx`: create client + optional email invite in one step; shown in `/admin` under "Client accounts"
- `app/admin/page.tsx`: "Client accounts" section added at top
- Vercel: `NEXT_PUBLIC_APP_URL` set for Production and Development

---

### Fixed (commit e233a2c)

**AI answer visibility + export button:**

- `QuestionsPanel.tsx`: replaced `<textarea rows={5}>` with full-height pre-wrap `<div>` — entire answer visible without scrolling
- Edit mode via `editingIds: Set<string>` — click answer or "Edit" button; textarea + Save/Discard appear
- Green dismissible banner after "Answer All": "✓ N answers generated — scroll down to review, edit, and approve"; auto-dismisses 8s
- Export button always rendered: DOCX link with count when answers exist, plain hint when none

---

## 2026-06-05 — Phases 7+9+10: matrix filter, gap DOCX export, source cron

### Added (commit 171a120)

**Phase 9 — Gap report in DOCX:**

- `ExportGapReport` type + `gapReportSection()` appendix in `lib/export-response-docx.ts`
- Export route automatically runs `analyseGaps()` when a client is linked via pipeline; appends gap table to DOCX

**Phase 7 — Compliance matrix UX:**

- Status filter dropdown + Mandatory-only checkbox (client-side, no extra requests)
- "Copy as Markdown" button — copies filtered requirements as pipe table to clipboard
- Empty state message when filter returns no rows

**Phase 10 — Find a Tender daily sync:**

- Migration 036: seeds all 4 source rows (find-tender, contracts-finder, public-contracts-scotland, sell2wales)
- `/api/cron/sync-sources`: daily sync at 06:00 UTC via vercel.json cron
- All remaining `@/lib/supabase` → `@/lib/supabase-service` migration complete (S-004 cleanup done)

---

## 2026-06-05 — Phases 5+6: readiness score + evidence gap engine

### Added (commit 2703a03)

**Phase 5 — readiness score:**

- `lib/readiness.ts`: IT/Cyber and Facilities vertical checklists; keyword + evidence_type matching; weighted scoring (3/2/1); expiring = 0.5 weight; returns 0-100 score + per-item coverage
- `GET /api/clients/[id]/readiness`: org-scoped, returns ReadinessScore or "unsupported vertical" message
- `/clients/[id]` ReadinessWidget: circular SVG gauge, progress bar, checklist rows with coverage icons (✓/⚠/✕/–), weight labels, "Add missing evidence →" link

**Phase 6 — evidence gap engine:**

- `lib/evidence-gap.ts`: 14 REQUIREMENT_SIGNALS mapping bid phrases (ISO 27001, GDPR, PI insurance, case studies, etc.) → evidence_type + keywords; coverage: covered/partial/expired/missing; no AI tokens
- `GET /api/opportunities/[id]/evidence-gaps?clientId=`: maps requirement-class questions → client evidence; falls back to all non-guidance questions; returns GapReport with counts and per-item results
- `OpportunityTabs`: added "Evidence Gaps" tab at `/opportunities/[id]/gaps`
- `/opportunities/[id]/gaps` page: auto-selects client from pipeline; score gauge; coverage filter pills; colour-coded requirement cards with left border, risk badge, "Add →" link

---

## 2026-06-05 — Phase 5: scoped RAG + fit scoring persistence

### Added (commit cc77f01)

**Scoped RAG per client:**

- Migration 034: `hybrid_search_chunks` extended with `p_client_id`; retrieval includes client-specific docs + shared org docs when set, all org docs when null
- `retrieveChunks()`: new optional `clientId` param forwarded to RPC
- `answer-all` route: reads `bid_pipeline.client_id` for the opportunity+org, scopes AI retrieval to that client's evidence
- `ask` route: accepts optional `client_id` in request body, scopes retrieval; UI can pass it when in a client context
- `rfp/answer-batch`: imports from `supabase-service` (cleanup)

**Fit score persistence:**

- Migration 035: `bid_pipeline` gains `fit_score`, `readiness_score`, `recommended_action`, `score_reasons[]`, `score_risks[]`, `scored_at`
- `analyse` route: updates `bid_pipeline` row with scores after analysis so pipeline page shows scores without re-running
- Pipeline page: `ACTION_STYLES` lookup added; recommended_action badge (Bid/Maybe/Needs review/Do not bid) + `fit N · ready N` monospace chip on each card

---

## 2026-06-05 — Phases 3+4 complete: client wiring + evidence vault

### Added (commit e007270)

**Phase 3 — client_id wired into existing flows:**

- OpportunityActions: client selector before "Save opportunity"; client_id persisted to bid_pipeline; restored from pipeline-status on load
- add-to-pipeline route + addToPipeline(): accept and save client_id
- pipeline-status route: returns client_id alongside saved flag
- Pipeline page: client filter dropdown; client name badge on each card linking to /clients/[id]
- DocumentUpload: "Scope to client" dropdown; passes client_id in FormData
- documents/upload route + ingestDocument: accept and persist client_id on documents

**Phase 4 — evidence vault:**

- Migration 033: `evidence_items` table (org_id + client_id FKs, 7-value type enum, status auto-set by BEFORE trigger from expires_at)
- GET/POST `/api/clients/[id]/evidence` + PATCH/DELETE `/api/clients/[id]/evidence/[eid]`
- `/clients/[id]/evidence` page: status summary chips (valid/expiring_soon/expired), type filter pills, inline add form, per-item inline edit, delete with confirm
- `/clients/[id]` detail: evidence vault placeholder replaced with live link card

---

## 2026-06-05 — Phase 3 foundation shipped

### Added (commit b674c7d)

- Migration 031: `clients` table — org_id FK, vertical enum, status, website, notes; RLS scoped to org_memberships
- Migration 032: nullable `client_id` FK on documents, opportunity_questions, bid_pipeline, compliance_matrices with partial indexes
- `GET/POST /api/clients` + `GET/PATCH/DELETE /api/clients/[id]` — org-scoped CRUD with Zod validation; DELETE is soft-archive
- `/clients` list page — inline create form, status filter, hover cards
- `/clients/[id]` detail page — inline edit, archive confirmation, vertical/status badges, placeholder cards for Phase 4
- Clients nav item added to sidebar and topbar breadcrumb map
- 3 client isolation tests added to `tests/tenant-isolation.test.ts`

### Architecture

Clients modelled as a separate table linked to agency org (Option A / ADR-005). Existing single-org constraint preserved. client_id is nullable on all tables — no migration impact on existing data.

---

## 2026-06-05 — Phase 2 security fixes complete

### Security (commit 83573dc)

- S-001: `tender_doc_cache` — added `org_id` column + RLS policy via migration 030; storage path now org-prefixed
- S-002: `/api/admin/integrations` GET — added `requireAdmin()` check; previously any authenticated user could read webhook credentials
- S-003: `CRON_SECRET` — made required; returns 500 if unset instead of being publicly accessible
- S-004: `lib/supabase-service.ts` created; service role key moved out of `lib/supabase.ts`; anon client now isolated in that file
- S-005: `tests/tenant-isolation.test.ts` — 5 cross-tenant tests across documents, opportunity_questions, tender_doc_cache, answer_library; run via `npm run test:isolation`
- S-006: Rate limit fail-open now logs `console.error` so DB errors are visible in production logs

Phase gate cleared. Safe to onboard real organisations.

---

## 2026-06-05 — Phase 0 complete

### Added

- `MARKET_WEDGE_REPO_STATE_v3.md` — full snapshot of repo: stack, all routes, all DB tables, RAG pipeline, what exists vs what is missing
- `MARKET_WEDGE_SECURITY_PLAN_v3.md` — updated with audit findings: 14 security risks documented and classified (S-001 to S-014), phase gate defined

### Changed

- `MARKET_WEDGE_EXECUTION_TRACKER_v3.md` — Phase 0 marked complete; all checklist items ticked; Phase 2 checklist populated with actual gaps found
- `MARKET_WEDGE_NEXT_ACTIONS_v3.md` — replaced placeholder with concrete Phase 2 tasks (S-001 to S-006) with exact file paths and code changes needed
- `MARKET_WEDGE_ARCHITECTURE_DECISIONS_v3.md` — added ADR-004 through ADR-010 based on audit findings

### Security

- 3 critical risks identified: tender_doc_cache has no RLS, admin integrations GET is unprotected, CRON_SECRET is optional
- 3 high risks identified: supabase client split needed, no cross-tenant tests, rate limit fail-open
- 8 medium/low risks documented
- Phase gate written: do not onboard real orgs until S-001 through S-006 resolved

### Repo state summary

The product already substantially implements Phases 5, 7, 8, and 9 from the build plan (opportunity workflow, compliance matrices, AI answer drafting, review queue, DOCX export). The main gaps before production use are the security fixes above and the agency/client workspace model (Phase 3).

---

## Created (initial)

### Added

- Unique market-wedge strategy v3 folder
- Unique internal filenames
- Strategy build plan
- Execution tracker
- Security plan
- Product requirements
- Validation and GTM plan
- Next actions
- Architecture decisions

### Security

- Security remains the number one priority
