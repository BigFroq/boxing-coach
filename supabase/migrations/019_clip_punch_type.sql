-- 019_clip_punch_type.sql
-- Punch-specific clip review: the fighter declares which punch they want
-- assessed before analysis runs. The slug matches vault/clip-review/<slug>.md
-- and src/lib/punch-types.ts.
--
-- Nullable with no default: rows written before this migration genuinely have
-- no declared punch, and that is different from 'general' (which means the
-- fighter was asked and chose not to specify).

ALTER TABLE clip_logs ADD COLUMN IF NOT EXISTS punch_type text;
