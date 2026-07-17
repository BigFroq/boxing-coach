-- 018_clip_corrections.sql
-- Coach corrections on clip-review analyses. Each row is one phase-level
-- disagreement: what the AI scored/said vs what the coach says is right.
-- Recent corrections are injected into the clip-review prompt as calibration
-- examples. Anonymous-userId model, permissive RLS — post-migration-012
-- convention. NOTE: before public release, gate who can write corrections
-- (any user can currently steer the coach).

CREATE TABLE IF NOT EXISTS clip_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  clip_log_id uuid REFERENCES clip_logs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  phase text NOT NULL,
  ai_score int CHECK (ai_score BETWEEN 1 AND 10),
  ai_feedback text NOT NULL DEFAULT '',
  corrected_score int NOT NULL CHECK (corrected_score BETWEEN 1 AND 10),
  note text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_clip_corrections_created
  ON clip_corrections (created_at DESC);

ALTER TABLE clip_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on clip_corrections" ON clip_corrections;
CREATE POLICY "Allow all on clip_corrections"
  ON clip_corrections FOR ALL USING (true) WITH CHECK (true);
