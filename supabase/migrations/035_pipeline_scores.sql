-- Store fit analysis results on the pipeline row so they persist
-- between page loads and can be shown on the pipeline list.

ALTER TABLE bid_pipeline
  ADD COLUMN IF NOT EXISTS fit_score        integer,
  ADD COLUMN IF NOT EXISTS readiness_score  integer,
  ADD COLUMN IF NOT EXISTS recommended_action text
    CHECK (recommended_action IN ('bid', 'maybe', 'needs-review', 'do-not-bid')),
  ADD COLUMN IF NOT EXISTS score_reasons    text[],
  ADD COLUMN IF NOT EXISTS score_risks      text[],
  ADD COLUMN IF NOT EXISTS scored_at        timestamptz;
