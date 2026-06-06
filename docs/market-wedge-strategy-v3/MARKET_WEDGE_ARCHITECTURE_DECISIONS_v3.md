# Market Wedge Architecture Decisions v3

## ADR-001: Use a unique strategy folder

Status: accepted

Decision:

Use:

```text
docs/market-wedge-strategy-v3/
```

for this plan so it does not overlap with earlier planning packs.

## ADR-002: Strategic wedge

Status: accepted

Decision:

Target UK bid agencies serving SME suppliers in one selected vertical first.

## ADR-003: Security-first production build

Status: accepted

Decision:

Security and tenant isolation are phase-gating requirements.

## ADR-004: Evidence-backed workflow over generic AI writer

Status: accepted

Decision:

Build evidence gap detection, compliance matrix generation, cited drafting, review, and bid pack export as the core workflow.

---

## ADR-005: Opportunities as a global catalog, not org-scoped

Status: accepted (2026-06-05)

Context:

Opportunities come from public procurement feeds (Find a Tender, Contracts Finder). They are not org-specific data.

Decision:

The `opportunities` table has no org_id and is publicly readable by all authenticated users. Per-org data (pipeline, matches, questions, answers) lives in separate org-scoped tables that reference opportunity IDs.

Consequence:

Tender intelligence is shared infrastructure. Bid production data is isolated.

---

## ADR-006: Single-org-per-user constraint (current)

Status: accepted, fragile (2026-06-05)

Context:

The current data model assumes one user belongs to one org. This is enforced by migration 024 and the `opportunity_questions` RLS policy uses `limit 1` on the membership lookup.

Decision:

Accept the single-org constraint for now. Document it explicitly. Do not add multi-org support until Phase 3 (agency/client workspace) is designed, at which point the RLS policies on `opportunity_questions` and related tables must be rewritten.

Risk:

If multi-org support is added without rewriting RLS, the `limit 1` policy could silently return wrong org data.

---

## ADR-007: RAG org-scoping via RPC parameter, not RLS

Status: accepted (2026-06-05)

Context:

`document_chunks` has no direct org_id column. Scoping chunks to an org requires joining through `documents`. The hybrid search RPC accepts `p_org_id` and applies the filter in a CTE.

Decision:

Rely on the RPC parameter for org scoping on chunk retrieval. This is safe as long as:

- All callers pass orgId (verified in audit)
- The RPC is not redesigned without preserving the org filter

Future consideration:

Add org_id directly to document_chunks to eliminate join dependency (tracked as S-008).

---

## ADR-008: Tender document cache is org-agnostic

Status: accepted with caveat (2026-06-05)

Context:

Public procurement documents (PDFs from Find a Tender etc.) are the same for all orgs. Caching them per-URL without org_id is efficient.

Decision:

`tender_doc_cache` stores raw file bytes keyed by URL hash, without org_id. Access is server-side only via service role.

Caveat:

The table currently has no RLS. This is tracked as S-001. Until fixed, any authenticated client that queries the table directly can see all cached URLs. Must add org_id + RLS before production.

---

## ADR-009: Auth via Supabase Auth (password + magic link)

Status: accepted (2026-06-05)

Context:

The product uses Supabase's built-in auth system. Session tokens are stored in HTTP-only cookies managed by the Supabase SSR client.

Decision:

Continue using Supabase Auth. Do not introduce a separate auth layer. If enterprise SSO (SAML/OIDC) is needed in future, it can be added as a Supabase Auth provider.

---

## ADR-010: Admin role is env-list based (current), must move to DB for Phase 3

Status: interim (2026-06-05)

Context:

Admin users are currently identified by checking their email against a `ADMIN_EMAILS` environment variable list.

Decision:

This is acceptable for a single-founder product. Before Phase 3 (agency/client workspaces), migrate to a `role` column on `org_memberships` so agency owners, bid writers, reviewers, and clients can have distinct permissions without environment variable changes.

---

## ADR-011: Tender documents stored centrally (global), bid data stays org-scoped

Status: accepted (2026-06-06)

Context:

`opportunities` is a central/global catalog readable by all authenticated users (migration 023). Tender documents attached to an opportunity are the same buyer-published public material for every org, but the old `tender_doc_cache` cached them per-org (path `${org_id}/${url_hash}/...`, bytes only), so the same PDF was re-downloaded and re-extracted once per org, and extracted text was discarded.

Decision:

Introduce a global `tender_documents` store (migration 040): one row per document keyed by content hash (sha256 of bytes), storing the file once at `central/<content_hash>/<file>` in the `tender-docs` bucket plus the extracted text, page/word counts. A global `opportunity_tender_documents` link table maps opportunities → documents. RLS grants `SELECT` to all authenticated users; writes go through the service role only — the same trust class as the global `opportunities` catalog, because this is public buyer material.

All bid-private data (`opportunity_questions`, `bid_pipeline`, drafts, re-evaluations) remains strictly org-scoped. Sharing is limited to public tender material only; no org can see another org's answers, evidence, or that they are bidding.

`tender_doc_cache` is left in place as a dormant per-org fallback and will be dropped in a later migration once the central store is proven in production. `lib/tender-docs.ts` (`getOrFetchTenderDoc`) is the single fetch/cache entry point: URL fast-path (no download), then content-hash dedup (no re-upload/re-extract), then store.
