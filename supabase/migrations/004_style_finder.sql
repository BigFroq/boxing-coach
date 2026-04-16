-- 004_style_finder.sql
-- Style finder: quiz progress, style profiles, fighter dimension profiles

-- Progressive quiz saving (one active quiz per user)
CREATE TABLE quiz_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_question int NOT NULL DEFAULT 0,
  experience_level text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed boolean NOT NULL DEFAULT false,
  UNIQUE(user_id)
);

-- Completed style profiles with history
CREATE TABLE style_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  answers jsonb NOT NULL,
  dimension_scores jsonb NOT NULL,
  physical_context jsonb NOT NULL,
  ai_result jsonb NOT NULL,
  matched_fighters jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_current boolean NOT NULL DEFAULT true
);

CREATE INDEX idx_style_profiles_user ON style_profiles(user_id, is_current, created_at DESC);

-- Pre-scored fighter reference data
CREATE TABLE fighter_profiles (
  slug text PRIMARY KEY,
  name text NOT NULL,
  dimension_scores jsonb NOT NULL,
  vault_path text
);

-- Trigger: when a new profile is inserted, mark previous profiles as not current
CREATE OR REPLACE FUNCTION mark_previous_profiles_not_current()
RETURNS trigger AS $$
BEGIN
  UPDATE style_profiles
  SET is_current = false
  WHERE user_id = NEW.user_id
    AND id != NEW.id
    AND is_current = true;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_style_profile_created
  AFTER INSERT ON style_profiles
  FOR EACH ROW EXECUTE FUNCTION mark_previous_profiles_not_current();

-- Row Level Security
ALTER TABLE quiz_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE style_profiles ENABLE ROW LEVEL SECURITY;

-- Quiz progress: users can only access their own
CREATE POLICY "Users read own quiz progress" ON quiz_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users upsert own quiz progress" ON quiz_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own quiz progress" ON quiz_progress FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own quiz progress" ON quiz_progress FOR DELETE USING (auth.uid() = user_id);

-- Style profiles: users can manage their own, anyone can read by ID (for sharing)
CREATE POLICY "Users manage own profiles" ON style_profiles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Anyone can read profiles by id" ON style_profiles FOR SELECT USING (true);

-- Fighter profiles: public read (reference data)
ALTER TABLE fighter_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read fighter profiles" ON fighter_profiles FOR SELECT USING (true);

