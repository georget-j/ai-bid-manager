# Market Wedge Strategy Build Plan v3

## Purpose

This file is a Claude Code-friendly strategic build plan for turning the existing AI RFP Agent repo into a production-grade UK public-sector bid operating system.

This version intentionally uses a unique folder and file naming scheme so it does not overlap with previous planning packs in this chat.

Target repo:

```text
https://github.com/georget-j/ai-rfp-agent
```

---

# 1. Strategic north star

Build:

```text
A secure, UK-specific bid operating system that helps bid agencies and SME suppliers turn public-sector opportunities into evidence-backed, reviewable, submission-ready bid packs.
```

Do not build:

```text
A generic AI bid writer
```

Do not build:

```text
A generic tender alerts platform
```

The strategic wedge is:

```text
UK bid agencies serving SME suppliers in one selected vertical.
```

Recommended first vertical:

```text
IT / cyber / SaaS / digital suppliers
```

Alternative vertical:

```text
Facilities management / cleaning / security / maintenance suppliers
```

---

# 2. Why this wedge

Bid agencies are attractive because they:

- manage multiple clients
- repeat tender workflows weekly
- understand bid/no-bid pain
- chase missing evidence from clients
- reuse content across bids
- need compliance matrices
- need reviewable draft answers
- can become channel partners
- can expand usage across many client workspaces

The first product should help an agency:

```text
create a client workspace
→ upload client evidence
→ analyse a live tender
→ identify missing evidence
→ create a compliance matrix
→ draft answers with citations
→ review/edit/approve
→ export a bid pack
```

---

# 3. Strategic differentiation

## Compete against tender-alert tools by going deeper

Tender-alert tools help users find opportunities.

This product should help users decide:

```text
Should we bid?
Can we prove we can deliver?
What evidence is missing?
What should we draft?
Who needs to review it?
What is ready to export?
```

## Compete against AI bid writers by being evidence-led

The product should not just produce fluent prose.

Every answer should have:

- evidence used
- citations
- confidence
- missing evidence
- unsupported claim warnings
- review status

## Compete against public-sector intelligence tools by owning the execution workflow

Do not try to out-data large intelligence platforms first.

Win by turning a tender into a bid pack.

---

# 4. Product backbone

The platform should be built as five connected systems:

## System 1 — Secure workspace foundation

- authentication
- organisation/workspace model
- agency/client workspaces
- role-based access
- Supabase RLS or equivalent
- private documents
- scoped RAG retrieval
- scoped citations
- audit logs

## System 2 — Evidence vault and readiness

- client profile
- evidence upload
- evidence types
- evidence expiry
- approved claims
- missing evidence
- readiness score
- vertical evidence checklist

## System 3 — Opportunity intake and analysis

- manual opportunity creation
- tender document upload
- fit score
- readiness score
- bid/no-bid recommendation
- risk flags
- opportunity pipeline
- Find a Tender connector later

## System 4 — Bid production workflow

- requirement extraction
- compliance matrix
- evidence gap engine
- draft answers
- citations
- review queue
- approval workflow
- bid pack export

## System 5 — Bid memory and moat

- approved answer bank
- evidence graph
- claim-to-evidence mapping
- previous usage
- reviewer edits
- win/loss notes
- buyer/sector memory

---

# 5. Build phases

## Phase 0 — Security and repo audit

Goal:

```text
Understand the existing repo and identify production blockers.
```

Claude Code must inspect:

```text
package.json
app/
app/api/
components/
lib/
middleware.ts
supabase/migrations/
tests/
.env.example
README.md
docs/
.claude/
```

Track:

- existing routes
- API routes
- Supabase schema
- RAG pipeline
- document upload flow
- embeddings/vector search
- review queue
- admin routes
- auth status
- RLS status
- tenant isolation gaps
- document privacy gaps
- service role key usage
- RAG scoping risks
- XSS risks
- rate limiting gaps

Definition of done:

- [ ] repo structure documented
- [ ] current RAG workflow documented
- [ ] current security risks documented
- [ ] production blockers documented
- [ ] next actions created
- [ ] no product features built before audit is complete

---

## Phase 1 — Wedge validation assets

Goal:

```text
Create the materials needed to validate the bid-agency wedge.
```

Claude Code should create:

- interview script
- ICP scorecard
- pilot offer
- validation tracker
- paid pilot workflow
- target-list template

Founder should interview:

- 10 bid agencies
- 10 SMEs in selected vertical
- 5 in-house bid managers
- 5 public-sector sales/capture people

Definition of done:

- [ ] interview script created
- [ ] ICP scorecard created
- [ ] pilot offer created
- [ ] validation tracker created
- [ ] first vertical selected
- [ ] founder can start outreach

---

## Phase 2 — Production security foundation

Goal:

```text
Make the app safe for real organisation data.
```

Build or verify:

- authentication
- organisation model
- membership model
- roles
- agency/client isolation
- organisation_id on sensitive records
- Supabase RLS
- private file storage
- upload validation
- scoped RAG retrieval
- scoped citations
- admin route guards
- audit logs
- rate limits
- tenant isolation tests

