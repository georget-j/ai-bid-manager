# Claude Code Build Brief: Convert AI RFP Agent into UK Bid Intelligence Agent

## Purpose of this file

This file is intended to be pasted into a Claude Code chat or saved in the repository as a working implementation brief.

The goal is to convert the existing app at:

- Current app: `https://ai-rfp-agent-ten.vercel.app`
- Inspiration app: `https://ai-rfp-agent.vercel.app`

into a UK public-sector bid intelligence and RFP response platform.

The current app should not be rewritten from scratch. The existing RFP response, document upload, knowledge base, semantic search, cited answer generation, history, review queue, RFP run, and admin workflows should be preserved and extended.

---

# 1. Product vision

## New product name

Use one of these working names:

- `UK Bid Intelligence Agent`
- `Public Sector Bid Agent`
- `Tender Intelligence Agent`
- `AI Bid Intelligence Platform`

Recommended default:

> **UK Bid Intelligence Agent**

## Homepage positioning

Use this as the primary positioning:

> **Find, qualify, and respond to UK public-sector tenders with AI.**

Supporting copy:

> Monitor UK government, council, NHS, devolved, education, housing, and public-sector procurement opportunities. Score bid fit, identify missing evidence, generate compliance matrices, and draft RFP responses using your approved company knowledge base.

## Product transformation

The current product is primarily:

> An enterprise knowledge-grounded RFP response agent.

The target product is:

> A public-sector opportunity intelligence, bid/no-bid, and RFP response platform for UK suppliers.

The new platform should help users:

1. Discover relevant public-sector tenders.
2. Pull data from official procurement feeds.
3. Match opportunities against their organisation profile.
4. Score fit, readiness, risk, and deadline feasibility.
5. Add opportunities to a bid pipeline.
6. Generate a compliance matrix.
7. Draft tender/RFP answers from uploaded company documents.
8. Route low-confidence or risky answers to review.
9. Export final bid materials or response packs.

---

---

# 1A. Security-first implementation requirement

Security is the number one priority for this build.

Claude Code must treat security, data protection, access control, and safe handling of procurement/customer documents as foundational requirements, not optional polish or a later roadmap item.

This app will handle sensitive commercial information, bid drafts, customer knowledge-base documents, policies, pricing, case studies, compliance evidence, and potentially confidential tender material. Therefore, every phase must be implemented with security as the default.

## Security principles

1. **Security before features**
   - Do not implement a feature in a way that exposes sensitive documents, user data, API secrets, embeddings, generated answers, or procurement records.
   - If a feature cannot be implemented safely in the current architecture, stop and propose the safer implementation path.

2. **Tenant and user isolation**
   - Organisation data must be isolated.
   - Users must not be able to access another organisation’s documents, opportunities, RFP runs, answers, review queue items, profile data, or pipeline records.
   - Every database query for organisation-owned data must be scoped by the authenticated user and organisation.

3. **Authentication and authorisation**
   - Do not rely only on client-side checks.
   - Enforce permissions server-side on every API route, server action, and data-access function.
   - Admin-only functions such as source sync, raw notice access, routing rules, and integrations must require server-side admin checks.

4. **Secrets management**
   - No API keys, database URLs, tokens, or service credentials may be hardcoded.
   - Use environment variables or the project’s existing secret-management pattern.
   - Never expose secrets to the browser bundle.

5. **Document security**
   - Uploaded company documents, tender documents, generated answers, and evidence citations must be treated as sensitive.
   - Validate file type and size.
   - Avoid unsafe file execution.
   - Store files in private storage where possible.
   - Use signed URLs or authenticated download routes where needed.
   - Do not make uploaded documents publicly accessible.

6. **AI/RAG safety**
   - Retrieval must be scoped to the correct organisation/user.
   - Citations must only reference documents the current user is authorised to access.
   - Do not leak raw chunks, embeddings, hidden system prompts, or other tenants’ data.
   - Treat model output as draft decision support, not guaranteed legal/procurement advice.
   - Keep human review for high-risk, low-confidence, or missing-evidence answers.

7. **Procurement data integrity**
   - Store raw public procurement payloads for auditability.
   - Preserve source URLs and timestamps.
   - Avoid silently overwriting or deleting source records.
   - Keep generated analysis separate from original source data.

8. **Input validation**
   - Validate and sanitise all user inputs.
   - Validate connector responses before normalising.
   - Defend against malformed JSON, oversized payloads, unexpected fields, and HTML/script injection in procurement descriptions.

9. **Output encoding**
   - Render procurement descriptions, buyer names, document titles, and uploaded content safely.
   - Prevent XSS in tables, detail pages, markdown renderers, review comments, and generated answer previews.

10. **Auditability**
   - Log important security-relevant events:
     - source sync runs
     - admin actions
     - document uploads/deletions
     - RFP run creation
     - review approvals/rejections
     - integration changes
   - Do not log sensitive document contents, secrets, or full generated bid responses unnecessarily.

11. **Rate limiting and abuse prevention**
   - Add sensible rate limits to expensive AI, sync, upload, and extraction endpoints.
   - Prevent accidental repeated source syncs.
   - Handle external API rate limits gracefully.

12. **Least privilege**
   - Keep data-access functions narrow.
   - Give integrations the minimum permissions needed.
   - Do not expose raw notices, documents, or admin controls to users who do not need them.

13. **Secure-by-default UI**
   - Hide or disable actions the user is not authorised to perform.
   - However, never depend on UI hiding alone; server-side checks are mandatory.

14. **Security acceptance criteria**
   - New routes must include server-side auth checks where required.
   - Organisation-owned data must be scoped.
   - Admin routes must be protected.
   - Uploaded documents must not be public by default.
   - AI retrieval must not cross tenant boundaries.
   - No secrets may be committed.
   - User-generated and source-provided content must be safely rendered.
   - Tests or code review notes should cover these controls for each phase.

If there is a conflict between speed of implementation and security, choose security.


---

# 1B. Context compaction and continuity protocol

Claude Code may compact or summarise the conversation context during long builds. This project brief must therefore include durable, repo-based memory so the true product goals are not lost between compactions, sessions, or model context resets.

The implementation must use repository files as the source of truth, not chat memory alone.

## Core rule

At the start of every Claude Code session, Claude must read the persistent project files listed below before making plans or editing code.

If any of these files do not exist, Claude must create them during Phase 0 or Phase 1.

## Required persistent context files

Create and maintain these files in the repository:

```text
CLAUDE.md
docs/PROJECT_GOALS.md
docs/IMPLEMENTATION_STATE.md
docs/SECURITY_REQUIREMENTS.md
docs/ARCHITECTURE_DECISIONS.md
docs/NEXT_ACTIONS.md
docs/CHANGELOG.md
```

If the repository does not already have a `docs/` directory, create one.

These files are not optional. They are the anti-context-loss system.

---

## 1B.1 `CLAUDE.md`

This should be the short, high-priority instruction file that Claude Code reads first.

It must contain:

```text
# CLAUDE.md

## Project identity

This project is being converted from an AI RFP response tool into a UK public-sector bid intelligence and RFP response platform.

Working product name:
UK Bid Intelligence Agent

Core promise:
Find, qualify, and respond to UK public-sector tenders with AI.

## Non-negotiable priorities

1. Security is the number one priority.
2. Preserve existing RFP, knowledge base, RAG, review queue, history, and admin functionality.
3. Do not rewrite the app from scratch.
4. Build incrementally.
5. Store raw procurement source data before normalisation.
6. Use official APIs/downloads before scraping.
7. Maintain organisation/user data isolation.
8. Keep AI answers evidence-grounded and reviewable.
9. Keep source links and audit trails visible.
10. Update the persistent project files after meaningful changes.

## Required reading before every coding session

Before planning or coding, read:

- docs/PROJECT_GOALS.md
- docs/IMPLEMENTATION_STATE.md
- docs/SECURITY_REQUIREMENTS.md
- docs/ARCHITECTURE_DECISIONS.md
- docs/NEXT_ACTIONS.md
- docs/CHANGELOG.md

Then continue from the current state rather than reinterpreting the original goal.

## Current implementation rule

Always check `docs/NEXT_ACTIONS.md` before choosing work.

If there is conflict between chat instructions and the persistent project goals, stop and ask for clarification unless the chat instruction is clearly a deliberate change from the user.
```

---

## 1B.2 `docs/PROJECT_GOALS.md`

This file captures the durable product strategy.

It should contain:

```text
# Project Goals

## Product vision

Build a UK public-sector bid intelligence and RFP response platform.

The platform helps suppliers:

1. Discover UK public-sector opportunities.
2. Pull tender data from official sources.
3. Match opportunities against an organisation profile.
4. Score bid fit, readiness, risk, and deadline feasibility.
5. Manage opportunities in a bid pipeline.
6. Generate compliance matrices.
7. Draft RFP responses from the company knowledge base.
8. Flag missing evidence.
9. Route risky or low-confidence answers to review.
10. Export/reuse bid response content.

## Current app capabilities to preserve

- Dashboard
- Ask page
- Knowledge Base
- Document upload/indexing
- Semantic search
- Cited answer generation
- History
- Review Queue
- Full RFP document processing
- RFP Runs
- Admin page
- Routing/integrations
- Human review workflow
- Missing information flags
- Evidence-grounded response generation

## Target routes

Authenticated app:

- /dashboard
- /opportunities
- /opportunities/[id]
- /sources
- /buyers
- /pipeline
- /profile
- /rfp
- /knowledge-base
- /ask
- /history
- /review
- /admin

Public site:

- /
- /how-it-works
- /industries
- /resources
- /pricing
- /services
- /contact

## MVP definition

The first useful MVP is done when:

- Product is rebranded as a UK bid intelligence platform.
- User can create an organisation profile.
- App has realistic procurement opportunities.
- User can view, filter, and open opportunities.
- User can score opportunities against the organisation profile.
- User can add opportunities to a bid pipeline.
- User can start an RFP run from an opportunity.
- Existing knowledge base and RFP answer generation still work.
- At least one real source connector works end-to-end, preferably Find a Tender.
- Raw notices are stored before normalisation.
- Duplicate notices are not repeatedly processed.
- Source sync status is visible.
- Missing evidence and risks are shown clearly.
- Persistent continuity files exist and are actively maintained.
- Claude Code session-start and session-end protocols are documented and followed.
```

---

## 1B.3 `docs/IMPLEMENTATION_STATE.md`

This file should be updated after every meaningful coding session.

It should contain:

```text
# Implementation State

Last updated: YYYY-MM-DD

## Current phase

Example:
Phase 2 — Data model and seed data

## Completed

- [ ] Phase 0 repo audit
- [ ] Phase 1 rebrand and navigation scaffold
- [ ] Phase 2 data model and seed data
- [ ] Phase 3 organisation profile and scoring
- [ ] Phase 4 bid pipeline
- [ ] Phase 5 Find a Tender connector
- [ ] Phase 6 RFP run integration
- [ ] Phase 7 compliance matrix
- [ ] Phase 8 additional connectors
- [ ] Phase 9 alerts and saved searches
- [ ] Phase 10 public marketing/resources layer

## What exists now

Document the actual implemented state here.

## What changed in the latest session

Document the latest changes here.

## Known issues

Document bugs, incomplete work, broken tests, or assumptions here.

## Files changed recently

List important files changed recently.

## How to run locally

Document current commands.

## How to test

Document current test commands.

## Important implementation notes

Document anything future Claude sessions must not forget.
```

---

## 1B.4 `docs/SECURITY_REQUIREMENTS.md`

This file keeps security from being lost during context compaction.

It should contain:

```text
# Security Requirements

Security is the number one priority.

## Mandatory controls

- Server-side authentication on protected routes.
- Server-side authorisation on organisation-owned data.
- Tenant isolation for documents, RFP runs, review items, opportunities, profile data, pipeline records, generated answers, citations, and embeddings.
- No secrets in code or browser bundles.
- Uploaded files private by default.
- Signed URLs or authenticated download routes for private files.
- RAG retrieval scoped to the authenticated organisation/user.
- Citations scoped to authorised documents only.
- Admin routes protected server-side.
- Source sync routes protected.
- User/source-provided content safely rendered to prevent XSS.
- Input validation on all API routes.
- Rate limits on upload, sync, extraction, and AI endpoints.
- Audit logging for important admin, upload, review, sync, and RFP actions.
- Do not log sensitive document contents, secrets, embeddings, or complete bid responses unless explicitly required and protected.

## Security checks required before completing each phase

For every phase, answer:

1. Did this phase add or modify protected data?
2. Are all reads/writes scoped by user and organisation?
3. Are all new API routes protected server-side?
4. Are admin-only actions protected server-side?
5. Are uploaded or generated documents private?
6. Can any user access another user’s data?
7. Could source-provided content create XSS?
8. Are secrets kept out of code and client bundles?
9. Are expensive or sensitive endpoints rate-limited?
10. Are security-relevant actions auditable?

Do not mark a phase complete until these questions are answered.
```

---

## 1B.5 `docs/ARCHITECTURE_DECISIONS.md`

This file prevents repeated re-litigation after compaction.

It should contain:

```text
# Architecture Decisions

Use this file to record major decisions.

## Decision format

### ADR-001: Title

Date:
Status: proposed | accepted | superseded

Context:
What problem are we solving?

Decision:
What did we decide?

Rationale:
Why?

Consequences:
What does this affect?

Security impact:
Does this introduce or reduce risk?

Files affected:
List important files.
```

Initial decisions to record:

```text
ADR-001: Preserve existing RFP/RAG workflows instead of rewriting the app.
ADR-002: Use official procurement APIs/downloads before scraping.
ADR-003: Store raw procurement payloads before normalisation.
ADR-004: Use a common canonical opportunity model.
ADR-005: Treat security and tenant isolation as phase-gating requirements.
```

---

## 1B.6 `docs/NEXT_ACTIONS.md`

This file is the operational task queue.

Claude Code must check this file at the start of every session.

It should contain:

```text
# Next Actions

Last updated: YYYY-MM-DD

## Current objective

Write the one current objective here.

## Immediate next tasks

1. Task one
2. Task two
3. Task three

## Do not do yet

- List tempting but premature work here.

## Blockers / questions

- List unresolved issues here.

## After completing the current objective

- Update IMPLEMENTATION_STATE.md
- Update CHANGELOG.md
- Update ARCHITECTURE_DECISIONS.md if a major decision was made
- Update this NEXT_ACTIONS.md file
```

---

## 1B.7 `docs/CHANGELOG.md`

This is a concise implementation log.

It should contain:

```text
# Changelog

## YYYY-MM-DD

### Added

- ...

### Changed

- ...

### Fixed

- ...

### Security

- ...

### Notes for future Claude sessions

- ...
```

---

# 1C. Session-start protocol for Claude Code

Every Claude Code session must begin with this protocol.

```text
Before making changes:

1. Read CLAUDE.md.
2. Read docs/PROJECT_GOALS.md.
3. Read docs/IMPLEMENTATION_STATE.md.
4. Read docs/SECURITY_REQUIREMENTS.md.
5. Read docs/ARCHITECTURE_DECISIONS.md.
6. Read docs/NEXT_ACTIONS.md.
7. Read docs/CHANGELOG.md.
8. Inspect the current git diff/status if available.
9. Summarise the current phase, next action, and security considerations.
10. Only then begin implementation.
```

Claude must not rely only on the compacted chat context.

---

# 1D. Session-end protocol for Claude Code

At the end of every meaningful Claude Code session, Claude must update the persistent project files.

```text
Before ending the session:

1. Update docs/IMPLEMENTATION_STATE.md with what changed.
2. Update docs/NEXT_ACTIONS.md with the next concrete tasks.
3. Update docs/CHANGELOG.md.
4. Update docs/ARCHITECTURE_DECISIONS.md if a decision was made.
5. Update docs/SECURITY_REQUIREMENTS.md if new security requirements or risks were discovered.
6. Run tests or document why tests were not run.
7. Summarise remaining risks and incomplete work.
```

This is required even if the chat context is about to compact.

---

# 1E. Compact recovery prompt

If Claude Code compacts, resets, or appears to lose context, paste this prompt:

```text
Context may have compacted. Do not continue from memory.

Re-read the repository continuity files now:

1. CLAUDE.md
2. docs/PROJECT_GOALS.md
3. docs/IMPLEMENTATION_STATE.md
4. docs/SECURITY_REQUIREMENTS.md
5. docs/ARCHITECTURE_DECISIONS.md
6. docs/NEXT_ACTIONS.md
7. docs/CHANGELOG.md

Then summarise:
- current product goal
- current phase
- completed work
- next action
- security constraints
- files likely to be touched next

Only after that, continue implementation.
```

