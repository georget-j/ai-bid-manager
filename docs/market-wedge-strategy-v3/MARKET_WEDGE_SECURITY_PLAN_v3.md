# Market Wedge Security Plan v3

Security is the number one priority.

---

## Production trust requirement

This product cannot onboard real organisations until customer data isolation is safe.

---

## Sensitive data types

- uploaded documents
- extracted text chunks
- embeddings
- tender documents
- generated bid answers
- citations
- review comments
- client profiles
- organisation profiles
- evidence items
- certifications
- insurance documents
- case studies
- bid decisions
- pipeline notes

---

## Phase 0 audit findings (2026-06-05)

### Authentication

| Control              | Status         | Notes                                      |
| -------------------- | -------------- | ------------------------------------------ |
| Sign up              | ✅ Implemented | Supabase Auth, password + magic link       |
| Sign in              | ✅ Implemented | Password + OTP email                       |
| Sign out             | ✅ Implemented |                                            |
| Session validation   | ✅ Implemented | Middleware validates every request         |
| Protected app routes | ✅ Implemented | Middleware redirects unauthenticated users |
| Protected API routes | ✅ Implemented | `getRequestOrgId()` returns null → 401     |

### Authorisation

| Control                        | Status         | Notes                                       |
| ------------------------------ | -------------- | ------------------------------------------- |
| Organisation membership checks | ✅ Implemented | All data routes scope to `org_id`           |
| Role checks                    | ⚠️ Partial     | Admin role via `ADMIN_EMAILS` env list only |
| Admin checks                   | ✅ Implemented | `requireAdmin()` on most admin routes       |
| Client workspace checks        | ❌ Not built   | No agency/client model yet                  |

### Tenant isolation

| Table                   | Isolation            | Risk                                          |
| ----------------------- | -------------------- | --------------------------------------------- |
| documents               | ✅ org_id + RLS      | Safe                                          |
| document_chunks         | ⚠️ RLS via join only | No direct org_id; join fragile if RPC changes |
| queries                 | ✅ org_id + RLS      | Safe                                          |
| query_results           | ⚠️ RLS via join only | No direct org_id                              |
| opportunity_questions   | ✅ org_id + RLS      | Safe; single-org assumption                   |
| compliance_matrices     | ✅ org_id + RLS      | Safe                                          |
| compliance_requirements | ⚠️ RLS via join only | No direct org_id                              |
| review_requests         | ✅ org_id + RLS      | Safe                                          |
| review_comments         | ⚠️ RLS via join only | No direct org_id                              |
| review_audit_log        | ⚠️ RLS via join only | No direct org_id                              |
| bid_pipeline            | ✅ org_id + RLS      | Safe                                          |
| answer_library          | ✅ org_id + RLS      | Safe                                          |
| organisation_profiles   | ✅ org_id + RLS      | Safe                                          |
| approved_answers        | ✅ org_id + RLS      | Safe                                          |
| opportunities           | ✅ Global catalog    | Intentional; no org data                      |
| tender_doc_cache        | 🔴 NO RLS, NO org_id | Critical gap — see below                      |

### RAG safety

| Control                                                   | Status         | Notes                                        |
| --------------------------------------------------------- | -------------- | -------------------------------------------- |
| Retrieval queries include org scope                       | ✅ Implemented | `hybrid_search_chunks` takes `p_org_id`      |
| Citations only reference authorised documents             | ✅ Implemented | `verifyCitations()` strips invalid chunk_ids |
| Embeddings cannot be queried across tenants               | ✅ Implemented | `org_docs` CTE in hybrid search RPC          |
| Generated answers cannot include another tenant's content | ✅ Implemented | Retrieval is scoped; Zod structured output   |
| Answer library scoped to org                              | ✅ Implemented | `match_answer_library` takes `p_org_id`      |

### File security

