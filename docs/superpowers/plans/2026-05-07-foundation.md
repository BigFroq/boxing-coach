# Foundation Plan — Clip cap to 40s + Retention instrumentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the video clip cap from 20s → 40s (with frame cap 60 → 80, sampling ~2fps), and add a `user_engagement` table + sync helper that tracks `last_seen_at`, `session_count`, and a daily streak — surfaced as a passive streak indicator in the coach progress view.

**Architecture:** Two independent slices. (1) Video cap: a duration check + schema cap + sampling math change, all in already-touched files. (2) Engagement: a new Supabase table, a new client-only sync helper that mirrors the existing `style-profile-sync.ts` concurrent-safe pattern, wired into app boot, with a small streak chip in the coach progress component. No auth changes — keys on the existing anonymous `punch-doctor-user-id` localStorage UUID.

**Tech Stack:** Next.js (App Router) · React · Supabase (anon-key browser client) · Zod (validation) · Vitest (tests) · PostHog (analytics, already wired)

**Spec:** [docs/ideas/2026-05-07-floman-feedback-idea-map.md](../../ideas/2026-05-07-floman-feedback-idea-map.md)

---

## File Structure

| File | Action | Purpose |
|---|---|---|
| `src/components/coach-clip-review.tsx` | Modify | Duration cap 20s → 40s, frame target 60 → 80, UI copy update |
| `src/lib/validation.ts` | Modify | Schema `frames` cap 60 → 80 |
| `src/lib/validation.test.ts` | Modify | Add coverage for new 80-frame cap boundary |
| `supabase/migrations/013_user_engagement.sql` | Create | New `user_engagement` table |
| `src/lib/streak-math.ts` | Create | Pure streak-computation function (no DB, no globals) |
| `src/lib/streak-math.test.ts` | Create | TDD coverage for streak logic |
| `src/lib/user-engagement-sync.ts` | Create | DB upsert + dedup + streak update on app boot (mirrors style-profile-sync) |
| `src/lib/user-engagement-sync.test.ts` | Create | Unit tests for sync orchestration where mockable |
| `src/app/page.tsx` | Modify | Wire `ensureUserEngagement(userId)` into app boot |
| `src/components/coach-progress.tsx` | Modify | Render passive streak chip from engagement data |

**Boundaries:**
- `streak-math.ts` is pure — no DB, no Date.now, no localStorage. Takes inputs, returns outputs. This is what the tests exercise heavily.
- `user-engagement-sync.ts` is the orchestration layer (DB I/O, dedup, time). It composes `streak-math`.
- The component (`coach-progress.tsx`) is a thin renderer — no streak math inline.

---

## Task 1: Lift duration cap (frontend) — 20s → 40s

**Files:**
- Modify: `src/components/coach-clip-review.tsx:80-92` (duration check + sampling math)
- Modify: `src/components/coach-clip-review.tsx:247` (UI copy)

**Why this task is first:** Smallest, safest change. Ships an immediate user-visible win. Self-contained in one file.

**Sampling math at the new cap:** `totalFrames = min(floor(duration × 5), 80)`. At 40s → 80 frames → 2fps effective. At 20s → still 80 frames → 4fps (slight quality bump for short clips, accepted as the +30% cost we agreed on).

- [ ] **Step 1: Read the current cap block to preserve surrounding context**

Run: `sed -n '80,92p' src/components/coach-clip-review.tsx`

Expected output: the block currently containing `if (duration > 20)` and `Math.min(Math.floor(duration * fps), 60)`.

- [ ] **Step 2: Apply the cap + sampling change**

Replace lines 80-92 of `src/components/coach-clip-review.tsx`:

```tsx
    const duration = video.duration;
    if (duration > 40) {
      setError(
        "Clip must be under 40 seconds. This video is " +
          Math.round(duration) +
          "s."
      );
      return [];
    }

    const fps = 5;
    const totalFrames = Math.min(Math.floor(duration * fps), 80);
    const interval = duration / totalFrames;
```

- [ ] **Step 3: Update UI copy**