---

# 1F. Context preservation acceptance criteria

The build is not ready for serious implementation until:

- `CLAUDE.md` exists.
- `docs/PROJECT_GOALS.md` exists.
- `docs/IMPLEMENTATION_STATE.md` exists.
- `docs/SECURITY_REQUIREMENTS.md` exists.
- `docs/ARCHITECTURE_DECISIONS.md` exists.
- `docs/NEXT_ACTIONS.md` exists.
- `docs/CHANGELOG.md` exists.
- Claude Code has been instructed to read these files at the start of every session.
- Claude Code has been instructed to update these files at the end of every meaningful session.
- Security requirements are kept in a dedicated file and referenced from `CLAUDE.md`.
- The current phase and next tasks are explicitly documented in `docs/NEXT_ACTIONS.md`.

This protocol exists because chat context is temporary, but repository files persist.


# 2. Existing app capabilities to preserve

Before making changes, inspect the current repository and identify the actual implementation of each of these capabilities.

Preserve and reuse:

- Dashboard
- Ask page
- Knowledge Base
- Document upload/indexing
- Semantic search
- Cited answer generation
- History
- Review Queue
- Full RFP document processing
- RFP Runs
- Admin page
- Routing/integrations
- Human review workflow
- Missing information flags
- Evidence-grounded response generation

Do not remove existing routes until replacement routes are implemented and tested.

---

# 3. Inspiration app patterns to borrow

The app at `https://ai-rfp-agent.vercel.app` is useful as product inspiration, not as code to copy.

Borrow these ideas:

## 3.1 Clear commercial positioning

The inspiration app frames itself around business outcomes, not just AI functionality.

Apply this approach:

- Avoid making the homepage feel like a generic AI document chatbot.
- Make the product feel like a bid partner.
- Emphasise contract discovery, bid readiness, opportunity matching, and winning public-sector work.

Suggested headline:

> Find, qualify, and respond to public-sector tenders faster.

Suggested subheadline:

> An AI-powered bid intelligence platform for UK suppliers. Track opportunities, assess fit, identify missing evidence, and draft compliant responses from your approved company documents.

## 3.2 Organisation onboarding

Create a setup flow that gathers the supplier profile.

Collect:

- Organisation name
- Organisation type
- Services offered
- Sectors served
- CPV codes
- Target regions
- Minimum contract value
- Maximum contract value
- Preferred buyers
- Excluded buyers
- Excluded keywords
- Certifications
- Accreditations
- Insurance levels
- Case studies
- Policy documents
- Social value credentials
- Public-sector experience

## 3.3 Bid readiness score

Make the readiness score a core part of the product.

Suggested readiness dimensions:

- Company profile completeness
- Service/category clarity
- Evidence library strength
- Case study strength
- Policy/compliance coverage
- Insurance/certification readiness
- Public-sector track record
- Social value evidence
- Deadline feasibility
- Knowledge base coverage

## 3.4 Public resources

Add a resources section later.

Potential resources:

- How to use Find a Tender
- Contracts Finder setup guide
- Council portal guide
- Bid/no-bid checklist
- Compliance matrix template
- Social value response guide
- Public-sector case study template
- Modern slavery policy checklist
- Cyber/security evidence checklist
- Bid readiness checklist

---

# 4. Target users

Build primarily for UK suppliers bidding into the public sector.

Initial target users:

- SMEs
- Consultancies
- Technology suppliers
- Software vendors
- Construction firms
- Facilities management companies
- Care providers
- Training providers
- Marketing/creative agencies
- Cybersecurity firms
- Housing association contractors
- NHS suppliers
- Nonprofits and social enterprises
- Professional services firms

The app should work across sectors. Avoid hardcoding it for one industry.

---

# 5. Target information architecture

Add or refactor toward this navigation structure.

## Main authenticated app routes

```text
/dashboard
/opportunities
/opportunities/[id]
/sources
/buyers
/pipeline
/profile
/rfp
/rfp/[id]
/knowledge-base
/ask
/history
/review
/admin
```

## Optional public marketing routes

```text
/
/how-it-works
/industries
/resources
/pricing
/services
/contact
```

## Existing routes

Keep existing routes working unless a route is explicitly replaced.

If the current app uses different route names, map existing routes into this structure carefully.

---

# 6. High-level build strategy

Do not build everything at once.

Build in phases:

1. Repo audit and implementation plan.
2. Rebrand and navigation scaffold.
3. Data model and seed opportunities.
4. Find a Tender connector.
5. Opportunity list and detail pages.
6. Organisation profile.
7. Matching and scoring engine.
8. Bid pipeline.
9. RFP run integration.
10. Compliance matrix generator.
11. Additional connectors.
12. Alerts and CRM-style workflows.
13. Public marketing/resources pages.

---

# 7. First Claude Code task

When Claude Code starts, perform this repo audit before writing code.

## Claude Code should inspect and report

1. Framework and stack:
   - Next.js, Vite, Remix, or other
   - App Router vs Pages Router if Next.js
   - TypeScript or JavaScript
   - Styling system
   - UI library
   - Auth approach
   - Database or persistence layer
   - ORM
   - API route structure
   - Deployment assumptions

2. Existing routes/pages:
   - Dashboard
   - Ask
   - Knowledge Base
   - RFP
   - Review
   - Admin
   - History
   - Demo
   - Any API routes

3. Existing data structures:
   - Documents
   - Chunks
   - Embeddings
   - RFP runs
   - Review items
   - Users/orgs
   - Answers/citations/history

4. Existing AI/RAG logic:
   - Document ingestion
   - Embedding generation
   - Vector store
   - Retrieval
   - Answer generation
   - Citation rendering
   - Confidence/missing-evidence logic

5. Safest incremental implementation plan:
   - Files to modify first
   - Files not to touch yet
   - Routes to add
   - Types/models to add
   - Test strategy

Claude Code should provide a short repo-specific plan after the audit, then implement Phase 1.

---

# 8. Non-negotiable implementation principles

1. Security is the number one priority. Do not add features that weaken authentication, authorisation, tenant isolation, document privacy, secret handling, or safe AI retrieval.
2. Preserve existing RFP/RAG functionality.
3. Avoid a full rewrite.
4. Use TypeScript types for procurement objects.
5. Store raw source payloads before normalisation.
6. Use source-specific connectors behind a shared interface.
7. Make connectors mockable.
8. Respect source API limits.
9. Do not scrape gated portals in the MVP.
10. Prefer official APIs and official downloads.
11. Keep source links visible to users.
12. Build deduplication early.
13. Keep raw JSON for traceability.
14. Add loading, empty, and error states to all new UI.
15. Add seed/demo data so UI can be built before live API edge cases are solved.
16. Do not remove working routes until replacements are verified.
17. Enforce server-side access control on all organisation-owned data.
18. Ensure RAG retrieval, citations, review items, and document access are scoped to the authenticated user and organisation.
19. Never expose secrets, private documents, raw embeddings, or cross-tenant data to the browser or logs.

---

# 9. Public procurement data sources

## 9.1 MVP sources

Start with:

1. Find a Tender
2. Contracts Finder
3. Public Contracts Scotland
4. Sell2Wales

## 9.2 Later sources

Add later:

5. eTendersNI
6. ProContract / Due North portals
7. In-tend portals
8. The Chest
9. YORtender
10. NEPO
11. London Tenders
12. NHS Supply Chain
13. Defence Sourcing Portal
14. CCS / Government Commercial Agency framework data
15. Sector-specific framework portals

## 9.3 Source strategy

Use this priority order:

1. Official API.
2. Official OCDS feed.
3. Official CSV/JSON/XML download.
4. Email-alert ingestion.
5. User-uploaded notice/tender documents.
6. Paid aggregator integration.
7. Scraping only if allowed by terms and technically safe.

---

# 10. Source connector architecture

Create a common connector interface.

The exact location should match the repo structure. Suggested locations:

```text
src/lib/procurement/connectors/
src/lib/procurement/normalizers/
src/lib/procurement/scoring/
src/lib/procurement/types.ts
```

or, if the repo uses a different convention:

```text
lib/procurement/
app/api/procurement/
components/procurement/
```

## TypeScript connector interface