Definition of done:

- [ ] auth implemented or clearly selected
- [ ] organisation/workspace model exists
- [ ] sensitive tables scoped
- [ ] RLS or equivalent enforced
- [ ] RAG cannot retrieve cross-tenant data
- [ ] documents are private
- [ ] admin routes protected
- [ ] source sync routes protected
- [ ] tests prove tenant isolation

---

## Phase 3 — Agency/client workspace

Goal:

```text
Support bid agencies managing multiple clients.
```

Build:

- agency workspace
- clients list
- client detail page
- client profile
- client evidence area
- client opportunities
- client pipeline
- permissions model

Definition of done:

- [ ] agency can create client workspace
- [ ] client data is isolated
- [ ] client profile exists
- [ ] client evidence area exists
- [ ] client opportunities can be associated
- [ ] client pipeline exists or is planned
- [ ] security tests cover client separation

---

## Phase 4 — Evidence vault and readiness

Goal:

```text
Make proof reusable, trackable, and scoreable.
```

Build:

- evidence item model
- evidence categories
- vertical evidence checklist
- evidence expiry tracking
- approved claims
- readiness score
- missing evidence dashboard

Definition of done:

- [ ] evidence model exists
- [ ] evidence dashboard exists
- [ ] first vertical evidence types exist
- [ ] readiness score works
- [ ] expired evidence is flagged
- [ ] missing evidence is visible
- [ ] evidence linked to documents
- [ ] evidence access is scoped securely

---

## Phase 5 — Opportunity intake and analysis

Goal:

```text
Allow users to evaluate real tenders before every connector exists.
```

Support:

- manual opportunity creation
- tender document upload
- source URL
- seeded opportunities
- opportunity detail page
- fit/readiness scoring
- bid/no-bid recommendation
- risk flags
- add to pipeline

Definition of done:

- [ ] opportunity can be created manually
- [ ] tender documents can be attached
- [ ] opportunity detail page exists
- [ ] fit/readiness analysis runs
- [ ] risks are displayed
- [ ] missing evidence is displayed
- [ ] opportunity can be added to pipeline

---

## Phase 6 — Evidence gap engine

Goal:

```text
Make evidence gaps the hero feature.
```

Inputs:

- opportunity
- tender documents
- extracted requirements
- profile
- evidence vault
- knowledge base

Outputs:

- requirement
- required evidence
- evidence found
- evidence strength
- missing evidence
- risk level
- owner
- request status

Definition of done:

- [ ] evidence gaps generated
- [ ] gaps mapped to requirements
- [ ] evidence strength shown
- [ ] missing evidence request draft created
- [ ] evidence expiry considered
- [ ] no cross-client leakage possible

---

## Phase 7 — Compliance matrix generator

Goal:

```text
Turn tender documents into structured bid work.
```

Fields:

- section reference
- requirement
- mandatory/pass-fail
- evaluation weighting
- evidence required
- owner
- status
- draft answer
- confidence
- citations
- risk level

Definition of done:

- [ ] tender document can be processed
- [ ] requirements extracted
- [ ] compliance matrix created
- [ ] matrix links to opportunity
- [ ] requirements can be reviewed
- [ ] weak requirements flagged
- [ ] matrix can be exported or copied

---

## Phase 8 — Evidence-backed response drafting

Goal:

```text
Draft answers from approved evidence, not hallucinated claims.
```

Every answer must show:

- answer text
- confidence
- citations
- evidence used
- missing evidence
- risk flags
- review status

Definition of done:

- [ ] draft answers generated from knowledge base
- [ ] citations included
- [ ] missing evidence flagged
- [ ] unsupported claims avoided
- [ ] answers editable
- [ ] answers approvable
- [ ] risky answers routed to review

---

## Phase 9 — Review workflow and bid pack export

Goal:

```text
Turn AI draft output into approved bid content.
```

Review actions:

- approve
- edit
- reject
- request evidence
- assign

Bid pack should include:

- opportunity summary
- bid/no-bid recommendation
- fit score
- readiness score
- evidence gap report
- compliance matrix
- draft answers
- citations
- unresolved risks

Definition of done:

- [ ] review items include opportunity context
- [ ] reviewer can approve/edit/reject
- [ ] bid pack export generated
- [ ] approved answers stored for reuse
- [ ] unresolved risks shown

---

## Phase 10 — Find a Tender connector

Goal:

```text
Add the first real procurement feed after manual workflow works.
```

Build:

- source model
- raw notice model
- connector
- raw payload storage
- payload hashing
- normalisation
- deduplication
- sync status UI
- protected sync route

Definition of done:

- [ ] Find a Tender sync runs
- [ ] raw notices stored
- [ ] opportunities created/updated
- [ ] duplicates avoided
- [ ] sync errors shown safely
- [ ] source data safely rendered

---

## Phase 11 — Paid pilot workflow

Goal:

```text
Support real pilots with bid agencies.
```

For each pilot:

