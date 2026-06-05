-- Client account provisioning.
-- Agencies can invite their SME clients to log in with their own accounts.
-- When a client accepts the invite, their new org is linked here.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS invited_email    text,
  ADD COLUMN IF NOT EXISTS invite_sent_at  timestamptz,
  ADD COLUMN IF NOT EXISTS client_org_id   uuid REFERENCES orgs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS clients_invited_email_idx ON clients (invited_email)
  WHERE invited_email IS NOT NULL;
