-- NOTE (rebase): The user's feat/pre-outreach-prep branch already uses migrations
-- 008-010. When this branch lands AFTER pre-outreach-prep merges, rename this file
-- to the next available number (likely 011_) before applying.

-- 008_drill_program.sql
-- Cached, style-tailored drill program JSON for each style_profile
ALTER TABLE style_profiles
  ADD COLUMN drill_program jsonb;