| Control                                  | Status         | Notes                                        |
| ---------------------------------------- | -------------- | -------------------------------------------- |
| Private storage                          | ✅ Implemented | Supabase Storage service-role only           |
| Upload size limits                       | ✅ Implemented | 5MB for knowledge base, 10MB for tender docs |
| Upload file-type validation              | ✅ Implemented | Whitelist of allowed extensions              |
| Signed URLs or authenticated file routes | ✅ Implemented | Storage accessed server-side only            |
| No public access to sensitive uploads    | ✅ Implemented | `tender-docs` bucket: service-role only      |

### Admin protection

| Control                       | Status             | Notes                                                         |
| ----------------------------- | ------------------ | ------------------------------------------------------------- |
| Admin routes protected        | ✅ Implemented     | `requireAdmin()` enforced                                     |
| Source sync routes protected  | ✅ Implemented     | Admin-only                                                    |
| `/api/admin/integrations` GET | ✅ Protected       | `requireAdmin()` added — S-002 fixed 2026-06-05               |
| Cron route                    | ✅ Required secret | `CRON_SECRET` required; 500 if unset — S-003 fixed 2026-06-05 |

### Safe rendering

| Control                             | Status     | Notes                                          |
| ----------------------------------- | ---------- | ---------------------------------------------- |
| Tender descriptions safely rendered | ⚠️ Partial | React escapes JSX; raw HTML not confirmed safe |
| Uploaded text safely rendered       | ⚠️ Partial | Requires audit of markdown rendering paths     |
| XSS prevented                       | ⚠️ Assumed | React default escaping; no explicit sanitizer  |

### Secrets

| Control                    | Status       | Notes                                                                                                   |
| -------------------------- | ------------ | ------------------------------------------------------------------------------------------------------- |
| No secrets committed       | ✅ Confirmed | .gitignore covers .env files                                                                            |
| Service role server-only   | ✅ Confirmed | Not prefixed NEXT*PUBLIC*; only in server routes                                                        |
| OpenAI key server-only     | ✅ Confirmed | Server-only usage confirmed                                                                             |
| Both keys in same lib file | ✅ Fixed     | Split into `lib/supabase.ts` (anon) + `lib/supabase-service.ts` (service role) — S-004 fixed 2026-06-05 |

### DEMO_MODE risk

| Risk                               | Detail                                                 |
| ---------------------------------- | ------------------------------------------------------ |
| `DEMO_MODE=true` bypasses all auth | Intentional for demos; dangerous if set in production  |
| Guard in place                     | `DEMO_MODE` only active if `NODE_ENV !== "production"` |
| Residual risk                      | If misconfigured at hosting level, all auth bypassed   |

### Rate limiting

| Control                      | Status         | Notes                             |
| ---------------------------- | -------------- | --------------------------------- |
| Per-route limits implemented | ✅ Implemented | ask: 20/hr, upload: 10/hr, etc.   |
| IP-based                     | ⚠️ Partial     | Trusts `x-forwarded-for` header   |
| Fail-open                    | 🔴 Risk        | DB error = no rate limit enforced |

### Audit logs

| Control            | Status                         |
| ------------------ | ------------------------------ |
| Uploads            | ✅ Document created in DB      |
| Review actions     | ✅ review_audit_log table      |
| Answer approval    | ✅ answer_status field updated |
| Source sync        | ⚠️ Not yet                     |
| Admin changes      | ⚠️ Not yet                     |
| Membership changes | ⚠️ Not yet                     |

---

## Security risks for Phase 2 remediation

### Critical

| #     | Risk                                                                | Remediation                                      |
| ----- | ------------------------------------------------------------------- | ------------------------------------------------ |
| S-001 | `tender_doc_cache` has no RLS or org_id                             | Add org_id column + RLS policy in migration 030  |
| S-002 | `/api/admin/integrations` GET is not admin-protected                | Add `requireAdmin()` to GET handler              |
| S-003 | `CRON_SECRET` is optional — cron route publicly accessible if unset | Make CRON_SECRET required; return 500 if missing |

### High

