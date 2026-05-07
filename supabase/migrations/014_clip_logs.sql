-- 014_clip_logs.sql
-- Per-clip persistence for the compounding clip log. Each successful clip
-- analysis becomes a row here. Anonymous-userId model (matches user_engagement,
-- user_profiles, training_sessions). Permissive RLS — same pattern as the
-- post-migration-012 convention.

CREATE TABLE IF NOT EXISTS clip_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  filename text,
  duration_seconds numeric(5,2),

  summary text NOT NULL,
  phases jsonb NOT NULL,
  strengths text[] NOT NULL DEFAULT '{}',
  improvements text[] NOT NULL DEFAULT '{}',

  score_loading int CHECK (score_loading BETWEEN 1 AND 10),
  score_hip_explosion int CHECK (score_hip_explosion BETWEEN 1 AND 10),
  score_energy_transfer int CHECK (score_energy_transfer BETWEEN 1 AND 10),
  score_follow_through int CHECK (score_follow_through BETWEEN 1 AND 10),
  score_overall numeric(3,1),

  thumbnail_b64 text,

  model_version text NOT NULL DEFAULT 'sonnet-4-6',
  prompt_version text NOT NULL DEFAULT 'v1'
);

CREATE INDEX IF NOT EXISTS idx_clip_logs_user_created
  ON clip_logs (user_id, created_at DESC);

ALTER TABLE clip_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on clip_logs" ON clip_logs;
CREATE POLICY "Allow all on clip_logs"
  ON clip_logs FOR ALL USING (true) WITH CHECK (true);
