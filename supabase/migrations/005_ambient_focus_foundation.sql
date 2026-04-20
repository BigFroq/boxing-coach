-- 005_ambient_focus_foundation.sql
-- Phase 1 of ambient trajectory: add dimension/source/last_surfaced_at to focus_areas,
-- replace fragile name-based dedup with a functional unique index.

-- Dimension taxonomy: one of the 8 canonical style-finder dimensions.
-- Nullable for legacy rows written before this migration.
ALTER TABLE focus_areas
  ADD COLUMN dimension text
    CHECK (dimension IS NULL OR dimension IN (
      'powerMechanics',
      'positionalReadiness',
      'rangeControl',
      'defensiveIntegration',
      'ringIQ',
      'outputPressure',
      'deceptionSetup',
      'killerInstinct'
    ));

-- Attribution: did this come from the quiz, a session extraction, or manual entry?
-- Legacy rows get 'session_extraction' since the quiz bridge didn't exist yet.
ALTER TABLE focus_areas
  ADD COLUMN source text NOT NULL DEFAULT 'session_extraction'
    CHECK (source IN ('quiz', 'session_extraction', 'manual'));

-- Throttle support: when did the coach last surface this focus area in a response?
ALTER TABLE focus_areas
  ADD COLUMN last_surfaced_at timestamptz;

-- Dedup: a user can have at most one focus area per (dimension, knowledge_node_slug) tuple.
-- Legacy rows with dimension IS NULL are excluded from the constraint — they'll be
-- superseded the next time the extraction runs, at which point dimension gets set.
-- COALESCE on slug ensures (dim, NULL) and (dim, '') don't collide as separate buckets.
CREATE UNIQUE INDEX idx_focus_areas_dedup
  ON focus_areas (user_id, dimension, COALESCE(knowledge_node_slug, ''))
  WHERE dimension IS NOT NULL;
