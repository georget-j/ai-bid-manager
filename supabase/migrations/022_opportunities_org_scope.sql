-- Scope opportunities to the org that synced them.
-- Each org holds its own copy of public notices; same notice synced by two
-- orgs produces two rows (different org_id).

alter table opportunities
  add column if not exists org_id uuid references orgs(id) on delete cascade;

-- Remove any rows synced before org-scoping (org_id = null).
-- They would never appear in org-filtered queries so are safe to drop.
-- Users should re-sync their sources after this migration.
delete from opportunities where org_id is null;

-- Drop the old global unique constraints.
alter table opportunities
  drop constraint if exists opportunities_canonical_ocid_key;
alter table opportunities
  drop constraint if exists opportunities_source_name_source_notice_id_key;

-- New org-scoped unique indices.
-- NULLS NOT DISTINCT requires Postgres 15+; Supabase ships 15.
create unique index if not exists opportunities_source_org_idx
  on opportunities (source_name, source_notice_id, org_id)
  nulls not distinct;

create unique index if not exists opportunities_ocid_org_idx
  on opportunities (canonical_ocid, org_id)
  nulls not distinct
  where canonical_ocid is not null;

create index if not exists opportunities_org_idx on opportunities (org_id);

-- Update RLS: authenticated users see only their org's opportunities.
drop policy if exists "opportunities_read" on opportunities;

create policy "opportunities_own"
  on opportunities for all
  to authenticated
  using  (org_id in (select org_id from org_memberships where user_id = auth.uid()))
  with check (org_id in (select org_id from org_memberships where user_id = auth.uid()));
