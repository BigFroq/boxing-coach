# Compounding Clip Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform clip review from a one-shot tool into a compounding personal-progress library — every analysis becomes a dated row with phase scores, surfaces in a timeline + trend graph + diff card, and informs the coach's chat context.

**Architecture:** Two layers. **Data layer** = `clip_logs` table + AI prompt extension (numeric phase scores) + auto-persist on successful analysis. **UI layer** = timeline list + trend graph + "vs last clip" diff card. **Plus** chat-context integration that mirrors the existing `styleProfile` pattern (Zod schema field → `formatClipHistory()` → appended to system prompt). All client-aggregated, no new server-side RPC.

**Tech Stack:** Next.js (App Router) · React · Supabase (anon-key browser client) · Anthropic SDK (Sonnet 4.6) · Recharts (new dep, ~50KB gzip) · Zod · Vitest · PostHog

**Spec:** [docs/superpowers/specs/2026-05-07-compounding-clip-log-design.md](../specs/2026-05-07-compounding-clip-log-design.md)

**Phase names (from existing codebase, not the v1 spec draft):** `Loading` · `Hip Explosion` · `Energy Transfer` · `Follow Through`. Score column suffixes use snake_case of these.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/014_clip_logs.sql` | Create | Schema + RLS for `clip_logs` |
| `src/lib/clip-log-types.ts` | Create | Shared TS types (`ClipLog`, `ClipLogScores`, `ClipHistoryContext`) |
| `src/lib/clip-log-aggregation.ts` | Create | Pure aggregation: trend deltas, score averages, history block for coach |
| `src/lib/clip-log-aggregation.test.ts` | Create | Vitest unit tests for aggregation |
| `src/lib/clip-log-storage.ts` | Create | Supabase read/write helpers + pure `rowToClipLog` mapper |
| `src/lib/clip-log-storage.test.ts` | Create | Tests for the pure mapper |
| `src/lib/validation.ts` | Modify | Extend `chatRequestSchema` with optional `clipHistory`; export `clipHistorySchema` |
| `src/app/api/coach/clip-review/route.ts` | Modify | Update `ANALYSIS_PROMPT` to include scoring rubric and ask for `phases[].score` |
| `src/app/api/chat/route.ts` | Modify | Accept `clipHistory`, format via new `formatClipHistory()`, append to system prompt |
| `src/components/coach-clip-review.tsx` | Modify | Capture thumbnail; fetch prev clip; auto-persist on success; mount diff card and timeline |
| `src/components/clip-log/timeline.tsx` | Create | Timeline list component (date · thumbnail · summary · score chips) |
| `src/components/clip-log/diff-card.tsx` | Create | "vs your last clip" delta card |
| `src/components/clip-log/trend-graph.tsx` | Create | Recharts line chart, 5 lines, 3-clip rolling avg |
| `src/components/coach-progress.tsx` | Modify | Mount trend graph card |
| `src/app/page.tsx` | Modify | Fetch clip history once; pass `extraContext={{ clipHistory }}` to technique + drills `ChatTab` instances |
| `package.json` | Modify | Add `recharts` |

**Decomposition principles:**
- `clip-log-aggregation.ts` is pure (no DB, no Date.now, no globals). Tests hit it directly.
- `clip-log-storage.ts` exports an I/O surface and a pure `rowToClipLog` mapper. Tests cover the mapper; manual QA covers the round-trip.
- UI components in `src/components/clip-log/` receive aggregated data via props — no fetches inside leaves except for the storage helpers they directly compose.
- `coach-clip-review.tsx` is the orchestration layer that ties upload → analysis → fetch-prev → diff render → timeline refresh → async-persist.
- Chat-side integration (`page.tsx` + `chat-tab.tsx` flow) mirrors the existing `styleProfile` pattern.

---

## Pre-flight

Working directory: `/Users/mark/boxing-coach`
Branch: `feat/compounding-clip-log` (already created)

**Note:** The spec doc at `docs/superpowers/specs/2026-05-07-compounding-clip-log-design.md` has uncommitted phase-name corrections (Force Generation → Hip Explosion, Delivery → Energy Transfer, Recovery → Follow Through) made between commits `8afc51e` and Task 1. The first task's commit can include these corrections, or commit them in a separate `chore(spec)` commit before Task 1.

---

## Task 1: Migration 014 — `clip_logs` table

**Files:**
- Create: `supabase/migrations/014_clip_logs.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/014_clip_logs.sql`:

```sql
-- 014_clip_logs.sql
-- Per-clip persistence for the compounding clip log. Each successful clip
-- analysis becomes a row here. Anonymous-userId model (matches user_engagement,
-- user_profiles, training_sessions). Permissive RLS — same pattern as the
-- post-migration-012 convention.

CREATE TABLE IF NOT EXISTS clip_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  filename text,
  duration_seconds numeric(5,2),

  summary text NOT NULL,
  phases jsonb NOT NULL,
  strengths text[] NOT NULL DEFAULT '{}',
  improvements text[] NOT NULL DEFAULT '{}',

  score_loading int CHECK (score_loading BETWEEN 1 AND 10),
  score_hip_explosion int CHECK (score_hip_explosion BETWEEN 1 AND 10),
  score_energy_transfer int CHECK (score_energy_transfer BETWEEN 1 AND 10),
  score_follow_through int CHECK (score_follow_through BETWEEN 1 AND 10),
  score_overall numeric(3,1),

  thumbnail_b64 text,

  model_version text NOT NULL DEFAULT 'sonnet-4-6',
  prompt_version text NOT NULL DEFAULT 'v1'
);

CREATE INDEX IF NOT EXISTS idx_clip_logs_user_created
  ON clip_logs (user_id, created_at DESC);

ALTER TABLE clip_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on clip_logs" ON clip_logs;
CREATE POLICY "Allow all on clip_logs"
  ON clip_logs FOR ALL USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Apply to production Supabase via MCP**

