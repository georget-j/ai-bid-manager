-- Cache AI-generated buyer briefings on the opportunity row.
-- Avoids regenerating on every page visit.
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS buyer_briefing text;
