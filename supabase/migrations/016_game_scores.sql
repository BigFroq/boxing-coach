-- 016_game_scores.sql
-- Generic per-game, per-user score log. game_type identifies which game's
-- score_value belongs to; score_unit clarifies what score_value means
-- ('ms' for reaction games, 'seconds' for schulte completion time,
-- 'accuracy_pct' for punch prediction).

CREATE TABLE IF NOT EXISTS game_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  game_type text NOT NULL CHECK (game_type IN ('reaction_tap', 'schulte', 'punch_prediction')),
  score_value numeric NOT NULL,
  score_unit text NOT NULL CHECK (score_unit IN ('ms', 'seconds', 'accuracy_pct')),
  played_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_game_scores_user_game
  ON game_scores (user_id, game_type, played_at DESC);

CREATE INDEX IF NOT EXISTS idx_game_scores_leaderboard
  ON game_scores (game_type, score_value);

ALTER TABLE game_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on game_scores" ON game_scores;
CREATE POLICY "Allow all on game_scores"
  ON game_scores FOR ALL USING (true) WITH CHECK (true);
