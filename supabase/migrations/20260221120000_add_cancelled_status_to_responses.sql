-- Add 'cancelled' to the responses.status CHECK constraint
ALTER TABLE responses DROP CONSTRAINT IF EXISTS responses_status_check;
ALTER TABLE responses ADD CONSTRAINT responses_status_check
  CHECK (status IN ('in_progress', 'completed', 'cancelled'));
