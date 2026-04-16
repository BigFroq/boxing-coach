# Style Finder Overhaul — Design Spec

## Context

The current "Find Your Style" questionnaire is shallow — 8 questions, mostly physical attributes, producing a single AI-generated style label. The questions don't align with how Alex Wiant actually analyzes fighters (biomechanical dimensions, positional readiness, kinetic chains), so the RAG retrieval pulls generic results. Results are ephemeral — no persistence, no auth, no retake history.

This overhaul rebuilds the questionnaire as a **dimension-based profiling system** grounded in Alex's actual analytical framework, adds auth and persistence, and produces a rich multi-axis fighter profile instead of a flat label.

## Design

### 1. The 8 Style Dimensions

Every user is scored 0-100 on these 8 axes, derived from how Alex analyzes fighters in the vault:

| Dimension | What It Measures | Vault Alignment |
|---|---|---|
| **Power Mechanics** | Hip-first sequencing, kinetic chain integration, throw vs push | Hip explosion, kinetic chains, shearing force |
| **Positional Readiness** | Perpetual balance, weight distribution, ready-state maintenance | Crawford analysis, stance discipline |
| **Range Control** | Edge of the bubble, distance management, jab usage, footwork | Distance management, ring cutting |
| **Defensive Integration** | Defense-to-offense linking, head movement, counter transitions | Toney/Floyd analysis, defensive transitions |
| **Ring IQ & Adaptation** | Pattern recognition, mid-fight tactical switching, opponent reading | Crawford vs Canelo analysis, adaptation |
| **Output & Pressure** | Punch volume, combination length, forward movement, pace | Pressure fighting, cardio capacity |
| **Deception & Setup** | Feints, attention manipulation, noise punches, misdirection | Floyd psychological warfare, McClellan setups |
| **Killer Instinct** | Finishing ability, composure when opponent hurt, aggression management | Finishing sequences, pressure response |

Physical attributes (height, build, reach, stance) are collected as **context** — they shape recommendations but are not dimensions themselves.

### 2. Question Set (30 beginner / 31 advanced)

Organized into 5 parts. Experience level (Q5) determines branching — beginners/intermediates get scenario-based versions; advanced/competitors get direct technical versions. Same dimensions scored either way.

**Part A: Foundation (6 questions, everyone)**

| # | Question | Format | Feeds |
|---|---|---|---|
| Q1 | Which stance do you use? | MC (orthodox/southpaw/switch/not sure) | Context |
| Q2 | What's your height? | MC (3 ranges) | Context |
| Q3 | What's your body type? | MC (stocky/lean/lanky) | Context |
| Q4 | Reach relative to height? | MC (short/average/long) | Context |
| Q5 | Experience level? | MC (beginner/intermediate/advanced/competitor) | Context + branching |
| Q6 | Primary goal? | MC (compete/sparring/fitness/self-defense) | Context |

**Part B: Force Generation (5 questions)**

| # | Question | Format | Feeds |
|---|---|---|---|
| Q7 | When you throw your hardest shot, what does it feel like? / How do you initiate power shots? | Scenario (branched) | Power Mechanics |
| Q8 | Power vs speed spectrum | Slider | Power Mechanics, Output |
| Q9 | Default state between exchanges | MC | Positional Readiness |
| Q10 | Who throws first in an exchange? | MC | Positional Readiness, Defensive Integration |
| Q11 | Which punches do you gravitate toward? (pick 2) | Multi-select | Power Mechanics, Range Control |

**Part C: Range & Movement (6 questions)**

| # | Question | Format | Feeds |
|---|---|---|---|
| Q12 | Where do your best exchanges happen? | MC | Range Control |
| Q13 | Opponent aggressively closing distance — what do you do? | Scenario | Range Control, Output |
| Q14 | How would you describe your natural footwork? | MC | Range Control, Positional Readiness |
| Q15 | What's your natural punch output? | MC | Output & Pressure |
| Q16 | What role does your jab play? | MC | Range Control, Deception |
| Q17 | Where do you naturally end up in the ring? | MC | Range Control, Output |

**Part D: Defense & Ring IQ (7 questions, Q20 advanced-only)**

| # | Question | Format | Feeds |
|---|---|---|---|
| Q18 | Straight punch coming at your face — instinct? | Scenario | Defensive Integration |
| Q19 | What's your relationship with the clinch? | MC | Defensive Integration, Ring IQ |
| Q20 | Which defensive system feels most natural? | MC (advanced/competitor only) | Defensive Integration |
| Q21 | Opponent drops right hand after jabbing — two rounds in | Scenario (anti-aspirational) | Ring IQ |
| Q22 | Game plan isn't working, losing rounds | Scenario | Ring IQ & Adaptation |
| Q23 | How do you set up your best punch? | MC | Deception & Setup |
| Q24 | How would you describe your rhythm? | MC | Deception, Ring IQ |

