-- Phase 3: agency/client workspace model
-- Clients are companies that a bid agency manages bids on behalf of.
-- Each client belongs to one agency org. No client-side login yet.

CREATE TABLE clients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name        text NOT NULL,
  vertical    text CHECK (vertical IN (
                'it_cyber', 'facilities', 'construction', 'healthcare',
                'education', 'professional_services', 'other'
              )),
  status      text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'inactive', 'archived')),
  website     text,
  notes       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_own" ON clients
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())
  );

CREATE INDEX clients_org_id_idx ON clients (org_id);
