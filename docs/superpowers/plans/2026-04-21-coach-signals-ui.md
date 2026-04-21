# Coach Signals UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface three coach-computed signals (Been Avoiding, Drill History, last-worked recency) on the My Progress tab, plus a collapsible Been Avoiding banner on the Log Session chat — all consuming data that migrations 005/006 already populate.

**Architecture:** Two new pure-function lib modules feed a single extended `/api/coach/progress` route. Three new / modified renders on `coach-progress.tsx`. One collapsible banner on `coach-session.tsx` that reuses the extended progress endpoint. No schema changes, no new LLM calls.

**Tech Stack:** Next.js 16 App Router route handler, Supabase (read-only), existing `computeNeglected` helper from `src/lib/neglected-focus-areas.ts`, Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-04-21-coach-signals-ui-design.md`

---

## File Structure

**New files:**
- `src/lib/relative-time.ts` — pure `formatRelativeTime(iso, now?)` helper.
- `src/lib/relative-time.test.ts`
- `src/lib/focus-area-last-worked.ts` — pure `computeLastWorkedMap(focusAreas, sessions)` helper.
- `src/lib/focus-area-last-worked.test.ts`
- `src/app/api/coach/progress/route.test.ts` — integration test covering the extended response shape.

**Modified files:**
- `src/app/api/coach/progress/route.ts` — add drill query + neglected computation + last-worked map.
- `src/components/coach-progress.tsx` — new sections + reuse `relative-time` helper.
- `src/components/coach-session.tsx` — collapsible Been Avoiding banner.

**Untouched:** Style Finder, chat route, clip review, save-session route, all migrations.

---

### Task 1: `relative-time.ts` pure helper + tests (TDD)

**Files:**
- Create: `src/lib/relative-time.ts`
- Test: `src/lib/relative-time.test.ts`

The existing `coach-progress.tsx` has a local `formatRelativeDate(date: Date)` function. We extract a replacement that accepts an ISO string (easier caller contract), accepts an optional `now` for deterministic tests, and returns the same labels. Capitalisation matches the existing usage ("Today", "Yesterday", "N days ago", "N weeks ago", "N months ago", "Over a year ago").

- [ ] **Step 1: Write the failing tests**

Create `src/lib/relative-time.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "./relative-time";

const NOW = new Date("2026-04-21T12:00:00Z");

