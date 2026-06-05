-- S-001: Add org_id and RLS to tender_doc_cache
-- Cache entries are scoped per-org so users cannot enumerate other orgs' cached URLs.
ALTER TABLE tender_doc_cache
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES orgs(id) ON DELETE CASCADE;

ALTER TABLE tender_doc_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cache_own" ON tender_doc_cache
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
    )
  );