The MCP tool `mcp__claude_ai_Supabase__apply_migration` can apply this. Use:
- `project_id`: `vrtuyqtbzacilcjlqzkt` (BigFroq's Project, the boxing-coach DB)
- `name`: `clip_logs`
- `query`: the SQL above (everything between the outer triple backticks of Step 1)

If the executing engineer doesn't have MCP access, leave this for the human pipeline and skip to Step 3.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/014_clip_logs.sql docs/superpowers/specs/2026-05-07-compounding-clip-log-design.md
git commit -m "feat(db): add clip_logs table for compounding clip log"
```

(The `docs/superpowers/specs/...` co-add picks up the uncommitted phase-name corrections from pre-flight.)

---

## Task 2: Add Recharts + shared types

**Files:**
- Modify: `package.json` (via pnpm)
- Create: `src/lib/clip-log-types.ts`

- [ ] **Step 1: Add the recharts dependency**

Run: `pnpm add recharts`

This adds the dep and updates `package.json` and the lockfile.

- [ ] **Step 2: Create the shared types file**

Create `src/lib/clip-log-types.ts`:

```ts
// Shared types for the compounding clip log. Used by storage, aggregation,
// the API route's response shape, and all UI components. Phase names must
// match the existing analysis prompt: Loading / Hip Explosion / Energy
// Transfer / Follow Through.

export type PhaseName = "Loading" | "Hip Explosion" | "Energy Transfer" | "Follow Through";

export interface ClipPhase {
  phase: PhaseName | string;        // string for forward-compat if prompt evolves
  feedback: string;
  score?: number;                   // 1-10 integer; optional for backward compat with v1 rows
}

export interface ClipAnalysis {
  summary: string;
  phases: ClipPhase[];
  strengths: string[];
  improvements: string[];
}

export interface ClipScores {
  loading: number | null;
  hipExplosion: number | null;
  energyTransfer: number | null;
  followThrough: number | null;
  overall: number | null;
}

export interface ClipLog {
  id: string;
  userId: string;
  createdAt: string;                // ISO timestamp
  filename: string | null;
  durationSeconds: number | null;
  analysis: ClipAnalysis;
  scores: ClipScores;
  thumbnailB64: string | null;
  modelVersion: string;
  promptVersion: string;
}

export interface ClipHistoryContext {
  windowDays: number;
  totalClips: number;
  trend?: {
    last5Avg: ClipScores;
    prior5Avg: ClipScores;
  };
  mostRecent?: {
    daysAgo: number;
    summary: string;
  };
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/clip-log-types.ts
git commit -m "feat(clip-log): add recharts dep and shared types"
```

---

## Task 3: Extend clip-review prompt to return scores

**Files:**
- Modify: `src/app/api/coach/clip-review/route.ts`

**Approach:** Update the system prompt to add a scoring rubric and request `phases[].score`. Keep response shape backward-compatible — existing consumers ignore unknown fields.

- [ ] **Step 1: Replace the `ANALYSIS_PROMPT` constant**

In `src/app/api/coach/clip-review/route.ts`, replace the entire `ANALYSIS_PROMPT` constant (lines 11–58) with:

```ts
const ANALYSIS_PROMPT = `You are a boxing technique analyst trained on Dr. Alex Wiant's Power Punching Blueprint methodology.

You are analyzing a DENSE sequence of frames (5 frames per second) from a short boxing clip. Because these frames are closely spaced, you CAN see the progression of movement — use this to analyze timing and sequence.

## What to Analyze

### Phase 1: Loading
- Is elastic potential energy being stored via weight shift?
- Is the weight transferring to the appropriate leg?
- Are cross-body kinetic chains being pre-stretched?

### Phase 2: Hip Explosion
- Does the hip rotate BEFORE the arm? (Look at frame sequence — hip should lead)
- Is the hip opening (jab/hook/lead uppercut) or closing (cross/rear uppercut)?
- Is there visible separation between hip and arm timing?

### Phase 3: Energy Transfer
- Is the core rotating after the hips?
- Does the punch follow a slight arc (throw) or go straight (push)?
- Does the arm appear loose until near impact?

### Phase 4: Follow Through
- Is there follow-through past the impact point?
- Does weight transfer through the target?
- Is there a quick reset to neutral stance?

### Common Errors to Check
- Push punching (linear movement instead of rotational)
- Arm in lockstep with hips (no acceleration — hip should fire first)
- Guard dropping during the punch
- Stance too narrow or too wide
- No weight shift in loading phase

## Scoring rubric (per phase)

For each phase, return an integer score 1–10 calibrated against textbook technique:
- 1–3 — needs significant work (basic alignment off, sequence broken)
- 4–6 — developing (form recognizable, key flaws present)
- 7–8 — competent (textbook execution, minor refinements possible)
- 9–10 — elite (fight-ready precision)

Score against the platonic ideal, NOT against the user's previous attempts. Be honest, not generous.

## Response Format
Return a JSON object:
{
  "summary": "2-3 sentence overall assessment",
  "phases": [
    { "phase": "Loading", "feedback": "what you observe", "score": 7 },
    { "phase": "Hip Explosion", "feedback": "what you observe", "score": 6 },
    { "phase": "Energy Transfer", "feedback": "what you observe", "score": 7 },
    { "phase": "Follow Through", "feedback": "what you observe", "score": 5 }
  ],
  "strengths": ["specific strength observed"],
  "improvements": ["specific improvement needed"]
}

Be specific about what you SEE in the frames. Reference the frame sequence when relevant (e.g., "In the early frames... by mid-sequence..."). Be encouraging but honest. Score honestly — inflated scores rob the user of useful feedback.`;
```

- [ ] **Step 2: Run existing tests to verify no regression**

Run: `pnpm test`
Expected: 222/222 pass (no test currently asserts on prompt text; the change is additive).

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/coach/clip-review/route.ts
git commit -m "feat(clip-review): extend prompt with phase scoring rubric"
```

---

## Task 4: Pure aggregation — `clip-log-aggregation.ts`

**Files:**
- Create: `src/lib/clip-log-aggregation.ts`
- Test: `src/lib/clip-log-aggregation.test.ts`

**Pure functions only.** No Date.now, no DB. All inputs explicit (clips array + today date passed in). Two responsibilities: (1) aggregate a `ClipHistoryContext` for the coach chat, (2) compute rolling-average trend points for the chart. Both used by other tasks.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/clip-log-aggregation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  aggregateClipHistory,
  computeRollingAvgTrend,
} from "./clip-log-aggregation";
import type { ClipLog, ClipScores } from "./clip-log-types";

const today = new Date("2026-05-07T10:00:00Z");

function makeClip(daysAgo: number, scores: Partial<ClipScores>, summary = "test"): ClipLog {
  const created = new Date(today);
  created.setUTCDate(created.getUTCDate() - daysAgo);
  return {
    id: `clip-${daysAgo}`,
    userId: "u1",
    createdAt: created.toISOString(),
    filename: null,
    durationSeconds: null,
    analysis: { summary, phases: [], strengths: [], improvements: [] },
    scores: {
      loading: scores.loading ?? null,
      hipExplosion: scores.hipExplosion ?? null,
      energyTransfer: scores.energyTransfer ?? null,
      followThrough: scores.followThrough ?? null,
      overall: scores.overall ?? null,
    },
    thumbnailB64: null,
    modelVersion: "sonnet-4-6",
    promptVersion: "v1",
  };
}

describe("aggregateClipHistory", () => {
  it("returns empty context when no clips", () => {
    const ctx = aggregateClipHistory([], today);
    expect(ctx).toEqual({ windowDays: 14, totalClips: 0 });
  });

  it("includes mostRecent when there is at least one clip", () => {
    const clips = [makeClip(2, { overall: 7 }, "good jab")];
    const ctx = aggregateClipHistory(clips, today);
    expect(ctx.totalClips).toBe(1);
    expect(ctx.mostRecent).toEqual({ daysAgo: 2, summary: "good jab" });
    expect(ctx.trend).toBeUndefined();
  });

  it("omits trend until there are at least 6 clips (need 5+5 split, but we ship at 6)", () => {
    const clips = Array.from({ length: 5 }, (_, i) => makeClip(i, { overall: 5 + i }));
    const ctx = aggregateClipHistory(clips, today);
    expect(ctx.totalClips).toBe(5);
    expect(ctx.trend).toBeUndefined();
  });

  it("computes trend from last 5 vs prior 5 when 10+ clips exist", () => {
    const clips: ClipLog[] = [];
    // last 5 (days 0-4): all 8s
    for (let i = 0; i < 5; i++) {
      clips.push(makeClip(i, { loading: 8, hipExplosion: 8, energyTransfer: 8, followThrough: 8, overall: 8 }));
    }
    // prior 5 (days 5-9): all 6s
    for (let i = 5; i < 10; i++) {
      clips.push(makeClip(i, { loading: 6, hipExplosion: 6, energyTransfer: 6, followThrough: 6, overall: 6 }));
    }
    const ctx = aggregateClipHistory(clips, today);
    expect(ctx.totalClips).toBe(10);
    expect(ctx.trend?.last5Avg.loading).toBe(8);
    expect(ctx.trend?.prior5Avg.loading).toBe(6);
    expect(ctx.trend?.last5Avg.overall).toBe(8);
    expect(ctx.trend?.prior5Avg.overall).toBe(6);
  });

  it("filters to last 14 days for the window", () => {
    const clips = [
      makeClip(2, { overall: 8 }),
      makeClip(20, { overall: 5 }), // outside 14-day window
    ];
    const ctx = aggregateClipHistory(clips, today);
    expect(ctx.totalClips).toBe(1); // only the 2-day-old clip counts
  });

  it("handles missing scores gracefully (null in averages)", () => {
    const clips: ClipLog[] = [];
    for (let i = 0; i < 10; i++) {
      // Half have null overall scores
      const overall = i % 2 === 0 ? 7 : null;
      clips.push(makeClip(i, { loading: 5, overall: overall ?? undefined }));
    }
    const ctx = aggregateClipHistory(clips, today);
    expect(ctx.totalClips).toBe(10);
    // last 5 (days 0-4): even indices (0, 2, 4) have score, odd (1, 3) are null
    // avg of non-null = (7 + 7 + 7) / 3 = 7
    expect(ctx.trend?.last5Avg.overall).toBe(7);
  });
});

describe("computeRollingAvgTrend", () => {
  it("returns empty array when fewer than 3 clips", () => {
    const clips = [
      makeClip(0, { overall: 7 }),
      makeClip(1, { overall: 8 }),
    ];
    const points = computeRollingAvgTrend(clips, 3);
    expect(points).toEqual([]);
  });

  it("returns one point per 3-clip window with averaged scores", () => {
    const clips = [
      makeClip(0, { loading: 9, overall: 9 }),
      makeClip(1, { loading: 8, overall: 8 }),
      makeClip(2, { loading: 7, overall: 7 }),
      makeClip(3, { loading: 6, overall: 6 }),
    ];
    const points = computeRollingAvgTrend(clips, 3);
    // points[0] = avg of clips[0..2]: loading (9+8+7)/3 = 8
    // points[1] = avg of clips[1..3]: loading (8+7+6)/3 = 7
    expect(points).toHaveLength(2);
    expect(points[0].loading).toBeCloseTo(8);
    expect(points[1].loading).toBeCloseTo(7);
  });

  it("uses the latest createdAt of the window as the point date", () => {
    const c0 = makeClip(2, { overall: 7 });
    const c1 = makeClip(1, { overall: 7 });
    const c2 = makeClip(0, { overall: 7 });
    const points = computeRollingAvgTrend([c0, c1, c2], 3);
    expect(points[0].createdAt).toBe(c2.createdAt);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/clip-log-aggregation.test.ts`
Expected: FAIL with "Cannot find module './clip-log-aggregation'".

- [ ] **Step 3: Implement `clip-log-aggregation.ts`**

Create `src/lib/clip-log-aggregation.ts`:

```ts
// Pure aggregation for the compounding clip log. No DB, no Date.now, no
// globals. Two consumers:
//   1) aggregateClipHistory — produces a ClipHistoryContext for the coach
//      chat (system-prompt fragment).
//   2) computeRollingAvgTrend — produces 3-clip rolling-average points for
//      the trend chart, smoothing model-variance noise.

import type { ClipLog, ClipScores, ClipHistoryContext } from "./clip-log-types";

const WINDOW_DAYS = 14;
const TREND_HALF = 5;          // last 5 vs prior 5
const MIN_FOR_TREND = TREND_HALF * 2;

function utcDayIndex(d: Date): number {
  const ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor(ms / 86_400_000);
}

function avg(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  // Round to 1 decimal place for stability.
  return Math.round((sum / nums.length) * 10) / 10;
}

function avgScores(clips: ClipLog[]): ClipScores {
  return {
    loading: avg(clips.map((c) => c.scores.loading)),
    hipExplosion: avg(clips.map((c) => c.scores.hipExplosion)),
    energyTransfer: avg(clips.map((c) => c.scores.energyTransfer)),
    followThrough: avg(clips.map((c) => c.scores.followThrough)),
    overall: avg(clips.map((c) => c.scores.overall)),
  };
}

export function aggregateClipHistory(
  allClips: ClipLog[],
  today: Date
): ClipHistoryContext {
  // Filter to last 14 days and sort newest-first.
  const todayIdx = utcDayIndex(today);
  const inWindow = allClips
    .filter((c) => todayIdx - utcDayIndex(new Date(c.createdAt)) <= WINDOW_DAYS)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const ctx: ClipHistoryContext = {
    windowDays: WINDOW_DAYS,
    totalClips: inWindow.length,
  };

  if (inWindow.length > 0) {
    const first = inWindow[0];
    const daysAgo = todayIdx - utcDayIndex(new Date(first.createdAt));
    ctx.mostRecent = { daysAgo, summary: first.analysis.summary };
  }

  if (inWindow.length >= MIN_FOR_TREND) {
    ctx.trend = {
      last5Avg: avgScores(inWindow.slice(0, TREND_HALF)),
      prior5Avg: avgScores(inWindow.slice(TREND_HALF, TREND_HALF * 2)),
    };
  }

  return ctx;
}

export interface TrendPoint {
  createdAt: string;
  loading: number | null;
  hipExplosion: number | null;
  energyTransfer: number | null;
  followThrough: number | null;
  overall: number | null;
}

export function computeRollingAvgTrend(
  allClips: ClipLog[],
  windowSize: number
): TrendPoint[] {
  if (allClips.length < windowSize) return [];

  // Sort oldest-first so the chart x-axis is left-to-right chronological.
  const sorted = [...allClips].sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : 1
  );

  const out: TrendPoint[] = [];
  for (let i = windowSize - 1; i < sorted.length; i++) {
    const window = sorted.slice(i - windowSize + 1, i + 1);
    const a = avgScores(window);
    out.push({
      createdAt: window[window.length - 1].createdAt,
      loading: a.loading,
      hipExplosion: a.hipExplosion,
      energyTransfer: a.energyTransfer,
      followThrough: a.followThrough,
      overall: a.overall,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test -- src/lib/clip-log-aggregation.test.ts`
Expected: all 8 cases PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/clip-log-aggregation.ts src/lib/clip-log-aggregation.test.ts
git commit -m "feat(clip-log): pure aggregation for history + trend"
```

---

## Task 5: Storage helpers — `clip-log-storage.ts`

**Files:**
- Create: `src/lib/clip-log-storage.ts`
- Test: `src/lib/clip-log-storage.test.ts`

**Layout:** A pure `rowToClipLog` mapper (testable, what the test file targets) plus three I/O helpers (`saveClipLog`, `fetchRecentClips`, `fetchPreviousClipBefore`). I/O helpers return tagged results; never throw.

- [ ] **Step 1: Write the failing test for the mapper**

Create `src/lib/clip-log-storage.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { rowToClipLog } from "./clip-log-storage";

describe("rowToClipLog", () => {
  it("maps a fully-populated DB row to a ClipLog", () => {
    const row = {
      id: "abc",
      user_id: "u1",
      created_at: "2026-05-07T10:00:00Z",
      filename: "jab.mp4",
      duration_seconds: 12.5,
      summary: "good jab",
      phases: [{ phase: "Loading", feedback: "ok", score: 7 }],
      strengths: ["s1"],
      improvements: ["i1"],
      score_loading: 7,
      score_hip_explosion: 6,
      score_energy_transfer: 8,
      score_follow_through: 5,
      score_overall: 6.5,
      thumbnail_b64: "abc==",
      model_version: "sonnet-4-6",
      prompt_version: "v1",
    };
    const c = rowToClipLog(row);
    expect(c.id).toBe("abc");
    expect(c.userId).toBe("u1");
    expect(c.createdAt).toBe("2026-05-07T10:00:00Z");
    expect(c.filename).toBe("jab.mp4");
    expect(c.durationSeconds).toBe(12.5);
    expect(c.analysis.summary).toBe("good jab");
    expect(c.analysis.phases).toEqual([{ phase: "Loading", feedback: "ok", score: 7 }]);
    expect(c.analysis.strengths).toEqual(["s1"]);
    expect(c.analysis.improvements).toEqual(["i1"]);
    expect(c.scores).toEqual({
      loading: 7,
      hipExplosion: 6,
      energyTransfer: 8,
      followThrough: 5,
      overall: 6.5,
    });
    expect(c.thumbnailB64).toBe("abc==");
    expect(c.modelVersion).toBe("sonnet-4-6");
    expect(c.promptVersion).toBe("v1");
  });

  it("handles null/missing optional columns", () => {
    const row = {
      id: "abc",
      user_id: "u1",
      created_at: "2026-05-07T10:00:00Z",
      filename: null,
      duration_seconds: null,
      summary: "x",
      phases: [],
      strengths: [],
      improvements: [],
      score_loading: null,
      score_hip_explosion: null,
      score_energy_transfer: null,
      score_follow_through: null,
      score_overall: null,
      thumbnail_b64: null,
      model_version: "sonnet-4-6",
      prompt_version: "v1",
    };
    const c = rowToClipLog(row);
    expect(c.filename).toBeNull();
    expect(c.durationSeconds).toBeNull();
    expect(c.scores.loading).toBeNull();
    expect(c.scores.overall).toBeNull();
    expect(c.thumbnailB64).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/clip-log-storage.test.ts`
Expected: FAIL with "Cannot find module './clip-log-storage'".

- [ ] **Step 3: Implement `clip-log-storage.ts`**

Create `src/lib/clip-log-storage.ts`:

```ts
// Read/write helpers for the clip_logs table. Anon-key Supabase client (the
// post-migration-012 permissive-RLS pattern). All I/O paths return tagged
// results, never throw. The pure rowToClipLog mapper is exported so it can
// be unit-tested without a Supabase stub.

import { createBrowserClient } from "./supabase-browser";
import { track } from "./analytics";
import type {
  ClipLog,
  ClipAnalysis,
  ClipScores,
} from "./clip-log-types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;

export function rowToClipLog(row: AnyRow): ClipLog {
  const analysis: ClipAnalysis = {
    summary: row.summary,
    phases: row.phases ?? [],
    strengths: row.strengths ?? [],
    improvements: row.improvements ?? [],
  };
  const scores: ClipScores = {
    loading: row.score_loading ?? null,
    hipExplosion: row.score_hip_explosion ?? null,
    energyTransfer: row.score_energy_transfer ?? null,
    followThrough: row.score_follow_through ?? null,
    overall: row.score_overall ?? null,
  };
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    filename: row.filename ?? null,
    durationSeconds: row.duration_seconds ?? null,
    analysis,
    scores,
    thumbnailB64: row.thumbnail_b64 ?? null,
    modelVersion: row.model_version,
    promptVersion: row.prompt_version,
  };
}

export interface SaveClipLogInput {
  userId: string;
  filename: string | null;
  durationSeconds: number | null;
  analysis: ClipAnalysis;
  thumbnailB64: string | null;
}

export type SaveResult =
  | { status: "saved"; clip: ClipLog }
  | { status: "error"; reason: string };

function extractScoresFromAnalysis(analysis: ClipAnalysis): {
  loading: number | null;
  hipExplosion: number | null;
  energyTransfer: number | null;
  followThrough: number | null;
  overall: number | null;
} {
  const byPhase = new Map<string, number>();
  for (const p of analysis.phases) {
    if (typeof p.score === "number" && p.phase) {
      byPhase.set(p.phase, p.score);
    }
  }
  const loading = byPhase.get("Loading") ?? null;
  const hipExplosion = byPhase.get("Hip Explosion") ?? null;
  const energyTransfer = byPhase.get("Energy Transfer") ?? null;
  const followThrough = byPhase.get("Follow Through") ?? null;
  const present = [loading, hipExplosion, energyTransfer, followThrough].filter(
    (s): s is number => typeof s === "number"
  );
  const overall = present.length > 0
    ? Math.round((present.reduce((a, b) => a + b, 0) / present.length) * 10) / 10
    : null;
  return { loading, hipExplosion, energyTransfer, followThrough, overall };
}

export async function saveClipLog(input: SaveClipLogInput): Promise<SaveResult> {
  if (typeof window === "undefined") {
    return { status: "error", reason: "server-side" };
  }
  if (!input.userId || input.userId === "anon") {
    return { status: "error", reason: "no-userid" };
  }
  let supabase: ReturnType<typeof createBrowserClient>;
  try {
    supabase = createBrowserClient();
  } catch (err) {
    console.error("[clip-log-storage] supabase init failed:", err);
    track("clip_log_persist_failed", { stage: "client-init" });
    return { status: "error", reason: "supabase-init-failed" };
  }

  const scores = extractScoresFromAnalysis(input.analysis);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("clip_logs") as any)
      .insert({
        user_id: input.userId,
        filename: input.filename,
        duration_seconds: input.durationSeconds,
        summary: input.analysis.summary,
        phases: input.analysis.phases,
        strengths: input.analysis.strengths,
        improvements: input.analysis.improvements,
        score_loading: scores.loading,
        score_hip_explosion: scores.hipExplosion,
        score_energy_transfer: scores.energyTransfer,
        score_follow_through: scores.followThrough,
        score_overall: scores.overall,
        thumbnail_b64: input.thumbnailB64,
      })
      .select("*")
      .single();
    if (error || !data) {
      console.error("[clip-log-storage] insert failed:", error);
      track("clip_log_persist_failed", { stage: "db-insert", code: error?.code });
      return { status: "error", reason: "db-insert-failed" };
    }
    track("clip_log_persisted", { hasScores: scores.overall !== null });
    return { status: "saved", clip: rowToClipLog(data) };
  } catch (err) {
    console.error("[clip-log-storage] insert threw:", err);
    track("clip_log_persist_failed", { stage: "db-insert-throw" });
    return { status: "error", reason: "db-insert-throw" };
  }
}

export type FetchResult =
  | { status: "ok"; clips: ClipLog[] }
  | { status: "error"; reason: string };

export async function fetchRecentClips(
  userId: string,
  limit = 30
): Promise<FetchResult> {
  if (typeof window === "undefined") {
    return { status: "error", reason: "server-side" };
  }
  if (!userId || userId === "anon") {
    return { status: "ok", clips: [] };
  }
  try {
    const supabase = createBrowserClient();
    const { data, error } = await supabase
      .from("clip_logs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("[clip-log-storage] fetchRecent failed:", error);
      track("clip_log_fetch_failed", { stage: "db-select", code: error.code });
      return { status: "error", reason: "db-select-failed" };
    }
    return { status: "ok", clips: (data ?? []).map(rowToClipLog) };
  } catch (err) {
    console.error("[clip-log-storage] fetchRecent threw:", err);
    track("clip_log_fetch_failed", { stage: "db-select-throw" });
    return { status: "error", reason: "db-select-throw" };
  }
}

export async function fetchMostRecentClip(userId: string): Promise<ClipLog | null> {
  const r = await fetchRecentClips(userId, 1);
  if (r.status !== "ok") return null;
  return r.clips[0] ?? null;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test -- src/lib/clip-log-storage.test.ts`
Expected: 2 mapper tests PASS.

- [ ] **Step 5: Run full test suite — verify no regression**

Run: `pnpm test`
Expected: full suite green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/clip-log-storage.ts src/lib/clip-log-storage.test.ts
git commit -m "feat(clip-log): storage helpers + rowToClipLog mapper"
```

---

## Task 6: Auto-persist + thumbnail capture in `coach-clip-review.tsx`

**Files:**
- Modify: `src/components/coach-clip-review.tsx`

**Goals:** After a successful analysis, capture a thumbnail (middle frame from the already-extracted `frames[]` array), save to `clip_logs` asynchronously, and refresh local timeline state. Persistence failure must not break the existing UX.

**The orchestration order matters for the diff card (Task 7), so this task also wires the prev-clip fetch:**
1. Submit analysis request.
2. Receive analysis result.
3. **Before** rendering — fetch most-recent clip from DB (for diff card).
4. Render result (existing UI + diff card from Task 7 — diff-card import added in Task 7).
5. **After** rendering — save the new clip async.

For Task 6 we wire steps 1, 2, 5 (persist). Diff-card render in step 3-4 is added in Task 7.

- [ ] **Step 1: Add imports**

Near the top of `src/components/coach-clip-review.tsx`, add:

```tsx
import { saveClipLog } from "@/lib/clip-log-storage";
import type { ClipLog } from "@/lib/clip-log-types";
```

- [ ] **Step 2: Capture thumbnail in `extractFrames`**

In `extractFrames` (around line 68-129), the function currently returns `frames: string[]`. Update it to also return the middle frame as a thumbnail. The simplest change: keep returning `string[]` but expose the array to the caller. The caller (`analyze`) computes `frames[Math.floor(frames.length / 2)]` as the thumbnail.

No code change in `extractFrames` itself — Step 3 does the thumbnail compute in `analyze`.

- [ ] **Step 3: Add thumbnail compute + persist call in `analyze`**

In `src/components/coach-clip-review.tsx`, find the `analyze` callback (around line 131-164). Replace its body with:

```tsx
  const analyze = useCallback(async () => {
    if (!videoFile) return;
    setAnalyzing(true);
    setError(null);

    try {
      setStatus("Extracting frames...");
      const frames = await extractFrames();
      if (frames.length === 0) {
        setAnalyzing(false);
        return;
      }

      setStatus(`Analyzing ${frames.length} frames...`);
      const response = await fetch("/api/coach/clip-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frames, filename: videoFile.name, userId }),
      });

      if (!response.ok) {
        throw new Error("Analysis failed");
      }

      const result = await response.json();
      setAnalysis(result);

      // Compute thumbnail from middle frame and persist asynchronously.
      // Failure does NOT surface to the user — the analysis UX still works,
      // we just lose persistence for this clip. Tracked in PostHog.
      const middleFrame = frames[Math.floor(frames.length / 2)] ?? null;
      const durationSeconds = videoRef.current?.duration ?? null;
      if (userId && userId !== "anon") {
        void saveClipLog({
          userId,
          filename: videoFile.name,
          durationSeconds,
          analysis: result,
          thumbnailB64: middleFrame,
        }).then((res) => {
          if (res.status === "saved") {
            setRecentClips((prev) => [res.clip, ...prev]);
          }
        });
      }
    } catch (err) {
      console.error("Analysis error:", err);
      setError("Failed to analyze clip. Please try again.");
    } finally {
      setAnalyzing(false);
      setStatus("");
    }
  }, [videoFile, extractFrames, userId]);
```

- [ ] **Step 4: Add `recentClips` state + initial fetch**

Locate the existing `useState` block at the top of the component (around line 18-23). Add:

```tsx
  const [recentClips, setRecentClips] = useState<ClipLog[]>([]);
```

Then add a `useEffect` immediately after the existing `useEffect` for `videoUrl` cleanup (around line 28-32):

```tsx
  useEffect(() => {
    if (!userId || userId === "anon") return;
    let cancelled = false;
    (async () => {
      const { fetchRecentClips } = await import("@/lib/clip-log-storage");
      const r = await fetchRecentClips(userId, 30);
      if (!cancelled && r.status === "ok") setRecentClips(r.clips);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);
```

(Dynamic import keeps initial load light. Could be a static import — judgment call; static is fine if that pattern is preferred elsewhere in the codebase.)

Actually — use a static import for consistency with the rest of the codebase:

```tsx
import { saveClipLog, fetchRecentClips } from "@/lib/clip-log-storage";
```

And the effect becomes:

```tsx
  useEffect(() => {
    if (!userId || userId === "anon") return;
    let cancelled = false;
    (async () => {
      const r = await fetchRecentClips(userId, 30);
      if (!cancelled && r.status === "ok") setRecentClips(r.clips);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);
```

- [ ] **Step 5: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Run full test suite**

Run: `pnpm test`
Expected: green (no test currently asserts on this component's behavior; adding tests for this orchestration is deferred to manual QA in Task 12).

- [ ] **Step 7: Commit**

```bash
git add src/components/coach-clip-review.tsx
git commit -m "feat(clip-review): persist analyses with thumbnail; load recent clips"
```

---

## Task 7: Diff card component

**Files:**
- Create: `src/components/clip-log/diff-card.tsx`
- Modify: `src/components/coach-clip-review.tsx` (mount diff-card)

- [ ] **Step 1: Create the diff card component**

Create `src/components/clip-log/diff-card.tsx`:

```tsx
"use client";

import type { ClipLog, ClipScores } from "@/lib/clip-log-types";

interface DiffCardProps {
  current: ClipScores;
  previous: ClipLog | null;
}

interface PhaseRow {
  label: string;
  current: number | null;
  previous: number | null;
}

function relativeTime(iso: string, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "1 week ago";
  return `${Math.floor(days / 7)} weeks ago`;
}

export function DiffCard({ current, previous }: DiffCardProps) {
  if (!previous) return null;

  const rows: PhaseRow[] = [
    { label: "Loading", current: current.loading, previous: previous.scores.loading },
    { label: "Hip", current: current.hipExplosion, previous: previous.scores.hipExplosion },
    { label: "Transfer", current: current.energyTransfer, previous: previous.scores.energyTransfer },
    { label: "Follow", current: current.followThrough, previous: previous.scores.followThrough },
  ];

  return (
    <div className="rounded-xl bg-surface-hover p-4 text-sm">
      <div className="text-xs text-muted mb-2">
        vs your last clip · {relativeTime(previous.createdAt)}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {rows.map((r) => {
          if (r.current == null || r.previous == null) {
            return (
              <span key={r.label} className="text-muted">
                {r.label} —
              </span>
            );
          }
          const delta = r.current - r.previous;
          const arrow = delta >= 1 ? "↑" : delta <= -1 ? "↓" : "–";
          const color =
            delta >= 1
              ? "text-green-400"
              : delta <= -1
              ? "text-yellow-400"
              : "text-muted";
          return (
            <span key={r.label} className={color}>
              {r.label} {r.previous} → {r.current} {arrow}
            </span>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `coach-clip-review.tsx`**

Add to imports at the top:

```tsx
import { DiffCard } from "@/components/clip-log/diff-card";
```

In the existing results view (the block starting `if (analysis) { return (...) }` around line 167), add the diff card immediately above the Phase Breakdown section. Find this in the existing JSX:

```tsx
        <div className="rounded-xl bg-surface-hover p-5">
          <h3 className="text-sm font-semibold mb-2">Summary</h3>
          <p className="text-sm text-muted leading-relaxed">{analysis.summary}</p>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Phase Breakdown</h3>
```

Insert the diff card BETWEEN the Summary div and the Phase Breakdown div. Compute the current scores from the analysis result (matching the same extraction the storage layer does):

```tsx
        <div className="rounded-xl bg-surface-hover p-5">
          <h3 className="text-sm font-semibold mb-2">Summary</h3>
          <p className="text-sm text-muted leading-relaxed">{analysis.summary}</p>
        </div>

        <DiffCard
          current={{
            loading: getPhaseScore(analysis, "Loading"),
            hipExplosion: getPhaseScore(analysis, "Hip Explosion"),
            energyTransfer: getPhaseScore(analysis, "Energy Transfer"),
            followThrough: getPhaseScore(analysis, "Follow Through"),
            overall: null,
          }}
          previous={recentClips[0] ?? null}
        />

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Phase Breakdown</h3>
```

Add this helper just below the imports (or in a small util block above the component):

```tsx
function getPhaseScore(
  analysis: { phases: { phase: string; score?: number }[] },
  phase: string
): number | null {
  const p = analysis.phases.find((x) => x.phase === phase);
  return typeof p?.score === "number" ? p.score : null;
}
```

**Note on previous-clip selection:** `recentClips[0]` at the time the diff card renders should be the prior clip — the new clip's persist (Task 6 step 3) prepends to `recentClips`, but the persist is async. Order on first render: result lands → setAnalysis triggers rerender → DiffCard sees `recentClips[0]` (still the previous clip). Good. If the persist resolves super fast and the rerender races, `recentClips[0]` becomes the just-saved clip and the diff is zero against itself — undesirable. **Mitigation:** capture the prior clip in a ref or a separate state before persisting. Cleanest: split.

Actually, simpler: capture `recentClips[0]` into a `priorClipForDiff` state at the moment the analysis result lands (in `analyze`, just before calling `saveClipLog`):

```tsx
  const [priorClipForDiff, setPriorClipForDiff] = useState<ClipLog | null>(null);
```

In `analyze`, immediately after `setAnalysis(result);`:

```tsx
      setAnalysis(result);
      setPriorClipForDiff(recentClips[0] ?? null);
```

And the JSX uses `previous={priorClipForDiff}` instead of `recentClips[0]`. This guarantees the diff card always compares against the truly-previous clip, regardless of persist timing.

Update the DiffCard mount accordingly:

```tsx
        <DiffCard
          current={{
            loading: getPhaseScore(analysis, "Loading"),
            hipExplosion: getPhaseScore(analysis, "Hip Explosion"),
            energyTransfer: getPhaseScore(analysis, "Energy Transfer"),
            followThrough: getPhaseScore(analysis, "Follow Through"),
            overall: null,
          }}
          previous={priorClipForDiff}
        />
```

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/clip-log/diff-card.tsx src/components/coach-clip-review.tsx
git commit -m "feat(clip-log): vs-last-clip diff card"
```

---

## Task 8: Timeline component

**Files:**
- Create: `src/components/clip-log/timeline.tsx`
- Modify: `src/components/coach-clip-review.tsx` (mount timeline)

- [ ] **Step 1: Create the timeline component**

Create `src/components/clip-log/timeline.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { ClipLog } from "@/lib/clip-log-types";

interface TimelineProps {
  clips: ClipLog[];
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function scoreColor(score: number | null): string {
  if (score == null) return "bg-surface-hover text-muted";
  if (score <= 3) return "bg-red-500/10 text-red-400";
  if (score <= 6) return "bg-yellow-500/10 text-yellow-400";
  if (score <= 8) return "bg-green-500/10 text-green-400";
  return "bg-amber-500/15 text-amber-300";
}

function ScoreChip({ label, score }: { label: string; score: number | null }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs ${scoreColor(score)}`}
      title={`${label}: ${score ?? "—"}`}
    >
      {label} {score ?? "—"}
    </span>
  );
}

export function Timeline({ clips }: TimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (clips.length === 0) {
    return (
      <div className="rounded-xl bg-surface-hover p-5 text-center text-sm text-muted">
        Log your first clip above to start your record.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold mb-2">Your clip log</h3>
      {clips.map((c) => {
        const expanded = expandedId === c.id;
        const summaryFirstLine = c.analysis.summary.split(". ")[0] + ".";
        return (
          <div
            key={c.id}
            className="rounded-xl bg-surface-hover p-3 cursor-pointer"
            onClick={() => setExpandedId(expanded ? null : c.id)}
          >
            <div className="flex items-start gap-3">
              {c.thumbnailB64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/jpeg;base64,${c.thumbnailB64}`}
                  alt=""
                  className="w-20 h-15 rounded object-cover flex-shrink-0"
                  width={80}
                  height={60}
                />
              ) : (
                <div className="w-20 h-15 rounded bg-surface flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted">{shortDate(c.createdAt)}</div>
                <div className="text-sm mt-0.5 line-clamp-2">{summaryFirstLine}</div>
                <div className="flex flex-wrap gap-1 mt-2">
                  <ScoreChip label="Load" score={c.scores.loading} />
                  <ScoreChip label="Hip" score={c.scores.hipExplosion} />
                  <ScoreChip label="Transfer" score={c.scores.energyTransfer} />
                  <ScoreChip label="Follow" score={c.scores.followThrough} />
                </div>
              </div>
            </div>
            {expanded && (
              <div className="mt-3 pt-3 border-t border-border space-y-2 text-sm">
                <p className="text-muted leading-relaxed">{c.analysis.summary}</p>
                {c.analysis.strengths.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold mb-1">Strengths</div>
                    {c.analysis.strengths.map((s, i) => (
                      <div key={i} className="flex gap-2 text-muted">
                        <span className="text-green-400">+</span>
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                )}
                {c.analysis.improvements.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold mb-1">Improvements</div>
                    {c.analysis.improvements.map((s, i) => (
                      <div key={i} className="flex gap-2 text-muted">
                        <span className="text-yellow-400">!</span>
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Wire into `coach-clip-review.tsx`**

Add to imports:

```tsx
import { Timeline } from "@/components/clip-log/timeline";
```

In the upload-empty-state JSX (the block starting `{!videoFile ? (...)` around line 238), wrap it so the Timeline renders below the upload area when no clip is being analyzed. Replace the empty-state block with:

```tsx
      {!videoFile ? (
        <div className="w-full max-w-md space-y-6">
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="w-full rounded-xl border-2 border-dashed border-border hover:border-accent/50 p-8 text-center cursor-pointer transition-colors"
          >
            <Upload className="mx-auto mb-3 h-8 w-8 text-muted" />
            <p className="text-sm font-medium mb-1">Upload a short clip</p>
            <p className="text-xs text-muted">Up to 40 seconds — single punch, combination, or short flurry</p>
            <p className="text-xs text-muted mt-1">MP4, MOV, or WebM • Max 50MB</p>
          </div>
          <Timeline clips={recentClips} />
        </div>
      ) : (
```

(The original empty state was a single `div`; this wraps it in a max-width container with a Timeline below.)

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/clip-log/timeline.tsx src/components/coach-clip-review.tsx
git commit -m "feat(clip-log): timeline list below upload area"
```

---

## Task 9: Trend graph component + mount in coach-progress

**Files:**
- Create: `src/components/clip-log/trend-graph.tsx`
- Modify: `src/components/coach-progress.tsx`

- [ ] **Step 1: Create the trend graph component**

Create `src/components/clip-log/trend-graph.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { fetchRecentClips } from "@/lib/clip-log-storage";
import { computeRollingAvgTrend } from "@/lib/clip-log-aggregation";

interface TrendGraphProps {
  userId: string;
}

const ROLL = 3;        // rolling-average window size
const PHASE_COLORS = {
  loading: "#3b82f6",          // blue
  hipExplosion: "#f97316",     // orange
  energyTransfer: "#ef4444",   // red
  followThrough: "#a855f7",    // purple
  overall: "#9ca3af",          // gray (thicker)
};

export function TrendGraph({ userId }: TrendGraphProps) {
  const [points, setPoints] = useState<ReturnType<typeof computeRollingAvgTrend>>([]);
  const [clipCount, setClipCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId || userId === "anon") {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const r = await fetchRecentClips(userId, 60);
      if (cancelled) return;
      if (r.status === "ok") {
        setClipCount(r.clips.length);
        setPoints(computeRollingAvgTrend(r.clips, ROLL));
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!loaded) return null;

  if (clipCount < ROLL) {
    return (
      <div className="rounded-xl bg-surface-hover p-5 text-center text-sm text-muted">
        Log {ROLL} clips to see your trend.
      </div>
    );
  }

  const chartData = points.map((p) => ({
    date: new Date(p.createdAt).toLocaleDateString([], { month: "short", day: "numeric" }),
    Loading: p.loading,
    Hip: p.hipExplosion,
    Transfer: p.energyTransfer,
    Follow: p.followThrough,
    Overall: p.overall,
  }));

  return (
    <div className="rounded-xl bg-surface-hover p-4">
      <div className="text-sm font-semibold mb-3">Technique trend</div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="date" stroke="#9ca3af" fontSize={11} />
            <YAxis domain={[1, 10]} stroke="#9ca3af" fontSize={11} />
            <Tooltip
              contentStyle={{
                background: "#1c1c1c",
                border: "1px solid rgba(255,255,255,0.1)",
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="Loading" stroke={PHASE_COLORS.loading} dot={false} strokeWidth={1.5} />
            <Line type="monotone" dataKey="Hip" stroke={PHASE_COLORS.hipExplosion} dot={false} strokeWidth={1.5} />
            <Line type="monotone" dataKey="Transfer" stroke={PHASE_COLORS.energyTransfer} dot={false} strokeWidth={1.5} />
            <Line type="monotone" dataKey="Follow" stroke={PHASE_COLORS.followThrough} dot={false} strokeWidth={1.5} />
            <Line type="monotone" dataKey="Overall" stroke={PHASE_COLORS.overall} dot={false} strokeWidth={2.5} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="text-xs text-muted mt-2">
        3-clip rolling average · scores 1–10 · expect ±1 model variance
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mount in `coach-progress.tsx`**

In `src/components/coach-progress.tsx`, add to imports:

```tsx
import { TrendGraph } from "@/components/clip-log/trend-graph";
```

Find the streak chip block (added in Plan 1 Task 7, currently above the stats grid). Render the TrendGraph immediately above the stats grid (below or beside the streak chip is fine — let visual hierarchy decide). Example placement:

```tsx
{engagement && engagement.current_streak_days >= 1 && (
  <div className="...">🔥 {engagement.current_streak_days} day streak ...</div>
)}

{userId && userId !== "anon" && (
  <div className="mb-4">
    <TrendGraph userId={userId} />
  </div>
)}

{/* existing Stats bar block follows */}
```

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Run full test suite**

Run: `pnpm test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/components/clip-log/trend-graph.tsx src/components/coach-progress.tsx
git commit -m "feat(clip-log): trend graph mounted in coach progress"
```

---

## Task 10: Backend chat schema + `formatClipHistory`

**Files:**
- Modify: `src/lib/validation.ts`
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: Extend the chat schema with `clipHistory`**

In `src/lib/validation.ts`, add a `clipHistorySchema` and an optional `clipHistory` field on `chatRequestSchema`. Find the existing `chatRequestSchema` block (around line 43-57) and replace with:

```ts
export const clipHistorySchema = z.object({
  windowDays: z.number().int().min(1).max(365),
  totalClips: z.number().int().min(0),
  trend: z
    .object({
      last5Avg: z.object({
        loading: z.number().nullable(),
        hipExplosion: z.number().nullable(),
        energyTransfer: z.number().nullable(),
        followThrough: z.number().nullable(),
        overall: z.number().nullable(),
      }),
      prior5Avg: z.object({
        loading: z.number().nullable(),
        hipExplosion: z.number().nullable(),
        energyTransfer: z.number().nullable(),
        followThrough: z.number().nullable(),
        overall: z.number().nullable(),
      }),
    })
    .optional(),
  mostRecent: z
    .object({
      daysAgo: z.number().int().min(0),
      summary: z.string().max(2000),
    })
    .optional(),
});

export const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      })
    )
    .min(1)
    .max(100),
  context: z.enum(["technique", "drills", "style"]).optional(),
  styleProfile: styleProfileSchema.optional(),
  clipHistory: clipHistorySchema.optional(),
  thinkLonger: z.boolean().optional(),
  userId: z.string().max(128).optional(),
});
```

- [ ] **Step 2: Add `formatClipHistory()` and append to system prompt**

In `src/app/api/chat/route.ts`, add a `formatClipHistory` function after the existing `formatStyleProfile` function (around line 117). Add it before the `POST` export:

```ts
interface ClipHistoryPayload {
  windowDays: number;
  totalClips: number;
  trend?: {
    last5Avg: {
      loading: number | null;
      hipExplosion: number | null;
      energyTransfer: number | null;
      followThrough: number | null;
      overall: number | null;
    };
    prior5Avg: {
      loading: number | null;
      hipExplosion: number | null;
      energyTransfer: number | null;
      followThrough: number | null;
      overall: number | null;
    };
  };
  mostRecent?: { daysAgo: number; summary: string };
}

function formatPct(prior: number | null, last: number | null): string {
  if (prior == null || last == null || prior === 0) return "—";
  const delta = ((last - prior) / prior) * 100;
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${Math.round(delta)}%`;
}

function formatClipHistory(c: ClipHistoryPayload): string {
  if (c.totalClips === 0) return "";
  const lines: string[] = [
    `\n\n## This fighter's recent clip log\n<clip_history>`,
    `Last ${c.windowDays} days: ${c.totalClips} clips logged.`,
  ];
  if (c.trend) {
    lines.push(`Phase trend (avg of last 5 vs prior 5):`);
    const t = c.trend;
    lines.push(
      `- Loading ${t.prior5Avg.loading ?? "—"} → ${t.last5Avg.loading ?? "—"} (${formatPct(t.prior5Avg.loading, t.last5Avg.loading)})`
    );
    lines.push(
      `- Hip Explosion ${t.prior5Avg.hipExplosion ?? "—"} → ${t.last5Avg.hipExplosion ?? "—"} (${formatPct(t.prior5Avg.hipExplosion, t.last5Avg.hipExplosion)})`
    );
    lines.push(
      `- Energy Transfer ${t.prior5Avg.energyTransfer ?? "—"} → ${t.last5Avg.energyTransfer ?? "—"} (${formatPct(t.prior5Avg.energyTransfer, t.last5Avg.energyTransfer)})`
    );
    lines.push(
      `- Follow Through ${t.prior5Avg.followThrough ?? "—"} → ${t.last5Avg.followThrough ?? "—"} (${formatPct(t.prior5Avg.followThrough, t.last5Avg.followThrough)})`
    );
  }
  if (c.mostRecent) {
    lines.push(
      `Most recent clip: ${c.mostRecent.daysAgo === 0 ? "today" : c.mostRecent.daysAgo === 1 ? "yesterday" : `${c.mostRecent.daysAgo} days ago`} — "${c.mostRecent.summary}"`
    );
  }
  lines.push("</clip_history>");
  lines.push(
    "\nReference these phase trends and recent feedback when answering — the user expects you to know their progression. Don't ask them to tell you what they've worked on; check the log."
  );
  return lines.join("\n");
}
```

- [ ] **Step 3: Wire `clipHistory` into the request handler**

In the same file, update the destructure on line 130 from:

```ts
    const { messages, context, thinkLonger, styleProfile, userId } = parsed.data;
```

to:

```ts
    const { messages, context, thinkLonger, styleProfile, clipHistory, userId } = parsed.data;
```

Then around line 165 where `styleNote` is computed, add a sibling `clipHistoryNote`:

```ts
    const styleNote = context === "style" && styleProfile ? formatStyleProfile(styleProfile) : "";
    const clipHistoryNote = clipHistory ? formatClipHistory(clipHistory) : "";
```

And update the `system:` argument on line 180 from:

```ts
      system: SYSTEM_PROMPT + contextText + contextNote + styleNote + thinkLongerNote,
```

to:

```ts
      system: SYSTEM_PROMPT + contextText + contextNote + styleNote + clipHistoryNote + thinkLongerNote,
```

- [ ] **Step 4: Run full test suite**

Run: `pnpm test`
Expected: green. Existing chat tests should continue to pass — `clipHistory` is optional.

- [ ] **Step 5: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validation.ts src/app/api/chat/route.ts
git commit -m "feat(chat): accept clipHistory and inject into system prompt"
```

---

## Task 11: Frontend chat-tab clip history injection

**Files:**
- Modify: `src/app/page.tsx` (fetch clip history once, pass to ChatTabs)

**Approach:** Fetch recent clips at the page level (once per page mount), aggregate to `ClipHistoryContext`, pass via `extraContext={{ clipHistory }}` to both the technique and drills `ChatTab` instances.

- [ ] **Step 1: Add imports + state + fetch**

In `src/app/page.tsx`, add to imports:

```tsx
import { fetchRecentClips } from "@/lib/clip-log-storage";
import { aggregateClipHistory } from "@/lib/clip-log-aggregation";
import type { ClipHistoryContext } from "@/lib/clip-log-types";
```

Inside `AppContent`, near the existing `useState`/`useEffect` declarations (around line 46-50), add:

```tsx
  const [clipHistory, setClipHistory] = useState<ClipHistoryContext | null>(null);

  useEffect(() => {
    if (!userId || userId === "anon") return;
    let cancelled = false;
    (async () => {
      const r = await fetchRecentClips(userId, 60);
      if (cancelled) return;
      if (r.status === "ok") {
        setClipHistory(aggregateClipHistory(r.clips, new Date()));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);
```

- [ ] **Step 2: Pass `extraContext` to both ChatTabs**

Find the technique `ChatTab` block (around line 152-167) and add the prop:

```tsx
            <ChatTab
              systemContext="technique"
              ...
              userId={userId}
              extraContext={clipHistory ? { clipHistory } : undefined}
            />
```

Find the drills `ChatTab` block (around line 180-193) and add the same prop:

```tsx
                <ChatTab
                  systemContext="drills"
                  ...
                  userId={userId}
                  extraContext={clipHistory ? { clipHistory } : undefined}
                />
```

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Run full test suite**

Run: `pnpm test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(chat): inject clip history into technique + drills tabs"
```

---

## Task 12: End-to-end manual QA

**Goal:** Walk the whole flow before merging. No automated test covers the full Supabase + Anthropic round-trip; this is the human gate.

- [ ] **Step 1: Migration applied**

Verify `clip_logs` table exists in production Supabase via `mcp__claude_ai_Supabase__list_tables` (or by querying directly). Expected: row schema matches Task 1's SQL.

- [ ] **Step 2: First clip — fresh user**

1. Open the app in a fresh browser profile (or clear localStorage).
2. Navigate to **My Coach → Clip Review**.
3. Empty state: timeline says "Log your first clip above to start your record."
4. Upload a short clip (≤40s).
5. Verify: analysis lands within ~20s with summary + 4 phases + scores + strengths + improvements.
6. Verify: NO diff card renders (no previous clip).
7. Verify: a row appears in `clip_logs` with non-null scores and a `thumbnail_b64`.
8. Verify: timeline now shows the clip with a thumbnail and 4 score chips.

- [ ] **Step 3: Second clip — diff card**

1. Upload a second clip (any clip).
2. Verify: a "vs your last clip" diff card appears above Phase Breakdown.
3. Verify: deltas match the score change between the two clips.
4. Verify: timeline now shows two clips, newest on top.

- [ ] **Step 4: Trend graph empty state**

1. Navigate to My Coach → Progress.
2. With <3 clips: card shows "Log 3 clips to see your trend."

- [ ] **Step 5: Trend graph rendered**

1. Upload a third clip.
2. Navigate to Progress.
3. Verify: trend graph card renders with 5 lines (Loading, Hip, Transfer, Follow, Overall).
4. Verify: only 1 data point on the chart (3 clips → 1 rolling-average point).
5. Verify: chart axis is 1-10.
6. Upload a 4th and 5th clip; verify points accumulate.

- [ ] **Step 6: Coach context awareness**

1. With ≥6 clips logged (need 5+5 for trend block).
2. Open the **Technique** tab.
3. Ask the coach: "How am I doing? What should I work on?"
4. Verify: coach references your recent clips qualitatively — e.g., "your hip rotation has been improving" or "your follow-through has dropped." It should not ask you to tell it what you've practiced.
5. Open the **Drills** tab and ask "What drill should I prioritize?"
6. Verify: coach references your phase trend (the worst-performing phase should drive its recommendation).

- [ ] **Step 7: Persistence resilience**

1. With DevTools open, throttle network to "Offline."
2. Upload a clip.
3. Verify: analysis fails (expected — request can't reach the server).
4. Switch back to online.
5. Upload again.
6. Verify: analysis succeeds.
7. With DevTools console, look for `[clip-log-storage]` errors. None expected on a successful path.

- [ ] **Step 8: Document outcomes**

Append a `## Verification` block to this plan file noting the date, scenarios tested, and any deviations or surprises.

---

## Self-Review (run after writing the plan, before executing)

### Spec coverage
Spec sections covered:
- Schema (spec §1) → Task 1 ✅
- Scoring approach (spec §2) → Task 3 ✅
- Persistence flow (spec §3) → Task 6 ✅
- Timeline UX (spec §4) → Task 8 ✅
- Trend graph UX (spec §5) → Task 9 ✅
- Diff card UX (spec §6) → Task 7 ✅
- Coach chat context (spec §7) → Task 10 (backend) + Task 11 (frontend) ✅
- Out of scope (spec §8) → tasks explicitly avoid these ✅

Plus supporting tasks: Task 2 (deps + types), Task 4 (aggregation), Task 5 (storage), Task 12 (manual QA).

### Placeholder scan
- No "TBD"/"TODO"/"implement later"
- No "add appropriate error handling" — error paths are explicit
- No "similar to Task N" — code is repeated where needed

### Type consistency
- `ClipLog` / `ClipScores` / `ClipHistoryContext` shapes consistent across types file, aggregation, storage, components.
- `aggregateClipHistory(clips, today)` signature consistent between Tasks 4 and 11.
- `fetchRecentClips(userId, limit)` signature consistent between Tasks 5, 6, 9, 11.
- `saveClipLog({...})` input shape consistent between Tasks 5 and 6.
- `formatClipHistory(c)` payload shape (Task 10) matches the `ClipHistoryContext` shape from Task 4 (modulo nullable scores — handled by the schema).

---

## Out of scope (explicit non-goals)

- **Tagging** clips by punch type / drill category — Plan 3+
- **User notes** on clips — Plan 3+
- **Re-running** old clips with newer prompts — Plan 3+
- **Share cards / export** — Plan 3+ or never
- **Full video storage** — explicitly avoided due to cost
- **Clip-specific streak** (separate from Plan 1's `user_engagement` app-streak) — data-model creep
- **D1/D7/D30 cohort dashboard** — Plan 1 enabled the data; visualization is later
- **Automated browser tests** — Vitest covers pure logic; manual QA covers integration

---

## Notes for the executing engineer

- The codebase uses **Vitest**, not Jest. Run with `pnpm test` (full) or `pnpm test -- <path>` (single file).
- The codebase uses the **anonymous localStorage UUID identity model** — never `auth.getUser()`. New tables follow the post-012 permissive-RLS pattern.
- The **Supabase client used here is the browser anon-key client** (`createBrowserClient` from `@/lib/supabase-browser`).
- The **`style-profile-sync.ts` file is the canonical reference** for "client-side helper with single-flight + tagged results." Read it if you're unsure about a pattern.
- **Don't `--amend`** if a pre-commit hook fails. Per project CLAUDE.md, pre-commit failure means the commit didn't happen — fix the issue and create a NEW commit.
- The Anthropic model name in `clip-review/route.ts` is `claude-sonnet-4-20250514` (Sonnet 4.6). Don't change it as part of Plan 2.
- The new prompt in Task 3 is **additive** — existing consumers ignoring `phases[].score` continue to work.
- **`recharts`** must be added in Task 2 — it is NOT currently a dep.
