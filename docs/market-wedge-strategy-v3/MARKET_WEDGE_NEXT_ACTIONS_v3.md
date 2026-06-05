# Market Wedge Next Actions v3

## Current objective

Phase 2 security fixes complete (2026-06-05). Phase gate cleared.

Move to Phase 1 (founder outreach) and Phase 3 design (agency/client workspace).

---

## Completed Phase 2 tasks (S-001 through S-006)

All resolved in commit 83573dc.

- [x] S-001: tender_doc_cache RLS + org_id (migration 030)
- [x] S-002: admin integrations GET protected
- [x] S-003: CRON_SECRET required
- [x] S-004: lib/supabase-service.ts created; service key isolated
- [x] S-005: tests/tenant-isolation.test.ts — 5 cross-tenant tests
- [x] S-006: rate limit fail-open logs console.error

---

## Completed Phase 2 tasks (reference)

These are small, focused changes. Each should be a separate commit.

### 1. Fix tender_doc_cache RLS (S-001)

File: `supabase/migrations/030_cache_rls.sql`

```sql
ALTER TABLE tender_doc_cache ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES orgs(id) ON DELETE CASCADE;
ALTER TABLE tender_doc_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cache_own" ON tender_doc_cache
  FOR ALL USING (org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid()));
```

Also update `app/api/opportunities/[id]/extract-from-document/route.ts`:

- Add `org_id` to cache insert
- Add `eq("org_id", orgId)` to cache lookup

Note: the tender-docs storage bucket is service-role only, so storage objects are already safe. This fixes the DB table.

### 2. Protect admin integrations GET (S-002)

File: `app/api/admin/integrations/route.ts`

Add `requireAdmin()` call to the GET handler before returning integration settings.

### 3. Make CRON_SECRET required (S-003)

File: `app/api/cron/escalate/route.ts`

Change:

```typescript
const secret = process.env.CRON_SECRET;
if (secret) { ... }
```

To:

```typescript
const secret = process.env.CRON_SECRET;
if (!secret)
  return NextResponse.json(
    { error: "CRON_SECRET not configured" },
    { status: 500 },
  );
if (auth !== `Bearer ${secret}`)
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

### 4. Split supabase client files (S-004)

Create `lib/supabase-service.ts` exporting only `getServiceSupabase()`.
Update all server-side imports to use `lib/supabase-service.ts`.
Keep `lib/supabase.ts` with only the browser anon client.
This prevents accidental service role key use in client components.

### 5. Add cross-tenant retrieval tests (S-005)

File: `tests/tenant-isolation.test.ts` (new)

Tests to write:

- User A uploads a document; User B's query cannot retrieve it
- User A's opportunity_questions are not accessible to User B via API
- User A's answer_library is not returned by match_answer_library for User B

### 6. Fix rate limit fail-open (S-006)

File: `lib/rate-limit.ts`

On DB error, either:

- Block the request with 503 (safest), or
- Log the error to console.error and allow (current behaviour)

At minimum: add `console.error("Rate limit check failed:", error)` so errors are visible in logs.

---

## After Phase 2 security fixes

### Phase 1 — Validation (founder task, parallel to Phase 3)

Run outreach to bid agencies. Target 10 calls.

Use interview guide from `MARKET_WEDGE_VALIDATION_AND_GTM_v3.md`.

Questions to answer before building Phase 3:

- Do bid agencies want a workspace tool for client evidence?
- What evidence formats do they manage (Word, PDF, ISO certs)?
- Is the IT/cyber vertical right, or is facilities management better?
- Would they pay £500–£2,000/month for this?

### Phase 3 — Agency/client workspace (next build phase)

Only start after Phase 2 security fixes are done.

Design decisions needed first:

- Does an agency org contain sub-orgs (clients), or are clients modelled differently?
- Can a bid writer be a member of multiple client workspaces?
- What is the permission model (owner, writer, reviewer, client-only)?

Suggest: read `MARKET_WEDGE_PRODUCT_REQUIREMENTS_v3.md` and design the schema before touching code.

---

## Do not do yet

- Do not build every tender source
- Do not build full buyer intelligence
- Do not build automatic submission
- Do not build marketplace
- Do not expand to every industry
- Do not add real organisations before Phase 2 security fixes are complete
- Do not build Phase 3 before Phase 2 is done
