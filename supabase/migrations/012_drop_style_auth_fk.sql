-- 012_drop_style_auth_fk.sql
-- Unify identity model: style_profiles + quiz_progress now key on the anonymous
-- localStorage UUID used by user_profiles / training_sessions / focus_areas.
-- The original auth.users(id) FK + auth.uid()-based RLS were unreachable: the app
-- has no signIn flow, so getUser() always returned null and these tables only
-- ever held data when the client happened to be authed (which it isn't in prod).
-- After this migration the client can persist style profiles via the anon key,
-- and /api/profile finds them.

ALTER TABLE style_profiles
  DROP CONSTRAINT IF EXISTS style_profiles_user_id_fkey,
  ADD COLUMN IF NOT EXISTS experience_level text;

ALTER TABLE quiz_progress
  DROP CONSTRAINT IF EXISTS quiz_progress_user_id_fkey;

-- Replace auth-gated policies with permissive ones (mirrors user_profiles in 003).
DROP POLICY IF EXISTS "Users read own quiz progress" ON quiz_progress;
DROP POLICY IF EXISTS "Users upsert own quiz progress" ON quiz_progress;
DROP POLICY IF EXISTS "Users update own quiz progress" ON quiz_progress;
DROP POLICY IF EXISTS "Users delete own quiz progress" ON quiz_progress;
CREATE POLICY "Allow all on quiz_progress" ON quiz_progress FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users manage own profiles" ON style_profiles;
-- "Anyone can read profiles by id" (from 004) stays — it's already permissive for SELECT.
CREATE POLICY "Allow all on style_profiles" ON style_profiles FOR ALL USING (true) WITH CHECK (true);
