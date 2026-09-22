# Session State

This file captures the exact working state. Update it at the end of every session or after every commit.

---

## Last updated

2026-06-05

## Current phase

All core product phases complete. Recent work: client account provisioning (invite flow), AI answer visibility fix, admin access control hardening.

## What was just done

### `9a7291b` — fix: restrict /clients and /admin to admin users only

- `components/AppSidebar.tsx`: Clients nav item marked `adminOnly: true` — hidden from non-admin accounts (same pattern as Sources)
- `middleware.ts`: `ADMIN_PAGES` extended with `/clients` and `/admin` — direct URL access by non-admins now redirects to `/`

### `39fcf2e` — feat(phase2): client account provisioning via invite flow

- **Migration 037**: `invited_email`, `invite_sent_at`, `client_org_id` columns on `clients` table; partial index on `invited_email`
- **`POST /api/clients/[id]/invite`**: org-scoped invite route; calls `supabase.auth.admin.inviteUserByEmail` with `redirectTo` containing `client_id`; records invite on client row
- **`app/auth/callback/route.ts`**: after `getOrCreateOrgForUser`, links `client_org_id = newOrgId` where `invited_email = user.email AND client_org_id IS NULL` — prevents URL spoofing and re-linking
- **`lib/org.ts`**: import fixed to `@/lib/supabase-service`
- **`/clients/[id]`**: invite status chips (green Active / amber Pending), inline invite form, `sendInvite()` function
- **`components/ClientsAdmin.tsx`**: create client + optional email invite in one form; shown in `/admin` under "Client accounts"
- **`app/admin/page.tsx`**: "Client accounts" section added at top using `ClientsAdmin`
- **Vercel**: `NEXT_PUBLIC_APP_URL=https://ai-bid-manager.vercel.app` set for Production and Development environments

### `e233a2c` — fix(phase1): make AI draft answers visible + always-present export button

- **`app/opportunities/[id]/QuestionsPanel.tsx`**:
  - Replaced `<textarea rows={5}>` with a full-height `<div style={{ whiteSpace: "pre-wrap" }}>` read-only block — entire answer visible immediately
  - Edit mode toggled via `editingIds: Set<string>` — click answer or "Edit" button; Save / Discard buttons appear
  - Green dismissible banner after "Answer All": "✓ N answers generated — scroll down to review, edit, and approve"; auto-dismisses after 8s
  - Export button always rendered: shows DOCX link with count when answers exist, plain-text hint "Export (answer questions first)" when none

## What to do next

See `MARKET_WEDGE_NEXT_ACTIONS_v3.md`.

## Last commit

`9a7291b` — fix: restrict /clients and /admin to admin users only

## Branch

`main`

## Open security risks (non-blocking)

S-007 through S-014 in `MARKET_WEDGE_SECURITY_PLAN_v3.md`. None block production use.

## Key files

| Purpose         | File                                                                   |
| --------------- | ---------------------------------------------------------------------- |
| Phase tracker   | `docs/market-wedge-strategy-v3/MARKET_WEDGE_EXECUTION_TRACKER_v3.md`   |
| Next tasks      | `docs/market-wedge-strategy-v3/MARKET_WEDGE_NEXT_ACTIONS_v3.md`        |
| Security risks  | `docs/market-wedge-strategy-v3/MARKET_WEDGE_SECURITY_PLAN_v3.md`       |
| Re-entry prompt | `docs/market-wedge-strategy-v3/MARKET_WEDGE_CLAUDE_CODE_PROMPTS_v3.md` |
