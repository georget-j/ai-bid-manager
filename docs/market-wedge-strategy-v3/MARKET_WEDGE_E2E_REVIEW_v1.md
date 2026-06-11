# E2E Review v1 — core vs peripheral, coverage, programmes, profile (2026-06-11)

4-lane read-only audit (full detail in the session transcript). Decisions recorded here.

## Core vs peripheral verdicts

CORE (keep, invest): home, /opportunities(+detail+rfp tab), /my-opportunities, /grants(+detail),
/my-grants, /my-applications, guided flow (/rfp/drafts/[id]), /ask, /documents (Evidence
library), /review, /profile, /responses, sources/cron/connector machinery.

SUPPORTING (keep): gaps tab, buyer tab, alerts, compliance, history, team, clients (agency
wedge — currently 0 rows), /help, operator pages.

PERIPHERAL (keep, don't grow): /buyers + /funders directories (research value; demoted),
/programmes (being linked into core — see below), investor events (explicit owner feature;
reviewer suggested parking it — overruled, it stays).

DELETED (orphaned/dead, this commit): /demo (pre-pivot scenarios, wrong product),
/rfp + /rfp/history (standalone pages superseded by /responses + the opportunity Respond tab;
"Start RFP response" CTA re-pointed), components/AppHeader.tsx (imported by nothing).
/services linked into the public nav (was orphaned).

ROADMAP (merge candidates, not now): /pipeline → board view inside /my-opportunities;
/responses vs /my-applications same-draft overlap (one drafting workspace, one tracking view —
needs naming + filter, not deletion); compliance → opportunity tabs; no public landing at /
(signed-out → /login; marketing pages only by direct URL).

## Grants coverage (audited vs live sites)

GOV.UK Find a Grant: 108 DB vs 107 live — exact after prune-lag reconciliation. Innovate UK:
25/25 exact. UKRI: 30/112 — connector shipped same day, converging at 6 pages/night; FIXES:
cap raised to 13 so a full walk fits one run (prune can finally run — 2 stale grants were
already rotting), nightly deadline-passed status sweep as backstop for ALL sources, Innovate UK
page cap moved out of the connector (could masquerade as walk-complete → wrongful mass-prune),
grant_sync_runs history table (071) (cron failures were unprovable — first-night 360giving
failure was erased by the next manual run), sync route refuses disabled sources,
cross-source duplicate collapse for display (22 open calls shown 2-3×), /grants default
open+forthcoming. sedia-horizon ENABLED (owner decision) — 50 staged Horizon grants stay fresh,
backlog drains nightly.

## Programmes → linked into core (owner goal: "link those workflows into the tool")

Keystone: curated programmes upserted as grants rows (source 'curated-programmes', rolling/
dated) → the ENTIRE guided apply-with-evidence flow works untouched (drafts, eligibility
scoring, due-soon, alerts). Excluded by default from /grants + recommendations (own surface:
/programmes gains "Programmes for you" + "Apply with your evidence →"). Hand-curated question
sets for the wedge five (NCSC For Startups, Cyber Runway, CyLon, Entrepreneur First, Seedcamp).
Events cross-links for the 2 exact organizer matches. Deferred: live programme data feeds
(paid), programme-site question scraping (JS-heavy portals).

## Profile + evidence (owner goal: "all the information you would expect from a business")

Migration 070 (approved): organisation_profiles += website, vat_number, registered_address
jsonb, incorporation_date, sic_codes[], trading_names[], employee_count, key_people jsonb,
memberships[], frameworks jsonb, policies jsonb, carbon_reduction_plan; insurance jsonb gains
insurer/policy_number/expiry per line (shape change, no schema). evidence_items freed from the
agency-clients model (client_id nullable, types += insurance/membership) → org-scoped
"Credentials" in the Evidence library with expiry tracking. Completeness logic unified into
lib/setup-flow.ts (was duplicated). Registers mapper extended (address + SIC already in the CH
response, discarded today). AI-fill: draft-only proposals per section (KB retrieval + website
fetch + registers), apply-per-section, never silently written; raw payloads stored.
Generation gains an org-context block so answers can cite registered details + current certs.
Fortis Cyber Solutions Ltd seeded with realistic fictional data across all new fields after the
migration lands.

Known config gaps (user): COMPANIES_HOUSE_API_KEY + CHARITY_COMMISSION_API_KEY (register
auto-fill), RESEND_API_KEY (digests).
