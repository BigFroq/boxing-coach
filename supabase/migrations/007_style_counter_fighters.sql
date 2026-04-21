-- 007_style_counter_fighters.sql
-- Add counter_fighters jsonb column to style_profiles for "Fighters Strongest Against You".
-- Nullable; legacy rows stay NULL. Written alongside matched_fighters at insert time.

ALTER TABLE style_profiles
  ADD COLUMN counter_fighters jsonb;
