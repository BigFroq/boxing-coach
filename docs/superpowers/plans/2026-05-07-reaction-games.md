# Reaction Games Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone `Games` tab with three boxing-relevant games — Reaction Tap, Schulte Table, Punch Prediction — each with anonymous global leaderboards. Includes a one-time ingestion script that uses Claude vision to label punch-prediction clips.

**Architecture:** Two new tables (`game_scores` generic + `punch_prediction_clips` content). Two API routes (`/api/games/score` for POST + leaderboard GET; `/api/games/punch-clips` for random batch). One node script for ingestion. UI is a hub with three game cards plus a shared leaderboard component. New top-level tab in main nav.

**Tech Stack:** Next.js (App Router) · React · Supabase · Anthropic SDK (Sonnet 4.6 for ingestion only) · Zod · Vitest · Lucide icons

**Spec:** [docs/superpowers/specs/2026-05-07-reaction-games-design.md](../specs/2026-05-07-reaction-games-design.md)

**Project uses npm.** Use `npm test`, `npx tsc --noEmit`.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/016_game_scores.sql` | Create | `game_scores` table + indexes + RLS |
| `supabase/migrations/017_punch_prediction_clips.sql` | Create | `punch_prediction_clips` table + RLS |
| `src/lib/games-types.ts` | Create | Shared TS types |
| `src/lib/games-storage.ts` | Create | Pure mappers (`rowToScore`, `rowToClip`) + I/O helpers (`saveScore`, `fetchUserBest`, `fetchLeaderboard`, `fetchPunchClips`) |
| `src/lib/games-storage.test.ts` | Create | Vitest tests for the pure mappers |
| `src/lib/games-leaderboard-anon.ts` | Create | Pure: `anonTokenForUserId(id)` — derives stable display token from userId hash |
| `src/lib/games-leaderboard-anon.test.ts` | Create | Vitest tests for the anon-token function |
| `src/lib/validation.ts` | Modify | Add `gameScoreSubmitSchema` |
| `src/app/api/games/score/route.ts` | Create | POST score, GET leaderboard / user-best |
| `src/app/api/games/punch-clips/route.ts` | Create | GET random batch of labeled clips with anti-repeat |
| `scripts/games/label-punch-clips.ts` | Create | One-time ingestion via Claude vision (Sonnet 4.6) |
| `src/components/games/hub.tsx` | Create | Hub with 3 cards |
| `src/components/games/leaderboard.tsx` | Create | Reusable anonymous top-20 display |
| `src/components/games/reaction-tap.tsx` | Create | Reaction Tap game |
| `src/components/games/schulte.tsx` | Create | Schulte Table game |
| `src/components/games/punch-prediction.tsx` | Create | Punch Prediction game |
| `src/app/page.tsx` | Modify | Add `games` tab to main nav |

---

## Task 1: Migration 016 — `game_scores` table

**File:**
- Create: `supabase/migrations/016_game_scores.sql`

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/016_game_scores.sql` with EXACTLY:

```sql
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
```

- [ ] **Step 2: Skip local apply**

Production migration application happens at parent-controller level via Supabase MCP after this task.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/016_game_scores.sql
git commit -m "feat(db): add game_scores table for reflex hub"
```

---

## Task 2: Migration 017 — `punch_prediction_clips` table

**File:**
- Create: `supabase/migrations/017_punch_prediction_clips.sql`

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/017_punch_prediction_clips.sql`:

```sql
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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/017_punch_prediction_clips.sql
git commit -m "feat(db): add punch_prediction_clips content catalog table"
```

---

## Task 3: Shared types — `games-types.ts`

**File:**
- Create: `src/lib/games-types.ts`

- [ ] **Step 1: Create the types file**

Create `src/lib/games-types.ts` with EXACTLY:

```ts
// Shared types for the Reaction Games (Reflex Hub) feature. Imported by
// storage, API routes, and all game UI components.

export type GameType = "reaction_tap" | "schulte" | "punch_prediction";
export type ScoreUnit = "ms" | "seconds" | "accuracy_pct";
export type PunchLabel = "jab" | "cross" | "hook" | "uppercut";
export type Difficulty = "easy" | "medium" | "hard";

export interface GameScore {
  id: string;
  userId: string;
  gameType: GameType;
  scoreValue: number;
  scoreUnit: ScoreUnit;
  playedAt: string; // ISO timestamp
}

export interface LeaderboardEntry {
  rank: number;
  playerToken: string;     // anonymized display token
  scoreValue: number;
  scoreUnit: ScoreUnit;
}

export interface PunchClip {
  id: string;
  sourceFilename: string;
  imageB64: string;
  punchLabel: PunchLabel;
  difficulty: Difficulty;
  llmConfidence: number | null;
  llmNotes: string | null;
}

// Sort direction for leaderboards: lower-better for ms/seconds, higher-better for pct.
export function sortDirectionFor(unit: ScoreUnit): "asc" | "desc" {
  return unit === "accuracy_pct" ? "desc" : "asc";
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/games-types.ts
git commit -m "feat(games): shared types"
```

---

## Task 4: Pure anon-token helper — `games-leaderboard-anon.ts` + tests

**Files:**
- Create: `src/lib/games-leaderboard-anon.ts`
- Test: `src/lib/games-leaderboard-anon.test.ts`

A pure function that takes a userId and returns a stable, anonymous display token like `player_a3f9`. Deterministic — same userId always produces same token.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/games-leaderboard-anon.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { anonTokenForUserId } from "./games-leaderboard-anon";

