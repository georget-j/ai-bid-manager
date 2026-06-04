-- Revert org-scoping on opportunities (added in 022).
-- Opportunities become a central admin-managed catalog readable by all
-- authenticated users. Privacy is maintained through bid_pipeline and
-- opportunity_matches, which remain org-scoped.

-- Drop the policy that references org_id before dropping the column.
drop policy if exists "opportunities_own" on opportunities;

alter table opportunities drop column if exists org_id;

drop index if exists opportunities_source_org_idx;
drop index if exists opportunities_ocid_org_idx;
drop index if exists opportunities_org_idx;

-- Restore global unique constraints.
create unique index if not exists opportunities_source_idx
  on opportunities (source_name, source_notice_id);

create unique index if not exists opportunities_ocid_idx
  on opportunities (canonical_ocid)
  where canonical_ocid is not null;

-- All authenticated users can read; writes go through service role only.

create policy "opportunities_read"
  on opportunities for select
  to authenticated
  using (true);