| #     | Risk                                                    | Remediation                                                                        |
| ----- | ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| S-004 | `lib/supabase.ts` contains both anon + service role key | Split into `lib/supabase-client.ts` (anon) and `lib/supabase-server.ts` (service)  |
| S-005 | No cross-tenant retrieval tests                         | Add Vitest tests that verify User A cannot retrieve User B's documents             |
| S-006 | Rate limiting is fail-open (DB error = bypass)          | Add fallback that blocks on DB error OR log + alert when rate_limits table missing |

### Medium

| #     | Risk                                                                              | Remediation                                                                          |
| ----- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| S-007 | Prompt injection from tender document chunks                                      | Add chunk content sanitization or injection-detection before LLM prompt construction |
| S-008 | `document_chunks` has no direct org_id                                            | Add org_id column; backfill from documents join                                      |
| S-009 | `compliance_requirements`, `review_comments`, `review_audit_log` no direct org_id | Add org_id columns; backfill from parent                                             |
| S-010 | `opportunity_questions` RLS uses `limit 1` org membership                         | Fragile if multi-org support added; document assumption                              |
| S-011 | XSS in rendered markdown/tender text not fully audited                            | Audit all `dangerouslySetInnerHTML` usage; use DOMPurify if found                    |

### Low / informational

| #     | Risk                                         | Remediation                                                          |
| ----- | -------------------------------------------- | -------------------------------------------------------------------- |
| S-012 | DEMO_MODE disables all auth                  | Document clearly; add Vercel env check to alert if set in production |
| S-013 | Admin role is email-list based, not DB-based | Move to `role` column on org_memberships for Phase 3                 |
| S-014 | No org isolation tests in any test file      | Add isolation tests before Phase 3                                   |

---

## Full-stack review findings (2026-06-10)

Review of code + GitHub + Vercel + Supabase. Live DB verified: all 42 public tables have RLS
enabled; `raw_notices`/`raw_grant_notices` are deny-all (zero policies, service-role only —
intentional). All grants tables (migs 058–067) have org_id + membership RLS. Production env:
CRON_SECRET set, DEMO_MODE absent, service-role key server-only. Cron routes return 401
unauthenticated (verified live).

S-007..S-014 status: S-010 FIXED (mig 057). S-011 effectively closed (no
`dangerouslySetInnerHTML`/`innerHTML` anywhere; export/email HTML escaped). S-007, S-008, S-009,
S-012, S-013 unchanged. S-014 partially addressed (tenant-isolation + grants tests exist).

### New risks

| #     | Severity | Risk                                                                                                                                                                                                                                                                                                                                                                             | Remediation                                                                                |
| ----- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| S-015 | 🔴 HIGH  | Cross-tenant read/write on legacy routes: service-role client (bypasses RLS) with **no org_id filter** in `app/api/queries` (+ `[id]`), `app/api/documents/[id]` (full raw_text), `app/api/rfp/runs` (+ `[id]`), and all `app/api/review/*` routes (queue, action, comments, bulk-action, notify-missing, confirm-routing). Any logged-in org A user can read/act on org B data. | Add `getRequestOrgId()` + `.eq('org_id', orgId)` to each handler (join-scope child tables) |
| S-016 | 🟠 MED   | `cron/sync-grants` + `cron/grant-deadline-digest` fail OPEN if `CRON_SECRET` unset (`if (secret)` guard) — diverges from the S-003 pattern. Mitigated in prod (secret is set) but a config regression re-exposes them.                                                                                                                                                           | Mirror escalate pattern: 500 if unset, unconditional Bearer check                          |
| S-017 | 🟠 MED   | SSRF: `lib/grants/ingest-docs.ts` + `lib/tender-docs.ts` fetch URLs from external grant/tender payloads with no private-IP/localhost guard, following redirects.                                                                                                                                                                                                                 | Block loopback/RFC-1918/link-local hosts before fetch; or allowlist known source hostnames |
| S-018 | 🟡 LOW   | `app/api/documents/stats` returns global (all-org) document/chunk counts to any authenticated user.                                                                                                                                                                                                                                                                              | Scope to `getRequestOrgId()`                                                               |