```ts
export type ProcurementSourceName =
  | "find-tender"
  | "contracts-finder"
  | "public-contracts-scotland"
  | "sell2wales"
  | "etenders-ni"
  | "manual-upload"
  | "seed";

export interface FetchSinceParams {
  from: Date;
  to: Date;
  cursor?: string | null;
  limit?: number;
}

export interface SourceFetchResult {
  sourceName: ProcurementSourceName;
  rawItems: unknown[];
  nextCursor?: string | null;
  fetchedAt: string;
  hasMore: boolean;
}

export interface ProcurementSourceConnector {
  sourceName: ProcurementSourceName;
  displayName: string;
  baseUrl: string;
  fetchSince(params: FetchSinceParams): Promise<SourceFetchResult>;
  normalize(raw: unknown): Promise<NormalizedOpportunity[]>;
}
```

---

# 11. Canonical opportunity model

Use OCDS concepts where possible but keep the app model practical.

```ts
export type ProcurementStage =
  | "planning"
  | "tender"
  | "award"
  | "contract"
  | "implementation"
  | "unknown";

export type OpportunityStatus =
  | "planned"
  | "active"
  | "closed"
  | "awarded"
  | "cancelled"
  | "unknown";

export interface NormalizedOpportunity {
  canonicalOcid?: string | null;
  sourceName: string;
  sourceNoticeId: string;
  sourceUrl?: string | null;
  submissionUrl?: string | null;

  title: string;
  description?: string | null;

  buyerName?: string | null;
  buyerIdentifier?: string | null;
  buyerRegion?: string | null;

  noticeType?: string | null;
  procurementStage: ProcurementStage;
  status: OpportunityStatus;

  cpvCodes: string[];
  region?: string | null;

  valueAmount?: number | null;
  valueCurrency?: string | null;

  publishedAt?: string | null;
  updatedAt?: string | null;
  deadlineAt?: string | null;
  contractStartAt?: string | null;
  contractEndAt?: string | null;

  frameworkFlag?: boolean;
  lots?: NormalizedLot[];
  documents?: NormalizedDocument[];

  rawJson: unknown;
}

export interface NormalizedLot {
  id?: string | null;
  title?: string | null;
  description?: string | null;
  valueAmount?: number | null;
  valueCurrency?: string | null;
  cpvCodes?: string[];
  deadlineAt?: string | null;
}

export interface NormalizedDocument {
  id?: string | null;
  title: string;
  documentType?: string | null;
  url?: string | null;
  format?: string | null;
  publishedAt?: string | null;
}
```

---

# 12. Database model

Adapt this to the actual database/ORM in the repo.

If the project uses Prisma, create Prisma models. If it uses Supabase, create SQL migrations and matching TypeScript types. If it uses a JSON/file store for demo mode, add an abstraction that can later be backed by a real database.

## Required tables/models

### sources

```text
id
name
display_name
type
base_url
enabled
last_successful_sync_at
last_cursor
last_error
created_at
updated_at
```

### raw_notices

```text
id
source_id
source_name
source_notice_id
ocid
raw_payload
content_hash
fetched_at
parser_version
created_at
```

### opportunities

```text
id
canonical_ocid
title
description
buyer_name
buyer_identifier
buyer_region
source_name
source_notice_id
source_url
submission_url
notice_type
procurement_stage
status
cpv_codes
region
value_amount
value_currency
published_at
updated_at
deadline_at
contract_start_at
contract_end_at
framework_flag
lots
documents
raw_json
created_at
updated_at
```

### buyers

```text
id
name
identifiers
address
region
website
source_refs
created_at
updated_at
```

### organisation_profiles

```text
id
name
organisation_type
sectors
services
cpv_codes
regions
certifications
accreditations
insurance
min_contract_value
max_contract_value
preferred_buyers
excluded_buyers
excluded_keywords
created_at
updated_at
```

### opportunity_matches

```text
id
opportunity_id
organisation_profile_id
fit_score
readiness_score
reasons
risks
missing_requirements
recommended_action
created_at
```

### bid_pipeline

```text
id
opportunity_id
status
owner
bid_decision
decision_notes
next_action
due_date
created_at
updated_at
```

### alert_rules

```text
id
name
keywords
cpv_codes
regions
buyers
min_value
max_value
enabled
channel
created_at
updated_at
```

### compliance_matrices

```text
id
opportunity_id
rfp_run_id
status
created_at
updated_at
```

### compliance_requirements

```text
id
compliance_matrix_id
requirement_text
section_reference
mandatory
evidence_needed
response_owner
draft_answer
confidence
source_citations
status
created_at
updated_at
```

---

# 13. Suggested Prisma-style schema

Only use this if the repo uses Prisma. Otherwise translate it.

```prisma
model ProcurementSource {
  id                   String   @id @default(cuid())
  name                 String   @unique
  displayName          String
  type                 String
  baseUrl              String?
  enabled              Boolean  @default(true)
  lastSuccessfulSyncAt DateTime?
  lastCursor           String?
  lastError            String?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  rawNotices           RawNotice[]
}

model RawNotice {
  id             String   @id @default(cuid())
  sourceId       String?
  sourceName     String
  sourceNoticeId String
  ocid           String?
  rawPayload     Json
  contentHash    String
  fetchedAt      DateTime
  parserVersion  String
  createdAt      DateTime @default(now())

  source         ProcurementSource? @relation(fields: [sourceId], references: [id])

  @@unique([sourceName, sourceNoticeId, contentHash])
  @@index([ocid])
  @@index([sourceName, sourceNoticeId])
}

model Opportunity {
  id               String   @id @default(cuid())
  canonicalOcid    String?
  title            String
  description      String?
  buyerName        String?
  buyerIdentifier  String?
  buyerRegion      String?
  sourceName       String
  sourceNoticeId   String
  sourceUrl        String?
  submissionUrl    String?
  noticeType       String?
  procurementStage String
  status           String
  cpvCodes         Json
  region           String?
  valueAmount      Float?
  valueCurrency    String?
  publishedAt      DateTime?
  updatedAt        DateTime?
  deadlineAt       DateTime?
  contractStartAt  DateTime?
  contractEndAt    DateTime?
  frameworkFlag    Boolean  @default(false)
  lots             Json?
  documents        Json?
  rawJson          Json?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  matches          OpportunityMatch[]
  pipelineItems    BidPipelineItem[]

  @@index([canonicalOcid])
  @@index([sourceName, sourceNoticeId])
  @@index([deadlineAt])
  @@index([buyerName])
}

model Buyer {
  id          String   @id @default(cuid())
  name        String
  identifiers Json?
  address     Json?
  region      String?
  website     String?
  sourceRefs  Json?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([name])
}

model OrganisationProfile {
  id                String   @id @default(cuid())
  name              String
  organisationType  String?
  sectors           Json?
  services          Json?
  cpvCodes          Json?
  regions           Json?
  certifications    Json?
  accreditations    Json?
  insurance         Json?
  minContractValue  Float?
  maxContractValue  Float?
  preferredBuyers   Json?
  excludedBuyers    Json?
  excludedKeywords  Json?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  matches           OpportunityMatch[]
}

model OpportunityMatch {
  id                    String   @id @default(cuid())
  opportunityId          String
  organisationProfileId  String
  fitScore               Int
  readinessScore         Int
  reasons                Json
  risks                  Json
  missingRequirements    Json
  recommendedAction      String
  createdAt              DateTime @default(now())

  opportunity            Opportunity @relation(fields: [opportunityId], references: [id])
  organisationProfile    OrganisationProfile @relation(fields: [organisationProfileId], references: [id])

  @@unique([opportunityId, organisationProfileId])
}

model BidPipelineItem {
  id             String   @id @default(cuid())
  opportunityId  String
  status         String
  owner          String?
  bidDecision    String?
  decisionNotes  String?
  nextAction     String?
  dueDate        DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  opportunity    Opportunity @relation(fields: [opportunityId], references: [id])
}
```

---

# 14. Data source implementation notes

## 14.1 Find a Tender

Implement first.

Use the official OCDS release package API.

Expected behaviour:

- Fetch by updated date window.
- Use cursor pagination.
- Store raw release package.
- Extract releases.
- Normalise each release into one or more opportunities.
- Upsert opportunities.

Pseudo endpoint:

```text
GET /api/1.0/ocdsReleasePackages?updatedFrom={from}&updatedTo={to}&limit=100&cursor={cursor}
```

Implementation should tolerate:

