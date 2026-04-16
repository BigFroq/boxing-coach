-- 003_coach_tables.sql
-- My Coach: user profiles, training sessions, focus areas, drill prescriptions

-- User profiles (persistent coaching notes)
CREATE TABLE user_profiles (
  id uuid PRIMARY KEY,
  display_name text,
  tendencies jsonb DEFAULT '{}'::jsonb,
  skill_levels jsonb DEFAULT '{}'::jsonb,
  preferences jsonb DEFAULT '{}'::jsonb,
  onboarding_complete boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Training sessions (one per logged session)
CREATE TABLE training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_type text CHECK (session_type IN ('bag_work', 'shadow_boxing', 'sparring', 'drills', 'mixed')),
  rounds int,
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary jsonb DEFAULT '{}'::jsonb,
  prescriptions_given jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_training_sessions_user ON training_sessions(user_id, created_at DESC);

-- Focus areas (tracked problems with status progression)
CREATE TABLE focus_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'active', 'improving', 'resolved')),
  knowledge_node_slug text,
  history jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_focus_areas_user ON focus_areas(user_id, status);

-- Drill prescriptions
CREATE TABLE drill_prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  focus_area_id uuid REFERENCES focus_areas(id) ON DELETE SET NULL,
  session_id uuid REFERENCES training_sessions(id) ON DELETE SET NULL,
  drill_name text NOT NULL,
  details text,
  followed_up boolean DEFAULT false,
  follow_up_notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_drill_prescriptions_user ON drill_prescriptions(user_id, followed_up);

-- Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE focus_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE drill_prescriptions ENABLE ROW LEVEL SECURITY;

-- Open policies (no auth — anonymous user IDs from localStorage)
CREATE POLICY "Allow all on user_profiles" ON user_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on training_sessions" ON training_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on focus_areas" ON focus_areas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on drill_prescriptions" ON drill_prescriptions FOR ALL USING (true) WITH CHECK (true);
