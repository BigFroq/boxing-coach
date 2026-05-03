-- 011_drill_program.sql
-- Cached, style-tailored drill program JSON for each style_profile
ALTER TABLE style_profiles
  ADD COLUMN drill_program jsonb;
