# Market Wedge Repo State v3

## Inspected on: 2026-06-05

This document is the Phase 0 output: a snapshot of the existing codebase.

---

## Stack

| Layer      | Technology                                                |
| ---------- | --------------------------------------------------------- |
| Framework  | Next.js App Router (server + client components)           |
| Database   | Supabase (PostgreSQL + pgvector)                          |
| Auth       | Supabase Auth (password + magic link OTP)                 |
| AI         | OpenAI (gpt-4o or gpt-4o-mini, structured output via Zod) |
| Embeddings | OpenAI text-embedding-3-small (1536 dims)                 |
| Storage    | Supabase Storage (tender-docs bucket — new)               |
| Deployment | Vercel                                                    |
| Tests      | Vitest                                                    |

---

## App routes

| Route                 | Auth required | Notes                                                      |
| --------------------- | ------------- | ---------------------------------------------------------- |
| `/`                   | Yes           | Dashboard                                                  |
| `/opportunities`      | Yes           | Procurement opportunity list                               |
| `/opportunities/[id]` | Yes           | Opportunity detail, documents, ITT questions, RFP response |
| `/my-opportunities`   | Yes           | Saved opportunities + RFP Runs tabs                        |
| `/rfp`                | Yes           | RFP document processor                                     |
| `/rfp/history`        | Yes           | Past RFP runs                                              |
| `/ask`                | Yes           | RAG Q&A                                                    |
| `/documents`          | Yes           | Knowledge base upload                                      |
| `/compliance/[id]`    | Yes           | Compliance matrix detail                                   |
| `/review`             | Yes           | Review queue                                               |
| `/pipeline`           | Yes           | Bid pipeline                                               |
| `/alerts`             | Yes           | Tender alerts                                              |
| `/sources`            | Yes + admin   | Admin: procurement sources                                 |
| `/admin`              | Yes           | Admin routing config                                       |
| `/profile`            | Yes           | Organisation profile                                       |
| `/login`              | No            | Auth page                                                  |
| `/(public)/*`         | No            | Marketing pages                                            |

---

## API routes

| Route                                           | Method      | Rate limited | Admin only                 | Notes                                  |
| ----------------------------------------------- | ----------- | ------------ | -------------------------- | -------------------------------------- |
| `/api/ask`                                      | POST        | Yes (20/hr)  | No                         | RAG Q&A                                |
| `/api/documents`                                | GET, DELETE | No           | No                         | Org-scoped doc list                    |
| `/api/documents/upload`                         | POST        | Yes (10/hr)  | No                         | File ingest + chunk                    |
| `/api/opportunities/[id]/extract-questions`     | POST        | No           | No                         | Extract ITT questions from description |
| `/api/opportunities/[id]/extract-from-document` | POST        | Yes (upload) | No                         | Fetch/cache + extract from URL         |
| `/api/opportunities/[id]/questions`             | GET, POST   | No           | No                         | CRUD opportunity questions             |
| `/api/opportunities/[id]/questions/[qid]`       | PATCH       | No           | No                         | Update draft/status                    |
| `/api/opportunities/[id]/questions/answer-all`  | POST        | No           | No                         | SSE: generate AI answers               |
| `/api/opportunities/[id]/export-response`       | GET         | No           | No                         | Download DOCX bid response             |
| `/api/opportunities/[id]/fetch-documents`       | POST        | No           | No                         | HEAD check procurement URLs            |
| `/api/opportunities/[id]/analyse`               | POST        | No           | No                         | Opportunity fit analysis               |
| `/api/compliance-matrix`                        | POST        | No           | No                         | Generate compliance matrix             |
| `/api/rfp/extract`                              | POST        | Yes (upload) | No                         | Extract questions from uploaded file   |
| `/api/rfp/answer-batch`                         | POST        | Yes          | No                         | Batch RFP answers                      |
| `/api/review/[id]/action`                       | POST        | Yes          | No                         | Approve/reject review item             |
| `/api/review/[id]/comments`                     | GET, POST   | Yes          | No                         | Review comments                        |
| `/api/review/bulk-action`                       | POST        | Yes          | No                         | Bulk review actions                    |
| `/api/admin/routing`                            | GET, POST   | Yes          | Yes                        | Email routing config                   |
| `/api/admin/integrations`                       | GET, POST   | Yes          | GET: any auth, POST: admin | Integration settings                   |
| `/api/admin/integrations/test`                  | POST        | Yes          | Yes                        | Test webhook                           |
| `/api/cron/escalate`                            | GET         | No (Bearer)  | CRON_SECRET                | Escalate overdue reviews               |
| `/api/health`                                   | GET         | No           | No                         | Health check                           |
| `/api/export/docx`                              | POST        | Yes          | No                         | Export single answer DOCX              |
| `/api/answer-library`                           | GET, POST   | No           | No                         | Answer library CRUD                    |