- Empty release packages
- Missing values
- Missing tender periods
- Multiple lots
- Multiple documents
- Buyer name in different places
- Planning notices vs tender notices vs award notices

## 14.2 Contracts Finder

Implement second.

Use its published notices OCDS search endpoint.

Expected behaviour:

- Fetch by published date range.
- Use stages filter if needed.
- Use cursor pagination.
- Normalise to canonical opportunity model.

## 14.3 Public Contracts Scotland

Implement third.

Use API or JSON/CSV download route.

Expected behaviour:

- Pull notices in JSON or CSV.
- Map to canonical model.
- Preserve raw source payload.

## 14.4 Sell2Wales

Implement fourth.

Use API or bulk download route.

Expected behaviour:

- Pull notice data by type and month if using bulk download.
- Preserve OCID.
- Map related notices using OCID where possible.

## 14.5 eTendersNI

Do not scrape in the MVP.

Create a placeholder connector:

- Source appears in `/sources`.
- Status: `manual / planned`.
- Admin note: “Requires portal connector, official export, email ingestion, or aggregator integration.”
- Allow manual CSV/import later.

---

# 15. Raw notice storage and hashing

Every connector must store raw payloads before transformation.

Use a stable content hash.

Example:

```ts
import crypto from "crypto";

export function hashPayload(payload: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}
```

Use the hash to avoid reprocessing identical notices.

---

# 16. Normalisation rules

Map each source into this common shape:

```text
title
description
buyer_name
buyer_identifier
buyer_region
source_name
source_notice_id
source_url
submission_url
notice_type
procurement_stage
status
cpv_codes
region
value_amount
value_currency
published_at
updated_at
deadline_at
contract_start_at
contract_end_at
framework_flag
lots
documents
raw_json
```

## Stage mapping

Suggested mapping:

```text
planning notice / PIN       -> planning
tender / opportunity        -> tender
award                       -> award
contract                    -> contract
implementation              -> implementation
unknown                     -> unknown
```

## Status mapping

Suggested mapping:

```text
open tender deadline future      -> active
deadline passed, no award        -> closed
award notice                     -> awarded
cancelled notice                 -> cancelled
future pipeline notice           -> planned
unknown                          -> unknown
```

## Region mapping

Try to derive region from:

1. Source region field
2. Buyer address
3. Place of performance
4. NUTS/UK region codes
5. Text fallback

Keep raw location fields if uncertain.

---

# 17. Deduplication strategy

Expect duplicate or related records across sources.

Implement dedupe in layers:

## Layer 1: Exact source identity

Same `source_name + source_notice_id` means same source notice.

## Layer 2: OCID

Same `canonical_ocid` means same contracting process.

## Layer 3: Related notice family

Notices with the same OCID but different notice type may be different stages of the same procurement.

Do not discard them. Link them.

## Layer 4: Fuzzy duplicate candidate

Potential duplicate if all or most match:

- Normalised title similarity
- Buyer name similarity
- Same or similar deadline
- Same or similar value
- Same CPV codes
- Same source/submission URL

Initial MVP can simply flag `possibleDuplicateOf` rather than auto-merging.

---

# 18. Organisation profile

Create an organisation profile page.

Route:

```text
/profile
```

## Profile sections

1. Company basics
2. Services and keywords
3. CPV codes
4. Target regions
5. Contract value range
6. Certifications and accreditations
7. Insurance and compliance
8. Case studies and past performance
9. Buyers and sectors
10. Exclusions/no-go criteria

## Example profile fields

```ts
export interface OrganisationProfileInput {
  name: string;
  organisationType?: string;
  sectors: string[];
  services: string[];
  keywords: string[];
  cpvCodes: string[];
  regions: string[];
  certifications: string[];
  accreditations: string[];
  minContractValue?: number;
  maxContractValue?: number;
  preferredBuyers: string[];
  excludedBuyers: string[];
  excludedKeywords: string[];
}
```

---

# 19. Opportunity matching and scoring

Create a scoring function.

Suggested location:

```text
src/lib/procurement/scoring/scoreOpportunity.ts
```

## Scoring model

Total: 100 points

```text
CPV match: 20
Keyword/service match: 20
Region match: 10
Buyer preference: 10
Contract value fit: 10
Evidence/readiness from knowledge base: 20
Deadline feasibility: 10
```

## Output

```ts
export type RecommendedAction =
  | "bid"
  | "maybe"
  | "do-not-bid"
  | "needs-review";

export interface OpportunityScore {
  fitScore: number;
  readinessScore: number;
  recommendedAction: RecommendedAction;
  reasons: string[];
  risks: string[];
  missingRequirements: string[];
}
```

## Recommendation thresholds

```text
80–100: bid
60–79: maybe
40–59: needs-review
0–39: do-not-bid
```

Override to `needs-review` when:

- Deadline is very soon
- Mandatory certification appears missing
- Contract value is far outside range
- Opportunity has ambiguous data
- There is no organisation profile
- The knowledge base lacks relevant evidence

---

# 20. Readiness score

Readiness is different from opportunity fit.

Fit = how relevant the opportunity is.

Readiness = how prepared the supplier is to respond.

Readiness should consider:

- Profile completeness
- Matching case studies
- Matching policies
- Accreditations/certifications
- Insurance
- Financial evidence
- Social value evidence
- Security/cyber evidence
- Past public-sector work
- Availability of reusable answers

Initial MVP can calculate readiness using simple heuristics.

Later, it can use RAG to check whether relevant documents exist.

---

# 21. Opportunity pages

## 21.1 Opportunities list

Route:

```text
/opportunities
```

Features:

- Search bar
- Filter by source
- Filter by stage
- Filter by status
- Filter by deadline
- Filter by value
- Filter by region
- Filter by CPV
- Filter by buyer
- Sort by deadline
- Sort by fit score
- Sort by published date
- Empty state
- Error state
- Loading state

Table/card fields:

```text
Title
Buyer
Deadline
Value
Source
Stage
Status
Region
CPV codes
Fit score
Pipeline status
```

Actions:

```text
View details
Analyse fit
Add to pipeline
Generate compliance matrix
Start RFP response
Open source notice
```

## 21.2 Opportunity detail page

Route:

```text
/opportunities/[id]
```

Sections:

1. Header
   - Title
   - Buyer
   - Source
   - Status
   - Deadline
   - Value
   - Fit score

2. Summary
   - Description
   - Procurement stage
   - Notice type
   - Source link
   - Submission link

3. Buyer information
   - Buyer name
   - Buyer identifier
   - Region
   - Address if available

4. Procurement details
   - CPV codes
   - Lots
   - Framework flag
   - Contract dates
   - Documents

5. AI fit analysis
   - Fit score
   - Readiness score
   - Recommended action
   - Reasons
   - Risks
   - Missing evidence

6. Bid actions
   - Add to pipeline
   - Generate compliance matrix
   - Start RFP Run
   - Assign owner
   - Set next action

---

# 22. Sources page

Route:

```text
/sources
```

Purpose:

Admin/operator visibility into data feeds.

Show:

```text
Source name
Source type
Enabled/disabled
Last successful sync
Last cursor
Last error
Number of raw notices
Number of opportunities
Manual sync button
```

Actions:

```text
Enable/disable source
Run sync now
View recent raw notices
View errors
```

MVP should include:

- Find a Tender: enabled
- Contracts Finder: planned/enabled if implemented
- Public Contracts Scotland: planned
- Sell2Wales: planned
- eTendersNI: planned/manual
- Manual Upload: enabled
- Seed Data: enabled in demo/dev

---

# 23. Buyers page

Route:

```text
/buyers
```

Purpose:

Build intelligence on public buyers.

Show:

```text
Buyer name
Region
Number of opportunities
Average contract value
Open opportunities
Awards found
Last seen
```

Buyer detail page can be added later.

Future buyer insights:

- Repeated suppliers
- Contract renewal dates
- Framework use
- Average award value
- Common CPV codes
- Upcoming expiries

---

# 24. Bid pipeline

Route:

```text
/pipeline
```

Purpose:

CRM-style management of active bids.

Statuses:

```text
new-match
reviewing
bid
no-bid
in-progress
awaiting-review
submitted
won
lost
archived
```

Pipeline item fields:

```text
Opportunity
Buyer
Deadline
Owner
Status
Bid decision
Next action
Due date
Fit score
Readiness score
```

Actions:

```text
Change status
Assign owner
Add decision notes
Start RFP run
Open compliance matrix
Archive
```

---

