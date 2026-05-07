---
title: Plan 3c — Reaction Games (Reflex Hub)
date: 2026-05-07
status: design approved, awaiting spec review
predecessor: Plan 3b (Today's Drill) — shipped 2026-05-07, merged to main
upstream_design: docs/ideas/2026-05-07-floman-feedback-idea-map.md (item #10: hand-eye warm-up game; FLOMAN's explicit ask)
---

# Plan 3c — Reaction Games (Reflex Hub)

## Goal

Add a standalone **Games** tab with three boxing-relevant reaction/cognition games. Standalone — NOT gating clip review or any other flow. Every play persists to a generic `game_scores` table; an anonymous global leaderboard surfaces lifetime-best scores per game. The games are framed as *warmup ritual / fun coordination challenges* throughout — never as performance-training claims (FTC).

This implements item #10 from the FLOMAN idea map and addresses his explicit ask about hand-eye coordination games.

## Success criteria

- A new `Games` tab is reachable from the main nav, alongside Technique / Drills / Coach / Style.
- Three games playable end-to-end: Reaction Tap, Schulte Table, Punch Prediction.
- Each play writes a row to `game_scores`. Each game's hub card shows the user's lifetime-best.
- Each game has an anonymous global top-20 leaderboard (lifetime-best per user).
- Punch Prediction has a labeled content catalog of 50–100 clips/stills, ingested once via Claude vision and stored in `punch_prediction_clips`.
- All UI copy uses warmup/fun framing (no "improves your boxing" claims).
- Plans 1+2+3a+3b tests (243/243) continue to pass.

## Architecture

Five layers:

**Data:**
1. `game_scores` table — generic per-game, per-user score log.
2. `punch_prediction_clips` table — labeled content catalog for the prediction game.

**Server:**
3. API route `/api/games/score` — POST a score (writes a row), GET leaderboard query.
4. API route `/api/games/punch-clips` — GET a random batch of N labeled clips for a round.
5. Ingestion script `scripts/games/label-punch-clips.ts` — one-time tool that takes a directory of clip stills, runs them through Claude vision with a labeling prompt, writes to the `punch_prediction_clips` table.

**UI:**
6. New top-level tab `Games` in `src/app/page.tsx`.
7. Hub page (`src/components/games/hub.tsx`) — 3 cards.
8. Three game components (`src/components/games/reaction-tap.tsx`, `schulte.tsx`, `punch-prediction.tsx`).
9. Shared `Leaderboard` component (`src/components/games/leaderboard.tsx`) for the per-game top-20.

**Plus** Task N: manual QA.

### File structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/016_game_scores.sql` | Create | `game_scores` table + index + RLS |
| `supabase/migrations/017_punch_prediction_clips.sql` | Create | `punch_prediction_clips` table + RLS |
| `src/lib/games-types.ts` | Create | Shared TS types |
| `src/lib/games-storage.ts` | Create | Read/write helpers (saveScore, fetchLeaderboard, fetchPunchClips, fetchUserBests) |
| `src/lib/validation.ts` | Modify | Add `gameScoreSubmitSchema` |
| `src/app/api/games/score/route.ts` | Create | POST score, GET leaderboard |
| `src/app/api/games/punch-clips/route.ts` | Create | GET random labeled clips for a round |
| `scripts/games/label-punch-clips.ts` | Create | One-time ingestion via Claude vision |
| `src/components/games/hub.tsx` | Create | Games hub with 3 cards |
| `src/components/games/reaction-tap.tsx` | Create | Reaction Tap game |
| `src/components/games/schulte.tsx` | Create | Schulte Table game |
| `src/components/games/punch-prediction.tsx` | Create | Punch Prediction game |
| `src/components/games/leaderboard.tsx` | Create | Shared anon leaderboard |
| `src/app/page.tsx` | Modify | Add `games` tab to main nav |

### Decomposition principles

- `games-storage.ts` is the I/O boundary. All four games + leaderboard go through it.
- Each game component is self-contained: receives `userId` prop, manages its own play state, calls storage on score commit.
- Hub page renders 3 game cards (each with a last-score line) and routes to the game's full UI.
- Leaderboard component takes `gameType` + `scoreUnit` + sort direction (lower-better for ms/seconds, higher-better for accuracy_pct) — fully reusable.
- The ingestion script is a node-only `tsx` script (no UI, run via `npm run` or directly with `tsx`).

## 1. Schema

### `game_scores`

```sql
-- 016_game_scores.sql
-- Generic per-game, per-user score log. game_type identifies which game's
-- score_value belongs to; score_unit clarifies what score_value means
-- ('ms' for reaction games, 'seconds' for schulte completion time, 'accuracy_pct'
-- for punch prediction).

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
```

### `punch_prediction_clips`

```sql
-- 017_punch_prediction_clips.sql
-- Labeled content catalog for the punch prediction game. Each row is a still
-- frame (or short clip thumbnail) of a fighter in setup position with the
-- ground-truth label of which punch they're about to throw. Populated by the
-- one-time ingestion script via Claude vision.

CREATE TABLE IF NOT EXISTS punch_prediction_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_filename text NOT NULL,
  image_b64 text NOT NULL,                    -- still frame, base64 JPEG
  punch_label text NOT NULL CHECK (punch_label IN ('jab', 'cross', 'hook', 'uppercut')),
  difficulty text NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  llm_confidence numeric,                     -- 0..1, optional
  llm_notes text,                             -- the LLM's brief justification
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_punch_clips_label ON punch_prediction_clips (punch_label);

ALTER TABLE punch_prediction_clips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read on punch_prediction_clips" ON punch_prediction_clips;
CREATE POLICY "Allow read on punch_prediction_clips"
  ON punch_prediction_clips FOR SELECT USING (true);

-- INSERT policy is intentionally NOT permissive — only the ingestion script
-- (server-side via service role) writes to this table. Clients only read.
```

**Rationale:**
- `image_b64` in DB rather than Storage because v1 catalog is small (50–100 rows × ~30KB each = 3MB max). Migrate to Supabase Storage if the catalog grows past 1k rows.
- `INSERT` policy is restrictive (no anon writes) — prevents users from injecting fake content. Reads are public so the game can fetch them.

## 2. Game mechanics

### Game 1: Reaction Tap

- Full-screen red background.
- After 1–5s random delay, turns green.
- Tap anywhere → record reaction time in ms.
- 5 attempts per round; report **average ms** as the round score.
- False start (tap before green) → round restarts, no score.
- Score units: `ms`. Lower = better.

### Game 2: Schulte Table

- 5×5 grid of scrambled numbers 1–25.
- Tap them in order. UI highlights the next expected number subtly.
- Wrong tap → no penalty, just doesn't advance.
- Stopwatch starts on first tap, stops on tapping `25`.
- Score units: `seconds`. Lower = better.

### Game 3: Punch Prediction

- 10 prompts per round.
- Each prompt: show a clip image (250–500px, the `image_b64` rendered) for ~1.5s, then auto-hide.
- 4 buttons: Jab / Cross / Hook / Uppercut. Stay enabled for 3s after image hides.
- Correct + within 1s = 100 points. Correct + 1–3s = 70 points. Correct + 3s+ (timeout) = 30 points. Wrong = 0 points.
- Round score = total / 1000 → presented as **accuracy_pct** (0–100).
- Score units: `accuracy_pct`. Higher = better.

## 3. API routes

### `POST /api/games/score`

Body validated with `gameScoreSubmitSchema`:
```ts
{
  userId: string,
  gameType: 'reaction_tap' | 'schulte' | 'punch_prediction',
  scoreValue: number,
  scoreUnit: 'ms' | 'seconds' | 'accuracy_pct'
}
```
Returns `{ status: 'ok' }`. Insert into `game_scores`.

### `GET /api/games/score?gameType=...&kind=leaderboard|user-best`

- `kind=leaderboard`: returns top 20 lifetime-best scores per user. Anonymized (no userId returned — instead, derive a stable display token like `player_${hash(userId).slice(0,4)}`).
- `kind=user-best`: returns the requesting user's lifetime-best for that game.

Sort direction depends on `gameType`:
- reaction_tap, schulte → ASC (lower is better)
- punch_prediction → DESC (higher is better)

Use a SQL window function or a min/max + group-by query to dedupe to one row per user (lifetime best).

### `GET /api/games/punch-clips?count=10`

Returns `count` random labeled clips. Server-side randomness (Postgres `ORDER BY random()` LIMIT N). Anti-repeat heuristic: client passes a list of recently-seen clip IDs to exclude (`?exclude=id1,id2,...`); server filters them out.

## 4. Ingestion script

`scripts/games/label-punch-clips.ts` — one-time content pipeline.

- Reads from a local directory the user populates (e.g. `scripts/games/source-clips/`).
- For each image:
  1. Read file → base64.
  2. Send to Claude vision (Sonnet 4.6 since this is one-time and quality matters): "Identify the punch the boxer is about to throw. Return JSON: `{punch_label: jab|cross|hook|uppercut, difficulty: easy|medium|hard, confidence: 0..1, notes: '...'}`. If the image doesn't clearly show a punch setup, return `{punch_label: null, ...}` and we skip it."
  3. Insert into `punch_prediction_clips` table with the labels + image_b64.
- Logs progress, retries on failure, idempotent (skips already-ingested filenames).

The script is run from the developer machine (Mark's), not from the deployed app. Uses the Supabase service role key from `.env.local`.

## 5. UI structure

### Tab placement

Add `Games` to the main nav (`src/app/page.tsx` tabs array) — alongside Technique / Drills / Coach / Style. Use a controller icon (lucide `Gamepad2`).

### Hub (`src/components/games/hub.tsx`)

Three cards, each shows:
- Game name + 1-line description
- "Best: <score> <unit>" if the user has played
- "[Play]" button → routes into the game's full UI
- Below the cards: subtitle reminder *"Quick reflex challenges. Have fun, beat your own scores."*

Click a card → swap the hub for the game component (controlled by hub-level state, no router push needed).

### Per-game UI

Each game (reaction-tap, schulte, punch-prediction) follows the same pattern:
1. Pre-play: rules + "[Start round]" button + tease leaderboard
2. Play: the game itself, full-bleed
3. Post-play: result ("Round score: X ms"), best-score callout if new PB, "[Play again]" / "[Back to hub]"

### Leaderboard component (`src/components/games/leaderboard.tsx`)

Props: `gameType`, `scoreUnit`, `direction: 'asc' | 'desc'`. Self-fetches via `/api/games/score?kind=leaderboard&gameType=...`. Renders top 20 as a list: rank · anonymized player token · score.

## 6. Persistence model

- All scores write through `POST /api/games/score`.
- Hub fetches `kind=user-best` per game on mount.
- Leaderboard component fetches `kind=leaderboard` on mount.
- Punch-prediction game fetches a fresh batch of clips per round via `/api/games/punch-clips`.
- No localStorage — server-side only. (Eliminates "lost scores on browser clear" complaint.)

## 7. FTC-safe framing

**OK copy:**
- "Quick reflex challenges"
- "Test your timing"
- "Beat your best score"
- "Fun warmup before training"
- "Sharpen your eyes"

**NEVER:**
- "Improves your boxing"
- "Trains your reaction time" (too close to a performance claim)
- "Scientifically proven"
- "Better fighters react faster" (cause-effect implication)
- "Used by professionals"

Hub headline: *"Games — quick reflex challenges and pattern-recognition fun"*. Or similar. Mark to confirm copy at QA time; the principle is what matters.

## 8. Streak interaction — none new

Same call as Plan 3b: opening the app updates the existing `user_engagement` streak (Plan 1). Playing a game is just one form of engagement. No separate "games streak" — keeps one streak, one truth.

## 9. Cold-start

| Scenario | Behavior |
|---|---|
| User has never played any game | Hub shows all 3 cards, "Best: —" placeholders. Leaderboards still render (showing other users' scores). |
| Punch Prediction with empty `punch_prediction_clips` table | Game card on hub shows "Coming soon — content being labeled". Don't break the hub. |
| `userId === "anon"` | Hub still loads, but score-write API returns 400; UI shows a small "Log in or take the style quiz to save scores" banner. |

## 10. Out of scope (v1)

- Live multiplayer / synchronous competition
- Friends / social graph / nameable leaderboards (anonymous-only for v1)
- Difficulty progression / levels (each game has fixed difficulty)
- Daily attempt limits (unlimited plays — engagement metric, not gated)
- Mobile-specific touch optimizations beyond what works in mobile browser
- New game types beyond the 3 named
- F1 starting lights game (Mark dropped from initial proposal)
- Whack-a-mole game (Mark dropped from initial proposal)

## 11. Risks

1. **Punch Prediction content shortage.** With 50 clips, a serious user runs out of fresh prompts in a few rounds. Mitigation: anti-repeat heuristic via `?exclude=` query param (client tracks recently-seen IDs); content can grow with another ingestion run.
2. **Leaderboard gaming.** Anonymous global leaderboard could be manipulated by spamming attempts (unbounded plays). Acceptable: the leaderboard rewards consistent skill (lifetime-best converges), spam attempts are visible in analytics. Mitigation later if it's a real problem.
3. **FTC enforcement risk if copy drifts.** Future maintainers (or Mark in a hurry) could swap "warmup" copy for "training" copy. Mitigation: this spec doc is the canonical FTC framing reference; PR reviews should catch drift.
4. **Ingestion script labeling errors.** Claude vision may mislabel ambiguous setups. Mitigation: the script asks for `confidence`; we can filter to high-confidence labels at ingestion or spot-check the catalog manually before launch.

## 12. What's NOT in this plan

- Plan 3d (Agentic coach) — separate plan
- Vault prefill (Hooked/Fogg/Quiet-Eye principles, sports-vision-evidence craft) — Mark explicitly skipped after deciding it's not load-bearing for the games

## 13. What I'd want next

1. Spec review.
2. After approval, invoke `superpowers:writing-plans`.
3. Execute via `superpowers:subagent-driven-development`.

Estimated effort: ~12–14 tasks (2 migrations + types + storage + 2 routes + ingestion script + hub + 3 games + leaderboard + tab wiring + manual QA).

Mark also has a one-time content task: source 50–100 boxing clip stills for the punch prediction catalog, drop them in `scripts/games/source-clips/`, run the ingestion script. Can happen in parallel with implementation.