Replace line 247 of `src/components/coach-clip-review.tsx`:

```tsx
          <p className="text-xs text-muted">Up to 40 seconds — single punch, combination, or short flurry</p>
```

- [ ] **Step 4: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors related to this file.

- [ ] **Step 5: Commit**

```bash
git add src/components/coach-clip-review.tsx
git commit -m "feat(clip-review): lift cap 20s→40s, frames 60→80"
```

---

## Task 2: Lift schema cap (backend validation) — 60 → 80 frames

**Files:**
- Test: `src/lib/validation.test.ts` (add cases)
- Modify: `src/lib/validation.ts:60`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/validation.test.ts` (inside the file, after the existing `describe` blocks — find the closing `});` of `chatRequestSchema` describe and add this new describe block):

```ts
describe("clipReviewRequestSchema (frame cap)", () => {
  it("accepts 80 frames", () => {
    const frames = Array.from({ length: 80 }, () => "x");
    const res = clipReviewRequestSchema.safeParse({ frames });
    expect(res.success).toBe(true);
  });

  it("rejects 81 frames", () => {
    const frames = Array.from({ length: 81 }, () => "x");
    const res = clipReviewRequestSchema.safeParse({ frames });
    expect(res.success).toBe(false);
  });

  it("accepts 1 frame (lower bound unchanged)", () => {
    const res = clipReviewRequestSchema.safeParse({ frames: ["x"] });
    expect(res.success).toBe(true);
  });

  it("rejects 0 frames", () => {
    const res = clipReviewRequestSchema.safeParse({ frames: [] });
    expect(res.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify the new cap tests fail**

Run: `pnpm test -- src/lib/validation.test.ts`
Expected: the "accepts 80 frames" case FAILS (because schema currently caps at 60). The "rejects 81 frames" case may pass coincidentally but that's fine — the 80-frame case is the failing test.

- [ ] **Step 3: Bump the schema cap**

In `src/lib/validation.ts`, change line 60:

```ts
  frames: z.array(z.string().max(200_000)).min(1).max(80),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/lib/validation.test.ts`
Expected: all clipReviewRequestSchema cases PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation.ts src/lib/validation.test.ts
git commit -m "feat(validation): raise clipReview frames cap 60→80"
```

---

## Task 3: Migration 013 — `user_engagement` table

**Files:**
- Create: `supabase/migrations/013_user_engagement.sql`

**Schema decisions:**
- `user_id` is `text` (not `uuid`) because the app uses anonymous localStorage UUIDs — same pattern as `user_profiles` post-migration 012.
- `last_session_date` is `date` (no timezone). Streak math compares dates, not timestamps.
- `last_seen_at` is `timestamptz` for monitoring/cohort queries.
- RLS permissive (`Allow all`) — matches the post-migration-012 pattern documented in 012's comment.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/013_user_engagement.sql`:

```sql
-- 013_user_engagement.sql
-- Track per-user return cadence so we can measure D1/D7/D30 retention and
-- surface a passive streak indicator in the UI. Keys on the anonymous
-- localStorage UUID (same identity model as user_profiles after migration 012).
-- No FK to auth.users — the app has no signIn flow.

CREATE TABLE IF NOT EXISTS user_engagement (
  user_id text PRIMARY KEY,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_session_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  session_count int NOT NULL DEFAULT 1,
  current_streak_days int NOT NULL DEFAULT 1,
  longest_streak_days int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_engagement_last_seen
  ON user_engagement (last_seen_at DESC);

ALTER TABLE user_engagement ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on user_engagement"
  ON user_engagement FOR ALL USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Apply migration to local Supabase**

Run: `pnpm exec supabase db push` (or whatever the project's apply command is — check `package.json` scripts; if there's a `db:migrate` script use that).

If the project doesn't have a local Supabase running, skip to Step 3 (apply will happen when the deployment pipeline runs).

Expected: migration applies without error. Verify via `pnpm exec supabase db inspect` or by querying the `user_engagement` table from a Supabase studio session.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/013_user_engagement.sql
git commit -m "feat(db): add user_engagement table for retention tracking"
```

---

## Task 4: Pure streak math — `streak-math.ts`

**Files:**
- Create: `src/lib/streak-math.ts`
- Test: `src/lib/streak-math.test.ts`

**Why pure:** keeps the testable logic separate from DB/time/storage. `Date` is passed in, never read from `Date.now()` inside.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/streak-math.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeStreakUpdate } from "./streak-math";

describe("computeStreakUpdate", () => {
  const today = new Date("2026-05-07T10:00:00Z");

  it("first visit ever — streak starts at 1, should update", () => {
    const r = computeStreakUpdate({
      prevStreak: 0,
      lastSessionDate: null,
      today,
    });
    expect(r).toEqual({ newStreak: 1, isNewDay: true });
  });

  it("same UTC day — no update, streak unchanged", () => {
    const r = computeStreakUpdate({
      prevStreak: 7,
      lastSessionDate: new Date("2026-05-07T01:00:00Z"),
      today,
    });
    expect(r).toEqual({ newStreak: 7, isNewDay: false });
  });

  it("returned next day — streak increments by 1", () => {
    const r = computeStreakUpdate({
      prevStreak: 3,
      lastSessionDate: new Date("2026-05-06T20:00:00Z"),
      today,
    });
    expect(r).toEqual({ newStreak: 4, isNewDay: true });
  });

  it("two-day gap — streak resets to 1", () => {
    const r = computeStreakUpdate({
      prevStreak: 12,
      lastSessionDate: new Date("2026-05-05T10:00:00Z"),
      today,
    });
    expect(r).toEqual({ newStreak: 1, isNewDay: true });
  });

  it("month-long gap — streak resets to 1", () => {
    const r = computeStreakUpdate({
      prevStreak: 30,
      lastSessionDate: new Date("2026-04-01T10:00:00Z"),
      today,
    });
    expect(r).toEqual({ newStreak: 1, isNewDay: true });
  });

  it("treats UTC date boundaries — 23:59 vs 00:01 next day is a new day", () => {
    const lateLast = new Date("2026-05-06T23:59:00Z");
    const earlyToday = new Date("2026-05-07T00:01:00Z");
    const r = computeStreakUpdate({
      prevStreak: 1,
      lastSessionDate: lateLast,
      today: earlyToday,
    });
    expect(r).toEqual({ newStreak: 2, isNewDay: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/streak-math.test.ts`
Expected: FAIL with "Cannot find module './streak-math'".

- [ ] **Step 3: Implement `streak-math.ts`**

Create `src/lib/streak-math.ts`:

```ts
// Pure streak math. No DB, no Date.now(), no globals. All inputs explicit.
// Streak rules: same UTC day = no change; +1 UTC day = increment; gap = reset to 1.
// Using UTC sidesteps DST and timezone-travel edge cases for v1; we can revisit
// per-user-timezone later if cohort data shows it matters.

function utcDayIndex(d: Date): number {
  // Days since Unix epoch in UTC. Stable integer, easy to subtract.
  const ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor(ms / 86_400_000);
}

export interface StreakUpdateInput {
  prevStreak: number;
  lastSessionDate: Date | null;
  today: Date;
}

export interface StreakUpdateResult {
  newStreak: number;
  isNewDay: boolean;
}

export function computeStreakUpdate(input: StreakUpdateInput): StreakUpdateResult {
  const { prevStreak, lastSessionDate, today } = input;
  if (!lastSessionDate) {
    return { newStreak: 1, isNewDay: true };
  }
  const diff = utcDayIndex(today) - utcDayIndex(lastSessionDate);
  if (diff === 0) return { newStreak: prevStreak, isNewDay: false };
  if (diff === 1) return { newStreak: prevStreak + 1, isNewDay: true };
  return { newStreak: 1, isNewDay: true };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test -- src/lib/streak-math.test.ts`
Expected: all 6 cases PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/streak-math.ts src/lib/streak-math.test.ts
git commit -m "feat(streak): pure UTC-day streak computation"
```

---

## Task 5: Engagement sync helper — `user-engagement-sync.ts`

**Files:**
- Create: `src/lib/user-engagement-sync.ts`
- Test: `src/lib/user-engagement-sync.test.ts`

**Pattern:** Mirror `style-profile-sync.ts` for concurrent-safe single-flight (`inFlight` map) so React StrictMode double-mounts don't double-increment streaks.

**Behavior on call:**
1. Read existing `user_engagement` row by `user_id`.
2. If none → INSERT with streak=1, session_count=1.
3. If exists → compute streak update via `computeStreakUpdate`. If `isNewDay`, UPDATE `last_seen_at`, `last_session_date`, `current_streak_days`, `longest_streak_days = greatest(current, longest)`, `session_count += 1`. If not new day, UPDATE only `last_seen_at`.
4. Track via PostHog (`engagement_synced` with status).

- [ ] **Step 1: Write the failing test for the streak-update branch**

Create `src/lib/user-engagement-sync.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { decideEngagementUpdate } from "./user-engagement-sync";

// We don't unit-test the Supabase round-trip here — that's covered by manual
// QA + e2e if it's worth it later. We test the decision function which is
// where the logic lives.

describe("decideEngagementUpdate", () => {
  const today = new Date("2026-05-07T10:00:00Z");

  it("returns insert plan when no row exists", () => {
    const plan = decideEngagementUpdate({ existing: null, today });
    expect(plan).toEqual({
      kind: "insert",
      row: {
        last_session_date: "2026-05-07",
        current_streak_days: 1,
        longest_streak_days: 1,
        session_count: 1,
      },
    });
  });

  it("returns no-op-touch plan on same UTC day", () => {
    const plan = decideEngagementUpdate({
      existing: {
        last_session_date: "2026-05-07",
        current_streak_days: 5,
        longest_streak_days: 12,
        session_count: 30,
      },
      today,
    });
    expect(plan).toEqual({ kind: "touch" });
  });

  it("returns increment plan on next-day return", () => {
    const plan = decideEngagementUpdate({
      existing: {
        last_session_date: "2026-05-06",
        current_streak_days: 3,
        longest_streak_days: 3,
        session_count: 10,
      },
      today,
    });
    expect(plan).toEqual({
      kind: "update",
      row: {
        last_session_date: "2026-05-07",
        current_streak_days: 4,
        longest_streak_days: 4,
        session_count: 11,
      },
    });
  });

  it("preserves longest_streak when current resets after gap", () => {
    const plan = decideEngagementUpdate({
      existing: {
        last_session_date: "2026-05-04",
        current_streak_days: 2,
        longest_streak_days: 14,
        session_count: 50,
      },
      today,
    });
    expect(plan).toEqual({
      kind: "update",
      row: {
        last_session_date: "2026-05-07",
        current_streak_days: 1,
        longest_streak_days: 14,
        session_count: 51,
      },
    });
  });

  it("bumps longest_streak when current overtakes it", () => {
    const plan = decideEngagementUpdate({
      existing: {
        last_session_date: "2026-05-06",
        current_streak_days: 14,
        longest_streak_days: 14,
        session_count: 100,
      },
      today,
    });
    expect(plan).toEqual({
      kind: "update",
      row: {
        last_session_date: "2026-05-07",
        current_streak_days: 15,
        longest_streak_days: 15,
        session_count: 101,
      },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/user-engagement-sync.test.ts`
Expected: FAIL with "Cannot find module './user-engagement-sync'".

- [ ] **Step 3: Implement `user-engagement-sync.ts`**

Create `src/lib/user-engagement-sync.ts`:

```ts
// Mirrors style-profile-sync.ts pattern: single-flight per userId, defensive
// against StrictMode double-mounts and concurrent consumers. No throws — every
// failure path returns a tagged result so callers can render a noop without
// surfacing transient DB errors to users.

import { createBrowserClient } from "./supabase-browser";
import { track } from "./analytics";
import { computeStreakUpdate } from "./streak-math";

export interface EngagementRow {
  last_session_date: string; // ISO date (YYYY-MM-DD)
  current_streak_days: number;
  longest_streak_days: number;
  session_count: number;
}

export type DecideInput = {
  existing: EngagementRow | null;
  today: Date;
};

export type DecidePlan =
  | { kind: "insert"; row: EngagementRow }
  | { kind: "update"; row: EngagementRow }
  | { kind: "touch" };

function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Pure decision function — extracted so it's directly unit-testable without
// hitting Supabase. The sync function below composes this with DB I/O.
export function decideEngagementUpdate(input: DecideInput): DecidePlan {
  const { existing, today } = input;

  if (!existing) {
    return {
      kind: "insert",
      row: {
        last_session_date: utcDateString(today),
        current_streak_days: 1,
        longest_streak_days: 1,
        session_count: 1,
      },
    };
  }

  const lastDate = new Date(`${existing.last_session_date}T00:00:00Z`);
  const { newStreak, isNewDay } = computeStreakUpdate({
    prevStreak: existing.current_streak_days,
    lastSessionDate: lastDate,
    today,
  });

  if (!isNewDay) {
    return { kind: "touch" };
  }

  return {
    kind: "update",
    row: {
      last_session_date: utcDateString(today),
      current_streak_days: newStreak,
      longest_streak_days: Math.max(newStreak, existing.longest_streak_days),
      session_count: existing.session_count + 1,
    },
  };
}

export type SyncResult =
  | { status: "synced"; plan: DecidePlan["kind"]; engagement: EngagementRow }
  | { status: "error"; reason: string };

const inFlight = new Map<string, Promise<SyncResult>>();

export function ensureUserEngagement(userId: string): Promise<SyncResult> {
  if (typeof window === "undefined") {
    return Promise.resolve({ status: "error", reason: "server-side" });
  }
  if (!userId || userId === "anon") {
    return Promise.resolve({ status: "error", reason: "no-userid" });
  }
  const cached = inFlight.get(userId);
  if (cached) return cached;

  const promise = run(userId);
  inFlight.set(userId, promise);
  return promise;
}

async function run(userId: string): Promise<SyncResult> {
  let supabase: ReturnType<typeof createBrowserClient>;
  try {
    supabase = createBrowserClient();
  } catch (err) {
    console.error("[user-engagement-sync] supabase client init failed:", err);
    track("engagement_sync_failed", { stage: "client-init" });
    return { status: "error", reason: "supabase-init-failed" };
  }

  // 1) Read existing row.
  let existing: EngagementRow | null = null;
  try {
    const { data, error } = await supabase
      .from("user_engagement")
      .select("last_session_date, current_streak_days, longest_streak_days, session_count")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.error("[user-engagement-sync] DB select failed:", error);
      track("engagement_sync_failed", { stage: "db-select", code: error.code });
      return { status: "error", reason: "db-select-failed" };
    }
    existing = (data as EngagementRow | null) ?? null;
  } catch (err) {
    console.error("[user-engagement-sync] DB select threw:", err);
    track("engagement_sync_failed", { stage: "db-select-throw" });
    return { status: "error", reason: "db-select-throw" };
  }

  const today = new Date();
  const plan = decideEngagementUpdate({ existing, today });

  // 2) Apply the plan.
  try {
    if (plan.kind === "insert") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("user_engagement") as any).insert({
        user_id: userId,
        last_seen_at: today.toISOString(),
        last_session_date: plan.row.last_session_date,
        current_streak_days: plan.row.current_streak_days,
        longest_streak_days: plan.row.longest_streak_days,
        session_count: plan.row.session_count,
      });
      if (error) {
        console.error("[user-engagement-sync] insert failed:", error);
        track("engagement_sync_failed", { stage: "db-insert", code: error.code });
        return { status: "error", reason: "db-insert-failed" };
      }
      track("engagement_synced", { plan: "insert", streak: plan.row.current_streak_days });
      return { status: "synced", plan: "insert", engagement: plan.row };
    }

    if (plan.kind === "update") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("user_engagement") as any)
        .update({
          last_seen_at: today.toISOString(),
          last_session_date: plan.row.last_session_date,
          current_streak_days: plan.row.current_streak_days,
          longest_streak_days: plan.row.longest_streak_days,
          session_count: plan.row.session_count,
          updated_at: today.toISOString(),
        })
        .eq("user_id", userId);
      if (error) {
        console.error("[user-engagement-sync] update failed:", error);
        track("engagement_sync_failed", { stage: "db-update", code: error.code });
        return { status: "error", reason: "db-update-failed" };
      }
      track("engagement_synced", { plan: "update", streak: plan.row.current_streak_days });
      return { status: "synced", plan: "update", engagement: plan.row };
    }

    // plan.kind === "touch" — just bump last_seen_at, leave streak/count alone
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("user_engagement") as any)
      .update({ last_seen_at: today.toISOString(), updated_at: today.toISOString() })
      .eq("user_id", userId);
    if (error) {
      console.error("[user-engagement-sync] touch failed:", error);
      track("engagement_sync_failed", { stage: "db-touch", code: error.code });
      return { status: "error", reason: "db-touch-failed" };
    }
    // existing is non-null here because plan==="touch" implies an existing row
    track("engagement_synced", { plan: "touch", streak: existing!.current_streak_days });
    return { status: "synced", plan: "touch", engagement: existing! };
  } catch (err) {
    console.error("[user-engagement-sync] write threw:", err);
    track("engagement_sync_failed", { stage: "db-write-throw" });
    return { status: "error", reason: "db-write-throw" };
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test -- src/lib/user-engagement-sync.test.ts`
Expected: all 5 cases PASS.

- [ ] **Step 5: Run full test suite to verify no regression**

Run: `pnpm test`
Expected: full suite passes (existing + new).

- [ ] **Step 6: Commit**

```bash
git add src/lib/user-engagement-sync.ts src/lib/user-engagement-sync.test.ts
git commit -m "feat(engagement): user-engagement-sync helper with streak update"
```

---

## Task 6: Wire engagement sync into app boot

**Files:**
- Modify: `src/app/page.tsx` (add a `useEffect` calling `ensureUserEngagement`)

**Where:** Add immediately after the existing `useEffect` that calls `identify(userId)` (around line 75-78). That keeps engagement tracking next to the identity-tracking that already runs on the same trigger.

- [ ] **Step 1: Add the import**

Near the top of `src/app/page.tsx`, add to imports (after the existing `track, identify` line at line 22):

```tsx
import { ensureUserEngagement } from "@/lib/user-engagement-sync";
```

- [ ] **Step 2: Add the engagement sync useEffect**

In `src/app/page.tsx`, immediately after the existing `useEffect(() => { if (userId && userId !== "anon") identify(userId); }, [userId]);` block (around line 75-78), insert:

```tsx
  useEffect(() => {
    // Track per-user return cadence — feeds the streak chip and D1/D7/D30
    // cohort metrics. Single-flight inside the helper handles StrictMode
    // double-mount.
    if (userId && userId !== "anon") {
      void ensureUserEngagement(userId);
    }
  }, [userId]);
```

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Smoke-test in dev**

Run: `pnpm dev`

In a browser:
1. Open the app at the dev URL (typically `http://localhost:3000`).
2. Open DevTools → Network. Filter for `user_engagement`.
3. Reload. You should see a Supabase REST call to `user_engagement` (a SELECT, then an INSERT for first-time users or UPDATE for returning).
4. In Supabase Studio (or via psql), confirm a row exists in `user_engagement` for the localStorage `punch-doctor-user-id` value (read from `localStorage` in DevTools console).
5. Confirm `current_streak_days = 1`, `session_count = 1` for a fresh user.
6. Reload again same day → row should persist with same `current_streak_days` and `session_count` (the "touch" branch).

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(app): sync user engagement on app boot"
```

---

## Task 7: Streak indicator UI in coach progress

**Files:**
- Modify: `src/components/coach-progress.tsx`

**Decision:** Place the streak chip at the top of the coach-progress view, next to or near the existing stats. Conservative placement — visible but not pushy. We're shipping a passive indicator, not a notification engine.

**Open the file first to find the right insertion point:**

- [ ] **Step 1: Read coach-progress.tsx to identify where stats are rendered**

Run: `grep -n "stats\|return\|Total sessions\|focus" src/components/coach-progress.tsx | head -30`

Find the section that renders the existing stats blocks (sessions, improving areas, etc.). The streak chip goes immediately above those, as a single line.

- [ ] **Step 2: Add Supabase fetch for engagement data**

Locate the data-fetching block in `coach-progress.tsx` (likely a `useEffect` that calls Supabase or a fetch). Add a parallel fetch for engagement data alongside the existing fetches. If the file uses a single `useEffect`, add to it; if it uses multiple, add a new one.

Example pattern (adapt to whatever the file already uses for Supabase reads):

```tsx
const [engagement, setEngagement] = useState<{
  current_streak_days: number;
  longest_streak_days: number;
} | null>(null);

useEffect(() => {
  if (!userId || userId === "anon") return;
  let cancelled = false;
  (async () => {
    const supabase = createBrowserClient();
    const { data } = await supabase
      .from("user_engagement")
      .select("current_streak_days, longest_streak_days")
      .eq("user_id", userId)
      .maybeSingle();
    if (!cancelled && data) {
      setEngagement(data as { current_streak_days: number; longest_streak_days: number });
    }
  })();
  return () => {
    cancelled = true;
  };
}, [userId]);
```

If `createBrowserClient` and `useState` aren't already imported in this file, add the imports.

- [ ] **Step 3: Render the streak chip**

In the JSX of `coach-progress.tsx`, immediately above the existing top-level stats block, render the chip when `engagement` is loaded and the streak is ≥1:

```tsx
{engagement && engagement.current_streak_days >= 1 && (
  <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-orange-500/10 px-3 py-1.5 text-sm">
    <span className="text-orange-400">🔥</span>
    <span className="font-medium text-foreground">
      {engagement.current_streak_days} day streak
    </span>
    {engagement.longest_streak_days > engagement.current_streak_days && (
      <span className="text-xs text-muted">
        · best {engagement.longest_streak_days}
      </span>
    )}
  </div>
)}
```

Adjust class names to match the existing component's design tokens (e.g. `bg-surface-hover` over `bg-orange-500/10` if the rest of the file uses that). The visual goal: a small, single-line chip — **passive**, not loud.

- [ ] **Step 4: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Visual smoke-test**

Run: `pnpm dev`

1. Navigate to the My Coach tab → progress view.
2. Confirm "🔥 1 day streak" chip renders.
3. (Optional, requires DB write access) Manually update the row in `user_engagement` to set `current_streak_days = 5, longest_streak_days = 12` and reload the page. Confirm chip shows "🔥 5 day streak · best 12".
4. (Optional) Set both to 1 and confirm the "best N" suffix is hidden.

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/components/coach-progress.tsx
git commit -m "feat(coach-progress): passive streak chip"
```

---

## Task 8: End-to-end manual QA

**Goal:** Walk the whole flow end to end before marking done. No automated test covers the full Supabase round-trip; this is the human gate.

- [ ] **Step 1: Fresh-user scenario**

1. In a fresh browser profile (or after clearing localStorage), open the app.
2. Confirm a new row appears in `user_engagement` with `current_streak_days = 1, session_count = 1`.
3. Confirm the coach progress streak chip shows "🔥 1 day streak".

- [ ] **Step 2: Same-day return scenario**

1. Reload the app.
2. Confirm `session_count` does NOT increment (still 1) — same-day "touch" branch.
3. Confirm `last_seen_at` updates.
4. Confirm streak chip still shows "🔥 1 day streak".

- [ ] **Step 3: Next-day return scenario (manual DB tweak)**

1. In Supabase Studio (or psql), update the user's row: `last_session_date = '2026-05-06'` (yesterday).
2. Reload the app.
3. Confirm `current_streak_days = 2`, `session_count` incremented.
4. Confirm chip now shows "🔥 2 day streak".

- [ ] **Step 4: Gap scenario (manual DB tweak)**

1. Update row: `last_session_date = '2026-04-01'` (month-old gap).
2. Reload the app.
3. Confirm `current_streak_days = 1` (reset). `longest_streak_days` should preserve the prior best.
4. Confirm chip shows "🔥 1 day streak · best N" where N is preserved best.

- [ ] **Step 5: Clip cap end-to-end**

1. Upload a video that's 25 seconds long.
2. Confirm it now passes (was rejected before this plan).
3. Upload a video that's 41 seconds long.
4. Confirm it's rejected with "Clip must be under 40 seconds. This video is 41s."
5. Confirm the upload UI copy says "Up to 40 seconds".

- [ ] **Step 6: Document outcomes**

Append a brief verification note to the plan file (under a new `## Verification` section) noting which scenarios were tested, the date, and any deviations or surprises.

---

## Self-Review (run after writing the plan, before executing)

### Spec coverage
The idea map (referenced in the spec link above) approved this conservative bundle: **#1 cap fix → 30s** revised by user to **40s** with **middle sampling option** (80 frames @ 2fps) ✅ covered (Tasks 1+2). **#2 retention instrumentation** ✅ covered (Tasks 3-7). The other items in the idea map (#5 compounding clip log MVP, #6 today's drill, #8 yesterday-vs-today, #10 games) are explicitly out of scope per the user's "Plan 1 only (foundation)" decision — they're future plans.

### Placeholder scan
No "TBD"/"TODO"/"add appropriate error handling" left. One area where I let the engineer adapt: in Task 7 step 3, the chip's exact class names should match the file's existing tokens, which I haven't read. That's a tasteful choice, not a placeholder — flagged inline.

### Type consistency
- `EngagementRow` shape (last_session_date, current_streak_days, longest_streak_days, session_count) is consistent across `decideEngagementUpdate`, the test file, and the Supabase select in Task 7.
- `computeStreakUpdate` input/output shape consistent across `streak-math.ts`, its test, and `user-engagement-sync.ts`.
- `ensureUserEngagement` is the public name used in both the helper and `page.tsx`.

---

## Out of scope (explicit non-goals for this plan)

- **D1/D7/D30 cohort dashboard.** Data is being collected but not visualized internally yet. Use Supabase Studio or build a separate admin route later.
- **Per-user timezone for streak math.** v1 uses UTC. Revisit if cohort data shows timezone-edge bugs (unlikely at small scale).
- **Streak Freeze / Insurance mechanic.** Duolingo had to add it after rage-quit churn. We can add it once we have data showing it's needed.
- **Push notifications.** No web push, no email, no nudges in this plan. Streak is passive.
- **Long-clip support beyond 40s.** Chunked multi-pass analysis is out of scope; revisit if data shows users want it.
- **Compounding clip log persistence.** That's Plan 2.
- **Reaction games.** That's Plan 4.

---

## Notes for the executing engineer

- The codebase uses **Vitest**, not Jest. Test commands: `pnpm test` runs the full suite once, `pnpm test:watch` for watch mode, `pnpm test -- <path>` to run a single file.
- The codebase uses the **anonymous localStorage UUID identity model** — never call `auth.getUser()`, never assume Supabase auth. Migration 012 dropped the auth FKs; new tables follow the same pattern.
- The **Supabase client used here is the browser anon-key client** (`createBrowserClient`), not the server-side service-role client. RLS is permissive (`Allow all`) per the post-012 pattern.
- The **`style-profile-sync.ts` file is the canonical reference** for "client-side sync helper with single-flight dedup." Read it if you're unsure about a pattern.
- **Don't `--amend`** if a pre-commit hook fails. Per project CLAUDE.md, pre-commit failures mean the commit didn't happen — fix the issue and create a new commit.
- **Don't use deprecated Next APIs** — per project AGENTS.md, this Next.js version has breaking changes. Read `node_modules/next/dist/docs/` if uncertain about anything App-Router-related.
