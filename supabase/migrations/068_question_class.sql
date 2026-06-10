-- Add question classification and sort order to opportunity_questions
ALTER TABLE opportunity_questions
  ADD COLUMN IF NOT EXISTS question_class text NOT NULL DEFAULT 'question'
    CHECK (question_class IN ('question', 'requirement', 'guidance'));

ALTER TABLE opportunity_questions
  ADD COLUMN IF NOT EXISTS sort_order integer;