**Part E: Psychology & Instinct (7 questions)**

| # | Question | Format | Feeds |
|---|---|---|---|
| Q25 | Opponent's legs buckle after your clean shot | Scenario (anti-aspirational) | Killer Instinct |
| Q26 | You just got caught with a hard shot, you're hurt | Scenario (anti-aspirational) | Killer Instinct, Defensive Integration |
| Q27 | Close fight heading into championship rounds | Scenario | Killer Instinct, Output, Ring IQ |
| Q28 | What kind of combinations feel most natural? | MC | Output, Power Mechanics |
| Q29 | Head vs body targeting philosophy | MC | Output, Ring IQ |
| Q30 | How do you pace yourself across a fight? | MC | Output, Killer Instinct |
| Q31 | Biggest weakness you want to fix? | MC (8 options mapping to dimensions) | All dimensions (negative signal) |

#### Anti-Aspirational Wording Principles

All scenario options must sound like equally valid, smart strategies. Specific techniques:
- Frame every option as something a world champion does
- Include an honest/developing option where relevant (e.g., "I tend to panic a little" in Q26)
- Prompt users with "be honest, not what a coach would want"
- Avoid value-laden labels — "selective" not "passive," "composed" not "hesitant"

#### Question Formats

- **Multiple choice** — default, used for most questions
- **Slider** — Q8 only (power vs speed spectrum). Genuinely continuous, not forced into discrete buckets
- **Multi-select (pick 2)** — Q11 only (preferred punches). Hook-heavy vs straight-punch fighters need different technique recs
- **Scenario** — Q7, Q13, Q18, Q21, Q22, Q25, Q26, Q27. Reveals tendencies indirectly

### 3. Deterministic Scoring System

Each answer maps to specific dimension score contributions. Scoring is computed **client-side** from a static mapping — no AI involvement in scores.

```
Answer mapping example:
Q7 (hardest shot feel):
  A ("whip cracking") → Power Mechanics +18, Positional Readiness +4
  B ("driving through") → Power Mechanics +10, Output +6
  C ("quick and sharp") → Power Mechanics +6, Deception +8
  D ("still figuring out") → Power Mechanics +3

Q8 (slider 0-100):
  → Power Mechanics += (100 - value) * 0.2
  → Output += value * 0.15
```

Raw scores are normalized to 0-100 per dimension after all answers are tallied. The mapping weights are defined in a single data file (`src/data/scoring-map.ts`).

### 4. Fighter Dimension Profiles

Each fighter in the vault is pre-scored across the 8 dimensions. Stored in `fighter_profiles` table and in a local data file for client-side matching.

Example:
```
Terence Crawford: { power: 82, readiness: 95, range: 88, defense: 85, iq: 95, output: 72, deception: 80, instinct: 88 }
Floyd Mayweather: { power: 55, readiness: 90, range: 92, defense: 95, iq: 90, output: 52, deception: 95, instinct: 60 }
Mike Tyson:       { power: 95, readiness: 85, range: 45, defense: 78, iq: 72, output: 88, deception: 65, instinct: 95 }
```

Fighter matching uses **Euclidean distance** between user scores and fighter profiles. Top 3 closest matches returned. AI explains WHY they match using retrieved vault content.

### 5. Results Page

The results page shows a full fighter profile:

**Structure (top to bottom):**

1. **Physical profile card** — height, build, reach, stance (from Part A)
2. **Style name + description** — AI-generated creative label with 2-3 sentence explanation
3. **Radar chart** — hero visual showing the "shape" of the fighter's profile across 8 dimensions
4. **Dimensional bar breakdown** — exact scores with color coding (blue 70+, amber 50-69, red <50), sorted strongest to weakest
5. **Matching fighters (3)** — Euclidean distance matched, each showing which dimensions overlap, AI-written explanation grounded in vault content
6. **Strengths (top 4) vs Growth Areas (bottom 3)** — side by side. Growth areas include specific, actionable advice
7. **Technique recommendations** — punches to master, stance advice, 4 training priorities
8. **Punch Doctor Insight** — personalized tip from retrieved vault content
9. **Training priority CTAs** — each growth area has "Ask the coach about this" button that pre-loads a query into the chat tab
10. **Actions** — Save Profile, Share, Retake

**Experience-aware language:**
- Beginners: "You naturally lean toward..." / "Your natural tendencies"
- Advanced: "Your strength is..." / "Your profile shows..."

**Retake comparison:** When a previous profile exists, show a "Changes since last profile" section with dimension score deltas and evolved fighter matches.

