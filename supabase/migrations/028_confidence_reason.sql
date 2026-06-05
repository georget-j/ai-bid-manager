ALTER TABLE opportunity_questions
  ADD COLUMN IF NOT EXISTS confidence_reason text;
