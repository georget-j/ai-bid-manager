-- Store confidence level, score, and source citations on each answered question
ALTER TABLE opportunity_questions
  ADD COLUMN IF NOT EXISTS confidence_level text
    CHECK (confidence_level IN ('high', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS confidence_score integer,
  ADD COLUMN IF NOT EXISTS citations jsonb;