1. create agency/client workspace
2. upload client evidence
3. create client profile
4. add opportunities
5. analyse 5–10 tenders
6. choose one live tender
7. generate evidence gap report
8. create compliance matrix
9. draft key answers
10. review/export bid pack

Track:

- time saved
- opportunities reviewed
- missing evidence found
- requirements extracted
- answers generated
- answers approved
- pilot price paid
- user satisfaction
- willingness to continue

Definition of done:

- [ ] pilot workflow documented
- [ ] pilot metrics tracked
- [ ] onboarding checklist exists
- [ ] bid pack export works
- [ ] feedback capture exists

---

## Phase 12 — Productisation

Goal:

```text
Reduce manual founder effort.
```

Build:

- guided onboarding
- vertical selector
- evidence checklist templates
- profile setup wizard
- first-analysis walkthrough
- empty states
- usage analytics
- billing plan

Definition of done:

- [ ] new user can set up workspace
- [ ] user can upload documents
- [ ] user can create profile
- [ ] user can analyse first opportunity
- [ ] product can be demoed without heavy explanation

---

## Phase 13 — Bid memory and evidence graph

Goal:

```text
Build the defensible moat.
```

Build:

- claims model
- evidence-claim links
- approved answers
- answer versions
- previous use tracking
- bid outcomes
- reviewer history
- win/loss notes
- buyer memory
- sector playbooks

Definition of done:

- [ ] approved claims stored
- [ ] claims linked to evidence
- [ ] answers linked to claims
- [ ] expiry risk visible
- [ ] previous use visible
- [ ] bid outcome recorded
- [ ] future drafting improves from past approvals

---

## Phase 14 — Growth and agency expansion

Goal:

```text
Turn the product into a scalable business.
```

Create:

- pricing hypothesis
- pilot offer page
- landing page copy
- agency outreach list template
- case study template
- growth metrics
- onboarding materials

Definition of done:

- [ ] pricing hypothesis documented
- [ ] landing page copy drafted
- [ ] outreach list structure created
- [ ] case study template created
- [ ] growth metrics defined

---

# 6. What not to build yet

Do not build early:

- every procurement source
- full buyer intelligence
- full CRM
- automatic tender submission
- marketplace
- award analytics
- every industry playbook
- complex billing
- enterprise SSO
- white labelling
- mobile app
- generic AI chat as the main interface

---

# 7. Claude Code session rules

At the start of every session, read:

```text
docs/market-wedge-strategy-v3/MARKET_WEDGE_STRATEGY_BUILD_PLAN_v3.md
docs/market-wedge-strategy-v3/MARKET_WEDGE_EXECUTION_TRACKER_v3.md
docs/market-wedge-strategy-v3/MARKET_WEDGE_NEXT_ACTIONS_v3.md
docs/market-wedge-strategy-v3/MARKET_WEDGE_SECURITY_PLAN_v3.md
```

At the end of every meaningful session, update:

```text
MARKET_WEDGE_EXECUTION_TRACKER_v3.md
MARKET_WEDGE_NEXT_ACTIONS_v3.md
MARKET_WEDGE_CHANGELOG_v3.md
MARKET_WEDGE_ARCHITECTURE_DECISIONS_v3.md
MARKET_WEDGE_SECURITY_PLAN_v3.md if security risks changed
```

If context compacts, stop and re-read the same files.

---

# 8. Claude Code master prompt

```text
Read these files first:

- docs/market-wedge-strategy-v3/MARKET_WEDGE_STRATEGY_BUILD_PLAN_v3.md
- docs/market-wedge-strategy-v3/MARKET_WEDGE_EXECUTION_TRACKER_v3.md
- docs/market-wedge-strategy-v3/MARKET_WEDGE_NEXT_ACTIONS_v3.md
- docs/market-wedge-strategy-v3/MARKET_WEDGE_SECURITY_PLAN_v3.md
- docs/market-wedge-strategy-v3/MARKET_WEDGE_PRODUCT_REQUIREMENTS_v3.md
- docs/market-wedge-strategy-v3/MARKET_WEDGE_VALIDATION_AND_GTM_v3.md
- docs/market-wedge-strategy-v3/MARKET_WEDGE_ARCHITECTURE_DECISIONS_v3.md
- docs/market-wedge-strategy-v3/MARKET_WEDGE_CHANGELOG_v3.md

This repo is being converted from an AI RFP Agent into a production-grade UK public-sector bid operating system.

The strategic wedge is:

UK bid agencies serving SME suppliers in one selected vertical.

The product is not just an AI writer.

The product workflow is:

opportunity discovery
→ bid/no-bid decision
→ evidence readiness check
→ missing evidence request
→ compliance matrix
→ evidence-backed draft
→ human review
→ exportable bid pack
→ bid memory for future tenders

Security is the number one priority.

Do not implement product features until the current phase in the tracker and next-actions file says to.

Start by checking the current phase and next action.

Then inspect the repository and make the smallest safe changes needed for the current phase.

At the end, update all tracking files.
```
