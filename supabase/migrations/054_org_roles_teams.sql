-- 054: org roles + multi-user team invitations (additive, idempotent).
--
-- Enables multiple users per org with distinct roles, and an invitation flow so an
-- agency can build a team. Invited users join the inviting org (auth callback) instead
-- of being given a private org. "Platform operator" (sources/admin) stays a separate
-- concept driven by ADMIN_EMAILS, NOT by org role.

-- 1. Allow 'admin' as a membership role (was owner|member). Constraint is auto-named
--    org_memberships_role_check by Postgres when defined inline in migration 012.
alter table org_memberships drop constraint if exists org_memberships_role_check;
alter table org_memberships
  add constraint org_memberships_role_check check (role in ('owner', 'admin', 'member'));

-- 2. Team invitations.
create table if not exists org_invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  email       text not null,
  role        text not null default 'member' check (role in ('owner', 'admin', 'member')),
  token       text not null unique,
  invited_by  text,
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  expires_at  timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists org_invitations_org_idx on org_invitations (org_id);
create index if not exists org_invitations_email_idx on org_invitations (lower(email));

alter table org_invitations enable row level security;

-- Org members can read their org's invitations.
drop policy if exists "org_invitations_read" on org_invitations;
create policy "org_invitations_read" on org_invitations for select to authenticated
  using (
    org_id in (select org_id from org_memberships where user_id = auth.uid())
  );

-- Owners/admins manage invitations (writes also go through service-role API routes).
drop policy if exists "org_invitations_write" on org_invitations;
create policy "org_invitations_write" on org_invitations for all to authenticated
  using (
    org_id in (
      select org_id from org_memberships
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  )
  with check (
    org_id in (
      select org_id from org_memberships
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );
