-- 015_daily_drill_picks.sql
-- One row per (user, UTC day) holding the picked drill, the LLM's diagnosis,
-- and completion/skip state. Anonymous-userId model, permissive RLS — same
-- pattern as clip_logs and user_engagement (post-migration-012 convention).

CREATE TABLE IF NOT EXISTS daily_drill_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  drill_date date NOT NULL,

  drill_id text NOT NULL,
  drill_snapshot jsonb NOT NULL,
  diagnosis text NOT NULL,

  completed_at timestamptz,
  skipped_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, drill_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_drill_picks_user_date
  ON daily_drill_picks (user_id, drill_date DESC);

ALTER TABLE daily_drill_picks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on daily_drill_picks" ON daily_drill_picks;
CREATE POLICY "Allow all on daily_drill_picks"
  ON daily_drill_picks FOR ALL USING (true) WITH CHECK (true);
