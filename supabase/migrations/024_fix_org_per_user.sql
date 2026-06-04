-- Migration 024: Give every user their own private org.
--
-- Background: a bug in getOrCreateOrgForUser() caused every user who signed up
-- after the first one to be joined to the existing org rather than getting their
-- own. This migration corrects existing data by:
--
--   1. For each org that currently has more than one member, the EARLIEST member
--      (by org_memberships.created_at) keeps the original org and all its data.
--
--   2. Every later member is moved to a brand-new private org. Their new org
--      starts empty — we cannot reliably attribute existing rows (documents,
--      pipeline items, etc.) to a specific user because those tables only carry
--      org_id, not user_id.
--
--   3. All original members are promoted to 'owner' of whatever org they end
--      up in.
--
-- Safe to re-run: the DO block only processes users still sharing an org with
-- others. Users who already have their own org are untouched.

DO $$
DECLARE
  rec         RECORD;
  new_org_id  UUID;
  slug_base   TEXT;
  slug_val    TEXT;
  suffix      INT := 0;
BEGIN
  FOR rec IN
    -- All memberships that belong to an org shared with at least one other user,
    -- ordered so the earliest member (rn=1) is processed first.
    SELECT
      om.id,
      om.user_id,
      om.email,
      om.org_id  AS shared_org_id,
      ROW_NUMBER() OVER (PARTITION BY om.org_id ORDER BY om.created_at ASC) AS rn
    FROM org_memberships om
    WHERE om.org_id IN (
      SELECT org_id
      FROM org_memberships
      GROUP BY org_id
      HAVING COUNT(*) > 1
    )
    ORDER BY om.org_id, om.created_at ASC
  LOOP
    IF rec.rn = 1 THEN
      -- Earliest member: promote to owner in the original shared org and leave
      -- all existing data where it is.
      UPDATE org_memberships
      SET role = 'owner'
      WHERE id = rec.id;

      RAISE NOTICE 'User % (%) kept in original org % as owner',
        rec.user_id, rec.email, rec.shared_org_id;

    ELSE
      -- Later member: create a new private org and move them into it.
      slug_base := lower(
        regexp_replace(
          regexp_replace(rec.email, '[^a-z0-9]', '-', 'g'),
          '-+', '-', 'g'
        )
      );
      slug_base := trim(both '-' from slug_base);
      slug_val  := slug_base;
      suffix    := 0;

      -- Ensure slug uniqueness
      WHILE EXISTS (SELECT 1 FROM orgs WHERE slug = slug_val) LOOP
        suffix   := suffix + 1;
        slug_val := slug_base || '-' || suffix;
      END LOOP;

      INSERT INTO orgs (name, slug)
      VALUES (rec.email, slug_val)
      RETURNING id INTO new_org_id;

      UPDATE org_memberships
      SET org_id = new_org_id,
          role   = 'owner'
      WHERE id = rec.id;

      RAISE NOTICE 'Created org % (slug: %) for user % (%)',
        new_org_id, slug_val, rec.user_id, rec.email;
    END IF;
  END LOOP;

  RAISE NOTICE 'Migration 024 complete.';
END $$;