describe("anonTokenForUserId", () => {
  it("produces the player_<4hex> shape", () => {
    const token = anonTokenForUserId("any-user-id");
    expect(token).toMatch(/^player_[a-f0-9]{4}$/);
  });

  it("is deterministic for the same userId", () => {
    const a = anonTokenForUserId("abc-123");
    const b = anonTokenForUserId("abc-123");
    expect(a).toBe(b);
  });

  it("differs across different userIds", () => {
    const a = anonTokenForUserId("user-a");
    const b = anonTokenForUserId("user-b");
    expect(a).not.toBe(b);
  });

  it("returns a constant fallback for empty/anon userId", () => {
    expect(anonTokenForUserId("")).toBe("player_anon");
    expect(anonTokenForUserId("anon")).toBe("player_anon");
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npm test -- src/lib/games-leaderboard-anon.test.ts`
Expected: FAIL with "Cannot find module './games-leaderboard-anon'".

- [ ] **Step 3: Implement**

Create `src/lib/games-leaderboard-anon.ts`:

```ts
// Derives a stable anonymous display token from a userId. Used by the
// leaderboard so users have an identity (consistent across reloads) without
// exposing the raw userId. Pure function — deterministic, no I/O.

import { createHash } from "crypto";

export function anonTokenForUserId(userId: string): string {
  if (!userId || userId === "anon") return "player_anon";
  const hash = createHash("sha256").update(userId).digest("hex");
  return `player_${hash.slice(0, 4)}`;
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm test -- src/lib/games-leaderboard-anon.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: 247/247 (243 + 4 new).

- [ ] **Step 6: Commit**

```bash
git add src/lib/games-leaderboard-anon.ts src/lib/games-leaderboard-anon.test.ts
git commit -m "feat(games): pure anon-token helper for leaderboard display"
```

---

## Task 5: Storage helpers + mapper tests — `games-storage.ts`

**Files:**
- Create: `src/lib/games-storage.ts`
- Test: `src/lib/games-storage.test.ts`

Pure `rowToScore` and `rowToClip` mappers (testable). I/O helpers (`saveScore`, `fetchUserBest`, `fetchLeaderboard`, `fetchPunchClips`) return tagged results, never throw.

- [ ] **Step 1: Write the failing tests for the mappers**

Create `src/lib/games-storage.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { rowToScore, rowToClip } from "./games-storage";

describe("rowToScore", () => {
  it("maps a DB row to a GameScore", () => {
    const row = {
      id: "s1",
      user_id: "u1",
      game_type: "reaction_tap",
      score_value: 245,
      score_unit: "ms",
      played_at: "2026-05-07T10:00:00Z",
    };
    expect(rowToScore(row)).toEqual({
      id: "s1",
      userId: "u1",
      gameType: "reaction_tap",
      scoreValue: 245,
      scoreUnit: "ms",
      playedAt: "2026-05-07T10:00:00Z",
    });
  });
});

describe("rowToClip", () => {
  it("maps a DB row to a PunchClip", () => {
    const row = {
      id: "c1",
      source_filename: "fight-1.jpg",
      image_b64: "abc==",
      punch_label: "jab",
      difficulty: "medium",
      llm_confidence: 0.92,
      llm_notes: "clear front-foot loading",
    };
    expect(rowToClip(row)).toEqual({
      id: "c1",
      sourceFilename: "fight-1.jpg",
      imageB64: "abc==",
      punchLabel: "jab",
      difficulty: "medium",
      llmConfidence: 0.92,
      llmNotes: "clear front-foot loading",
    });
  });

  it("handles null optional columns", () => {
    const row = {
      id: "c2",
      source_filename: "f2.jpg",
      image_b64: "x",
      punch_label: "hook",
      difficulty: "hard",
      llm_confidence: null,
      llm_notes: null,
    };
    const c = rowToClip(row);
    expect(c.llmConfidence).toBeNull();
    expect(c.llmNotes).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npm test -- src/lib/games-storage.test.ts`
Expected: FAIL "Cannot find module './games-storage'".

- [ ] **Step 3: Implement**

Create `src/lib/games-storage.ts`:

```ts
// Read/write helpers for the Reaction Games feature. Anon-key Supabase client
// for client-side reads (matches post-012 permissive-RLS pattern). Pure
// rowToScore and rowToClip mappers are exported for unit testing without a
// Supabase stub. All I/O paths return tagged results, never throw.

import { createBrowserClient } from "./supabase-browser";
import { track } from "./analytics";
import type {
  GameScore,
  GameType,
  PunchClip,
  ScoreUnit,
} from "./games-types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;

export function rowToScore(row: AnyRow): GameScore {
  return {
    id: row.id,
    userId: row.user_id,
    gameType: row.game_type,
    scoreValue: Number(row.score_value),
    scoreUnit: row.score_unit,
    playedAt: row.played_at,
  };
}

export function rowToClip(row: AnyRow): PunchClip {
  return {
    id: row.id,
    sourceFilename: row.source_filename,
    imageB64: row.image_b64,
    punchLabel: row.punch_label,
    difficulty: row.difficulty,
    llmConfidence: row.llm_confidence ?? null,
    llmNotes: row.llm_notes ?? null,
  };
}

export type SaveScoreResult =
  | { status: "saved" }
  | { status: "error"; reason: string };

export interface SaveScoreInput {
  userId: string;
  gameType: GameType;
  scoreValue: number;
  scoreUnit: ScoreUnit;
}

export async function saveScore(input: SaveScoreInput): Promise<SaveScoreResult> {
  if (typeof window === "undefined") {
    return { status: "error", reason: "server-side" };
  }
  if (!input.userId || input.userId === "anon") {
    return { status: "error", reason: "no-userid" };
  }
  try {
    const res = await fetch("/api/games/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error("[games-storage] saveScore non-ok:", body);
      track("game_score_save_failed", { stage: "non-ok", gameType: input.gameType });
      return { status: "error", reason: "non-ok" };
    }
    track("game_score_saved", { gameType: input.gameType, scoreValue: input.scoreValue });
    return { status: "saved" };
  } catch (err) {
    console.error("[games-storage] saveScore threw:", err);
    track("game_score_save_failed", { stage: "throw" });
    return { status: "error", reason: "fetch-throw" };
  }
}

export type FetchScoreResult =
  | { status: "ok"; score: number | null }
  | { status: "error"; reason: string };

export async function fetchUserBest(
  userId: string,
  gameType: GameType
): Promise<FetchScoreResult> {
  if (!userId || userId === "anon") return { status: "ok", score: null };
  try {
    const res = await fetch(
      `/api/games/score?gameType=${encodeURIComponent(gameType)}&userId=${encodeURIComponent(userId)}&kind=user-best`
    );
    if (!res.ok) return { status: "error", reason: "non-ok" };
    const body = (await res.json()) as { status: string; score: number | null };
    if (body.status === "ok") return { status: "ok", score: body.score };
    return { status: "error", reason: "bad-shape" };
  } catch (err) {
    console.error("[games-storage] fetchUserBest threw:", err);
    return { status: "error", reason: "fetch-throw" };
  }
}

export interface LeaderboardRow {
  rank: number;
  playerToken: string;
  scoreValue: number;
}

export type LeaderboardResult =
  | { status: "ok"; entries: LeaderboardRow[] }
  | { status: "error"; reason: string };

export async function fetchLeaderboard(
  gameType: GameType
): Promise<LeaderboardResult> {
  try {
    const res = await fetch(
      `/api/games/score?gameType=${encodeURIComponent(gameType)}&kind=leaderboard`
    );
    if (!res.ok) return { status: "error", reason: "non-ok" };
    const body = (await res.json()) as { status: string; entries?: LeaderboardRow[] };
    if (body.status === "ok" && Array.isArray(body.entries)) {
      return { status: "ok", entries: body.entries };
    }
    return { status: "error", reason: "bad-shape" };
  } catch (err) {
    console.error("[games-storage] fetchLeaderboard threw:", err);
    return { status: "error", reason: "fetch-throw" };
  }
}

export type FetchPunchClipsResult =
  | { status: "ok"; clips: PunchClip[] }
  | { status: "error"; reason: string };

export async function fetchPunchClips(
  count: number,
  excludeIds: string[] = []
): Promise<FetchPunchClipsResult> {
  try {
    const params = new URLSearchParams({ count: String(count) });
    if (excludeIds.length > 0) params.set("exclude", excludeIds.join(","));
    const res = await fetch(`/api/games/punch-clips?${params.toString()}`);
    if (!res.ok) return { status: "error", reason: "non-ok" };
    const body = (await res.json()) as { status: string; clips?: AnyRow[] };
    if (body.status === "ok" && Array.isArray(body.clips)) {
      return { status: "ok", clips: body.clips.map(rowToClip) };
    }
    return { status: "error", reason: "bad-shape" };
  } catch (err) {
    console.error("[games-storage] fetchPunchClips threw:", err);
    return { status: "error", reason: "fetch-throw" };
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm test -- src/lib/games-storage.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: 250/250.

- [ ] **Step 6: Commit**

```bash
git add src/lib/games-storage.ts src/lib/games-storage.test.ts
git commit -m "feat(games): storage helpers + mapper tests"
```

---

## Task 6: Add Zod schema for score submission

**File:** Modify `src/lib/validation.ts`

- [ ] **Step 1: Append the schema**

At the end of `src/lib/validation.ts` (after the existing `dailyDrillPickPatchSchema` export), append:

```ts
export const gameScoreSubmitSchema = z.object({
  userId: z.string().min(1).max(128),
  gameType: z.enum(["reaction_tap", "schulte", "punch_prediction"]),
  scoreValue: z.number().finite(),
  scoreUnit: z.enum(["ms", "seconds", "accuracy_pct"]),
});
```

- [ ] **Step 2: Type-check + tests**

Run: `npx tsc --noEmit` (clean) and `npm test` (250/250).

- [ ] **Step 3: Commit**

```bash
git add src/lib/validation.ts
git commit -m "feat(validation): add gameScoreSubmitSchema"
```

---

## Task 7: API route — `/api/games/score` (POST + GET)

**File:**
- Create: `src/app/api/games/score/route.ts`

- [ ] **Step 1: Implement**

Create directory: `mkdir -p src/app/api/games/score`

Create `src/app/api/games/score/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/rate-limit";
import { gameScoreSubmitSchema } from "@/lib/validation";
import { anonTokenForUserId } from "@/lib/games-leaderboard-anon";
import { sortDirectionFor } from "@/lib/games-types";
import type { GameType, ScoreUnit } from "@/lib/games-types";

const VALID_GAMES: GameType[] = ["reaction_tap", "schulte", "punch_prediction"];

function unitForGameType(gameType: GameType): ScoreUnit {
  if (gameType === "reaction_tap") return "ms";
  if (gameType === "schulte") return "seconds";
  return "accuracy_pct";
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const parsed = gameScoreSubmitSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { status: "error", message: "Invalid request", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const { userId, gameType, scoreValue, scoreUnit } = parsed.data;

    if (scoreUnit !== unitForGameType(gameType)) {
      return NextResponse.json(
        { status: "error", message: "scoreUnit doesn't match gameType" },
        { status: 400 }
      );
    }

    const limited = await enforceRateLimit(request, userId);
    if (limited) return limited;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createServerClient() as any;
    const { error } = await supabase.from("game_scores").insert({
      user_id: userId,
      game_type: gameType,
      score_value: scoreValue,
      score_unit: scoreUnit,
    });

    if (error) {
      console.error("[games/score] insert failed:", error);
      return NextResponse.json(
        { status: "error", message: "Failed to save score" },
        { status: 500 }
      );
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[games/score] POST threw:", err);
    return NextResponse.json(
      { status: "error", message: "Server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const gameTypeRaw = url.searchParams.get("gameType");
    const kind = url.searchParams.get("kind") ?? "leaderboard";

    if (!gameTypeRaw || !VALID_GAMES.includes(gameTypeRaw as GameType)) {
      return NextResponse.json(
        { status: "error", message: "gameType required" },
        { status: 400 }
      );
    }
    const gameType = gameTypeRaw as GameType;
    const unit = unitForGameType(gameType);
    const direction = sortDirectionFor(unit);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createServerClient() as any;

    if (kind === "user-best") {
      const userId = url.searchParams.get("userId");
      if (!userId || userId === "anon") {
        return NextResponse.json({ status: "ok", score: null });
      }
      const orderColumn = "score_value";
      const ascending = direction === "asc";
      const { data, error } = await supabase
        .from("game_scores")
        .select("score_value")
        .eq("user_id", userId)
        .eq("game_type", gameType)
        .order(orderColumn, { ascending })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("[games/score] user-best failed:", error);
        return NextResponse.json(
          { status: "error", message: "Failed to fetch" },
          { status: 500 }
        );
      }
      const score = data ? Number(data.score_value) : null;
      return NextResponse.json({ status: "ok", score });
    }

    // kind === "leaderboard" — top 20 lifetime-best per user
    // We pull a generous window then group by user in memory because
    // Supabase JS doesn't expose window functions cleanly.
    const ascending = direction === "asc";
    const { data, error } = await supabase
      .from("game_scores")
      .select("user_id, score_value")
      .eq("game_type", gameType)
      .order("score_value", { ascending })
      .limit(500);

    if (error) {
      console.error("[games/score] leaderboard failed:", error);
      return NextResponse.json(
        { status: "error", message: "Failed to fetch" },
        { status: 500 }
      );
    }

    // Dedupe to one row per user (the first hit is their best given the order).
    const seen = new Set<string>();
    const bests: Array<{ userId: string; scoreValue: number }> = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (data ?? []) as any[]) {
      if (seen.has(row.user_id)) continue;
      seen.add(row.user_id);
      bests.push({ userId: row.user_id, scoreValue: Number(row.score_value) });
      if (bests.length >= 20) break;
    }

    const entries = bests.map((b, i) => ({
      rank: i + 1,
      playerToken: anonTokenForUserId(b.userId),
      scoreValue: b.scoreValue,
    }));

    return NextResponse.json({ status: "ok", entries });
  } catch (err) {
    console.error("[games/score] GET threw:", err);
    return NextResponse.json(
      { status: "error", message: "Server error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Type-check + tests**

Run: `npx tsc --noEmit` (clean), `npm test` (250/250).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/games/score/route.ts
git commit -m "feat(api): /api/games/score POST + GET (leaderboard / user-best)"
```

---

## Task 8: API route — `/api/games/punch-clips`

**File:**
- Create: `src/app/api/games/punch-clips/route.ts`

- [ ] **Step 1: Implement**

Create directory: `mkdir -p src/app/api/games/punch-clips`

Create `src/app/api/games/punch-clips/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

const MAX_COUNT = 30;

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const countRaw = url.searchParams.get("count") ?? "10";
    const count = Math.min(Math.max(parseInt(countRaw, 10) || 10, 1), MAX_COUNT);
    const excludeRaw = url.searchParams.get("exclude") ?? "";
    const excludeIds = excludeRaw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createServerClient() as any;

    // Fetch a wider pool than count, exclude seen, shuffle in memory.
    // Postgres RANDOM() ORDER on small catalogs is fine but pulling a wider
    // pool lets us anti-repeat without round-trips.
    let query = supabase.from("punch_prediction_clips").select("*").limit(count * 4);
    if (excludeIds.length > 0) {
      query = query.not("id", "in", `(${excludeIds.map((id) => `"${id}"`).join(",")})`);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[games/punch-clips] select failed:", error);
      return NextResponse.json(
        { status: "error", message: "Failed to fetch clips" },
        { status: 500 }
      );
    }

    // Shuffle and trim to `count`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = (data ?? []) as any[];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const clips = pool.slice(0, count);

    return NextResponse.json({ status: "ok", clips });
  } catch (err) {
    console.error("[games/punch-clips] GET threw:", err);
    return NextResponse.json(
      { status: "error", message: "Server error" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Type-check + tests**

Run: `npx tsc --noEmit` (clean), `npm test` (250/250).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/games/punch-clips/route.ts
git commit -m "feat(api): /api/games/punch-clips with anti-repeat exclude"
```

---

## Task 9: Ingestion script — `scripts/games/label-punch-clips.ts`

**File:**
- Create: `scripts/games/label-punch-clips.ts`

One-time tool. Reads images from `scripts/games/source-clips/`, labels each via Claude vision (Sonnet 4.6), inserts to `punch_prediction_clips`. Idempotent — skips already-ingested filenames.

- [ ] **Step 1: Implement**

Create directory: `mkdir -p scripts/games`

Create `scripts/games/label-punch-clips.ts`:

```ts
// One-time ingestion: label boxing clip stills via Claude vision and insert
// into punch_prediction_clips. Run from developer machine, NOT from the
// deployed app. Uses the Supabase service-role key from .env.local.
//
// Usage:
//   1) Drop ~50-100 boxing clip stills (jpg/png) in scripts/games/source-clips/
//   2) Run: npx tsx scripts/games/label-punch-clips.ts
//   3) The script reads, labels, and inserts each unique filename.
//      Re-running is idempotent: filenames already present are skipped.

import fs from "fs/promises";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const SOURCE_DIR = path.join(__dirname, "source-clips");

const SYSTEM_PROMPT = `You are labeling a still frame from a boxing clip. The frame shows a boxer in setup position, just before throwing a punch.

Identify which punch is about to be thrown. Look at the loading phase — weight shift, hip orientation, lead vs rear hand position, shoulder rotation.

Return strict JSON:
{
  "punch_label": "jab" | "cross" | "hook" | "uppercut" | null,
  "difficulty": "easy" | "medium" | "hard",
  "confidence": 0.0..1.0,
  "notes": "brief justification, 1 sentence"
}

If the image doesn't clearly show a punch setup (e.g. mid-flight, recovery, defense, no boxer visible), return punch_label: null and we'll skip it.

Difficulty levels:
- easy: obvious commitment to one punch, clear loading
- medium: mostly clear but could be misread
- hard: ambiguous setup, requires real fight IQ to predict`;

interface LabelResult {
  punch_label: "jab" | "cross" | "hook" | "uppercut" | null;
  difficulty: "easy" | "medium" | "hard";
  confidence: number;
  notes: string;
}

async function labelOne(
  anthropic: Anthropic,
  imageB64: string
): Promise<LabelResult | null> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: imageB64 },
          },
          {
            type: "text",
            text: "Return only the JSON. No surrounding text.",
          },
        ],
      },
    ],
  });
  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  let jsonStr = text;
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) jsonStr = m[1].trim();
  try {
    const parsed = JSON.parse(jsonStr) as LabelResult;
    return parsed;
  } catch (err) {
    console.error("Failed to parse label JSON:", text.slice(0, 200), err);
    return null;
  }
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY in env");
  const anthropic = new Anthropic({ apiKey });

  // Read existing filenames so we skip duplicates.
  const { data: existing, error: existingErr } = await supabase
    .from("punch_prediction_clips")
    .select("source_filename");
  if (existingErr) throw existingErr;
  const seenFilenames = new Set(
    (existing ?? []).map((r: { source_filename: string }) => r.source_filename)
  );

  // List files in SOURCE_DIR
  let files: string[];
  try {
    files = await fs.readdir(SOURCE_DIR);
  } catch (err) {
    console.error(`Source directory not found: ${SOURCE_DIR}. Create it and drop images.`);
    throw err;
  }

  const candidates = files.filter((f) =>
    /\.(jpg|jpeg|png)$/i.test(f) && !seenFilenames.has(f)
  );
  console.log(`Found ${candidates.length} new file(s) to label out of ${files.length} total.`);

  let labeled = 0;
  let skipped = 0;
  for (const filename of candidates) {
    const buf = await fs.readFile(path.join(SOURCE_DIR, filename));
    const imageB64 = buf.toString("base64");
    console.log(`Labeling: ${filename} ...`);
    const result = await labelOne(anthropic, imageB64);

    if (!result || result.punch_label === null) {
      console.log(`  -> skipped (unclear setup)`);
      skipped++;
      continue;
    }

    const { error } = await supabase.from("punch_prediction_clips").insert({
      source_filename: filename,
      image_b64: imageB64,
      punch_label: result.punch_label,
      difficulty: result.difficulty,
      llm_confidence: result.confidence,
      llm_notes: result.notes,
    });
    if (error) {
      console.error(`  -> insert failed: ${error.message}`);
      continue;
    }
    console.log(`  -> labeled as ${result.punch_label} (${result.difficulty}, conf ${result.confidence})`);
    labeled++;
  }

  console.log(`\nDone. Labeled ${labeled}. Skipped ${skipped}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add `tsx` invocation note**

This script is run via `npx tsx scripts/games/label-punch-clips.ts` (tsx is already a dev-time tool in Node.js TypeScript projects; if it's not installed, it ships via `npx` automatically). No package.json script changes required for v1 — this is a one-time tool.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean (the script is in `scripts/` which may be excluded from tsconfig — if it errors, that's expected and the script still works; if tsconfig includes it, the imports must resolve).

If `scripts/` isn't covered by tsconfig: that's fine, the script doesn't need to be type-checked there.

- [ ] **Step 4: Commit**

```bash
git add scripts/games/label-punch-clips.ts
git commit -m "feat(games): one-time ingestion script for punch prediction clips"
```

---

## Task 10: Leaderboard component

**File:**
- Create: `src/components/games/leaderboard.tsx`

- [ ] **Step 1: Create directory and component**

Create directory: `mkdir -p src/components/games`

Create `src/components/games/leaderboard.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { fetchLeaderboard, type LeaderboardRow } from "@/lib/games-storage";
import type { GameType, ScoreUnit } from "@/lib/games-types";

interface LeaderboardProps {
  gameType: GameType;
  scoreUnit: ScoreUnit;
  title?: string;
}

function formatScore(value: number, unit: ScoreUnit): string {
  if (unit === "ms") return `${Math.round(value)} ms`;
  if (unit === "seconds") return `${value.toFixed(1)} s`;
  return `${Math.round(value)}%`;
}

export function Leaderboard({ gameType, scoreUnit, title = "Leaderboard" }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await fetchLeaderboard(gameType);
      if (cancelled) return;
      if (r.status === "ok") setEntries(r.entries);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [gameType]);

  if (!loaded) return null;

  if (entries.length === 0) {
    return (
      <div className="rounded-xl bg-surface-hover p-4 text-center text-sm text-muted">
        No scores yet — be the first.
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-surface-hover p-4">
      <div className="text-sm font-semibold mb-3">{title}</div>
      <ol className="space-y-1 text-sm">
        {entries.map((e) => (
          <li key={e.rank} className="flex justify-between">
            <span className="text-muted">
              #{e.rank} {e.playerToken}
            </span>
            <span className="font-medium">{formatScore(e.scoreValue, scoreUnit)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + tests**

Run: `npx tsc --noEmit` (clean), `npm test` (250/250).

- [ ] **Step 3: Commit**

```bash
git add src/components/games/leaderboard.tsx
git commit -m "feat(games): reusable anonymous leaderboard component"
```

---

## Task 11: Reaction Tap game component

**File:**
- Create: `src/components/games/reaction-tap.tsx`

- [ ] **Step 1: Implement**

Create `src/components/games/reaction-tap.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { saveScore } from "@/lib/games-storage";
import { Leaderboard } from "./leaderboard";

interface ReactionTapProps {
  userId: string;
  onBack: () => void;
}

const TOTAL_ATTEMPTS = 5;

type GameState =
  | { kind: "idle" }
  | { kind: "waiting"; attemptIdx: number; startedAt: number }
  | { kind: "ready"; attemptIdx: number; greenAt: number }
  | { kind: "false-start"; attemptIdx: number }
  | { kind: "round-done"; attempts: number[] };

export function ReactionTap({ userId, onBack }: ReactionTapProps) {
  const [state, setState] = useState<GameState>({ kind: "idle" });
  const attemptsRef = useRef<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function startAttempt(idx: number) {
    setState({ kind: "waiting", attemptIdx: idx, startedAt: Date.now() });
    const delayMs = 1000 + Math.random() * 4000;
    timerRef.current = setTimeout(() => {
      setState({ kind: "ready", attemptIdx: idx, greenAt: Date.now() });
    }, delayMs);
  }

  function startRound() {
    attemptsRef.current = [];
    startAttempt(0);
  }

  function handleTap() {
    if (state.kind === "waiting") {
      if (timerRef.current) clearTimeout(timerRef.current);
      setState({ kind: "false-start", attemptIdx: state.attemptIdx });
    } else if (state.kind === "ready") {
      const reactionMs = Date.now() - state.greenAt;
      attemptsRef.current = [...attemptsRef.current, reactionMs];
      const nextIdx = state.attemptIdx + 1;
      if (nextIdx >= TOTAL_ATTEMPTS) {
        const avg = attemptsRef.current.reduce((a, b) => a + b, 0) / attemptsRef.current.length;
        setState({ kind: "round-done", attempts: attemptsRef.current });
        // Async-save the round score.
        if (userId && userId !== "anon") {
          void saveScore({
            userId,
            gameType: "reaction_tap",
            scoreValue: Math.round(avg),
            scoreUnit: "ms",
          });
        }
      } else {
        // brief pause before next attempt
        setTimeout(() => startAttempt(nextIdx), 600);
      }
    }
  }

  if (state.kind === "idle") {
    return (
      <div className="px-4 py-6 space-y-4">
        <button onClick={onBack} className="text-xs text-muted">← Back to games</button>
        <h2 className="text-lg font-semibold">Reaction Tap</h2>
        <p className="text-sm text-muted">
          Wait for the screen to turn green, then tap as fast as you can.
          5 attempts, average reported. Tap before green and the round restarts.
        </p>
        <button
          onClick={startRound}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
        >
          Start round
        </button>
        <Leaderboard gameType="reaction_tap" scoreUnit="ms" title="Top 20" />
      </div>
    );
  }

  if (state.kind === "false-start") {
    return (
      <div
        className="min-h-[60vh] bg-yellow-500/20 flex flex-col items-center justify-center p-6 cursor-pointer"
        onClick={() => setState({ kind: "idle" })}
      >
        <div className="text-2xl font-semibold mb-2">False start</div>
        <div className="text-sm text-muted">Tap to restart</div>
      </div>
    );
  }

  if (state.kind === "round-done") {
    const avg = state.attempts.reduce((a, b) => a + b, 0) / state.attempts.length;
    return (
      <div className="px-4 py-6 space-y-4">
        <h2 className="text-lg font-semibold">Round complete</h2>
        <div className="rounded-xl bg-surface-hover p-5">
          <div className="text-3xl font-bold">{Math.round(avg)} ms</div>
          <div className="text-xs text-muted mt-1">
            Attempts: {state.attempts.map((a) => Math.round(a)).join(" · ")} ms
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={startRound}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Play again
          </button>
          <button onClick={onBack} className="rounded-lg bg-surface px-4 py-2 text-sm text-muted">
            Back
          </button>
        </div>
        <Leaderboard gameType="reaction_tap" scoreUnit="ms" title="Top 20" />
      </div>
    );
  }

  // waiting or ready — full-bleed colored area
  const isReady = state.kind === "ready";
  const bg = isReady ? "bg-green-500" : "bg-red-500";
  const label = isReady ? "TAP NOW" : "WAIT";
  return (
    <div
      className={`min-h-[60vh] ${bg} flex items-center justify-center cursor-pointer text-white text-3xl font-bold`}
      onClick={handleTap}
    >
      {label}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + tests**

`npx tsc --noEmit` (clean), `npm test` (250/250).

- [ ] **Step 3: Commit**

```bash
git add src/components/games/reaction-tap.tsx
git commit -m "feat(games): reaction tap game"
```

---

## Task 12: Schulte Table game component

**File:**
- Create: `src/components/games/schulte.tsx`

- [ ] **Step 1: Implement**

Create `src/components/games/schulte.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { saveScore } from "@/lib/games-storage";
import { Leaderboard } from "./leaderboard";

interface SchulteProps {
  userId: string;
  onBack: () => void;
}

const GRID_SIZE = 5;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;

function shuffledCells(): number[] {
  const arr = Array.from({ length: TOTAL_CELLS }, (_, i) => i + 1);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

type State =
  | { kind: "idle" }
  | { kind: "playing"; cells: number[]; nextNumber: number; startedAt: number }
  | { kind: "done"; elapsedSec: number };

export function Schulte({ userId, onBack }: SchulteProps) {
  const [state, setState] = useState<State>({ kind: "idle" });

  function startRound() {
    setState({
      kind: "playing",
      cells: shuffledCells(),
      nextNumber: 1,
      startedAt: Date.now(),
    });
  }

  function handleTap(n: number) {
    if (state.kind !== "playing") return;
    if (n !== state.nextNumber) return; // wrong tap, no penalty
    const next = state.nextNumber + 1;
    if (next > TOTAL_CELLS) {
      const elapsedSec = (Date.now() - state.startedAt) / 1000;
      setState({ kind: "done", elapsedSec });
      if (userId && userId !== "anon") {
        void saveScore({
          userId,
          gameType: "schulte",
          scoreValue: Math.round(elapsedSec * 10) / 10,
          scoreUnit: "seconds",
        });
      }
    } else {
      setState({ ...state, nextNumber: next });
    }
  }

  if (state.kind === "idle") {
    return (
      <div className="px-4 py-6 space-y-4">
        <button onClick={onBack} className="text-xs text-muted">← Back to games</button>
        <h2 className="text-lg font-semibold">Schulte Table</h2>
        <p className="text-sm text-muted">
          Tap the numbers 1 through 25 in order, as fast as possible. Wrong taps are ignored.
        </p>
        <button
          onClick={startRound}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
        >
          Start round
        </button>
        <Leaderboard gameType="schulte" scoreUnit="seconds" title="Top 20" />
      </div>
    );
  }

  if (state.kind === "done") {
    return (
      <div className="px-4 py-6 space-y-4">
        <h2 className="text-lg font-semibold">Round complete</h2>
        <div className="rounded-xl bg-surface-hover p-5">
          <div className="text-3xl font-bold">{state.elapsedSec.toFixed(1)} s</div>
        </div>
        <div className="flex gap-2">
          <button onClick={startRound} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
            Play again
          </button>
          <button onClick={onBack} className="rounded-lg bg-surface px-4 py-2 text-sm text-muted">
            Back
          </button>
        </div>
        <Leaderboard gameType="schulte" scoreUnit="seconds" title="Top 20" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <div className="mb-4 text-sm text-muted">
        Find: <span className="text-foreground font-bold">{state.nextNumber}</span>
      </div>
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))` }}
      >
        {state.cells.map((n) => (
          <button
            key={n}
            onClick={() => handleTap(n)}
            className="aspect-square rounded-md bg-surface-hover hover:bg-surface text-base font-medium"
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + tests**

`npx tsc --noEmit` (clean), `npm test` (250/250).

- [ ] **Step 3: Commit**

```bash
git add src/components/games/schulte.tsx
git commit -m "feat(games): schulte table game"
```

---

## Task 13: Punch Prediction game component

**File:**
- Create: `src/components/games/punch-prediction.tsx`

- [ ] **Step 1: Implement**

Create `src/components/games/punch-prediction.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { saveScore, fetchPunchClips } from "@/lib/games-storage";
import { Leaderboard } from "./leaderboard";
import type { PunchClip, PunchLabel } from "@/lib/games-types";

interface PunchPredictionProps {
  userId: string;
  onBack: () => void;
}

const PROMPTS_PER_ROUND = 10;
const SHOW_MS = 1500;
const ANSWER_TIMEOUT_MS = 3000;

const PUNCHES: PunchLabel[] = ["jab", "cross", "hook", "uppercut"];

interface Answer {
  clipId: string;
  correctLabel: PunchLabel;
  guess: PunchLabel | null;
  responseMs: number; // ms from image-hide to answer (timeout = ANSWER_TIMEOUT_MS)
  points: number;
}

function pointsFor(correct: boolean, responseMs: number): number {
  if (!correct) return 0;
  if (responseMs <= 1000) return 100;
  if (responseMs <= 3000) return 70;
  return 30;
}

type State =
  | { kind: "loading" }
  | { kind: "no-content" }
  | { kind: "idle"; clips: PunchClip[] }
  | { kind: "showing"; clips: PunchClip[]; idx: number; startedAt: number; answers: Answer[] }
  | { kind: "answering"; clips: PunchClip[]; idx: number; hiddenAt: number; answers: Answer[] }
  | { kind: "round-done"; answers: Answer[] };

export function PunchPrediction({ userId, onBack }: PunchPredictionProps) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const seenIdsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await fetchPunchClips(PROMPTS_PER_ROUND, seenIdsRef.current);
      if (cancelled) return;
      if (r.status === "ok" && r.clips.length > 0) {
        setState({ kind: "idle", clips: r.clips });
      } else {
        setState({ kind: "no-content" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function startRound(clips: PunchClip[]) {
    setState({
      kind: "showing",
      clips,
      idx: 0,
      startedAt: Date.now(),
      answers: [],
    });
  }

  // Manage transitions: showing -> answering after SHOW_MS, answering -> next on click or timeout
  useEffect(() => {
    if (state.kind === "showing") {
      const t = setTimeout(() => {
        setState({
          kind: "answering",
          clips: state.clips,
          idx: state.idx,
          hiddenAt: Date.now(),
          answers: state.answers,
        });
      }, SHOW_MS);
      return () => clearTimeout(t);
    }
    if (state.kind === "answering") {
      const remaining = ANSWER_TIMEOUT_MS - (Date.now() - state.hiddenAt);
      if (remaining <= 0) return;
      const t = setTimeout(() => recordAnswer(null), remaining);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind, state.kind === "answering" ? state.idx : 0, state.kind === "showing" ? state.idx : 0]);

  function recordAnswer(guess: PunchLabel | null) {
    if (state.kind !== "answering") return;
    const clip = state.clips[state.idx];
    const responseMs = Math.min(Date.now() - state.hiddenAt, ANSWER_TIMEOUT_MS);
    const correct = guess === clip.punchLabel;
    const answer: Answer = {
      clipId: clip.id,
      correctLabel: clip.punchLabel,
      guess,
      responseMs,
      points: pointsFor(correct, responseMs),
    };
    seenIdsRef.current.push(clip.id);
    const newAnswers = [...state.answers, answer];
    const nextIdx = state.idx + 1;
    if (nextIdx >= state.clips.length) {
      const totalPoints = newAnswers.reduce((sum, a) => sum + a.points, 0);
      const accuracyPct = Math.round((totalPoints / (PROMPTS_PER_ROUND * 100)) * 100);
      setState({ kind: "round-done", answers: newAnswers });
      if (userId && userId !== "anon") {
        void saveScore({
          userId,
          gameType: "punch_prediction",
          scoreValue: accuracyPct,
          scoreUnit: "accuracy_pct",
        });
      }
    } else {
      setState({
        kind: "showing",
        clips: state.clips,
        idx: nextIdx,
        startedAt: Date.now(),
        answers: newAnswers,
      });
    }
  }

  if (state.kind === "loading") {
    return <div className="px-4 py-6 text-sm text-muted">Loading clips…</div>;
  }

  if (state.kind === "no-content") {
    return (
      <div className="px-4 py-6 space-y-3">
        <button onClick={onBack} className="text-xs text-muted">← Back to games</button>
        <h2 className="text-lg font-semibold">Punch Prediction</h2>
        <div className="rounded-xl bg-surface-hover p-5 text-center text-sm text-muted">
          Coming soon — content being labeled.
        </div>
      </div>
    );
  }

  if (state.kind === "idle") {
    return (
      <div className="px-4 py-6 space-y-4">
        <button onClick={onBack} className="text-xs text-muted">← Back to games</button>
        <h2 className="text-lg font-semibold">Punch Prediction</h2>
        <p className="text-sm text-muted">
          Watch a fighter set up. {SHOW_MS}ms after the image hides, choose the punch you think is coming.
          Faster correct answers score more. {state.clips.length} prompts.
        </p>
        <button
          onClick={() => startRound(state.clips)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
        >
          Start round
        </button>
        <Leaderboard gameType="punch_prediction" scoreUnit="accuracy_pct" title="Top 20" />
      </div>
    );
  }

  if (state.kind === "round-done") {
    const totalPoints = state.answers.reduce((sum, a) => sum + a.points, 0);
    const accuracyPct = Math.round((totalPoints / (PROMPTS_PER_ROUND * 100)) * 100);
    const correct = state.answers.filter((a) => a.guess === a.correctLabel).length;
    return (
      <div className="px-4 py-6 space-y-4">
        <h2 className="text-lg font-semibold">Round complete</h2>
        <div className="rounded-xl bg-surface-hover p-5">
          <div className="text-3xl font-bold">{accuracyPct}%</div>
          <div className="text-xs text-muted mt-1">
            {correct}/{state.answers.length} correct
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setState({ kind: "loading" })}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Play again
          </button>
          <button onClick={onBack} className="rounded-lg bg-surface px-4 py-2 text-sm text-muted">
            Back
          </button>
        </div>
        <Leaderboard gameType="punch_prediction" scoreUnit="accuracy_pct" title="Top 20" />
      </div>
    );
  }

  if (state.kind === "showing") {
    const clip = state.clips[state.idx];
    return (
      <div className="px-4 py-6 space-y-3">
        <div className="text-xs text-muted">
          {state.idx + 1} / {state.clips.length}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/jpeg;base64,${clip.imageB64}`}
          alt=""
          className="rounded-xl w-full max-w-md mx-auto"
        />
        <div className="text-center text-xs text-muted">Watch closely…</div>
      </div>
    );
  }

  // answering
  return (
    <div className="px-4 py-6 space-y-4">
      <div className="text-xs text-muted">
        {state.idx + 1} / {state.clips.length} — what punch?
      </div>
      <div className="grid grid-cols-2 gap-2 max-w-md mx-auto">
        {PUNCHES.map((p) => (
          <button
            key={p}
            onClick={() => recordAnswer(p)}
            className="rounded-xl bg-surface-hover hover:bg-surface py-4 text-base font-medium capitalize"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + tests**

`npx tsc --noEmit` (clean), `npm test` (250/250).

- [ ] **Step 3: Commit**

```bash
git add src/components/games/punch-prediction.tsx
git commit -m "feat(games): punch prediction game with timed reveal"
```

---

## Task 14: Hub component

**File:**
- Create: `src/components/games/hub.tsx`

- [ ] **Step 1: Implement**

Create `src/components/games/hub.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Zap, Grid3x3, Crosshair } from "lucide-react";
import { fetchUserBest } from "@/lib/games-storage";
import { ReactionTap } from "./reaction-tap";
import { Schulte } from "./schulte";
import { PunchPrediction } from "./punch-prediction";
import type { GameType, ScoreUnit } from "@/lib/games-types";

interface HubProps {
  userId: string;
}

type ActiveView =
  | { kind: "hub" }
  | { kind: "reaction_tap" }
  | { kind: "schulte" }
  | { kind: "punch_prediction" };

interface GameMeta {
  type: GameType;
  name: string;
  blurb: string;
  icon: typeof Zap;
  unit: ScoreUnit;
}

const GAMES: GameMeta[] = [
  { type: "reaction_tap", name: "Reaction Tap", blurb: "Tap when the screen turns green. Fastest wins.", icon: Zap, unit: "ms" },
  { type: "schulte", name: "Schulte Table", blurb: "Find numbers 1 through 25, in order, as fast as possible.", icon: Grid3x3, unit: "seconds" },
  { type: "punch_prediction", name: "Punch Prediction", blurb: "Watch a fighter set up. Guess the punch.", icon: Crosshair, unit: "accuracy_pct" },
];

function formatScore(value: number, unit: ScoreUnit): string {
  if (unit === "ms") return `${Math.round(value)} ms`;
  if (unit === "seconds") return `${value.toFixed(1)} s`;
  return `${Math.round(value)}%`;
}

export function GamesHub({ userId }: HubProps) {
  const [view, setView] = useState<ActiveView>({ kind: "hub" });
  const [bests, setBests] = useState<Partial<Record<GameType, number | null>>>({});

  useEffect(() => {
    if (view.kind !== "hub") return;
    if (!userId || userId === "anon") return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        GAMES.map(async (g) => ({
          type: g.type,
          best: (await fetchUserBest(userId, g.type)).status === "ok"
            ? (await fetchUserBest(userId, g.type)).status === "ok"
              ? null
              : null
            : null,
        }))
      );
      // The double-await above is wrong; redo cleanly:
      const next: Partial<Record<GameType, number | null>> = {};
      for (const g of GAMES) {
        const r = await fetchUserBest(userId, g.type);
        if (r.status === "ok") next[g.type] = r.score;
      }
      if (!cancelled) setBests(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [view.kind, userId]);

  if (view.kind === "reaction_tap") {
    return <ReactionTap userId={userId} onBack={() => setView({ kind: "hub" })} />;
  }
  if (view.kind === "schulte") {
    return <Schulte userId={userId} onBack={() => setView({ kind: "hub" })} />;
  }
  if (view.kind === "punch_prediction") {
    return <PunchPrediction userId={userId} onBack={() => setView({ kind: "hub" })} />;
  }

  return (
    <div className="px-4 sm:px-6 py-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Games</h2>
        <p className="text-sm text-muted">Quick reflex challenges and pattern-recognition fun.</p>
      </div>
      <div className="space-y-2">
        {GAMES.map((g) => {
          const Icon = g.icon;
          const best = bests[g.type];
          return (
            <button
              key={g.type}
              onClick={() => setView({ kind: g.type })}
              className="w-full text-left rounded-xl bg-surface-hover hover:bg-surface p-4 flex items-center gap-3"
            >
              <Icon size={20} className="text-accent flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{g.name}</div>
                <div className="text-xs text-muted">{g.blurb}</div>
              </div>
              <div className="text-xs text-muted text-right flex-shrink-0">
                {best != null ? `Best ${formatScore(best, g.unit)}` : "—"}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

**Note:** The double-await pattern in the useEffect is wrong on first read — the for-loop below it is the actual implementation. Remove the dead `Promise.all` block; only keep the for-loop. Cleaned version:

```tsx
  useEffect(() => {
    if (view.kind !== "hub") return;
    if (!userId || userId === "anon") return;
    let cancelled = false;
    (async () => {
      const next: Partial<Record<GameType, number | null>> = {};
      for (const g of GAMES) {
        const r = await fetchUserBest(userId, g.type);
        if (r.status === "ok") next[g.type] = r.score;
      }
      if (!cancelled) setBests(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [view.kind, userId]);
```

(Use the cleaned version. The first version with the dead Promise.all is incorrect — this note is the actual instruction.)

- [ ] **Step 2: Type-check + tests**

`npx tsc --noEmit` (clean), `npm test` (250/250).

- [ ] **Step 3: Commit**

```bash
git add src/components/games/hub.tsx
git commit -m "feat(games): hub with three game cards"
```

---

## Task 15: Wire `Games` tab into main nav

**File:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add import**

In `src/app/page.tsx`, add to imports:

```tsx
import { GamesHub } from "@/components/games/hub";
```

Add `Gamepad2` to the existing `lucide-react` import:

```tsx
import { Gamepad2, /* existing icons */ } from "lucide-react";
```

(If the existing import is broken across multiple lines, just add `Gamepad2` to the list.)

- [ ] **Step 2: Add tab to the `tabs` array**

Find the `tabs` array (around line 29). Add a new entry AFTER `style`:

```tsx
const tabs = [
  { id: "technique", label: "Technique", shortLabel: "Technique", icon: MessageSquare, description: "Ask about punching mechanics" },
  { id: "drills", label: "Drills", shortLabel: "Drills", icon: Dumbbell, description: "Exercises & training" },
  { id: "coach", label: "My Coach", shortLabel: "Coach", icon: ClipboardList, description: "Log sessions & track progress" },
  { id: "style", label: "Find Your Style", shortLabel: "Style", icon: User, description: "Discover your fighting style" },
  { id: "games", label: "Games", shortLabel: "Games", icon: Gamepad2, description: "Reflex challenges & fun" },
] as const;
```

- [ ] **Step 3: Add the tab content render**

In the `<main>` block where the existing tabs are rendered (around line 149-200), add a new conditional render block AFTER the `style` tab block:

```tsx
{activeTab === "games" && (
  <ErrorBoundary label="Games">
    <GamesHub userId={userId} />
  </ErrorBoundary>
)}
```

- [ ] **Step 4: Type-check + tests**

`npx tsc --noEmit` (clean), `npm test` (250/250).

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(app): wire Games tab into main nav"
```

---

## Task 16: End-to-end manual QA

**Goal:** Validate all 3 games end-to-end with real DB writes + leaderboards rendering.

- [ ] **Step 1: Migrations applied**

Verify `game_scores` and `punch_prediction_clips` tables exist in production Supabase via `mcp__claude_ai_Supabase__list_tables`.

- [ ] **Step 2: Hub renders**

1. Open the app, click the new **Games** tab.
2. Verify hub renders with 3 cards: Reaction Tap, Schulte Table, Punch Prediction.
3. Each shows "—" for best score (fresh user).

- [ ] **Step 3: Reaction Tap end-to-end**

1. Click Reaction Tap → "Start round."
2. Wait for green, tap.
3. Repeat 5 times. False-start at least once → verify the round restarts.
4. Verify result screen shows average ms.
5. Reload Games tab → verify the card now shows "Best X ms."
6. Inspect `game_scores` table → row exists with `game_type='reaction_tap'`, `score_unit='ms'`.
7. Verify Leaderboard at bottom shows your score (player_xxxx token).

- [ ] **Step 4: Schulte end-to-end**

1. Click Schulte → "Start round."
2. Tap 1, 2, ..., 25 (use the highlighted next-number indicator).
3. Verify result screen shows elapsed seconds.
4. Inspect `game_scores` → row with `game_type='schulte'`, `score_unit='seconds'`.

- [ ] **Step 5: Punch Prediction end-to-end (requires content)**

**If the catalog is empty:**
1. Verify the Punch Prediction card shows "Coming soon — content being labeled."

**Once content is ingested:**
1. Drop ~30 boxing clip stills in `scripts/games/source-clips/`.
2. Run: `npx tsx scripts/games/label-punch-clips.ts`.
3. Verify the script labels each, prints summary.
4. Inspect `punch_prediction_clips` → ~30 rows with valid `punch_label`.
5. Reload the app, navigate to Games → Punch Prediction.
6. Click Start round. 10 prompts cycle: image shows for 1.5s, then 4 buttons appear.
7. Answer all 10. Some correct, some wrong.
8. Verify final accuracy% screen.
9. Inspect `game_scores` → row with `game_type='punch_prediction'`, `score_unit='accuracy_pct'`.

- [ ] **Step 6: Leaderboard regression**

Verify each game's leaderboard renders top-20 with anonymous tokens. If only one user (you), only one entry shows.

- [ ] **Step 7: Mobile/touch behavior**

Open on a phone or with DevTools mobile emulator. Verify:
- Reaction Tap: full-bleed red/green works on tap.
- Schulte: 5×5 grid is tappable, cells aren't too small.
- Punch Prediction: image renders, 4 answer buttons are tappable.

- [ ] **Step 8: Anon user (style quiz not done)**

In a fresh browser profile, navigate to Games before completing the style quiz. Verify:
- Hub still loads.
- Games are playable.
- Score saves silently fail (no error to user).
- Leaderboard still renders (others' scores).

- [ ] **Step 9: Document outcomes**

Append a `## Verification` section to this plan file noting the date, scenarios tested, and any deviations.

---

## Self-Review (before executing)

### Spec coverage
- Spec §1 schemas → Tasks 1, 2 ✅
- Spec §2 game mechanics → Tasks 11, 12, 13 ✅
- Spec §3 API routes → Tasks 7, 8 ✅
- Spec §4 ingestion script → Task 9 ✅
- Spec §5 UI structure → Tasks 14, 15 ✅
- Spec §6 persistence model → Tasks 5, 7 ✅
- Spec §7 FTC framing → Tasks 11-15 (copy throughout) ✅
- Spec §8 streak (none new) → no task needed ✅
- Spec §9 cold-start → Task 13 (no-content state), Task 14 (anon user) ✅
- Spec §10 out of scope → no tasks ✅

### Placeholder scan
No "TBD"/"TODO"/"add appropriate error handling". Every code block is complete. **Note in Task 14:** the implementation has a duplicated/dead-code Promise.all block which I clarified should be DROPPED — the implementer should use only the `for...of` cleaned version.

### Type consistency
- `GameType`, `ScoreUnit`, `PunchLabel`, `Difficulty`, `GameScore`, `PunchClip`, `LeaderboardEntry` — all defined in Task 3, used consistently in Tasks 4–15.
- `saveScore`, `fetchUserBest`, `fetchLeaderboard`, `fetchPunchClips`, `rowToScore`, `rowToClip` — defined in Task 5, used consistently downstream.
- `anonTokenForUserId` — defined in Task 4, used in Task 7's GET handler.
- `gameScoreSubmitSchema` — defined in Task 6, used in Task 7.

---

## Out of scope (re-confirmed)

- F1 lights game (Mark dropped from initial proposal)
- Whack-a-mole game (Mark dropped from initial proposal)
- Friends / social leaderboard
- Levels / progression
- Daily attempt limits
- Live multiplayer
- Plan 3d (Agentic coach) — separate plan

---

## Notes for the executing engineer

- **Vitest, npm.** Run `npm test` (full) or `npm test -- <path>` (single file).
- **createServerClient from `@/lib/supabase`** — the server-side Supabase client (handles service-role auth). Used by API routes.
- **createBrowserClient from `@/lib/supabase-browser`** — the anon-key client. NOT used by these games' API routes (they use server). Storage helpers in Task 5 use `fetch()` to the API, not the browser client directly.
- **anonymous localStorage UUID identity model** — score saves require a real userId; `userId === "anon"` is silently rejected.
- **Lucide icons:** `Zap` (reaction tap), `Grid3x3` (schulte), `Crosshair` (punch prediction), `Gamepad2` (the games tab itself). All available.
- **The ingestion script (Task 9) is run from your local machine, NOT from the deployed app.** Requires `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` in `.env.local`. The image directory `scripts/games/source-clips/` is gitignored — drop your images there.
- **`Math.random()` is fine for shuffling** in the games (cells, clip pool). Crypto-grade randomness isn't needed; users aren't trying to predict cell positions.
- **Don't `--amend`** if a pre-commit hook fails. Per project CLAUDE.md, hook failure means commit didn't happen — fix and create a new commit.
