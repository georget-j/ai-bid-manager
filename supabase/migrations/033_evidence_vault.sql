-- Phase 4: Evidence vault
-- Stores certifications, policies, case studies, and other evidence items
-- for a client. Each item has a type, expiry date, and links to documents.

CREATE TABLE evidence_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title           text NOT NULL,
  evidence_type   text NOT NULL CHECK (evidence_type IN (
                    'certification',    -- ISO 27001, Cyber Essentials, etc.
                    'policy',           -- GDPR policy, security policy, etc.
                    'case_study',       -- past project / reference
                    'financial',        -- accounts, insurance, turnover proof
                    'accreditation',    -- G-Cloud, Crown Commercial, etc.
                    'reference',        -- client reference letter
                    'other'
                  )),
  status          text NOT NULL DEFAULT 'valid'
                    CHECK (status IN ('valid', 'expiring_soon', 'expired', 'missing')),
  issuer          text,                 -- e.g. "IASME" or "BSI"
  reference_number text,               -- cert number / registration
  issued_at       date,
  expires_at      date,
  notes           text,
  document_id     uuid REFERENCES documents(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE evidence_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evidence_own" ON evidence_items
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())
  );

CREATE INDEX evidence_items_org_id_idx    ON evidence_items (org_id);
CREATE INDEX evidence_items_client_id_idx ON evidence_items (client_id);
CREATE INDEX evidence_items_type_idx      ON evidence_items (evidence_type);

-- Auto-update status based on expiry date
CREATE OR REPLACE FUNCTION update_evidence_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expires_at IS NOT NULL THEN
    IF NEW.expires_at < CURRENT_DATE THEN
      NEW.status := 'expired';
    ELSIF NEW.expires_at <= CURRENT_DATE + INTERVAL '60 days' THEN
      NEW.status := 'expiring_soon';
    ELSE
      NEW.status := 'valid';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER evidence_status_trigger
  BEFORE INSERT OR UPDATE ON evidence_items
  FOR EACH ROW EXECUTE FUNCTION update_evidence_status();
