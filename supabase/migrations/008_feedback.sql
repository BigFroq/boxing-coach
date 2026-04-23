-- 008_feedback.sql
-- Lightweight thumbs up/down feedback on any AI response.
-- Fire-and-forget: insert-only, no update, no auth required.

CREATE TABLE IF NOT EXISTS response_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text, -- anonymous UUID from localStorage; nullable for truly anon
  surface text NOT NULL CHECK (surface IN ('technique', 'drills', 'coach', 'style', 'clip_review', 'other')),
  rating text NOT NULL CHECK (rating IN ('up', 'down')),
  query text,           -- the user's prompt (trimmed)
  response_preview text, -- first ~500 chars of the AI response
  note text,            -- optional freeform user note
  user_agent text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_response_feedback_recent
  ON response_feedback(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_response_feedback_surface
  ON response_feedback(surface, rating, created_at DESC);
