-- Cache AI-generated semantic gap analysis per bid/client combination.
-- Stored as JSONB keyed by client_id so multiple clients can be cached.
ALTER TABLE bid_pipeline
  ADD COLUMN IF NOT EXISTS ai_gap_analysis jsonb;