-- Seed fighter profiles
INSERT INTO fighter_profiles (slug, name, dimension_scores, vault_path) VALUES
  ('alex-pereira', 'Alex Pereira', '{"powerMechanics":95,"positionalReadiness":88,"rangeControl":82,"defensiveIntegration":75,"ringIQ":78,"outputPressure":85,"deceptionSetup":72,"killerInstinct":88}', 'vault/fighters/alex-pereira.md'),
  ('canelo-alvarez', 'Canelo Alvarez', '{"powerMechanics":65,"positionalReadiness":38,"rangeControl":52,"defensiveIntegration":48,"ringIQ":42,"outputPressure":58,"deceptionSetup":45,"killerInstinct":50}', 'vault/fighters/canelo-alvarez.md'),
  ('charles-oliveira', 'Charles Oliveira', '{"powerMechanics":85,"positionalReadiness":65,"rangeControl":72,"defensiveIntegration":42,"ringIQ":78,"outputPressure":82,"deceptionSetup":80,"killerInstinct":72}', 'vault/fighters/charles-oliveira.md'),
  ('ciryl-gane', 'Ciryl Gane', '{"powerMechanics":38,"positionalReadiness":60,"rangeControl":65,"defensiveIntegration":55,"ringIQ":58,"outputPressure":62,"deceptionSetup":50,"killerInstinct":45}', 'vault/fighters/ciryl-gane.md'),
  ('deontay-wilder', 'Deontay Wilder', '{"powerMechanics":88,"positionalReadiness":72,"rangeControl":65,"defensiveIntegration":55,"ringIQ":48,"outputPressure":75,"deceptionSetup":45,"killerInstinct":80}', 'vault/fighters/deontay-wilder.md'),
  ('devin-haney', 'Devin Haney', '{"powerMechanics":28,"positionalReadiness":62,"rangeControl":68,"defensiveIntegration":70,"ringIQ":65,"outputPressure":45,"deceptionSetup":50,"killerInstinct":35}', 'vault/fighters/devin-haney.md'),
  ('dmitry-bivol', 'Dmitry Bivol', '{"powerMechanics":58,"positionalReadiness":75,"rangeControl":80,"defensiveIntegration":82,"ringIQ":78,"outputPressure":52,"deceptionSetup":65,"killerInstinct":48}', 'vault/fighters/dmitry-bivol.md'),
  ('earnie-shavers', 'Earnie Shavers', '{"powerMechanics":82,"positionalReadiness":58,"rangeControl":62,"defensiveIntegration":50,"ringIQ":55,"outputPressure":70,"deceptionSetup":48,"killerInstinct":78}', 'vault/fighters/earnie-shavers.md'),
  ('floyd-mayweather-jr', 'Floyd Mayweather Jr.', '{"powerMechanics":82,"positionalReadiness":90,"rangeControl":88,"defensiveIntegration":85,"ringIQ":88,"outputPressure":75,"deceptionSetup":85,"killerInstinct":80}', 'vault/fighters/floyd-mayweather-jr.md'),
  ('gervonta-davis', 'Gervonta Davis', '{"powerMechanics":90,"positionalReadiness":82,"rangeControl":75,"defensiveIntegration":68,"ringIQ":72,"outputPressure":85,"deceptionSetup":70,"killerInstinct":88}', 'vault/fighters/gervonta-davis.md'),
  ('ilia-topuria', 'Ilia Topuria', '{"powerMechanics":72,"positionalReadiness":58,"rangeControl":70,"defensiveIntegration":75,"ringIQ":72,"outputPressure":78,"deceptionSetup":68,"killerInstinct":82}', 'vault/fighters/ilia-topuria.md'),
  ('jake-paul', 'Jake Paul', '{"powerMechanics":32,"positionalReadiness":45,"rangeControl":50,"defensiveIntegration":55,"ringIQ":48,"outputPressure":42,"deceptionSetup":40,"killerInstinct":35}', 'vault/fighters/jake-paul.md'),
  ('james-toney', 'James Toney', '{"powerMechanics":82,"positionalReadiness":85,"rangeControl":78,"defensiveIntegration":88,"ringIQ":85,"outputPressure":72,"deceptionSetup":82,"killerInstinct":80}', 'vault/fighters/james-toney.md'),
  ('mike-tyson', 'Mike Tyson', '{"powerMechanics":92,"positionalReadiness":88,"rangeControl":82,"defensiveIntegration":85,"ringIQ":80,"outputPressure":85,"deceptionSetup":75,"killerInstinct":90}', 'vault/fighters/mike-tyson.md'),
  ('oscar-de-la-hoya', 'Oscar De La Hoya', '{"powerMechanics":70,"positionalReadiness":68,"rangeControl":72,"defensiveIntegration":65,"ringIQ":62,"outputPressure":68,"deceptionSetup":55,"killerInstinct":58}', 'vault/fighters/oscar-de-la-hoya.md'),
  ('ramon-dekkers', 'Ramon Dekkers', '{"powerMechanics":85,"positionalReadiness":75,"rangeControl":80,"defensiveIntegration":65,"ringIQ":72,"outputPressure":85,"deceptionSetup":78,"killerInstinct":82}', 'vault/fighters/ramon-dekkers.md'),
  ('terence-crawford', 'Terence Crawford', '{"powerMechanics":78,"positionalReadiness":95,"rangeControl":92,"defensiveIntegration":88,"ringIQ":92,"outputPressure":82,"deceptionSetup":85,"killerInstinct":78}', 'vault/fighters/terence-crawford.md'),
  ('tim-bradley', 'Tim Bradley', '{"powerMechanics":38,"positionalReadiness":60,"rangeControl":62,"defensiveIntegration":68,"ringIQ":65,"outputPressure":48,"deceptionSetup":50,"killerInstinct":40}', 'vault/fighters/tim-bradley.md');
