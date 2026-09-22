# Next Actions

Last updated: 2026-06-04

## Current objective

All phases complete. DB migrations applied. Deployed to Vercel. App is live at ai-bid-manager.vercel.app.

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

## DB migrations — all applied (2026-06-04)

```
011_rls.sql                   ✓ applied
012_orgs.sql                  ✓ applied
013_answer_library.sql        ✓ applied
014_rfp_run_questions.sql     ✓ applied
015_fix_rls_conflicts.sql     ✓ applied
016_retrieval_org_scope.sql   ✓ applied
017_procurement_tables.sql    ✓ applied
018_rfp_opportunity_link.sql  ✓ applied
019_compliance_matrix.sql     ✓ applied
020_alert_rules.sql           ✓ applied
021_tighten_rls.sql           ✓ applied
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

- None. All blockers resolved.

---

## After completing the current objective

- Update IMPLEMENTATION_STATE.md
- Update CHANGELOG.md
- Update ARCHITECTURE_DECISIONS.md if a decision was made
- Update this NEXT_ACTIONS.md file
- Update SECURITY_REQUIREMENTS.md if new risks found
