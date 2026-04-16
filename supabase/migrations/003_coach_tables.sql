-- 003_coach_tables.sql
-- My Coach: user profiles, training sessions, focus areas, drill prescriptions

-- User profiles (persistent coaching notes)
CREATE TABLE user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
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
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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

-- Users can only access their own data
CREATE POLICY "Users read own profile" ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON user_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users read own sessions" ON training_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own sessions" ON training_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own focus areas" ON focus_areas FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users manage own focus areas" ON focus_areas FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users read own prescriptions" ON drill_prescriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users manage own prescriptions" ON drill_prescriptions FOR ALL USING (auth.uid() = user_id);

-- Auto-create profile on first login (trigger)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO user_profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
