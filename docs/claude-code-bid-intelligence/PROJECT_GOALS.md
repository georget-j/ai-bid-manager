# Project Goals

## Product vision

Build a UK public-sector bid intelligence and RFP response platform on top of the existing AI RFP Agent repo.

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

## Existing app capabilities to preserve

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