---

## Database tables

### Core knowledge base

| Table           | org_id | RLS          | Notes                           |
| --------------- | ------ | ------------ | ------------------------------- |
| documents       | ✓      | ✓            | Uploaded files + extracted text |
| document_chunks | ✗      | ✓ (via join) | Embeddings + text chunks        |
| queries         | ✓      | ✓            | Ask history                     |
| query_results   | ✗      | ✓ (via join) | RAG responses                   |
| answer_library  | ✓      | ✓            | Approved reusable answers       |

### Procurement

| Table               | org_id | RLS | Notes                          |
| ------------------- | ------ | --- | ------------------------------ |
| opportunities       | ✗      | ✓   | Global catalog (admin-managed) |
| sources             | ✗      | ✓   | Feed sources                   |
| raw_notices         | ✗      | ✓   | Raw procurement notices        |
| buyers              | ✗      | ✓   | Buyer directory                |
| opportunity_matches | ✓      | ✓   | Per-org opportunity matches    |
| bid_pipeline        | ✓      | ✓   | Per-org pipeline               |

### Opportunity workflow

| Table                   | org_id | RLS          | Notes                               |
| ----------------------- | ------ | ------------ | ----------------------------------- |
| opportunity_questions   | ✓      | ✓            | Extracted ITT questions + AI drafts |
| compliance_matrices     | ✓      | ✓            | Per-opportunity compliance matrices |
| compliance_requirements | ✗      | ✓ (via join) | Requirements within matrices        |
| organisation_profiles   | ✓      | ✓            | Org profile data                    |

### Review queue

| Table            | org_id | RLS          | Notes               |
| ---------------- | ------ | ------------ | ------------------- |
| review_requests  | ✓      | ✓            | Items to review     |
| review_comments  | ✗      | ✓ (via join) | Comments on reviews |
| review_audit_log | ✗      | ✓ (via join) | Audit trail         |
| approved_answers | ✓      | ✓            | Approved responses  |

### Org + auth

| Table           | org_id | RLS | Notes                 |
| --------------- | ------ | --- | --------------------- |
| orgs            | N/A    | ✓   | Organisation records  |
| org_memberships | N/A    | ✓   | User ↔ org membership |

### Infrastructure

| Table                | org_id | RLS | Notes                             |
| -------------------- | ------ | --- | --------------------------------- |
| routing_config       | ✗      | ✓   | Email routing (service-role only) |
| integration_settings | ✗      | ✓   | Webhooks (service-role only)      |
| rate_limits          | ✗      | ✓   | Rate limit counters               |
| tender_doc_cache     | ✗      | ✗   | **NO RLS** — see security risks   |
| alert_rules          | ✓      | ✓   | Per-org alert rules               |
| alert_matches        | ✓      | ✓   | Per-org alert matches             |
| rfp_run_questions    | ✓      | ✓   | RFP run question history          |

---

## RAG pipeline

