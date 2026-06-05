-- Add client_id (nullable) to tables that need per-client scoping.
-- Nullable so existing solo-user data continues to work unchanged.
-- org_id remains the primary isolation boundary; client_id is a sub-scope.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE bid_pipeline
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE compliance_matrices
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE organisation_profiles
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE opportunity_questions
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE SET NULL;

-- Indexes for common filter patterns
CREATE INDEX IF NOT EXISTS documents_client_id_idx          ON documents (client_id)          WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bid_pipeline_client_id_idx       ON bid_pipeline (client_id)       WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS compliance_matrices_client_id_idx ON compliance_matrices (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS opp_questions_client_id_idx      ON opportunity_questions (client_id) WHERE client_id IS NOT NULL;
