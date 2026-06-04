# Next Actions

Last updated: 2026-06-04

## Current objective

Phases 1–10 complete. Security gaps fixed. Dashboard and buyers page updated. Apply pending DB migrations to Supabase (017–021), then deploy to Vercel.

---

## Phase 0 security fixes — COMPLETE (2026-06-04)

- [x] 0-S1: `supabase/migrations/015_fix_rls_conflicts.sql` — dropped `auth_all_documents`, `auth_all_queries`, `auth_all_review_requests` (GAP-002 fixed)
- [x] 0-S2: `supabase/migrations/016_retrieval_org_scope.sql` + `lib/retrieval.ts` + callers — `retrieveChunks` now org-scoped (GAP-001 fixed)
- [x] 0-S3: `checkRateLimit` added to all 4 export routes (GAP-003 mitigated; middleware still provides session check)
- [x] 0-S4: `orgs_insert` RLS policy dropped in migration 015 (GAP-004 fixed)

---

## Completed phases (2026-06-04)

- Phase 1: Rebrand + nav (sidebar, topbar, homepage, 5 placeholder pages)
- Phase 2: Procurement types, migrations (017), seed data, opportunities list + detail
- Phase 3: Profile form + API, scoring engine, analyse fit + add-to-pipeline routes
- Phase 4: Pipeline API routes, real pipeline page with status updates
- Phase 5: Find a Tender connector, OCDS normaliser, sync engine, sources page + API
- Phase 6: RFP→opportunity link (migration 018), RFPProcessor props, opportunity detail actions
- Phase 7: Compliance matrix migration (019), generate/detail/update routes, compliance list + detail pages

## Pending DB migrations — apply to Supabase before deploying

```
017_procurement_tables.sql
018_rfp_opportunity_link.sql
019_compliance_matrix.sql
020_alert_rules.sql
021_tighten_rls.sql
```

---

## Do not do yet

- Do not implement Find a Tender connector (Phase 5)
- Do not add procurement scoring (Phase 3)
- Do not overwrite existing docs
- Do not replace README.md
- Do not rewrite the app
- Do not remove existing RFP/RAG routes
- Do not scrape gated portals

---

## Blockers / questions

1. **Org model:** Single-org per deployment (Phase 1) vs multi-tenant (Phase 2)? Affects how `org_id` is passed into procurement tables.
2. **Demo mode vs production auth:** How should demo opportunities be scoped? Null `org_id` = visible to all (same as existing demo documents)?
3. **`CRON_SECRET` in current deployment:** Is it set on Vercel? If not, GAP-005 is live.

---

## After completing the current objective

- Update IMPLEMENTATION_STATE.md
- Update CHANGELOG.md
- Update ARCHITECTURE_DECISIONS.md if a decision was made
- Update this NEXT_ACTIONS.md file
- Update SECURITY_REQUIREMENTS.md if new risks found