```
User query
  → retrieveChunks(query, orgId)
      → generateEmbedding(query)
      → hybrid_search_chunks(embedding, query, p_org_id)   ← org-scoped
          → vector + BM25 fusion (RRF scoring)
          → rerank with LLM if >6 candidates
      → returns RetrievedChunk[]
  → match_answer_library(embedding, p_org_id)               ← org-scoped
  → generateRFPResponse(question, chunks)
      → OpenAI structured output (Zod schema)
      → returns draft_answer, citations, confidence, missing_information
  → verifyCitations(response, retrievedIds)
      → strips citations referencing unretrieved chunks
  → save to DB: ai_draft, answer_status, confidence_level, confidence_score, confidence_reason, citations
```

---

## What the product currently does well

1. Full opportunity workflow: save → analyse → extract ITT questions → answer → review → export DOCX
2. Evidence-grounded RAG answers with citations and confidence scoring
3. Org isolation on all core data (documents, questions, answers, pipeline)
4. Compliance matrix generation
5. Review queue with approve/reject/comment
6. Tender document fetch with caching and rate-limit bypass
7. Multi-document ITT extraction with deduplication

---

## What does not yet exist (required for production/agency use)

| Missing capability                                      | Required for Phase |
| ------------------------------------------------------- | ------------------ |
| Agency/client workspace model                           | Phase 3            |
| Client workspace isolation                              | Phase 3            |
| Evidence vault (certifications, case studies, policies) | Phase 4            |
| Evidence expiry tracking                                | Phase 4            |
| Readiness score                                         | Phase 4            |
| Evidence gap engine                                     | Phase 6            |
| Bid/no-bid recommendation                               | Phase 5            |
| Find a Tender live connector                            | Phase 10           |
| Guided onboarding                                       | Phase 12           |
| Billing / subscription                                  | Phase 12           |
| Bid memory / approved answer bank linked to evidence    | Phase 13           |
| Landing page / validation materials                     | Phase 1            |
| Cross-tenant isolation tests                            | Phase 2            |
| CRON_SECRET enforced                                    | Phase 2            |
| tender_doc_cache RLS                                    | Phase 2            |

---

## Migrations applied

| #   | File                  | Summary                                              |
| --- | --------------------- | ---------------------------------------------------- |
| 001 | create_tables         | Core documents, chunks, queries, query_results       |
| 002 | extensions            | pgvector, pgtrgm                                     |
| 003 | vector_index          | IVFFlat index on embeddings                          |
| 004 | hybrid_search         | hybrid_search_chunks RPC                             |
| 005 | rate_limits           | Rate limit table + RPC                               |
| 006 | approved_answers      | Approved answers table                               |
| 007 | review_requests       | Review queue + comments + audit log                  |
| 008 | review_details        | backup_notified_at, audit log improvements           |
| 009 | sources               | Procurement sources table                            |
| 010 | procurement           | raw_notices, opportunities, buyers                   |
| 011 | rls                   | Enable RLS on all tables; placeholder policies       |
| 012 | orgs                  | orgs, org_memberships, org-scoped policies           |
| 013 | answer_library        | Answer library + match RPC                           |
| 014 | rfp_run_questions     | RFP run questions table                              |
| 015 | compliance            | compliance_matrices + requirements                   |
| 016 | retrieval_org_scope   | hybrid_search_chunks org_id parameter                |
| 017 | opportunity_match     | opportunity_matches table                            |
| 018 | pipeline              | bid_pipeline table                                   |
| 019 | alert_rules           | Alert rules + matches                                |
| 020 | org_profile           | organisation_profiles table                          |
| 021 | rls_tighten           | Drop broad auth_all policies; tighten to org scope   |
| 022 | opportunity_documents | Document–opportunity links                           |
| 023 | opp_catalog           | Opportunities as global catalog                      |
| 024 | single_org            | Enforce one-org-per-user constraint                  |
| 025 | opportunity_questions | ITT questions table                                  |
| 026 | question_class        | question_class + sort_order on opportunity_questions |
| 027 | question_confidence   | confidence_level, confidence_score, citations        |
| 028 | confidence_reason     | confidence_reason                                    |
| 029 | tender_doc_cache      | tender-docs storage bucket + cache table             |
