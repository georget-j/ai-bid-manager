# Implementation State

Last updated: 2026-06-04

## Current phase

Phases 1–10 complete. All planned features shipped.

## Completed

- [x] Existing repo files inspected
- [x] Existing project instructions inspected
- [x] Continuity docs merged/linked from existing Claude instructions (appended to CLAUDE.md)
- [x] Phase 0 repo audit
- [x] Security foundation assessment documented
- [x] 0-S1: Dropped conflicting `auth_all_*` RLS policies (migration 015)
- [x] 0-S2: Org-scoped `hybrid_search_chunks` + `retrieveChunks(orgId)` (migration 016)
- [x] 0-S3: Rate limiting added to all 4 export routes
- [x] 0-S4: Dropped unrestricted `orgs_insert` RLS policy (migration 015)
- [x] Phase 1 rebrand and navigation scaffold
- [x] Phase 2 data model and seed data
- [x] Phase 3 organisation profile and scoring
- [x] Phase 4 bid pipeline
- [x] Phase 5 Find a Tender connector
- [x] Phase 6 RFP run integration
- [x] Phase 7 compliance matrix
- [x] Phase 8 additional connectors
- [x] Phase 9 alerts and saved searches
- [x] Phase 10 public marketing/resources layer

---

## What exists now (as of 2026-06-04)

### Stack

- **Framework:** Next.js 16 App Router, TypeScript
- **Database:** Supabase Postgres + pgvector (14 migrations applied)
- **AI:** OpenAI text-embedding-3-small + gpt-4o-mini via Vercel AI SDK
- **Auth:** Supabase Auth (magic link OTP); `@supabase/ssr` cookie sessions
- **Notifications:** Resend (email) + Slack webhook
- **Deployment:** Vercel (live at ai-bid-manager.vercel.app)
- **Styling:** Custom CSS variables (no Tailwind/MUI)

### Working routes (pages)

| Route            | Status                                            |
| ---------------- | ------------------------------------------------- |
| `/` (homepage)   | Working                                           |
| `/ask`           | Working — single question RAG answer              |
| `/documents`     | Working — upload, list, delete                    |
| `/rfp`           | Working — batch processing with checkpoint/resume |
| `/rfp/history`   | Working                                           |
| `/review`        | Working — queue with tabs, bulk actions           |
| `/review/[id]`   | Working                                           |
| `/history`       | Working                                           |
| `/admin`         | Working — routing config, integrations            |
| `/demo`          | Working — sample data loader                      |
| `/login`         | Working — magic link OTP form                     |
| `/auth/callback` | Working — exchanges code, provisions org          |

### Working API routes

| Route                                        | Auth                      | Notes                                        |
| -------------------------------------------- | ------------------------- | -------------------------------------------- |
| `POST /api/ask`                              | Middleware                | Rate-limited, SSE streaming                  |
| `POST /api/rfp/answer-batch`                 | Middleware                | SSE, checkpoint/resume via rfp_run_questions |
| `POST /api/rfp/extract`                      | Middleware                | Text extraction from uploaded ITT            |
| `GET/PATCH /api/rfp/runs`                    | Middleware                | —                                            |
| `GET/POST/DELETE /api/documents`             | Middleware                | Org-scoped                                   |
| `POST /api/documents/upload`                 | Middleware                | Ext allowlist, 5MB cap, org-scoped           |
| `GET/POST/DELETE /api/answer-library`        | Middleware                | Org-scoped                                   |
| `GET /api/queries` / `GET /api/queries/[id]` | Middleware                | —                                            |
| `GET /api/review/queue`                      | Middleware                | —                                            |
| `GET/POST /api/review/[id]/*`                | Middleware                | action, comments, notify-missing             |
| `POST /api/review/bulk-action`               | Middleware                | —                                            |
| `POST /api/review/confirm-routing`           | Middleware                | —                                            |
| `GET/POST /api/admin/routing`                | Middleware + requireAdmin | —                                            |
| `PATCH/DELETE /api/admin/routing/[id]`       | Middleware + requireAdmin | —                                            |
| `GET/POST /api/admin/integrations`           | Middleware + requireAdmin | —                                            |
| `POST /api/admin/integrations/test`          | Middleware + requireAdmin | —                                            |
| `POST /api/export/docx`                      | requireAuth               | Fixed: session check added                   |
| `POST /api/export/html`                      | requireAuth               | Fixed: session check added                   |
| `POST /api/export/rfp-batch`                 | requireAuth               | Fixed: session check added                   |
| `POST /api/export/rfp-batch-html`            | requireAuth               | Fixed: session check added                   |
| `GET /api/cron/escalate`                     | CRON_SECRET (optional)    | Gap if secret not set                        |
| `POST /api/auth/login`                       | Public (intentional)      | —                                            |
| `GET /api/health`                            | Public (intentional)      | —                                            |