### Platform gaps (GitHub/Vercel/Supabase)

- GitHub: ~~no CI workflow, Dependabot disabled~~ **FIXED 2026-06-11**: `.github/workflows/ci.yml`
  (tsc + lint + vitest + build on push/PR) + `.github/dependabot.yml`; vulnerability alerts +
  automated security fixes enabled via API. Branch protection still unavailable (private repo on
  free plan); secret scanning unavailable (needs GHAS or public repo).
- Supabase: ~~history only records 001–023~~ **FIXED 2026-06-11**: history repaired
  (`migration repair --status applied` 024–068); duplicate prefix resolved by renaming
  `026_question_class.sql` → `068_question_class.sql` (idempotent, no dependents). Next free: 069.
- Vercel: healthy — deploys green, 4 crons wired, env minimal and correct.

### S-015..S-018 remediation (2026-06-11)

- [x] **S-015 FIXED**: all 13 legacy routes org-scoped via `getRequestOrgId()` (401 on null);
      `queries`/`documents` filtered directly, children (`query_results`, `document_chunks`) via
      org-checked parent, `review/*` via `queries!inner` join on `queries.org_id` (because
      `review_requests.org_id` exists but was never populated — see follow-ups). Also closed a write
      leak: approved-answer ingestion now stamps `org_id` (was inserting null-org rows retrievable
      via RAG). Route-level isolation tests added (`tests/route-org-scoping.test.ts`).
- [x] **S-016 FIXED**: both grant crons now 500 if `CRON_SECRET` unset + unconditional Bearer
      check (matches S-003 pattern).
- [x] **S-017 FIXED**: `lib/safe-fetch.ts` — scheme check, DNS-resolution private/loopback/
      link-local/metadata IP rejection, manual redirects (≤5 hops, per-hop revalidation); wired into
      `lib/grants/ingest-docs.ts` + `lib/tender-docs.ts`. 22 unit tests. Residual: DNS-rebinding
      race (zero-TTL) accepted for these best-effort ingestion paths.
- [x] **S-018 FIXED**: documents/stats scoped to org.

Follow-ups from remediation (non-blocking):

- Populate `review_requests.org_id` at creation (lib/routing.ts) + backfill, then simplify the
  join-scoped review queries. Also backfill null-org `approved_answers` + ingested docs.
- `escalateOverdueReviews()` notification side-effect still scans all orgs (no data exposure).
- `tests/opportunity-filters.test.ts` hits live Supabase with no skip guard — CI excludes it via
  `--exclude`; give it the same `describe.skipIf` guard as tenant-isolation, then drop the flag.
- DEMO_MODE branches in review routes are now unreachable (org gate precedes them) — remove or
  define a demo-org strategy.

---

## Phase gate

- [x] S-001: tender_doc_cache RLS added — migration 030, 2026-06-05
- [x] S-002: admin integrations GET protected — requireAdmin() added, 2026-06-05
- [x] S-003: CRON_SECRET required — 500 if unset, 2026-06-05
- [x] S-004: supabase client files split — lib/supabase-service.ts, 2026-06-05
- [x] S-005: cross-tenant tests — tests/tenant-isolation.test.ts, 2026-06-05
- [x] S-006: rate limit fail-open — console.error on DB error, 2026-06-05
- [x] S-015: legacy route org-scoping — 13 routes fixed + tests, 2026-06-11
- [x] S-016: grant crons fail closed — 2026-06-11
- [x] S-017: SSRF guard (lib/safe-fetch.ts) — 2026-06-11
- [x] S-018: documents/stats org-scoped — 2026-06-11

**Phase gate cleared 2026-06-05; re-opened by S-015 on 2026-06-10; re-cleared 2026-06-11** after
S-015..S-018 remediation. Real organisations may be onboarded.

Remaining medium/low risks (S-007 to S-009, S-012, S-013) are tracked for future sprints.