describe("formatRelativeTime", () => {
  it("returns 'Never' for null", () => {
    expect(formatRelativeTime(null, NOW)).toBe("Never");
  });

  it("returns 'Never' for undefined", () => {
    expect(formatRelativeTime(undefined, NOW)).toBe("Never");
  });

  it("returns 'Today' for same-day timestamps", () => {
    expect(formatRelativeTime("2026-04-21T03:00:00Z", NOW)).toBe("Today");
  });

  it("returns 'Yesterday' for 1 day ago", () => {
    expect(formatRelativeTime("2026-04-20T12:00:00Z", NOW)).toBe("Yesterday");
  });

  it("returns 'N days ago' for 2-6 days", () => {
    expect(formatRelativeTime("2026-04-19T12:00:00Z", NOW)).toBe("2 days ago");
    expect(formatRelativeTime("2026-04-15T12:00:00Z", NOW)).toBe("6 days ago");
  });

  it("returns '1 week ago' for 7 days", () => {
    expect(formatRelativeTime("2026-04-14T12:00:00Z", NOW)).toBe("1 week ago");
  });

  it("returns 'N weeks ago' for 2-4 weeks", () => {
    expect(formatRelativeTime("2026-04-07T12:00:00Z", NOW)).toBe("2 weeks ago");
    expect(formatRelativeTime("2026-03-24T12:00:00Z", NOW)).toBe("4 weeks ago");
  });

  it("returns '1 month ago' for ~30 days", () => {
    expect(formatRelativeTime("2026-03-22T12:00:00Z", NOW)).toBe("1 month ago");
  });

  it("returns 'N months ago' for 2-11 months", () => {
    expect(formatRelativeTime("2026-02-21T12:00:00Z", NOW)).toBe("2 months ago");
    expect(formatRelativeTime("2025-05-21T12:00:00Z", NOW)).toBe("11 months ago");
  });

  it("returns 'Over a year ago' for 12+ months", () => {
    expect(formatRelativeTime("2025-04-20T12:00:00Z", NOW)).toBe("Over a year ago");
    expect(formatRelativeTime("2020-01-01T12:00:00Z", NOW)).toBe("Over a year ago");
  });

  it("returns 'Never' for an invalid date string", () => {
    expect(formatRelativeTime("not-a-date", NOW)).toBe("Never");
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npx vitest run src/lib/relative-time.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/relative-time.ts`:

```ts
/**
 * Format an ISO timestamp as a human-readable relative string.
 * Returns "Never" for null/undefined/invalid input.
 * Labels: "Today", "Yesterday", "N days ago", "N week(s) ago",
 * "N month(s) ago", "Over a year ago".
 */
export function formatRelativeTime(
  iso: string | null | undefined,
  now: Date = new Date()
): string {
  if (!iso) return "Never";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "Never";

  const diffMs = now.getTime() - then.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "1 week ago";
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 60) return "1 month ago";
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return "Over a year ago";
}
```

- [ ] **Step 4: Run tests, confirm they pass**

Run: `npx vitest run src/lib/relative-time.test.ts`
Expected: PASS (11 tests).

Run: `npm run test`
Expected: full suite passes (existing 81 + 11 new = 92 — adjust if baseline differs).

- [ ] **Step 5: Commit**

```bash
git add src/lib/relative-time.ts src/lib/relative-time.test.ts
git commit -m "feat(lib): relative-time formatter with ISO + now override

Pure helper for human-readable relative timestamps. Accepts null/undefined
as 'Never', accepts an override 'now' for deterministic tests.
Labels match the existing coach-progress timeline style."
```

---

### Task 2: `focus-area-last-worked.ts` pure helper + tests (TDD)

**Files:**
- Create: `src/lib/focus-area-last-worked.ts`
- Test: `src/lib/focus-area-last-worked.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/focus-area-last-worked.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeLastWorkedMap } from "./focus-area-last-worked";

describe("computeLastWorkedMap", () => {
  it("returns an empty map when no focus areas", () => {
    expect(computeLastWorkedMap([], [])).toEqual({});
  });

  it("returns null for a focus area that was never worked", () => {
    const focusAreas = [
      { id: "fa1", dimension: "powerMechanics", knowledge_node_slug: "hip-rotation" },
    ];
    const sessions = [
      { created_at: "2026-04-20T12:00:00Z", summary: { focus_areas_worked_keys: ["ringIQ::"] } },
    ];
    expect(computeLastWorkedMap(focusAreas, sessions)).toEqual({ fa1: null });
  });

  it("returns the session timestamp when the focus area was worked once", () => {
    const focusAreas = [
      { id: "fa1", dimension: "powerMechanics", knowledge_node_slug: "hip-rotation" },
    ];
    const sessions = [
      { created_at: "2026-04-20T12:00:00Z", summary: { focus_areas_worked_keys: ["powerMechanics::hip-rotation"] } },
    ];
    expect(computeLastWorkedMap(focusAreas, sessions)).toEqual({ fa1: "2026-04-20T12:00:00Z" });
  });

  it("picks the most recent session when the area was worked multiple times", () => {
    const focusAreas = [
      { id: "fa1", dimension: "powerMechanics", knowledge_node_slug: "hip-rotation" },
    ];
    const sessions = [
      { created_at: "2026-04-20T12:00:00Z", summary: { focus_areas_worked_keys: ["powerMechanics::hip-rotation"] } },
      { created_at: "2026-04-18T12:00:00Z", summary: { focus_areas_worked_keys: ["powerMechanics::hip-rotation"] } },
      { created_at: "2026-04-15T12:00:00Z", summary: { focus_areas_worked_keys: ["powerMechanics::hip-rotation"] } },
    ];
    expect(computeLastWorkedMap(focusAreas, sessions)).toEqual({ fa1: "2026-04-20T12:00:00Z" });
  });

  it("skips legacy sessions that have no focus_areas_worked_keys", () => {
    const focusAreas = [
      { id: "fa1", dimension: "powerMechanics", knowledge_node_slug: "hip-rotation" },
    ];
    const sessions = [
      { created_at: "2026-04-20T12:00:00Z", summary: { breakthroughs: ["yo"] } },
      { created_at: "2026-04-15T12:00:00Z", summary: null },
      { created_at: "2026-04-10T12:00:00Z", summary: { focus_areas_worked_keys: ["powerMechanics::hip-rotation"] } },
    ];
    expect(computeLastWorkedMap(focusAreas, sessions)).toEqual({ fa1: "2026-04-10T12:00:00Z" });
  });

  it("returns null for legacy focus areas where dimension is null", () => {
    const focusAreas = [
      { id: "fa1", dimension: null, knowledge_node_slug: null },
    ];
    const sessions = [
      { created_at: "2026-04-20T12:00:00Z", summary: { focus_areas_worked_keys: ["::"] } },
    ];
    expect(computeLastWorkedMap(focusAreas, sessions)).toEqual({ fa1: null });
  });

  it("handles multiple focus areas and mixes them correctly", () => {
    const focusAreas = [
      { id: "fa1", dimension: "powerMechanics", knowledge_node_slug: "hip-rotation" },
      { id: "fa2", dimension: "defensiveIntegration", knowledge_node_slug: null },
      { id: "fa3", dimension: "ringIQ", knowledge_node_slug: "frame" },
    ];
    const sessions = [
      { created_at: "2026-04-20T12:00:00Z", summary: { focus_areas_worked_keys: ["powerMechanics::hip-rotation"] } },
      { created_at: "2026-04-15T12:00:00Z", summary: { focus_areas_worked_keys: ["defensiveIntegration::"] } },
    ];
    expect(computeLastWorkedMap(focusAreas, sessions)).toEqual({
      fa1: "2026-04-20T12:00:00Z",
      fa2: "2026-04-15T12:00:00Z",
      fa3: null,
    });
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npx vitest run src/lib/focus-area-last-worked.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/focus-area-last-worked.ts`:

```ts
export interface FocusAreaWithKey {
  id: string;
  dimension: string | null;
  knowledge_node_slug: string | null;
}

export interface SessionLite {
  created_at: string;
  summary: { focus_areas_worked_keys?: string[] } | null | undefined;
}

/**
 * For each focus area, return the ISO timestamp of the most recent session
 * whose summary.focus_areas_worked_keys contains the focus area's canonical
 * `dimension::slug` key. Returns null for focus areas that were never worked
 * or that are legacy (dimension === null).
 */
export function computeLastWorkedMap(
  focusAreas: FocusAreaWithKey[],
  sessions: SessionLite[]
): Record<string, string | null> {
  // Build session list sorted newest-first so the first match is the latest.
  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const result: Record<string, string | null> = {};
  for (const area of focusAreas) {
    if (!area.dimension) {
      result[area.id] = null;
      continue;
    }
    const key = `${area.dimension}::${area.knowledge_node_slug ?? ""}`;
    const hit = sortedSessions.find((s) => {
      const keys = s.summary?.focus_areas_worked_keys ?? [];
      return keys.includes(key);
    });
    result[area.id] = hit ? hit.created_at : null;
  }
  return result;
}
```

- [ ] **Step 4: Run tests, confirm they pass**

Run: `npx vitest run src/lib/focus-area-last-worked.test.ts`
Expected: PASS (7 tests).

Run: `npm run test`
Expected: full suite passes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/focus-area-last-worked.ts src/lib/focus-area-last-worked.test.ts
git commit -m "feat(lib): focus-area-last-worked pure derivation

Maps each focus area ID to the ISO timestamp of the most recent session
whose summary.focus_areas_worked_keys includes the area's canonical key.
Legacy (dimension=null) areas always map to null."
```

---

### Task 3: Extend `/api/coach/progress` route with new fields

**Files:**
- Modify: `src/app/api/coach/progress/route.ts`

- [ ] **Step 1: Replace the route**

Replace the entire contents of `src/app/api/coach/progress/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { computeNeglected } from "@/lib/neglected-focus-areas";
import { computeLastWorkedMap } from "@/lib/focus-area-last-worked";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServerClient() as any;

  const [sessionsRes, focusRes, statsRes, drillsRes] = await Promise.all([
    supabase
      .from("training_sessions")
      .select("id, session_type, rounds, summary, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("focus_areas")
      .select("id, name, description, status, history, dimension, knowledge_node_slug, created_at, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("training_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("drill_prescriptions")
      .select("id, drill_name, details, followed_up, followed_up_at, followed_up_session_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  const focusAreas = focusRes.data ?? [];
  const recentSessions = sessionsRes.data ?? [];
  const allDrills = drillsRes.data ?? [];

  const improvingCount = focusAreas.filter((f: { status: string }) => f.status === "improving").length;
  const activeCount = focusAreas.filter((f: { status: string }) => ["new", "active"].includes(f.status)).length;

  // Neglected: canonical-key comparison via existing helper (uses last 3 sessions only).
  const neglectedFocusAreas = computeNeglected(
    focusAreas as Parameters<typeof computeNeglected>[0],
    recentSessions.slice(0, 3) as Parameters<typeof computeNeglected>[1]
  );

  // Last-worked: join focus-area canonical keys against all recent sessions' keys.
  const focusAreaLastWorked = computeLastWorkedMap(
    focusAreas as Parameters<typeof computeLastWorkedMap>[0],
    recentSessions as Parameters<typeof computeLastWorkedMap>[1]
  );

  // Split drills into pending vs recently-done.
  const pendingDrills = allDrills.filter((d: { followed_up: boolean }) => !d.followed_up);
  const recentDrills = allDrills
    .filter((d: { followed_up: boolean; followed_up_at: string | null }) => d.followed_up && d.followed_up_at)
    .sort(
      (a: { followed_up_at: string }, b: { followed_up_at: string }) =>
        new Date(b.followed_up_at).getTime() - new Date(a.followed_up_at).getTime()
    )
    .slice(0, 10);

  return NextResponse.json({
    stats: {
      totalSessions: statsRes.count ?? 0,
      areasImproving: improvingCount,
      activeFocusAreas: activeCount,
    },
    focusAreas,
    recentSessions,
    neglectedFocusAreas,
    drillPrescriptions: {
      pending: pendingDrills,
      recent: recentDrills,
    },
    focusAreaLastWorked,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: clean.

Run: `npm run test`
Expected: full suite still passes.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/coach/progress/route.ts
git commit -m "feat(coach): extend progress route with neglected/drills/last-worked

Adds four new response fields:
- neglectedFocusAreas: string[] (via computeNeglected, last 3 sessions)
- drillPrescriptions.pending: pending drill_prescriptions
- drillPrescriptions.recent: up to 10 drills followed_up=true, newest first
- focusAreaLastWorked: Record<focusAreaId, ISO|null> via computeLastWorkedMap"
```

---

### Task 4: API integration test for the extended progress route

**Files:**
- Create: `src/app/api/coach/progress/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/coach/progress/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createServerClient: () => ({ from: mockFrom }),
}));

async function callGet(userId: string) {
  const { GET } = await import("./route");
  const url = `http://test/api/coach/progress?userId=${userId}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return GET({ nextUrl: new URL(url) } as any);
}

// Helper: make a chainable mock for one .from(...) call.
function chain(resolveValue: unknown) {
  const p = Promise.resolve(resolveValue);
  const obj: Record<string, unknown> = {
    select: () => obj,
    eq: () => obj,
    order: () => obj,
    limit: () => obj,
    then: (fn: (v: unknown) => unknown) => p.then(fn),
  };
  return obj;
}

describe("GET /api/coach/progress — extended response", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns neglectedFocusAreas, drillPrescriptions, and focusAreaLastWorked", async () => {
    // training_sessions (limit 20)
    const sessions = [
      { id: "s1", session_type: "bag_work", rounds: 3, summary: { focus_areas_worked_keys: ["powerMechanics::hip-rotation"] }, created_at: "2026-04-20T12:00:00Z" },
      { id: "s2", session_type: "bag_work", rounds: 3, summary: { focus_areas_worked_keys: ["defensiveIntegration::"] }, created_at: "2026-04-18T12:00:00Z" },
      { id: "s3", session_type: "drills", rounds: 4, summary: { focus_areas_worked_keys: ["powerMechanics::hip-rotation"] }, created_at: "2026-04-10T12:00:00Z" },
    ];
    // focus_areas
    const focusAreas = [
      { id: "fa1", name: "Hip rotation", description: null, status: "active", history: [], dimension: "powerMechanics", knowledge_node_slug: "hip-rotation", created_at: "x", updated_at: "x" },
      { id: "fa2", name: "Defensive Integration", description: null, status: "active", history: [], dimension: "defensiveIntegration", knowledge_node_slug: null, created_at: "x", updated_at: "x" },
      { id: "fa3", name: "Ring IQ", description: null, status: "active", history: [], dimension: "ringIQ", knowledge_node_slug: null, created_at: "x", updated_at: "x" },
    ];
    // drill_prescriptions (pending + followed_up)
    const drills = [
      { id: "d1", drill_name: "Hip Rotation Drill", details: null, followed_up: false, followed_up_at: null, followed_up_session_id: null, created_at: "2026-04-19T12:00:00Z" },
      { id: "d2", drill_name: "Cross Body Chains", details: null, followed_up: true, followed_up_at: "2026-04-18T12:00:00Z", followed_up_session_id: "s2", created_at: "2026-04-10T12:00:00Z" },
      { id: "d3", drill_name: "Old Done Drill", details: null, followed_up: true, followed_up_at: "2026-04-05T12:00:00Z", followed_up_session_id: "sold", created_at: "2026-04-01T12:00:00Z" },
    ];
    // stats (count query, head: true)
    const statsCount = { data: null, count: 3 };

    // Four .from(...) calls in order: training_sessions (limit 20), focus_areas, training_sessions (count head), drill_prescriptions.
    mockFrom
      .mockReturnValueOnce(chain({ data: sessions, error: null }))
      .mockReturnValueOnce(chain({ data: focusAreas, error: null }))
      .mockReturnValueOnce(chain(statsCount))
      .mockReturnValueOnce(chain({ data: drills, error: null }));

    const res = await callGet("u1");
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.stats.totalSessions).toBe(3);
    expect(body.stats.activeFocusAreas).toBe(3);
    expect(body.focusAreas).toHaveLength(3);
    expect(body.recentSessions).toHaveLength(3);

    // neglected: fa3 (ringIQ) never worked in last 3 sessions
    expect(body.neglectedFocusAreas).toContain("Ring IQ");
    expect(body.neglectedFocusAreas).not.toContain("Hip rotation");
    expect(body.neglectedFocusAreas).not.toContain("Defensive Integration");

    // drillPrescriptions
    expect(body.drillPrescriptions.pending.map((d: { id: string }) => d.id)).toEqual(["d1"]);
    expect(body.drillPrescriptions.recent.map((d: { id: string }) => d.id)).toEqual(["d2", "d3"]);

    // focusAreaLastWorked
    expect(body.focusAreaLastWorked.fa1).toBe("2026-04-20T12:00:00Z");
    expect(body.focusAreaLastWorked.fa2).toBe("2026-04-18T12:00:00Z");
    expect(body.focusAreaLastWorked.fa3).toBeNull();
  });

  it("handles a user with no data — returns empty arrays + empty map", async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: [], error: null }))
      .mockReturnValueOnce(chain({ data: [], error: null }))
      .mockReturnValueOnce(chain({ data: null, count: 0 }))
      .mockReturnValueOnce(chain({ data: [], error: null }));

    const res = await callGet("u2");
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.stats.totalSessions).toBe(0);
    expect(body.neglectedFocusAreas).toEqual([]);
    expect(body.drillPrescriptions.pending).toEqual([]);
    expect(body.drillPrescriptions.recent).toEqual([]);
    expect(body.focusAreaLastWorked).toEqual({});
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/app/api/coach/progress/route.test.ts`
Expected: PASS (2 tests). If chain-mocking needs tuning, adjust — Supabase's chain API is query-builder-style and the shared `chain()` helper mimics all four queries.

Run: `npm run test`
Expected: full suite passes.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/coach/progress/route.test.ts
git commit -m "test(coach): integration tests for extended progress route

Mocks Supabase chain and verifies neglectedFocusAreas, drillPrescriptions
split pending/recent, and focusAreaLastWorked map. Covers populated-user
and empty-user paths."
```