### Database schema (14 migrations)

| Table                | RLS     | Org-scoped policy                                  |
| -------------------- | ------- | -------------------------------------------------- |
| documents            | Enabled | Yes (012) — but `auth_all_*` from 011 may override |
| document_chunks      | Enabled | No — `using(true)` from 011                        |
| queries              | Enabled | Yes (012)                                          |
| query_results        | Enabled | No — `using(true)` from 011                        |
| routing_config       | Enabled | No — `using(true)` from 011                        |
| review_requests      | Enabled | Yes (012)                                          |
| approved_answers     | Enabled | No — `using(true)` from 011                        |
| integration_settings | Enabled | No — `using(true)` from 011                        |
| rate_limits          | Enabled | No — `using(true)` from 011                        |
| review_comments      | Enabled | No — `using(true)` from 011                        |
| review_audit_log     | Enabled | No — `using(true)` from 011                        |
| answer_library       | Enabled | Yes (013)                                          |
| rfp_run_questions    | Enabled | No                                                 |
| orgs                 | Enabled | Yes (012)                                          |
| org_memberships      | Enabled | Yes (012)                                          |

### AI/RAG logic

- `lib/retrieval.ts` — hybrid vector + keyword search via `hybrid_search_chunks` RPC; reranking via LLM
- `lib/generation.ts` — generates structured RFP response (Zod schema: draft_answer, confidence, missing_information, citations, action_items)
- `lib/citations.ts` — server-side citation verification against retrieved chunk IDs
- `lib/confidence-score.ts` — confidence scoring
- `lib/review-routing.ts` — routes low-confidence/high-risk answers to review queue; `escalateOverdueReviews()` wired to cron
- `lib/embeddings.ts` — OpenAI text-embedding-3-small

---

## Known security issues (must fix before multi-tenant launch)

See SECURITY_REQUIREMENTS.md for full details.

### CRITICAL — all fixed

1. **RAG retrieval not org-scoped** — FIXED: migration 016 + `retrieveChunks(orgId)` in lib/retrieval.ts
2. **Conflicting RLS policies** — FIXED: migration 015 dropped `auth_all_documents`, `auth_all_queries`, `auth_all_review_requests`

### HIGH — all fixed

3. **Export routes unprotected** — FIXED: `requireAuth()` added to all 4 export routes (docx, html, rfp-batch, rfp-batch-html)
4. **`orgs_insert` is unrestricted** — FIXED: migration 015 dropped `orgs_insert` policy

### MEDIUM

5. **`CRON_SECRET` optional** — If unset, `/api/cron/escalate` is publicly callable. Mitigated: set `CRON_SECRET` in Vercel env vars.
6. **MIME type validation is client-supplied** — `file.type` is from the browser; magic-byte check would be stronger. Accepted risk for now.
7. **`document_chunks`, `query_results`, `approved_answers`, `review_comments`, `review_audit_log`, `rfp_run_questions` not org-scoped** — FIXED in migration 021: org-scoped policies for all 6 tables; `rfp_run_questions` also gains `org_id` column. `routing_config`, `integration_settings`, `rate_limits` remain broad (admin config only, service-role access only).

### All migrations applied (2026-06-04)

Migrations 011–021 applied to Supabase project `zurulmbbddizwiozrewu` via `supabase db push`.

---

## How to run locally

```bash
npm install
npm run dev
```

Requires `.env.local` with: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `NEXT_PUBLIC_APP_URL`. See README.md for full list.

## How to test

```bash
npm test          # Vitest unit tests
npm run typecheck # TypeScript
npm run lint      # ESLint (--max-warnings 0)
npm run build     # Next.js production build
```

---

## Important implementation notes

- All API routes use the **service role** Supabase client. RLS policies are therefore not currently enforced for any DB operation — data isolation relies entirely on application-level org_id filtering in queries.
- DEMO_MODE is guarded against production deployment: `process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production"`.
- The `rfp_run_questions` table enables checkpoint/resume for batch RFP processing.
- Answer library pre-check happens before RAG in `/api/ask` — similarity threshold 0.88.
- Cron SLA escalation is wired to Vercel Cron (hourly, `/api/cron/escalate`).
- The `auth/callback` route auto-provisions an org on first login (email-domain slug).