# 25. RFP workflow integration

The existing `/rfp` workflow is a major asset. Extend it to start from an opportunity.

## New action

From opportunity detail:

```text
Start RFP Response
```

Expected flow:

1. User opens opportunity.
2. User clicks `Start RFP Response`.
3. App creates an RFP Run linked to `opportunity_id`.
4. User uploads tender documents if not already attached.
5. App extracts requirements.
6. App generates compliance matrix.
7. App drafts responses using knowledge base.
8. App flags missing evidence.
9. Weak answers go to review queue.
10. User exports/reviews final response.

## Required relationship

RFP run should optionally link to:

```text
opportunity_id
source_notice_id
buyer_name
deadline_at
```

---

# 26. Compliance matrix generator

Create this after opportunity and RFP integration are working.

## Matrix fields

```text
Requirement
Section reference
Mandatory/optional
Evidence needed
Response owner
Draft answer
Confidence
Citations
Status
```

## Statuses

```text
not-started
drafted
needs-evidence
needs-review
approved
rejected
```

## Requirement extraction

Initial implementation can support uploaded tender documents.

Later implementation can also use documents pulled from source notices, where legally and technically available.

---

# 27. Review queue extension

The existing review queue should be extended, not replaced.

Add review item context:

```text
Opportunity
Buyer
Requirement
Draft answer
Confidence score
Missing evidence
Suggested citation sources
Assigned reviewer
Deadline
```

Actions:

```text
Approve
Edit
Reject
Request evidence
Assign
```

---

# 28. Admin page extensions

Extend admin with procurement-specific controls.

Add sections:

## Data sources

- Source list
- Enabled status
- Last sync time
- Last error
- Manual sync

## Alert rules

- Keywords
- CPV codes
- Regions
- Buyers
- Contract value range
- Channels

## Routing rules

- Sector/topic to reviewer
- High-risk answer routing
- Low-confidence routing
- Deadline escalation

## Integrations

Potential future integrations:

- Email
- Slack
- HubSpot
- Pipedrive
- Airtable
- Notion
- Google Drive
- SharePoint
- Microsoft Teams

---

# 29. API routes

Adapt this to the actual framework.

Suggested routes:

```text
GET    /api/opportunities
GET    /api/opportunities/:id
POST   /api/opportunities/:id/analyse
POST   /api/opportunities/:id/add-to-pipeline
POST   /api/opportunities/:id/start-rfp

GET    /api/sources
POST   /api/sources/:sourceName/sync
POST   /api/sources/sync-all

GET    /api/buyers
GET    /api/pipeline
POST   /api/pipeline
PATCH  /api/pipeline/:id

GET    /api/profile
POST   /api/profile
PATCH  /api/profile

POST   /api/compliance-matrix/generate
GET    /api/compliance-matrix/:id
PATCH  /api/compliance-requirements/:id
```

If using Next.js App Router:

```text
app/api/opportunities/route.ts
app/api/opportunities/[id]/route.ts
app/api/opportunities/[id]/analyse/route.ts
app/api/opportunities/[id]/add-to-pipeline/route.ts
app/api/opportunities/[id]/start-rfp/route.ts
```

---

# 30. Components to create

Suggested component structure:

```text
components/procurement/OpportunityCard.tsx
components/procurement/OpportunityTable.tsx
components/procurement/OpportunityFilters.tsx
components/procurement/OpportunityDetailHeader.tsx
components/procurement/FitScoreBadge.tsx
components/procurement/ReadinessScoreCard.tsx
components/procurement/RiskList.tsx
components/procurement/MissingEvidenceList.tsx
components/procurement/SourceStatusCard.tsx
components/procurement/BidPipelineBoard.tsx
components/procurement/ProfileSetupForm.tsx
components/procurement/ComplianceMatrixTable.tsx
```

---

# 31. Seed/demo data

Add realistic fake UK public procurement opportunities so the UI can be tested without live API dependencies.

## Seed examples

1. NHS Trust — Digital Patient Communication Platform
2. Local Council — Facilities Management and Cleaning Services
3. Housing Association — Responsive Repairs Framework
4. University — Cyber Security Managed Service
5. Department for Transport — Research and Evaluation Consultancy
6. County Council — Adult Social Care Provider Framework
7. Police and Crime Commissioner — Victim Support Services
8. Combined Authority — Website Redesign and Hosting
9. Borough Council — Waste Collection Fleet Maintenance
10. Academy Trust — IT Managed Services Framework

Each seed opportunity should include:

```text
title
description
buyer_name
source_name
source_notice_id
source_url
submission_url
notice_type
procurement_stage
status
cpv_codes
region
value_amount
value_currency
published_at
updated_at
deadline_at
contract_start_at
contract_end_at
framework_flag
lots
documents
```

Use obviously fake source IDs and URLs in demo mode.

---

# 32. Example seed opportunity object

```ts
export const demoOpportunity = {
  canonicalOcid: "ocds-demo-001",
  sourceName: "seed",
  sourceNoticeId: "DEMO-001",
  sourceUrl: "https://example.com/notices/demo-001",
  submissionUrl: "https://example.com/submit/demo-001",
  title: "Digital Patient Communication Platform",
  description:
    "An NHS Trust is seeking a supplier to provide a secure digital patient communication platform, including SMS, email, appointment reminders, accessibility support, reporting, implementation, training, and ongoing support.",
  buyerName: "Example NHS Foundation Trust",
  buyerIdentifier: "GB-NHS-DEMO",
  buyerRegion: "England",
  noticeType: "Contract Notice",
  procurementStage: "tender",
  status: "active",
  cpvCodes: ["72000000", "72212180", "64216000"],
  region: "North West England",
  valueAmount: 450000,
  valueCurrency: "GBP",
  publishedAt: "2026-06-01T09:00:00Z",
  updatedAt: "2026-06-01T09:00:00Z",
  deadlineAt: "2026-07-01T12:00:00Z",
  contractStartAt: "2026-09-01T00:00:00Z",
  contractEndAt: "2029-08-31T23:59:59Z",
  frameworkFlag: false,
  lots: [
    {
      id: "1",
      title: "Core platform and implementation",
      valueAmount: 450000,
      valueCurrency: "GBP",
      cpvCodes: ["72000000", "72212180"]
    }
  ],
  documents: [
    {
      id: "doc-1",
      title: "Invitation to Tender",
      documentType: "tenderDocument",
      url: "https://example.com/documents/demo-001-itt.pdf"
    }
  ],
  rawJson: {}
};
```

---

# 33. UI copy

Use UK-specific wording.

## Dashboard cards

```text
Matched opportunities
Deadlines this week
Bid pipeline
Missing evidence
Review queue
Recent RFP runs
```

## Opportunity action buttons

```text
Analyse fit
Add to pipeline
Start RFP response
Generate compliance matrix
Open source notice
```

## Fit score labels

```text
Strong fit
Possible fit
Needs review
Poor fit
```

## Empty state for opportunities

```text
No opportunities found yet.

Connect a procurement source, run a sync, or load demo opportunities to start matching tenders against your organisation profile.
```

## Empty state for profile

```text
Create your organisation profile to start receiving matched opportunities and bid/no-bid recommendations.
```

---

# 34. Design guidance

The UI should feel like a serious B2B procurement platform.

Prioritise:

- Clear tables
- Deadline visibility
- Buyer/source transparency
- Fit score badges
- Risk warnings
- Evidence gaps
- Simple next actions
- Not too much visual clutter

Avoid:

- Chatbot-first framing
- Overly playful copy
- Hiding source links
- Overclaiming that AI can guarantee compliance
- Creating the impression that the app submits tenders automatically

---

# 35. Find a Tender connector pseudo-code