---

### Task 5: Refactor `coach-progress.tsx` to share `relative-time` + add last-worked to focus areas

**Files:**
- Modify: `src/components/coach-progress.tsx`

Two changes in one commit: (a) replace the local `formatRelativeDate` with `formatRelativeTime` from Task 1, (b) render `focusAreaLastWorked` on each focus area row.

- [ ] **Step 1: Replace imports and local helper**

At the top of `src/components/coach-progress.tsx`, add the import (next to `lucide-react`):

```ts
import { formatRelativeTime } from "@/lib/relative-time";
```

Delete the local `formatRelativeDate` function (lines ~184-194 of the current file). In the Recent Sessions section where `const label = formatRelativeDate(date);` used to appear, change that line to:

```ts
const label = formatRelativeTime(s.created_at);
```

The label was previously `formatRelativeDate(new Date(s.created_at))`; `formatRelativeTime` accepts ISO directly so we drop the `Date` wrapper.

- [ ] **Step 2: Extend ProgressData + FocusArea types**

Replace the local `FocusArea` and `ProgressData` interfaces with these. The new fields are optional so the component doesn't crash against pre-extension responses (defensive; the route was updated in Task 3 but this gives a safety margin during rollout):

```ts
interface FocusArea {
  id: string;
  name: string;
  description: string | null;
  status: string;
  history: { date: string; note: string }[];
  created_at: string;
  dimension?: string | null;
  knowledge_node_slug?: string | null;
}

interface DrillPrescription {
  id: string;
  drill_name: string;
  details: string | null;
  followed_up: boolean;
  followed_up_at: string | null;
  followed_up_session_id: string | null;
  created_at: string;
}

interface ProgressData {
  stats: { totalSessions: number; areasImproving: number; activeFocusAreas: number };
  focusAreas: FocusArea[];
  recentSessions: SessionSummary[];
  neglectedFocusAreas?: string[];
  drillPrescriptions?: { pending: DrillPrescription[]; recent: DrillPrescription[] };
  focusAreaLastWorked?: Record<string, string | null>;
}
```

