# Architecture Decisions

Use this file to record major decisions.

## Decision format

### ADR-000: Template

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

---

### ADR-001: Merge planning files without overwriting existing repo files

Date: 2026-06-04
Status: accepted

Context:
The existing repo already has files and folders including docs.

Decision:
Place planning and continuity files in `docs/claude-code-bid-intelligence/` and use `CLAUDE_BID_INTELLIGENCE_ADDENDUM.md` rather than overwriting existing project files.

Rationale:
Avoids accidental loss of existing docs, instructions, or repo-specific context.

Consequences:
Claude Code must inspect and merge instructions deliberately.

Security impact:
Reduces risk of losing existing security or deployment notes.

---

### ADR-002: Preserve existing RFP/RAG workflows instead of rewriting the app

Date: 2026-06-04
Status: accepted

Context:
The current app already contains valuable RFP, knowledge-base, document, RAG, review, history, and admin workflows.

Decision:
Extend the existing app incrementally instead of rewriting it.

Rationale:
The existing RFP/RAG workflow is the core product asset. Ask, batch processing, citations, confidence scoring, missing-info flags, and review routing are all working.

Security impact:
Existing data flows must be audited before multi-user expansion. The Phase 0 audit identified gaps that must be closed.

Files affected:
All existing `app/`, `lib/`, `components/` files.

---

### ADR-003: Security and tenant isolation are phase-gating requirements

Date: 2026-06-04
Status: accepted

Context:
The app handles sensitive customer documents, bid drafts, embeddings, and generated responses.

Decision:
No phase should be marked complete unless security checks are satisfied. GAP-001 (retrieval org scoping) and GAP-002 (conflicting RLS) must be fixed before new data types are added.

Rationale:
Security is the number one priority.

Security impact:
Reduces risk of cross-tenant leakage, document exposure, and unsafe AI retrieval.

---

### ADR-004: Service role client for all API operations (current state)

Date: 2026-06-04
Status: accepted (Phase 1); review in Phase 2

Context:
All API routes use `getServiceSupabase()` which bypasses RLS. Data isolation relies entirely on application-level `org_id` filtering in query WHERE clauses.

Decision:
Accept this pattern for Phase 1. Document it explicitly. Ensure every query that touches org-owned data includes an `org_id` filter.

Rationale:
Service role pattern is simpler than per-request JWT propagation. RLS policies add defence-in-depth but cannot be the sole protection when service role bypasses them.

Consequences:
Every data-access function must manually scope queries by `org_id`. RLS policies are a second layer, not the first.

Security impact:
Risk: A bug that omits `org_id` filter in a query can expose cross-org data. Mitigated by: code review requirement, TypeScript types that include `org_id`.

Files affected:
`lib/supabase.ts`, `lib/org.ts`, all `app/api/*/route.ts` files.

---

### ADR-005: Single-org model for Phase 1; multi-org in Phase 2

Date: 2026-06-04
Status: accepted

Context:
Auth callback auto-provisions one org per deployment. All users in a deployment join the same org.

Decision:
Phase 1 keeps single-org model. Multi-org support (separate workspaces for different customers) is Phase 2.

Rationale:
Simplifies initial build. Existing `org_memberships` table supports multi-org when needed.

Consequences:
All procurement data added in Phase 2 should include `org_id` from the start.

Security impact:
Single-org means no cross-tenant risk within a deployment. Self-hosted deployments are naturally isolated.

Files affected:
`lib/org.ts`, `supabase/migrations/012_orgs.sql`, `app/auth/callback/route.ts`.

---

### ADR-006: Demo mode is a UI flag only, not a security bypass in production

Date: 2026-06-04
Status: accepted

Context:
`DEMO_MODE=true` previously bypassed all auth checks.

Decision:
`DEMO_MODE` is guarded: `process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production"`. In production, `DEMO_MODE` cannot be `true`.

Rationale:
Prevents accidental production deployment with auth bypass.

Consequences:
Demo data (null `org_id` rows) remains accessible to authenticated users in any org.

Security impact:
Significantly reduces auth-bypass risk.

Files affected:
`middleware.ts`, `lib/org.ts`, `lib/admin-auth.ts`.

---

### ADR-007: RAG retrieval must be org-scoped before multi-tenant document upload

Date: 2026-06-04
Status: proposed — implementation required (GAP-001)

Context:
`hybrid_search_chunks` queries all document_chunks with no org filter. In multi-tenant use, this leaks documents across orgs.

Decision:
Update `hybrid_search_chunks` to accept and apply an `org_id` filter. Update `retrieveChunks()` to pass `orgId`. Do not ship multi-tenant document upload until this is fixed.

Rationale:
Document privacy is a mandatory control.

Consequences:
New migration needed. `retrieveChunks()` signature changes. All callers updated.

Security impact:
Critical fix. Removes cross-tenant document retrieval risk.

Files affected:
`supabase/migrations/016_retrieval_org_scope.sql` (to be created), `lib/retrieval.ts`, `app/api/ask/route.ts`, `app/api/rfp/answer-batch/route.ts`.

---

### ADR-008: Procurement data uses null org_id for public demo data

Date: 2026-06-04
Status: proposed

Context:
Existing pattern: rows with `org_id = null` are visible to all authenticated users (demo/legacy data). New procurement data (opportunities, sources, buyers) will be public-sector open data — not org-confidential.

Decision:
Procurement opportunities, sources, and buyers are platform-level data (visible to all authenticated users), not org-scoped. Use `org_id = null` pattern or a separate access policy for these tables. Organisation profiles, pipeline items, and scoring results are org-private.

Rationale:
Public procurement notices are public data. Only the org's responses, scores, and pipeline decisions are private.

Consequences:
RLS policies for opportunities/sources/buyers tables should allow all authenticated users to read; write restricted to service role or admin.

Security impact:
Reduces complexity. Public data stays public; private data (profile, pipeline, scores, RFP runs) stays org-scoped.

Files affected:
`supabase/migrations/` (Phase 2), `lib/procurement/` (to be created).