**Shareable:** "Share" generates a URL to a public read-only view of the profile (radar chart + style name + top dimensions).

### 6. AI Integration

The API route changes from the current approach:

**Current:** All answers → search query → RAG retrieval → Claude generates everything including scores

**New:**
1. Client computes dimension scores deterministically from answers
2. Client sends: `{ answers, dimension_scores, physical_context }` to API
3. API computes fighter matching via Euclidean distance against `fighter_profiles`
4. API builds RAG search query from top dimensions + physical context (e.g., "counter-puncher defensive integration high ring IQ lean tall boxing analysis")
5. API retrieves vault content (8 chunks, filtered to analysis + mechanics)
6. Claude receives: dimension scores, physical context, matched fighters, vault content
7. Claude generates: style name, description, fighter explanations, strengths/growth area descriptions, technique recs, stance advice, training priorities, Punch Doctor insight
8. Claude does NOT generate scores or pick fighters — those are deterministic

### 7. Data Model

**Supabase Auth:** Email magic link, no passwords. User can start quiz without auth; prompted on "Save Profile."

**New tables:**

```sql
-- Progressive quiz saving
quiz_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}',
  current_question int NOT NULL DEFAULT 0,
  experience_level text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed boolean NOT NULL DEFAULT false,
  UNIQUE(user_id)
)

-- Completed profiles with history
style_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  answers jsonb NOT NULL,
  dimension_scores jsonb NOT NULL,
  physical_context jsonb NOT NULL,
  ai_result jsonb NOT NULL,
  matched_fighters jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_current boolean NOT NULL DEFAULT true
)

-- Pre-scored fighter reference data
fighter_profiles (
  slug text PRIMARY KEY,
  name text NOT NULL,
  dimension_scores jsonb NOT NULL,
  vault_path text
)
```

**Key flows:**
- **Progressive save (authed):** Every answer selection upserts to `quiz_progress`. Close tab, return, resume. Requires auth — if the user hasn't signed in yet, answers are held in local state only. On sign-in, local state syncs to `quiz_progress`.
- **Progressive save (unauthed):** Answers stored in React state + `localStorage` as fallback. On auth prompt (at save), `localStorage` answers sync to `quiz_progress`.
- **Profile generation:** On completion, client scores dimensions, sends to API, gets AI result, saves full profile to `style_profiles`.
- **Retake:** New row in `style_profiles` with `is_current = true`, previous row set to `is_current = false`. Results show deltas against most recent previous profile.
- **Share:** Public URL with profile ID, read-only view (no auth to view).

### 8. Files to Modify/Create

**Modify:**
- `src/components/style-finder-tab.tsx` — complete rewrite (new questions, progressive save, results redesign)
- `src/app/api/style-finder/route.ts` — new API contract (deterministic scores in, qualitative results out)

**Create:**
- `src/data/questions.ts` — question definitions with branching logic
- `src/data/scoring-map.ts` — answer → dimension score mappings
- `src/data/fighter-profiles.ts` — pre-scored fighter dimensions
- `src/lib/dimension-scoring.ts` — deterministic scoring engine
- `src/lib/fighter-matching.ts` — Euclidean distance matching
- `src/components/style-finder/` — split into sub-components:
  - `questionnaire.tsx` — question flow with progressive save
  - `results-profile.tsx` — full results page
  - `radar-chart.tsx` — 8-axis radar chart component
  - `dimension-bars.tsx` — scored bar breakdown
  - `fighter-match-card.tsx` — individual fighter match display
  - `retake-comparison.tsx` — delta display against previous profile
- `src/lib/supabase-auth.ts` — auth helpers (magic link)
- `supabase/migrations/XXX_style_profiles.sql` — new tables
- `supabase/migrations/XXX_fighter_profiles_seed.sql` — pre-scored fighter data

## Verification

1. **Questionnaire flow:** Complete the full quiz as beginner and as advanced — confirm branching works, all 30/31 questions render, progressive save persists on page reload
2. **Scoring consistency:** Submit the same answers twice — dimension scores must be identical (deterministic)
3. **Fighter matching:** Verify the top 3 matched fighters make intuitive sense for different profiles (a power-heavy aggressive profile should match Tyson, not Floyd)
4. **Auth flow:** Start quiz without auth → prompted on save → magic link → profile persists → return to app → profile loads
5. **Retake comparison:** Complete quiz, retake with different answers, confirm delta display shows meaningful changes
6. **Results grounding:** Verify AI-generated content references specific vault content (fighter analyses, Alex's terminology), not generic boxing advice
7. **Share:** Generate share URL, open in incognito — profile displays without auth
