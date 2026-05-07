-- 013_user_engagement.sql
-- Track per-user return cadence so we can measure D1/D7/D30 retention and
-- surface a passive streak indicator in the UI. Keys on the anonymous
-- localStorage UUID (same identity model as user_profiles after migration 012).
-- No FK to auth.users — the app has no signIn flow.

CREATE TABLE IF NOT EXISTS user_engagement (
  user_id text PRIMARY KEY,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_session_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  session_count int NOT NULL DEFAULT 1,
  current_streak_days int NOT NULL DEFAULT 1,
  longest_streak_days int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_engagement_last_seen
  ON user_engagement (last_seen_at DESC);

ALTER TABLE user_engagement ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on user_engagement" ON user_engagement;
CREATE POLICY "Allow all on user_engagement"
  ON user_engagement FOR ALL USING (true) WITH CHECK (true);