```ts
import { ProcurementSourceConnector, SourceFetchResult } from "../types";

export const findTenderConnector: ProcurementSourceConnector = {
  sourceName: "find-tender",
  displayName: "Find a Tender",
  baseUrl: "https://www.find-tender.service.gov.uk",

  async fetchSince({ from, to, cursor, limit = 100 }): Promise<SourceFetchResult> {
    const url = new URL(
      "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages"
    );

    url.searchParams.set("updatedFrom", from.toISOString());
    url.searchParams.set("updatedTo", to.toISOString());
    url.searchParams.set("limit", String(limit));

    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Find a Tender sync failed: ${response.status}`);
    }

    const payload = await response.json();

    return {
      sourceName: "find-tender",
      rawItems: Array.isArray(payload.releases)
        ? payload.releases
        : Array.isArray(payload.packages)
          ? payload.packages
          : [payload],
      nextCursor:
        payload.nextCursor ??
        payload.links?.next ??
        null,
      fetchedAt: new Date().toISOString(),
      hasMore: Boolean(payload.nextCursor || payload.links?.next)
    };
  },

  async normalize(raw) {
    return normalizeFindTenderRelease(raw);
  }
};
```

---

# 36. Generic OCDS normalisation pseudo-code

```ts
export function normalizeOcdsRelease(
  release: any,
  sourceName: string
): NormalizedOpportunity {
  const tender = release.tender ?? {};
  const buyer = release.buyer ?? release.parties?.find((p: any) =>
    Array.isArray(p.roles) && p.roles.includes("buyer")
  );

  const value = tender.value ?? release.value ?? {};
  const tenderPeriod = tender.tenderPeriod ?? {};
  const contractPeriod = tender.contractPeriod ?? {};

  return {
    canonicalOcid: release.ocid ?? null,
    sourceName,
    sourceNoticeId: release.id ?? release.ocid ?? crypto.randomUUID(),
    sourceUrl: release.links?.self ?? null,
    submissionUrl: tender.submissionMethodDetails ?? null,

    title: tender.title ?? release.title ?? "Untitled opportunity",
    description: tender.description ?? release.description ?? null,

    buyerName: buyer?.name ?? null,
    buyerIdentifier: buyer?.identifier?.id ?? null,
    buyerRegion: buyer?.address?.region ?? null,

    noticeType: release.tag?.join(", ") ?? null,
    procurementStage: mapOcdsStage(release.tag),
    status: mapTenderStatus(tender.status, tenderPeriod.endDate),

    cpvCodes: extractCpvCodes(tender),
    region: buyer?.address?.region ?? null,

    valueAmount: value.amount ?? null,
    valueCurrency: value.currency ?? "GBP",

    publishedAt: release.date ?? null,
    updatedAt: release.date ?? null,
    deadlineAt: tenderPeriod.endDate ?? null,
    contractStartAt: contractPeriod.startDate ?? null,
    contractEndAt: contractPeriod.endDate ?? null,

    frameworkFlag: Boolean(tender.techniques?.hasFrameworkAgreement),
    lots: normalizeLots(tender.lots ?? []),
    documents: normalizeDocuments(tender.documents ?? []),

    rawJson: release
  };
}
```

---

# 37. Matching pseudo-code

```ts
export function scoreOpportunity(
  opportunity: NormalizedOpportunity,
  profile: OrganisationProfileInput,
  evidenceSummary?: EvidenceSummary
): OpportunityScore {
  const reasons: string[] = [];
  const risks: string[] = [];
  const missingRequirements: string[] = [];

  let score = 0;

  const cpvMatches = opportunity.cpvCodes.filter((code) =>
    profile.cpvCodes.includes(code)
  );

  if (cpvMatches.length > 0) {
    score += 20;
    reasons.push(`Matches target CPV codes: ${cpvMatches.join(", ")}`);
  }

  const text = `${opportunity.title} ${opportunity.description ?? ""}`.toLowerCase();
  const keywordMatches = profile.keywords.filter((keyword) =>
    text.includes(keyword.toLowerCase())
  );

  if (keywordMatches.length > 0) {
    score += Math.min(20, keywordMatches.length * 5);
    reasons.push(`Matches service keywords: ${keywordMatches.join(", ")}`);
  }

  if (opportunity.region && profile.regions.includes(opportunity.region)) {
    score += 10;
    reasons.push(`Matches target region: ${opportunity.region}`);
  }

  if (
    opportunity.buyerName &&
    profile.preferredBuyers.some((buyer) =>
      opportunity.buyerName?.toLowerCase().includes(buyer.toLowerCase())
    )
  ) {
    score += 10;
    reasons.push(`Buyer matches preferred buyer list.`);
  }

  if (
    typeof opportunity.valueAmount === "number" &&
    (!profile.minContractValue || opportunity.valueAmount >= profile.minContractValue) &&
    (!profile.maxContractValue || opportunity.valueAmount <= profile.maxContractValue)
  ) {
    score += 10;
    reasons.push(`Contract value is within target range.`);
  }

  const evidenceScore = evidenceSummary?.score ?? 0;
  score += Math.min(20, evidenceScore);

  if (evidenceScore < 10) {
    risks.push("Limited relevant evidence found in the knowledge base.");
    missingRequirements.push("Upload relevant case studies, policies, or capability statements.");
  }

  const daysUntilDeadline = getDaysUntil(opportunity.deadlineAt);

  if (daysUntilDeadline === null) {
    risks.push("No clear deadline found.");
  } else if (daysUntilDeadline < 7) {
    risks.push("Deadline is very soon.");
  } else if (daysUntilDeadline <= 21) {
    score += 5;
    risks.push("Deadline is approaching soon.");
  } else {
    score += 10;
    reasons.push("Deadline appears feasible.");
  }

  for (const excluded of profile.excludedKeywords) {
    if (text.includes(excluded.toLowerCase())) {
      risks.push(`Contains excluded keyword: ${excluded}`);
      score = Math.min(score, 39);
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    fitScore: score,
    readinessScore: Math.min(100, Math.round(score * 0.85 + evidenceScore * 0.15)),
    recommendedAction: recommendAction(score, risks),
    reasons,
    risks,
    missingRequirements
  };
}
```

---

# 38. Development phases and acceptance criteria

## Phase 0: Repo audit

Deliverable:

- Claude Code reports stack, file structure, existing routes, data approach, and safest implementation plan.

Acceptance criteria:

- No code changes before audit summary.
- Clear list of files to modify.
- Clear note on where existing RFP/RAG logic lives.

---

## Phase 1: Rebrand and navigation scaffold

Tasks:

- Update visible product name.
- Update homepage copy.
- Add procurement-focused navigation.
- Add placeholder routes:
  - `/opportunities`
  - `/sources`
  - `/buyers`
  - `/pipeline`
  - `/profile`

Acceptance criteria:

- Existing app still works.
- New routes load.
- Navigation includes new routes.
- No existing core workflows are broken.

---

## Phase 2: Data model and seed data

Tasks:

- Add procurement types.
- Add data models/tables.
- Add seed opportunities.
- Add repository/data-access functions.
- Add opportunities list UI reading from seed data.

Acceptance criteria:

- `/opportunities` shows realistic demo opportunities.
- Opportunities can be filtered/search minimally.
- `/opportunities/[id]` shows detail page.
- Seed data can be reset or loaded in development/demo mode.

---

## Phase 3: Organisation profile and scoring

Tasks:

- Add `/profile` setup page.
- Add organisation profile persistence.
- Add scoring function.
- Add `Analyse fit` action.
- Show score on opportunity detail.

Acceptance criteria:

- User can create/edit organisation profile.
- User can analyse an opportunity.
- Score returns fit score, readiness score, reasons, risks, and missing evidence.
- Opportunity page displays recommendation.

---

## Phase 4: Bid pipeline

Tasks:

- Add pipeline data model.
- Add `Add to pipeline` action.
- Add `/pipeline` page.
- Add status changes and decision notes.

Acceptance criteria:

- User can add opportunity to pipeline.
- Pipeline page groups/shows items by status.
- User can mark bid/no-bid.
- User can set next action/due date.

---

## Phase 5: Find a Tender connector

Tasks:

- Add source model and source page.
- Add Find a Tender connector.
- Add manual sync endpoint.
- Store raw notices.
- Normalise opportunities.
- Upsert opportunities.
- Show sync status.

Acceptance criteria:

- Admin/source page can trigger Find a Tender sync.
- Raw payloads are stored.
- Opportunities appear in `/opportunities`.
- Duplicate processing is avoided by content hash.
- Errors are visible and do not crash the app.

---

## Phase 6: RFP run integration

Tasks:

- Add `Start RFP response` button on opportunity detail.
- Link RFP run to opportunity.
- Pre-fill buyer, title, source, deadline.
- Route to existing RFP workflow.

Acceptance criteria:

- User can start RFP run from opportunity.
- Existing RFP workflow still works without opportunity.
- RFP run displays linked opportunity context.

---

## Phase 7: Compliance matrix

Tasks:

- Add compliance matrix model.
- Extract requirements from uploaded tender docs.
- Display matrix table.
- Connect draft answers to existing knowledge base/RAG.
- Send weak answers to review queue.

Acceptance criteria:

- User can generate a matrix from tender docs.
- Each requirement has status.
- Draft answers include citations where available.
- Missing evidence is flagged.
- Review queue receives low-confidence items.

---

## Phase 8: Additional connectors

Implement:

- Contracts Finder
- Public Contracts Scotland
- Sell2Wales
- eTendersNI placeholder/manual import

Acceptance criteria:

- Each connector follows the shared interface.
- Each connector stores raw payloads.
- Each connector normalises into the same opportunity model.
- Source page shows status per source.

---

## Phase 9: Alerts and saved searches

Tasks:

- Add alert rules.
- Match new opportunities against rules.
- Notify through simple channel first, e.g. in-app dashboard or email.

Acceptance criteria:

- User can create alert rule.
- New matching opportunities are flagged.
- Dashboard shows new matches.

---

## Phase 10: Public marketing/resources layer

Tasks:

- Add marketing pages.
- Add resources.
- Add pricing/services page.
- Add contact/free review CTA.

Acceptance criteria:

- Public pages clearly explain product.
- Authenticated app remains separate.
- CTA leads into setup/profile or contact flow.

---

# 39. Testing plan

Add tests where the repo supports them.

Minimum tests:

## Normalisation tests

- Find a Tender release with title, buyer, deadline, CPV, value.
- Missing deadline.
- Multiple lots.
- Missing value.
- Award notice.
- Planning notice.

## Scoring tests

- Strong CPV + keyword + region match.
- Excluded keyword forces low score.
- Deadline soon creates risk.
- Value outside range creates risk.
- Missing evidence creates missing requirement.
- No profile creates needs-review.

## API tests

- Opportunities list
- Opportunity detail
- Analyse fit
- Add to pipeline
- Source sync error handling

## UI smoke tests

- `/opportunities` loads
- `/opportunities/[id]` loads
- `/profile` saves
- `/pipeline` shows added item

---

# 40. Error handling

All new sync/connectors must handle:

- Network failure
- API timeout
- Rate limit
- Invalid JSON
- Empty response
- Partial data
- Duplicate notices
- Missing OCID
- Missing buyer
- Missing deadline
- Missing value

User-visible error example:

```text
Find a Tender sync failed. Last successful sync: 2026-06-04 09:15.
The source returned a temporary error. Existing opportunities are still available.
```

---

# 41. Security and compliance notes

Do not:

- Store API secrets in code.
- Scrape gated portals without permission.
- Submit tenders automatically.
- Claim legal/procurement compliance guarantees.
- Hide source data from users.
- Delete raw procurement records after normalisation.

Do:

- Keep source links visible.
- Keep raw payloads available for audit.
- Log sync errors.
- Respect rate limits.
- Make AI-generated content reviewable.
- Label AI-generated recommendations as decision support.

---

# 42. Suggested environment variables

Only add these if needed.

```text
FIND_TENDER_BASE_URL=https://www.find-tender.service.gov.uk
CONTRACTS_FINDER_BASE_URL=https://www.contractsfinder.service.gov.uk
PUBLIC_CONTRACTS_SCOTLAND_BASE_URL=https://www.publiccontractsscotland.gov.uk
SELL2WALES_BASE_URL=https://www.sell2wales.gov.wales
PROCUREMENT_SYNC_LOOKBACK_HOURS=24
PROCUREMENT_SYNC_LIMIT=100
```

---

# 43. Manual sync flow

In `/sources`, each source should have:

```text
Run sync now
```

Manual sync should:

1. Check source is enabled.
2. Determine date range.
3. Fetch raw data.
4. Store raw notices.
5. Normalise opportunities.
6. Upsert records.
7. Update source sync status.
8. Return summary.

Example result:

```json
{
  "source": "find-tender",
  "fetched": 100,
  "rawStored": 98,
  "duplicatesSkipped": 2,
  "opportunitiesCreated": 42,
  "opportunitiesUpdated": 56,
  "errors": []
}
```

---

# 44. Dashboard requirements

Update dashboard to show procurement-specific widgets.

Cards:

```text
New matched opportunities
Deadlines this week
Bid pipeline
High-fit opportunities
Missing evidence
Review queue
Recent RFP runs
Source sync status
```

Dashboard sections:

1. New matches
2. Upcoming deadlines
3. Bid pipeline summary
4. Evidence gaps
5. Recent activity

---

# 45. Final target user journey

The final product should support this flow:

```text
1. User signs in.
2. User completes organisation profile.
3. User uploads company documents to knowledge base.
4. App ingests public-sector procurement notices.
5. App matches opportunities to the organisation profile.
6. User views opportunity fit score.
7. User adds the opportunity to the bid pipeline.
8. User generates a compliance matrix.
9. User starts an RFP response.
10. App drafts answers from approved company knowledge.
11. App flags missing evidence and risky answers.
12. Human reviewer approves/edits answers.
13. User exports or prepares the final bid response.
```

---

# 46. Prompt to use in Claude Code

Paste this section into Claude Code if you want a shorter execution prompt after saving this file.

```text
Read the file `claude_code_bid_intelligence_build_brief.md` and use it as the implementation brief.

Start with Phase 0:
1. Inspect the repository.
2. Treat security as the number one priority: identify auth, authorisation, tenant isolation, document privacy, secret handling, RAG data scoping, and admin-route risks before implementing features.
3. Create or update the persistent continuity files:
   - CLAUDE.md
   - docs/PROJECT_GOALS.md
   - docs/IMPLEMENTATION_STATE.md
   - docs/SECURITY_REQUIREMENTS.md
   - docs/ARCHITECTURE_DECISIONS.md
   - docs/NEXT_ACTIONS.md
   - docs/CHANGELOG.md
4. Read those continuity files before planning or coding.
5. Identify the stack, routes, data layer, AI/RAG logic, and existing workflows.
6. Produce a repo-specific implementation plan.
7. Do not rewrite the app.
8. Preserve existing RFP, knowledge base, review, history, and admin workflows.
9. Then begin Phase 1: rebrand and navigation scaffold.

Important:
Use incremental changes, keep the app working after each phase, and add tests for procurement normalisation and scoring as soon as those modules are created.

At the end of every meaningful session, update:
- docs/IMPLEMENTATION_STATE.md
- docs/NEXT_ACTIONS.md
- docs/CHANGELOG.md
- docs/ARCHITECTURE_DECISIONS.md if a decision was made
- docs/SECURITY_REQUIREMENTS.md if a new risk or requirement was discovered

If the conversation compacts or context seems lost, stop and re-read the continuity files before continuing.
```

---

# 47. Definition of done for the first useful MVP

The first useful MVP is done when:

- Product is rebranded as a UK bid intelligence platform.
- User can create an organisation profile.
- App has realistic procurement opportunities.
- User can view, filter, and open opportunities.
- User can score opportunities against the organisation profile.
- User can add opportunities to a bid pipeline.
- User can start an RFP run from an opportunity.
- Existing knowledge base and RFP answer generation still work.
- At least one real source connector works end-to-end, preferably Find a Tender.
- Raw notices are stored before normalisation.
- Duplicate notices are not repeatedly processed.
- Source sync status is visible.
- Missing evidence and risks are shown clearly.

---

# 48. Future roadmap

After MVP:

1. Add Contracts Finder connector.
2. Add Public Contracts Scotland connector.
3. Add Sell2Wales connector.
4. Add eTendersNI manual/import flow.
5. Add council portal email alert ingestion.
6. Add framework tracking.
7. Add award tracking.
8. Add buyer intelligence.
9. Add renewal prediction.
10. Add CRM integration.
11. Add Slack/Teams alerts.
12. Add export to Word/Excel.
13. Add proposal library.
14. Add answer versioning.
15. Add collaborative review workflow.
16. Add pricing/services public pages.
17. Add bid readiness report export.

---

# 49. Tone and UX principles

The app should feel like:

- Practical
- Serious
- UK-specific
- Procurement-aware
- Evidence-led
- Useful to bid managers
- Useful to founders/directors
- Useful to consultants and SMEs

Avoid making it feel like:

- A generic chatbot
- A toy demo
- A black-box AI recommender
- A procurement compliance guarantee
- A fully automated tender-submission system

The user should always see:

- Where the opportunity came from
- Why it matched
- What risks exist
- What evidence is missing
- What the next action is
