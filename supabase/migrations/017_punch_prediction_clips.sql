-- 017_punch_prediction_clips.sql
-- Labeled content catalog for the punch prediction game. Each row is a still
-- frame of a fighter in setup position with the ground-truth label of which
-- punch they're about to throw. Populated by the one-time ingestion script
-- via Claude vision.

CREATE TABLE IF NOT EXISTS punch_prediction_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_filename text NOT NULL,
  image_b64 text NOT NULL,
  punch_label text NOT NULL CHECK (punch_label IN ('jab', 'cross', 'hook', 'uppercut')),
  difficulty text NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  llm_confidence numeric,
  llm_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_punch_clips_label ON punch_prediction_clips (punch_label);

ALTER TABLE punch_prediction_clips ENABLE ROW LEVEL SECURITY;

-- Reads are public so the game can fetch them. Writes are restricted —
-- only the ingestion script via service-role key writes here (no anon writes).
DROP POLICY IF EXISTS "Allow read on punch_prediction_clips" ON punch_prediction_clips;
CREATE POLICY "Allow read on punch_prediction_clips"
  ON punch_prediction_clips FOR SELECT USING (true);
