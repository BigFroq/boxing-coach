-- 006_drill_followup_observability.sql
-- Enrich drill_prescriptions with timestamp + session reference when followed_up flips.
-- Both columns are nullable: legacy rows have NULL, new follow-ups populate them.

ALTER TABLE drill_prescriptions
  ADD COLUMN followed_up_at timestamptz,
  ADD COLUMN followed_up_session_id uuid REFERENCES training_sessions(id) ON DELETE SET NULL;

-- Index to support "when did this drill get followed up" queries from the UI if needed.
CREATE INDEX idx_drill_prescriptions_followed_up_at
  ON drill_prescriptions (user_id, followed_up_at DESC)
  WHERE followed_up = true;