- [ ] **Step 3: Add last-worked line to each focus area row**

Inside the Focus Areas section render, find the `<div key={fa.id} ...>` block (lines ~118-135). Add a new inline element just below the status chip and above the progress bar. Replace the inside of the card with:

```tsx
                  <div key={fa.id} className="rounded-xl bg-surface-hover p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{fa.name}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}>
                        {fa.status}
                      </span>
                    </div>
                    {fa.description && (
                      <p className="text-xs text-muted leading-relaxed mb-2">{fa.description}</p>
                    )}
                    <p className="text-xs text-muted mb-3">
                      Last worked: {formatRelativeTime(data.focusAreaLastWorked?.[fa.id] ?? null)}
                    </p>
                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${statusBarColor[fa.status] ?? "bg-blue-500"}`}
                        style={{ width: statusBarWidth[fa.status] ?? "15%" }}
                      />
                    </div>
                  </div>
```

- [ ] **Step 4: Typecheck + tests**

Run: `npm run build` — clean.
Run: `npm run test` — full suite passes.

- [ ] **Step 5: Commit**

```bash
git add src/components/coach-progress.tsx
git commit -m "feat(coach-progress): share relative-time helper + show last-worked

Replaces the local formatRelativeDate with the shared formatRelativeTime
from src/lib/relative-time.ts, and adds a 'Last worked: ...' line on each
Focus Area card driven by focusAreaLastWorked from the extended progress
route."
```

---

### Task 6: Add "Been Avoiding" panel to `coach-progress.tsx`

**Files:**
- Modify: `src/components/coach-progress.tsx`

- [ ] **Step 1: Add AlertTriangle to imports**

In the `lucide-react` import at the top of `src/components/coach-progress.tsx`, add `AlertTriangle`:

```ts
import { Loader2, TrendingUp, Target, Calendar, AlertTriangle } from "lucide-react";
```

- [ ] **Step 2: Insert the Been Avoiding section**

In the render, add this block AFTER the stats-bar `<div>` and BEFORE the Focus Areas section:

```tsx
      {/* Been Avoiding */}
      {(data.neglectedFocusAreas?.length ?? 0) > 0 && (
        <div>
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-red-400">
            <AlertTriangle size={14} /> Been Avoiding
          </h3>
          <p className="mb-3 text-xs text-muted">
            Focus areas not touched in your last 3 sessions.
          </p>
          <div className="flex flex-wrap gap-2">
            {data.neglectedFocusAreas!.map((name) => (
              <span
                key={name}
                className="inline-block rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-300"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}
```

- [ ] **Step 3: Typecheck + tests**

Run: `npm run build` — clean.
Run: `npm run test` — full suite passes.

- [ ] **Step 4: Commit**

```bash
git add src/components/coach-progress.tsx
git commit -m "feat(coach-progress): render Been Avoiding panel

New section between stats and focus areas. Red chip list of focus areas
that haven't been touched in the last 3 sessions. Section hidden entirely
when no neglected areas."
```

---

### Task 7: Add "Drill History" panel to `coach-progress.tsx`

**Files:**
- Modify: `src/components/coach-progress.tsx`

- [ ] **Step 1: Insert the Drill History section**

In the render, add this block AFTER the Focus Areas section and BEFORE the Recent Sessions section:

```tsx
      {/* Drill History */}
      {((data.drillPrescriptions?.pending.length ?? 0) > 0 ||
        (data.drillPrescriptions?.recent.length ?? 0) > 0) && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Target size={14} /> Drill History
          </h3>
          <div className="space-y-4">
            {(data.drillPrescriptions!.pending.length > 0) && (
              <div>
                <p className="mb-2 text-xs font-semibold text-muted uppercase">
                  Pending ({data.drillPrescriptions!.pending.length})
                </p>
                <div className="space-y-2">
                  {data.drillPrescriptions!.pending.map((d) => (
                    <div key={d.id} className="rounded-xl bg-surface-hover p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{d.drill_name}</span>
                        <span className="text-xs text-muted">
                          Prescribed {formatRelativeTime(d.created_at).toLowerCase()}
                        </span>
                      </div>
                      {d.details && <p className="mt-1 text-xs text-muted">{d.details}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(data.drillPrescriptions!.recent.length > 0) && (
              <div>
                <p className="mb-2 text-xs font-semibold text-muted uppercase">
                  Recently Done ({data.drillPrescriptions!.recent.length})
                </p>
                <div className="space-y-2">
                  {data.drillPrescriptions!.recent.map((d) => (
                    <div key={d.id} className="rounded-xl bg-surface-hover p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{d.drill_name}</span>
                        <span className="text-xs text-green-400">
                          Done {formatRelativeTime(d.followed_up_at).toLowerCase()}
                        </span>
                      </div>
                      {d.details && <p className="mt-1 text-xs text-muted">{d.details}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 2: Typecheck + tests**

Run: `npm run build` — clean.
Run: `npm run test` — full suite passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/coach-progress.tsx
git commit -m "feat(coach-progress): render Drill History panel

Shows pending and recently-done drill prescriptions between focus areas
and recent sessions. Each sub-list omitted when empty; whole section
hidden when both lists empty."
```

---

### Task 8: Add collapsible Been Avoiding banner to `coach-session.tsx`

**Files:**
- Modify: `src/components/coach-session.tsx`

- [ ] **Step 1: Add imports + state**

At the top of `src/components/coach-session.tsx`, add `AlertTriangle`, `X`, `ChevronDown` to the existing `lucide-react` import:

```ts
import { Send, Loader2, CheckCircle, AlertTriangle, X, ChevronDown } from "lucide-react";
```

Inside the `CoachSession` function, alongside the existing `useState` hooks, add:

```ts
  const [neglected, setNeglected] = useState<string[]>([]);
  const [bannerCollapsed, setBannerCollapsed] = useState<boolean>(false);
```

- [ ] **Step 2: Fetch neglected on mount + restore collapsed flag**

Add a new `useEffect` immediately after the existing "scroll to bottom" effect (around line 26-28). This mount-time effect pulls the neglected list from the progress route and reads the persisted collapse flag:

```ts
  useEffect(() => {
    // Read persisted collapse flag (safe defaults on any failure).
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem("coach-avoiding-banner-collapsed");
        setBannerCollapsed(saved === "true");
      } catch {
        // ignore
      }
    }
    // Fetch neglected focus areas — silently skip banner if this fails.
    fetch(`/api/coach/progress?userId=${encodeURIComponent(userId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { neglectedFocusAreas?: string[] } | null) => {
        if (data && Array.isArray(data.neglectedFocusAreas)) {
          setNeglected(data.neglectedFocusAreas);
        }
      })
      .catch(() => {
        // Banner just doesn't render; don't block chat.
      });
  }, [userId]);
```

- [ ] **Step 3: Add toggle helpers**

Inside the component body, next to `handleSend` / `handleFinish`, add:

```ts
  const collapseBanner = useCallback(() => {
    setBannerCollapsed(true);
    try {
      window.localStorage.setItem("coach-avoiding-banner-collapsed", "true");
    } catch {
      // ignore
    }
  }, []);

  const expandBanner = useCallback(() => {
    setBannerCollapsed(false);
    try {
      window.localStorage.setItem("coach-avoiding-banner-collapsed", "false");
    } catch {
      // ignore
    }
  }, []);
```

- [ ] **Step 4: Render the banner at the top of the chat scroll area**

In the `saved`-branch-less `return (...)` at the bottom of the component, find the `<div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">` (the chat scroll area) and insert this block as its FIRST child, BEFORE `{messages.map(...)}`:

```tsx
        {neglected.length > 0 && !bannerCollapsed && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-400 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-red-300">Coach flagged: you've been avoiding</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {neglected.map((name) => (
                    <span
                      key={name}
                      className="inline-block rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-300"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={collapseBanner}
                aria-label="Dismiss"
                className="flex-shrink-0 rounded-md p-1 text-red-400 hover:bg-red-500/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        {neglected.length > 0 && bannerCollapsed && (
          <button
            onClick={expandBanner}
            className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            Show avoidance list ({neglected.length})
          </button>
        )}
```

- [ ] **Step 5: Typecheck + tests**

Run: `npm run build` — clean.
Run: `npm run test` — full suite passes.

- [ ] **Step 6: Commit**

```bash
git add src/components/coach-session.tsx
git commit -m "feat(coach-session): collapsible Been Avoiding banner

Fetches neglected focus areas from /api/coach/progress on mount and
renders a red-tinted banner above the message list. User can collapse
with the X button; collapsed state persists via localStorage under
coach-avoiding-banner-collapsed. A 'Show avoidance list' button
restores the banner."
```

---

### Task 9: Manual Playwright smoke

**Files:** none modified — verification only.

- [ ] **Step 1: Start the dev server**

From the worktree:
```bash
PORT=3004 npm run dev > /tmp/signals-ui-dev.log 2>&1 &
sleep 10
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3004
```
Expected: HTTP 200.

Ensure `.env.local` is present in the worktree (copy from main if missing). Any Supabase-dependent API will 500 otherwise.

- [ ] **Step 2: Seed a test user via Supabase MCP**

```sql
-- Clean prior test data
DELETE FROM drill_prescriptions WHERE user_id = '44444444-4444-4444-4444-444444444444';
DELETE FROM training_sessions WHERE user_id = '44444444-4444-4444-4444-444444444444';
DELETE FROM focus_areas WHERE user_id = '44444444-4444-4444-4444-444444444444';
DELETE FROM user_profiles WHERE id = '44444444-4444-4444-4444-444444444444';

INSERT INTO user_profiles (id, tendencies, skill_levels, onboarding_complete)
VALUES ('44444444-4444-4444-4444-444444444444', '{}'::jsonb, '{}'::jsonb, true);

INSERT INTO focus_areas (user_id, name, dimension, knowledge_node_slug, status, description, source, history)
VALUES
  ('44444444-4444-4444-4444-444444444444', 'Hip rotation', 'powerMechanics', 'hip-rotation', 'active', 'Been working it', 'session_extraction', '[]'::jsonb),
  ('44444444-4444-4444-4444-444444444444', 'Head movement', 'defensiveIntegration', NULL, 'active', 'Stale', 'session_extraction', '[]'::jsonb);

INSERT INTO training_sessions (user_id, session_type, summary, prescriptions_given, created_at)
VALUES
  ('44444444-4444-4444-4444-444444444444', 'bag_work',
   '{"breakthroughs":["felt tight jab"],"struggles":[],"focus_areas_worked":["Hip rotation"],"focus_areas_worked_keys":["powerMechanics::hip-rotation"],"drills_done":[]}'::jsonb,
   '[]'::jsonb,
   now() - interval '1 day');

INSERT INTO drill_prescriptions (user_id, drill_name, details, followed_up, created_at)
VALUES
  ('44444444-4444-4444-4444-444444444444', 'Hip rotation drill', '3x10', false, now() - interval '2 days');

INSERT INTO drill_prescriptions (user_id, drill_name, details, followed_up, followed_up_at, followed_up_session_id, created_at)
VALUES
  ('44444444-4444-4444-4444-444444444444', 'Barbell punch', '3x8', true, now() - interval '1 day',
   (SELECT id FROM training_sessions WHERE user_id = '44444444-4444-4444-4444-444444444444' LIMIT 1),
   now() - interval '3 days');

SELECT 'seeded' AS status;
```

- [ ] **Step 3: Playwright smoke — My Progress tab**

In a browser, set localStorage:
```js
localStorage.setItem("punch-doctor-user-id", "44444444-4444-4444-4444-444444444444");
```

Navigate to `/`. Click My Coach → My Progress. Assert:
- Stats bar: Sessions = 1, Improving = 0, Active focus = 2.
- "Been Avoiding" section visible with "Head movement" chip (hip rotation was worked in last session).
- "Focus Areas" section: two cards. Hip rotation shows "Last worked: Yesterday". Head movement shows "Last worked: Never".
- "Drill History" section: Pending (1) shows "Hip rotation drill — Prescribed 2 days ago". Recently Done (1) shows "Barbell punch — Done yesterday".
- "Recent Sessions" section: one entry.

- [ ] **Step 4: Playwright smoke — Log Session tab banner**

Click "Log Session". Wait for the init message to stream. Assert:
- Red "Coach flagged: you've been avoiding" banner appears above the first message.
- Banner contains "Head movement" chip (hip rotation was worked, so only Head movement should appear).
- Click the X button. Assert the banner disappears and is replaced with a "Show avoidance list (1)" button.
- Reload the page. Assert the banner stays collapsed (shows "Show avoidance list").
- Click "Show avoidance list". Assert the full banner returns.

- [ ] **Step 5: Cleanup**

```sql
DELETE FROM drill_prescriptions WHERE user_id = '44444444-4444-4444-4444-444444444444';
DELETE FROM training_sessions WHERE user_id = '44444444-4444-4444-4444-444444444444';
DELETE FROM focus_areas WHERE user_id = '44444444-4444-4444-4444-444444444444';
DELETE FROM user_profiles WHERE id = '44444444-4444-4444-4444-444444444444';
```

Kill the dev server, remove any temporary files (`.env.local` if copied, vault symlink if created).

- [ ] **Step 6: No commit — this is verification only.**

---

## Self-Review Checklist

**Spec coverage:**
- Progress route extension (neglected + drills + last-worked): Task 3 ✓
- `formatRelativeTime` helper: Task 1 ✓
- `computeLastWorkedMap` helper: Task 2 ✓
- Been Avoiding panel on My Progress: Task 6 ✓
- Focus Areas with last-worked timestamp: Task 5 ✓
- Drill History panel: Task 7 ✓
- Collapsible banner on Log Session: Task 8 ✓
- API integration test: Task 4 ✓
- Manual smoke: Task 9 ✓

**Placeholder scan:** searched for TBD/TODO — none.

**Type consistency:**
- `FocusArea` in `coach-progress.tsx` Task 5 extends with optional `dimension` + `knowledge_node_slug` — matches what `computeLastWorkedMap`'s `FocusAreaWithKey` type requires.
- `DrillPrescription` in Task 5 shape matches what the API returns in Task 3.
- `ProgressData.neglectedFocusAreas`, `drillPrescriptions`, `focusAreaLastWorked` all match Task 3's response shape.
- `localStorage` key `coach-avoiding-banner-collapsed` used identically in Task 8 read/write paths.
