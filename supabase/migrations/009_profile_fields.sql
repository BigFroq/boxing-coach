-- 009_profile_fields.sql
-- Extend user_profiles with scalar fields surfaced on /me.

ALTER TABLE user_profiles
  ADD COLUMN email text,
  ADD COLUMN gym text,
  ADD COLUMN trainer text,
  ADD COLUMN started_boxing_at date,
  ADD COLUMN goals text,
  ADD COLUMN notes text;
