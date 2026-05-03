-- 010_style_profile_dashboard.sql
-- Adds narrative_stale flag to style_profiles. True when refinement updated
-- dimension_scores without regenerating the AI narrative; false otherwise.
-- Default false so existing rows (whose ai_result was generated alongside their scores) stay correct.

ALTER TABLE style_profiles
  ADD COLUMN narrative_stale boolean NOT NULL DEFAULT false;
