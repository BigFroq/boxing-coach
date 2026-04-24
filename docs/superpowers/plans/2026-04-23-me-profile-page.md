# /me Profile Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/me` — a personal profile page that rolls up identity, Style Finder results, and My Coach activity, with a small editable surface for self-reported training context and notes. Entry is a header avatar button.

**Architecture:** Extend the existing `user_profiles` table with scalar columns (no new table). A pure aggregator function assembles the response from `user_profiles` + `style_profiles` + `focus_areas` + `drill_prescriptions` + `training_sessions`. A thin Next.js route handler wraps the aggregator (GET) and a zod-validated patch normalizer (PATCH). `/me` is a client component composed of small single-responsibility section components with debounced autosave.

**Tech Stack:** Next.js 16.2.3 (App Router), React 19, Supabase (service-role from server), Tailwind v4, zod for validation, lucide-react icons, Vitest for unit tests (Node env), Playwright for e2e (desktop + mobile-safari projects), PostHog via `src/lib/analytics`.

**Spec:** [docs/superpowers/specs/2026-04-23-me-profile-page-design.md](docs/superpowers/specs/2026-04-23-me-profile-page-design.md)

---

## File layout

```
src/
  app/
    me/
      page.tsx                          # Task 9 — client route
    api/
      profile/
        route.ts                        # Task 5 — GET + PATCH
    page.tsx                            # Task 10 — add avatar button + ?tab= handling
  components/
    profile/
      profile-view.tsx                  # Task 9 — root; owns payload + autosave
      identity-card.tsx                 # Task 7 — name + email
      style-snapshot.tsx                # Task 7 — read-only from style_profiles
      coach-snapshot.tsx                # Task 8 — read-only from coach tables
      training-context-form.tsx         # Task 8 — gym/trainer/started/goals
      notes-form.tsx                    # Task 8 — free-form textarea
      saved-indicator.tsx               # Task 7 — shared tiny "Saved" ping
  lib/
    profile-types.ts                    # Task 2 — shared TS types
    profile-aggregator.ts               # Task 3 — pure ProfileResponse builder
    profile-aggregator.test.ts          # Task 3
    profile-patch.ts                    # Task 4 — zod + normalizeProfilePatch
    profile-patch.test.ts               # Task 4
    profile-client.ts                   # Task 6 — typed fetch wrapper for the browser
    profile-initials.ts                 # Task 7 — shared initials helper
    profile-initials.test.ts            # Task 7
supabase/
  migrations/
    009_profile_fields.sql              # Task 1
tests/
  e2e/
    profile.spec.ts                     # Task 11 — Playwright smoke
```

Each component receives its slice as props plus a single `onSave(field, value)` callback, so every file stays under ~150 lines.

---

## Task 1: Migration 009 — profile columns

**Files:**
- Create: `supabase/migrations/009_profile_fields.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/009_profile_fields.sql`:

```sql
-- 009_profile_fields.sql
-- Extend user_profiles with scalar fields surfaced on /me.

ALTER TABLE user_profiles
  ADD COLUMN email text,
  ADD COLUMN gym text,
  ADD COLUMN trainer text,
  ADD COLUMN started_boxing_at date,
  ADD COLUMN goals text,
  ADD COLUMN notes text;
```

No new indexes (lookups are by `id` primary key). No new RLS (existing `"Allow all on user_profiles"` from [003_coach_tables.sql](supabase/migrations/003_coach_tables.sql) matches the anon-first posture).

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/009_profile_fields.sql
git commit -m "feat(db): migration 009 — profile scalar fields on user_profiles"
```

---

## Task 2: Shared TypeScript types

**Files:**
- Create: `src/lib/profile-types.ts`

- [ ] **Step 1: Write the types file**

Create `src/lib/profile-types.ts`:

```ts
/**
 * Types shared between the /api/profile server handlers and the /me client.
 * Keeping them in one place prevents server/client drift.
 */

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

export type ProfileIdentity = {
  display_name: string | null;
  email: string | null;
};

export type ProfileTrainingContext = {
  gym: string | null;
  trainer: string | null;
  /** ISO date string (YYYY-MM-DD); month inputs land here as YYYY-MM-01. */
  started_boxing_at: string | null;
  goals: string | null;
};

export type ProfileStyleSnapshot = {
  style_name: string;
  description: string;
  stance: string;
  experience_level: ExperienceLevel;
  height: string;
  reach: string;
  build: string;
  top_fighters: Array<{ slug: string; name: string; match_pct: number }>;
  /** ID of the style_profiles row — lets the client deep-link to /profile/[id]. */
  profile_id: string;
};

export type ProfileCoachSnapshot = {
  last_session_at: string | null;
  last_session_type: string | null;
  active_focus_areas: Array<{ id: string; name: string; status: string }>;
  active_focus_areas_total: number;
  recent_drills: Array<{
    id: string;
    drill_name: string;
    followed_up: boolean;
    created_at: string;
  }>;
};

export type ProfileResponse = {
  identity: ProfileIdentity;
  training_context: ProfileTrainingContext;
  notes: string | null;
  style_snapshot: ProfileStyleSnapshot | null;
  coach_snapshot: ProfileCoachSnapshot | null;
};

export type ProfilePatch = {
  userId: string;
  display_name?: string | null;
  email?: string | null;
  gym?: string | null;
  trainer?: string | null;
  started_boxing_at?: string | null;
  goals?: string | null;
  notes?: string | null;
};

/** Field keys that are user-editable on /me. Used for analytics events. */
export type EditableProfileField =
  | "display_name"
  | "email"
  | "gym"
  | "trainer"
  | "started_boxing_at"
  | "goals"
  | "notes";
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors (new file has no runtime deps).

- [ ] **Step 3: Commit**

```bash
git add src/lib/profile-types.ts
git commit -m "feat(profile): shared types for ProfileResponse/ProfilePatch"
```

---

## Task 3: Aggregator (pure function, TDD)

**Files:**
- Create: `src/lib/profile-aggregator.test.ts`
- Create: `src/lib/profile-aggregator.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/profile-aggregator.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildProfileResponse, type AggregatorInput } from "./profile-aggregator";

function emptyInput(): AggregatorInput {
  return {
    userProfile: null,
    currentStyleProfile: null,
    focusAreas: [],
    focusAreasTotal: 0,
    recentDrills: [],
    lastSession: null,
  };
}

describe("buildProfileResponse", () => {
  it("returns skeletal shape when user has no data anywhere", () => {
    const result = buildProfileResponse(emptyInput());

    expect(result.identity).toEqual({ display_name: null, email: null });
    expect(result.training_context).toEqual({
      gym: null,
      trainer: null,
      started_boxing_at: null,
      goals: null,
    });
    expect(result.notes).toBeNull();
    expect(result.style_snapshot).toBeNull();
    expect(result.coach_snapshot).toBeNull();
  });

  it("pulls identity + training context + notes from user_profiles row", () => {
    const result = buildProfileResponse({
      ...emptyInput(),
      userProfile: {
        id: "u1",
        display_name: "Alex",
        email: "alex@example.com",
        gym: "Silverback BC",
        trainer: "Coach Joe",
        started_boxing_at: "2023-06-01",
        goals: "Amateur debut by summer",
        notes: "Left hook has been slow the last two weeks",
      },
    });

    expect(result.identity).toEqual({ display_name: "Alex", email: "alex@example.com" });
    expect(result.training_context).toEqual({
      gym: "Silverback BC",
      trainer: "Coach Joe",
      started_boxing_at: "2023-06-01",
      goals: "Amateur debut by summer",
    });
    expect(result.notes).toBe("Left hook has been slow the last two weeks");
  });

  it("builds style_snapshot from current style profile with first 3 matched fighters", () => {
    const result = buildProfileResponse({
      ...emptyInput(),
      currentStyleProfile: {
        id: "sp1",
        experience_level: "intermediate",
        physical_context: { height: "5'10", build: "athletic", reach: "71in", stance: "orthodox" },
        ai_result: {
          style_name: "Pressure Puncher",
          description: "Cuts distance and lands heavy inside.",
        },
        matched_fighters: [
          { slug: "mike-tyson", name: "Mike Tyson", match_pct: 82 },
          { slug: "gervonta-davis", name: "Gervonta Davis", match_pct: 78 },
          { slug: "ilia-topuria", name: "Ilia Topuria", match_pct: 71 },
          { slug: "alex-pereira", name: "Alex Pereira", match_pct: 68 },
        ],
      },
    });

    expect(result.style_snapshot).not.toBeNull();
    expect(result.style_snapshot!.profile_id).toBe("sp1");
    expect(result.style_snapshot!.style_name).toBe("Pressure Puncher");
    expect(result.style_snapshot!.stance).toBe("orthodox");
    expect(result.style_snapshot!.experience_level).toBe("intermediate");
    expect(result.style_snapshot!.height).toBe("5'10");
    expect(result.style_snapshot!.reach).toBe("71in");
    expect(result.style_snapshot!.build).toBe("athletic");
    expect(result.style_snapshot!.top_fighters).toHaveLength(3);
    expect(result.style_snapshot!.top_fighters[0].slug).toBe("mike-tyson");
    expect(result.style_snapshot!.top_fighters[2].slug).toBe("ilia-topuria");
  });

  it("builds coach_snapshot when focus areas, drills, or a session exist", () => {
    const result = buildProfileResponse({
      ...emptyInput(),
      focusAreas: [
        { id: "f1", name: "Jab recovery", status: "active" },
        { id: "f2", name: "Hip rotation on the hook", status: "improving" },
        { id: "f3", name: "Slipping the counter right", status: "new" },
      ],
      focusAreasTotal: 5,
      recentDrills: [
        { id: "d1", drill_name: "Shadow box 3x3", followed_up: true, created_at: "2026-04-20T10:00:00Z" },
        { id: "d2", drill_name: "Med-ball rotations", followed_up: false, created_at: "2026-04-18T10:00:00Z" },
      ],
      lastSession: {
        id: "s1",
        session_type: "bag_work",
        created_at: "2026-04-21T18:00:00Z",
      },
    });

    expect(result.coach_snapshot).not.toBeNull();
    expect(result.coach_snapshot!.last_session_at).toBe("2026-04-21T18:00:00Z");
    expect(result.coach_snapshot!.last_session_type).toBe("bag_work");
    expect(result.coach_snapshot!.active_focus_areas).toHaveLength(3);
    expect(result.coach_snapshot!.active_focus_areas_total).toBe(5);
    expect(result.coach_snapshot!.recent_drills).toHaveLength(2);
    expect(result.coach_snapshot!.recent_drills[0].drill_name).toBe("Shadow box 3x3");
  });

  it("returns null coach_snapshot when no focus areas, drills, or sessions", () => {
    const result = buildProfileResponse({
      ...emptyInput(),
      userProfile: {
        id: "u1",
        display_name: "Alex",
        email: null,
        gym: null,
        trainer: null,
        started_boxing_at: null,
        goals: null,
        notes: null,
      },
    });

    expect(result.coach_snapshot).toBeNull();
  });

  it("caps active_focus_areas at 3 even when input has more", () => {
    const result = buildProfileResponse({
      ...emptyInput(),
      focusAreas: [
        { id: "f1", name: "A", status: "active" },
        { id: "f2", name: "B", status: "active" },
        { id: "f3", name: "C", status: "active" },
        { id: "f4", name: "D", status: "active" },
      ],
      focusAreasTotal: 4,
    });

    expect(result.coach_snapshot!.active_focus_areas).toHaveLength(3);
    expect(result.coach_snapshot!.active_focus_areas_total).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/profile-aggregator.test.ts`
Expected: FAIL — module "./profile-aggregator" not found.

- [ ] **Step 3: Implement the aggregator**

Create `src/lib/profile-aggregator.ts`:

```ts
import type {
  ProfileResponse,
  ProfileStyleSnapshot,
  ProfileCoachSnapshot,
  ExperienceLevel,
} from "./profile-types";

export type UserProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  gym: string | null;
  trainer: string | null;
  started_boxing_at: string | null;
  goals: string | null;
  notes: string | null;
};

export type StyleProfileRow = {
  id: string;
  experience_level: string | null;
  physical_context: {
    height?: string;
    build?: string;
    reach?: string;
    stance?: string;
  } | null;
  ai_result: {
    style_name?: string;
    description?: string;
  } | null;
  matched_fighters: Array<{
    slug?: string;
    name?: string;
    match_pct?: number;
  }> | null;
};

export type FocusAreaRow = {
  id: string;
  name: string;
  status: string;
};

export type DrillPrescriptionRow = {
  id: string;
  drill_name: string;
  followed_up: boolean;
  created_at: string;
};

export type TrainingSessionRow = {
  id: string;
  session_type: string | null;
  created_at: string;
};

export type AggregatorInput = {
  userProfile: UserProfileRow | null;
  currentStyleProfile: StyleProfileRow | null;
  focusAreas: FocusAreaRow[];
  focusAreasTotal: number;
  recentDrills: DrillPrescriptionRow[];
  lastSession: TrainingSessionRow | null;
};

function toExperienceLevel(v: string | null | undefined): ExperienceLevel {
  if (v === "intermediate" || v === "advanced") return v;
  return "beginner";
}

function buildStyleSnapshot(row: StyleProfileRow | null): ProfileStyleSnapshot | null {
  if (!row) return null;
  const phys = row.physical_context ?? {};
  const ai = row.ai_result ?? {};
  const fighters = (row.matched_fighters ?? [])
    .slice(0, 3)
    .map((f) => ({
      slug: f.slug ?? "",
      name: f.name ?? "",
      match_pct: typeof f.match_pct === "number" ? f.match_pct : 0,
    }));

  return {
    profile_id: row.id,
    style_name: ai.style_name ?? "",
    description: ai.description ?? "",
    stance: phys.stance ?? "",
    experience_level: toExperienceLevel(row.experience_level),
    height: phys.height ?? "",
    reach: phys.reach ?? "",
    build: phys.build ?? "",
    top_fighters: fighters,
  };
}

function buildCoachSnapshot(input: AggregatorInput): ProfileCoachSnapshot | null {
  const hasAny =
    input.focusAreas.length > 0 ||
    input.recentDrills.length > 0 ||
    input.lastSession !== null;
  if (!hasAny) return null;

  return {
    last_session_at: input.lastSession?.created_at ?? null,
    last_session_type: input.lastSession?.session_type ?? null,
    active_focus_areas: input.focusAreas.slice(0, 3).map((f) => ({
      id: f.id,
      name: f.name,
      status: f.status,
    })),
    active_focus_areas_total: input.focusAreasTotal,
    recent_drills: input.recentDrills.slice(0, 3).map((d) => ({
      id: d.id,
      drill_name: d.drill_name,
      followed_up: d.followed_up,
      created_at: d.created_at,
    })),
  };
}

export function buildProfileResponse(input: AggregatorInput): ProfileResponse {
  const up = input.userProfile;

  return {
    identity: {
      display_name: up?.display_name ?? null,
      email: up?.email ?? null,
    },
    training_context: {
      gym: up?.gym ?? null,
      trainer: up?.trainer ?? null,
      started_boxing_at: up?.started_boxing_at ?? null,
      goals: up?.goals ?? null,
    },
    notes: up?.notes ?? null,
    style_snapshot: buildStyleSnapshot(input.currentStyleProfile),
    coach_snapshot: buildCoachSnapshot(input),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/profile-aggregator.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/profile-aggregator.ts src/lib/profile-aggregator.test.ts
git commit -m "feat(profile): pure aggregator builds ProfileResponse from row inputs"
```

---

## Task 4: Patch validation (TDD)

**Files:**
- Create: `src/lib/profile-patch.test.ts`
- Create: `src/lib/profile-patch.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/profile-patch.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeProfilePatch } from "./profile-patch";

describe("normalizeProfilePatch", () => {
  it("requires userId", () => {
    const res = normalizeProfilePatch({});
    expect(res.ok).toBe(false);
  });

  it("accepts a minimal patch with userId only", () => {
    const res = normalizeProfilePatch({ userId: "u1" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.patch).toEqual({});
    }
  });

  it("trims and collapses empty strings to null for text fields", () => {
    const res = normalizeProfilePatch({
      userId: "u1",
      display_name: "  Alex  ",
      gym: "",
      trainer: "   ",
      notes: "",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.patch.display_name).toBe("Alex");
      expect(res.patch.gym).toBeNull();
      expect(res.patch.trainer).toBeNull();
      expect(res.patch.notes).toBeNull();
    }
  });

  it("validates email shape (must contain @)", () => {
    const bad = normalizeProfilePatch({ userId: "u1", email: "not-an-email" });
    expect(bad.ok).toBe(false);

    const good = normalizeProfilePatch({ userId: "u1", email: "  alex@example.com  " });
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.patch.email).toBe("alex@example.com");
  });

  it("allows explicit null for email (clearing)", () => {
    const res = normalizeProfilePatch({ userId: "u1", email: null });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.patch.email).toBeNull();
  });

  it("coerces YYYY-MM to YYYY-MM-01 for started_boxing_at", () => {
    const res = normalizeProfilePatch({ userId: "u1", started_boxing_at: "2023-06" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.patch.started_boxing_at).toBe("2023-06-01");
  });

  it("accepts YYYY-MM-DD for started_boxing_at as-is", () => {
    const res = normalizeProfilePatch({ userId: "u1", started_boxing_at: "2023-06-15" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.patch.started_boxing_at).toBe("2023-06-15");
  });

  it("rejects malformed dates", () => {
    expect(normalizeProfilePatch({ userId: "u1", started_boxing_at: "June 2023" }).ok).toBe(false);
    expect(normalizeProfilePatch({ userId: "u1", started_boxing_at: "2023-13-01" }).ok).toBe(false);
  });

  it("enforces max length on display_name (80), gym/trainer (80), goals (500), notes (4000)", () => {
    expect(normalizeProfilePatch({ userId: "u1", display_name: "x".repeat(81) }).ok).toBe(false);
    expect(normalizeProfilePatch({ userId: "u1", gym: "x".repeat(81) }).ok).toBe(false);
    expect(normalizeProfilePatch({ userId: "u1", trainer: "x".repeat(81) }).ok).toBe(false);
    expect(normalizeProfilePatch({ userId: "u1", goals: "x".repeat(501) }).ok).toBe(false);
    expect(normalizeProfilePatch({ userId: "u1", notes: "x".repeat(4001) }).ok).toBe(false);

    expect(normalizeProfilePatch({ userId: "u1", notes: "x".repeat(4000) }).ok).toBe(true);
  });

  it("does not clobber fields that were not sent in the patch", () => {
    const res = normalizeProfilePatch({ userId: "u1", display_name: "Alex" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.patch).not.toHaveProperty("email");
      expect(res.patch).not.toHaveProperty("notes");
      expect(res.patch).not.toHaveProperty("gym");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/profile-patch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the normalizer**

Create `src/lib/profile-patch.ts`:

```ts
import { z } from "zod";

type NormalizedPatch = {
  display_name?: string | null;
  email?: string | null;
  gym?: string | null;
  trainer?: string | null;
  started_boxing_at?: string | null;
  goals?: string | null;
  notes?: string | null;
};

type NormalizeResult =
  | { ok: true; userId: string; patch: NormalizedPatch }
  | { ok: false; error: string };

// Accepts empty string (to clear) or a real value. We normalize both ways in the transform.
const optionalText = (max: number) =>
  z
    .union([z.string().max(max), z.null()])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (v === null) return null;
      const trimmed = v.trim();
      return trimmed === "" ? null : trimmed;
    });

// YYYY-MM or YYYY-MM-DD; coerced to YYYY-MM-DD.
const dateField = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const trimmed = v.trim();
    if (trimmed === "") return null;

    const monthOnly = /^\d{4}-(0[1-9]|1[0-2])$/.exec(trimmed);
    if (monthOnly) return `${trimmed}-01`;

    const full = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(trimmed);
    if (full) {
      // Parseability check (e.g. reject 2023-02-31).
      const d = new Date(trimmed + "T00:00:00Z");
      if (!Number.isNaN(d.getTime())) return trimmed;
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "started_boxing_at must be YYYY-MM or YYYY-MM-DD",
    });
    return z.NEVER;
  });

const emailField = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const trimmed = v.trim();
    if (trimmed === "") return null;
    if (!trimmed.includes("@") || trimmed.length > 200) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "email must contain @" });
      return z.NEVER;
    }
    return trimmed;
  });

const patchSchema = z.object({
  userId: z.string().min(1).max(80),
  display_name: optionalText(80),
  email: emailField,
  gym: optionalText(80),
  trainer: optionalText(80),
  started_boxing_at: dateField,
  goals: optionalText(500),
  notes: optionalText(4000),
});

export function normalizeProfilePatch(raw: unknown): NormalizeResult {
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid patch" };
  }

  const { userId, ...rest } = parsed.data;
  // Drop undefined keys so partial patches don't clobber omitted columns.
  const patch: NormalizedPatch = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined) (patch as Record<string, unknown>)[k] = v;
  }

  return { ok: true, userId, patch };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/profile-patch.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/profile-patch.ts src/lib/profile-patch.test.ts
git commit -m "feat(profile): zod-validated normalizer for PATCH /api/profile"
```

---

## Task 5: API route — GET + PATCH

**Files:**
- Create: `src/app/api/profile/route.ts`

- [ ] **Step 1: Implement the route**

Create `src/app/api/profile/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { buildProfileResponse } from "@/lib/profile-aggregator";
import { normalizeProfilePatch } from "@/lib/profile-patch";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServerClient() as any;

  const [userProfileRes, styleProfileRes, focusAreasRes, focusAreasCountRes, drillsRes, sessionRes] =
    await Promise.all([
      supabase
        .from("user_profiles")
        .select("id, display_name, email, gym, trainer, started_boxing_at, goals, notes")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("style_profiles")
        .select("id, experience_level, physical_context, ai_result, matched_fighters")
        .eq("user_id", userId)
        .eq("is_current", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("focus_areas")
        .select("id, name, status")
        .eq("user_id", userId)
        .in("status", ["new", "active", "improving"])
        .order("updated_at", { ascending: false })
        .limit(3),
      supabase
        .from("focus_areas")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", ["new", "active", "improving"]),
      supabase
        .from("drill_prescriptions")
        .select("id, drill_name, followed_up, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("training_sessions")
        .select("id, session_type, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const response = buildProfileResponse({
    userProfile: userProfileRes.data ?? null,
    currentStyleProfile: styleProfileRes.data ?? null,
    focusAreas: focusAreasRes.data ?? [],
    focusAreasTotal: focusAreasCountRes.count ?? 0,
    recentDrills: drillsRes.data ?? [],
    lastSession: sessionRes.data ?? null,
  });

  return NextResponse.json(response);
}

export async function PATCH(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = normalizeProfilePatch(raw);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const { userId, patch } = result;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServerClient() as any;

  const { error } = await supabase
    .from("user_profiles")
    .upsert(
      { id: userId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );

  if (error) {
    console.error("Profile upsert failed:", error);
    return NextResponse.json({ error: "Upsert failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify lint passes**

Run: `npm run lint`
Expected: no errors on the new file.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/profile/route.ts
git commit -m "feat(profile): GET + PATCH /api/profile"
```

---

## Task 6: Browser-side profile client

**Files:**
- Create: `src/lib/profile-client.ts`

- [ ] **Step 1: Write the client wrapper**

Create `src/lib/profile-client.ts`:

```ts
"use client";

import type { ProfileResponse, ProfilePatch } from "./profile-types";

export async function fetchProfile(userId: string): Promise<ProfileResponse> {
  const res = await fetch(`/api/profile?userId=${encodeURIComponent(userId)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to load profile (${res.status})`);
  return (await res.json()) as ProfileResponse;
}

export async function saveProfilePatch(patch: ProfilePatch): Promise<void> {
  const res = await fetch("/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Save failed (${res.status})`);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/profile-client.ts
git commit -m "feat(profile): browser fetch wrappers for /api/profile"
```

---

## Task 7: Initials helper + saved indicator + identity card + style snapshot

**Files:**
- Create: `src/lib/profile-initials.ts`
- Create: `src/lib/profile-initials.test.ts`
- Create: `src/components/profile/saved-indicator.tsx`
- Create: `src/components/profile/identity-card.tsx`
- Create: `src/components/profile/style-snapshot.tsx`

- [ ] **Step 1: Write failing test for initials helper**

Create `src/lib/profile-initials.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { initialsFrom } from "./profile-initials";

describe("initialsFrom", () => {
  it("returns empty string for null/undefined/empty", () => {
    expect(initialsFrom(null)).toBe("");
    expect(initialsFrom(undefined)).toBe("");
    expect(initialsFrom("")).toBe("");
    expect(initialsFrom("   ")).toBe("");
  });

  it("returns first letter uppercase for single-word names", () => {
    expect(initialsFrom("alex")).toBe("A");
    expect(initialsFrom("Bob")).toBe("B");
  });

  it("returns first + last initials for multi-word names", () => {
    expect(initialsFrom("Alex Rivera")).toBe("AR");
    expect(initialsFrom("Mary Jane Watson")).toBe("MW");
  });

  it("handles extra whitespace", () => {
    expect(initialsFrom("  Alex   Rivera  ")).toBe("AR");
  });
});
```

Run: `npm test -- src/lib/profile-initials.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement initials helper**

Create `src/lib/profile-initials.ts`:

```ts
export function initialsFrom(name: string | null | undefined): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
```

Run: `npm test -- src/lib/profile-initials.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 3: Create SavedIndicator**

Create `src/components/profile/saved-indicator.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";

/**
 * Tiny "Saved" ping next to a field. Pass `trigger` — bump it (e.g. incrementing
 * a number or setting to Date.now()) to show the indicator for 1.5s.
 */
export function SavedIndicator({ trigger }: { trigger: number | null }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (trigger === null) return;
    setVisible(true);
    const id = setTimeout(() => setVisible(false), 1500);
    return () => clearTimeout(id);
  }, [trigger]);

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs text-muted transition-opacity ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      aria-live="polite"
    >
      <Check size={12} />
      Saved
    </span>
  );
}
```

- [ ] **Step 4: Create IdentityCard**

Create `src/components/profile/identity-card.tsx`:

```tsx
"use client";

import { User } from "lucide-react";
import { SavedIndicator } from "./saved-indicator";
import { initialsFrom } from "@/lib/profile-initials";
import type { ProfileIdentity, EditableProfileField } from "@/lib/profile-types";

type Props = {
  identity: ProfileIdentity;
  savedField: EditableProfileField | null;
  savedTrigger: number | null;
  onSave: (field: EditableProfileField, value: string) => void;
  errorByField: Partial<Record<EditableProfileField, string>>;
};

export function IdentityCard({ identity, savedField, savedTrigger, onSave, errorByField }: Props) {
  const initials = initialsFrom(identity.display_name);

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent font-semibold text-xl">
          {initials || <User size={24} aria-hidden />}
        </div>
        <div className="flex-1 space-y-3">
          <label className="block">
            <span className="flex items-center gap-2 text-xs text-muted mb-1">
              Name
              {savedField === "display_name" && <SavedIndicator trigger={savedTrigger} />}
            </span>
            <input
              type="text"
              defaultValue={identity.display_name ?? ""}
              maxLength={80}
              placeholder="Your name"
              onBlur={(e) => onSave("display_name", e.target.value)}
              className={`w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-accent ${
                errorByField.display_name ? "border-red-500" : "border-border"
              }`}
            />
            {errorByField.display_name && (
              <span className="text-xs text-red-500">{errorByField.display_name}</span>
            )}
          </label>
          <label className="block">
            <span className="flex items-center gap-2 text-xs text-muted mb-1">
              Email (optional)
              {savedField === "email" && <SavedIndicator trigger={savedTrigger} />}
            </span>
            <input
              type="email"
              defaultValue={identity.email ?? ""}
              maxLength={200}
              placeholder="you@example.com"
              onBlur={(e) => onSave("email", e.target.value)}
              className={`w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-accent ${
                errorByField.email ? "border-red-500" : "border-border"
              }`}
            />
            <span className="mt-1 block text-xs text-muted">
              We&apos;ll use this to recover your profile on another device later — not needed today.
            </span>
            {errorByField.email && (
              <span className="text-xs text-red-500">{errorByField.email}</span>
            )}
          </label>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Create StyleSnapshot**

Create `src/components/profile/style-snapshot.tsx`:

```tsx
"use client";

import Link from "next/link";
import { track } from "@/lib/analytics";
import type { ProfileStyleSnapshot } from "@/lib/profile-types";

function onStyleDeepLinkClick() {
  track("profile_deep_link_clicked", { target: "style" });
}

export function StyleSnapshot({ snapshot }: { snapshot: ProfileStyleSnapshot | null }) {
  if (!snapshot) {
    return (
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold mb-2">Your style</h2>
        <p className="text-sm text-muted mb-3">
          Take the Style Finder quiz to see a snapshot of how you box.
        </p>
        <Link
          href="/?tab=style"
          onClick={onStyleDeepLinkClick}
          className="text-sm text-accent hover:underline underline-offset-2"
        >
          Open Style Finder →
        </Link>
      </section>
    );
  }

  const pills = [
    { label: "stance", value: snapshot.stance },
    { label: "experience", value: snapshot.experience_level },
    { label: "height", value: snapshot.height },
    { label: "reach", value: snapshot.reach },
    { label: "build", value: snapshot.build },
  ].filter((p) => p.value);

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold mb-1">Your style</h2>
      <p className="text-lg font-medium">{snapshot.style_name}</p>
      {snapshot.description && (
        <p className="text-sm text-muted mt-1">{snapshot.description}</p>
      )}

      {pills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {pills.map((p) => (
            <span
              key={p.label}
              className="rounded-full border border-border px-2 py-0.5 text-xs text-muted"
            >
              {p.label}: <span className="text-foreground">{p.value}</span>
            </span>
          ))}
        </div>
      )}

      {snapshot.top_fighters.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-muted mb-1">Top matched fighters</p>
          <div className="flex flex-wrap gap-2">
            {snapshot.top_fighters.map((f) => (
              <span
                key={f.slug}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs"
              >
                {f.name} <span className="text-muted">· {f.match_pct}%</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <Link
          href="/?tab=style"
          onClick={onStyleDeepLinkClick}
          className="text-sm text-accent hover:underline underline-offset-2"
        >
          Update via Style Finder →
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/profile-initials.ts src/lib/profile-initials.test.ts src/components/profile/saved-indicator.tsx src/components/profile/identity-card.tsx src/components/profile/style-snapshot.tsx
git commit -m "feat(profile): initials helper, SavedIndicator, IdentityCard, StyleSnapshot"
```

---

## Task 8: Coach snapshot + training context + notes

**Files:**
- Create: `src/components/profile/coach-snapshot.tsx`
- Create: `src/components/profile/training-context-form.tsx`
- Create: `src/components/profile/notes-form.tsx`

- [ ] **Step 1: Create CoachSnapshot**

Create `src/components/profile/coach-snapshot.tsx`:

```tsx
"use client";

import Link from "next/link";
import { formatRelativeTime } from "@/lib/relative-time";
import { track } from "@/lib/analytics";
import type { ProfileCoachSnapshot } from "@/lib/profile-types";

const STATUS_STYLES: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-400",
  active: "bg-amber-500/10 text-amber-400",
  improving: "bg-emerald-500/10 text-emerald-400",
};

function onCoachDeepLinkClick() {
  track("profile_deep_link_clicked", { target: "coach" });
}

export function CoachSnapshot({ snapshot }: { snapshot: ProfileCoachSnapshot | null }) {
  if (!snapshot) {
    return (
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold mb-2">Your coaching</h2>
        <p className="text-sm text-muted mb-3">
          Log your first session in My Coach to see progress here.
        </p>
        <Link
          href="/?tab=coach"
          onClick={onCoachDeepLinkClick}
          className="text-sm text-accent hover:underline underline-offset-2"
        >
          Open My Coach →
        </Link>
      </section>
    );
  }

  const extraFocusAreas = Math.max(0, snapshot.active_focus_areas_total - snapshot.active_focus_areas.length);

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold mb-3">Your coaching</h2>

      <p className="text-sm text-muted mb-3">
        Last session:{" "}
        <span className="text-foreground">{formatRelativeTime(snapshot.last_session_at)}</span>
        {snapshot.last_session_type && (
          <span className="text-muted"> · {snapshot.last_session_type.replace(/_/g, " ")}</span>
        )}
      </p>

      {snapshot.active_focus_areas.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-muted mb-1">Active focus areas</p>
          <div className="flex flex-wrap gap-2">
            {snapshot.active_focus_areas.map((f) => (
              <span
                key={f.id}
                className={`rounded-md px-2 py-1 text-xs ${STATUS_STYLES[f.status] ?? "bg-muted/10 text-muted"}`}
              >
                {f.name}
              </span>
            ))}
            {extraFocusAreas > 0 && (
              <span className="rounded-md border border-border px-2 py-1 text-xs text-muted">
                +{extraFocusAreas} more
              </span>
            )}
          </div>
        </div>
      )}

      {snapshot.recent_drills.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-muted mb-1">Recent drills</p>
          <ul className="space-y-1 text-sm">
            {snapshot.recent_drills.map((d) => (
              <li key={d.id} className="flex items-center justify-between">
                <span>{d.drill_name}</span>
                <span className="text-xs text-muted">
                  {d.followed_up ? "✓ followed up" : "— not yet"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link
        href="/?tab=coach"
        onClick={onCoachDeepLinkClick}
        className="text-sm text-accent hover:underline underline-offset-2"
      >
        Open My Coach →
      </Link>
    </section>
  );
}
```

- [ ] **Step 2: Create TrainingContextForm**

Create `src/components/profile/training-context-form.tsx`:

```tsx
"use client";

import { SavedIndicator } from "./saved-indicator";
import type { ProfileTrainingContext, EditableProfileField } from "@/lib/profile-types";

type Props = {
  context: ProfileTrainingContext;
  savedField: EditableProfileField | null;
  savedTrigger: number | null;
  onSave: (field: EditableProfileField, value: string) => void;
  errorByField: Partial<Record<EditableProfileField, string>>;
};

/** Convert stored YYYY-MM-DD to the YYYY-MM the <input type="month"> expects. */
function toMonthValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 7);
}

export function TrainingContextForm({
  context,
  savedField,
  savedTrigger,
  onSave,
  errorByField,
}: Props) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold mb-3">Training context</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          field="gym"
          label="Gym"
          value={context.gym}
          onSave={onSave}
          savedField={savedField}
          savedTrigger={savedTrigger}
          errorByField={errorByField}
          maxLength={80}
          placeholder="e.g. Silverback BC"
        />
        <TextField
          field="trainer"
          label="Trainer"
          value={context.trainer}
          onSave={onSave}
          savedField={savedField}
          savedTrigger={savedTrigger}
          errorByField={errorByField}
          maxLength={80}
          placeholder="e.g. Coach Joe"
        />
      </div>

      <label className="mt-3 block">
        <span className="flex items-center gap-2 text-xs text-muted mb-1">
          Started boxing
          {savedField === "started_boxing_at" && <SavedIndicator trigger={savedTrigger} />}
        </span>
        <input
          type="month"
          defaultValue={toMonthValue(context.started_boxing_at)}
          onBlur={(e) => onSave("started_boxing_at", e.target.value)}
          className={`rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-accent ${
            errorByField.started_boxing_at ? "border-red-500" : "border-border"
          }`}
        />
        {errorByField.started_boxing_at && (
          <span className="mt-1 block text-xs text-red-500">{errorByField.started_boxing_at}</span>
        )}
      </label>

      <label className="mt-3 block">
        <span className="flex items-center gap-2 text-xs text-muted mb-1">
          Goals
          {savedField === "goals" && <SavedIndicator trigger={savedTrigger} />}
        </span>
        <textarea
          defaultValue={context.goals ?? ""}
          maxLength={500}
          rows={3}
          placeholder="What are you working toward?"
          onBlur={(e) => onSave("goals", e.target.value)}
          className={`w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-accent ${
            errorByField.goals ? "border-red-500" : "border-border"
          }`}
        />
        {errorByField.goals && (
          <span className="text-xs text-red-500">{errorByField.goals}</span>
        )}
      </label>
    </section>
  );
}

function TextField({
  field,
  label,
  value,
  onSave,
  savedField,
  savedTrigger,
  errorByField,
  maxLength,
  placeholder,
}: {
  field: EditableProfileField;
  label: string;
  value: string | null;
  onSave: (field: EditableProfileField, value: string) => void;
  savedField: EditableProfileField | null;
  savedTrigger: number | null;
  errorByField: Partial<Record<EditableProfileField, string>>;
  maxLength: number;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-2 text-xs text-muted mb-1">
        {label}
        {savedField === field && <SavedIndicator trigger={savedTrigger} />}
      </span>
      <input
        type="text"
        defaultValue={value ?? ""}
        maxLength={maxLength}
        placeholder={placeholder}
        onBlur={(e) => onSave(field, e.target.value)}
        className={`w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-accent ${
          errorByField[field] ? "border-red-500" : "border-border"
        }`}
      />
      {errorByField[field] && (
        <span className="text-xs text-red-500">{errorByField[field]}</span>
      )}
    </label>
  );
}
```

- [ ] **Step 3: Create NotesForm**

Create `src/components/profile/notes-form.tsx`:

```tsx
"use client";

import { SavedIndicator } from "./saved-indicator";
import type { EditableProfileField } from "@/lib/profile-types";

const MAX = 4000;
const WARN_AT = MAX - 200;

type Props = {
  notes: string | null;
  savedField: EditableProfileField | null;
  savedTrigger: number | null;
  onSave: (field: EditableProfileField, value: string) => void;
  errorByField: Partial<Record<EditableProfileField, string>>;
};

export function NotesForm({ notes, savedField, savedTrigger, onSave, errorByField }: Props) {
  const length = (notes ?? "").length;
  const showCounter = length >= WARN_AT;

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <label className="block">
        <span className="flex items-center justify-between text-xs text-muted mb-1">
          <span className="flex items-center gap-2">
            Notes
            {savedField === "notes" && <SavedIndicator trigger={savedTrigger} />}
          </span>
          {showCounter && (
            <span aria-live="polite">
              {length} / {MAX}
            </span>
          )}
        </span>
        <textarea
          defaultValue={notes ?? ""}
          maxLength={MAX}
          rows={6}
          placeholder="Things about how you box — habits, injuries, what you're working on, anything."
          onBlur={(e) => onSave("notes", e.target.value)}
          className={`w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-accent ${
            errorByField.notes ? "border-red-500" : "border-border"
          }`}
        />
        {errorByField.notes && (
          <span className="text-xs text-red-500">{errorByField.notes}</span>
        )}
      </label>
    </section>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/coach-snapshot.tsx src/components/profile/training-context-form.tsx src/components/profile/notes-form.tsx
git commit -m "feat(profile): CoachSnapshot, TrainingContextForm, NotesForm components"
```

---

## Task 9: ProfileView root + /me page

**Files:**
- Create: `src/components/profile/profile-view.tsx`
- Create: `src/app/me/page.tsx`

- [ ] **Step 1: Create ProfileView (orchestrates state + autosave)**

Create `src/components/profile/profile-view.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchProfile, saveProfilePatch } from "@/lib/profile-client";
import { track } from "@/lib/analytics";
import type {
  EditableProfileField,
  ProfileResponse,
} from "@/lib/profile-types";
import { IdentityCard } from "./identity-card";
import { StyleSnapshot } from "./style-snapshot";
import { CoachSnapshot } from "./coach-snapshot";
import { TrainingContextForm } from "./training-context-form";
import { NotesForm } from "./notes-form";

const DISPLAY_NAME_LS_KEY = "punch-doctor-display-name";

type Status = "loading" | "ready" | "error";

export function ProfileView({ userId }: { userId: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [savedField, setSavedField] = useState<EditableProfileField | null>(null);
  const [savedTrigger, setSavedTrigger] = useState<number | null>(null);
  const [errorByField, setErrorByField] = useState<
    Partial<Record<EditableProfileField, string>>
  >({});

  useEffect(() => {
    let cancelled = false;
    fetchProfile(userId)
      .then((res) => {
        if (cancelled) return;
        setProfile(res);
        setStatus("ready");
        track("profile_viewed");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function onSave(field: EditableProfileField, rawValue: string) {
    const current = currentValueFor(profile, field);
    const next = rawValue.trim();
    // Skip no-ops (both empty or identical after trim).
    if ((current ?? "") === next) return;

    try {
      await saveProfilePatch({ userId, [field]: next });
      setErrorByField((prev) => {
        const clone = { ...prev };
        delete clone[field];
        return clone;
      });
      setProfile((prev) => (prev ? applyPatch(prev, field, next) : prev));
      setSavedField(field);
      setSavedTrigger(Date.now());
      track("profile_field_saved", { field });

      if (field === "display_name" && typeof window !== "undefined") {
        if (next === "") window.localStorage.removeItem(DISPLAY_NAME_LS_KEY);
        else window.localStorage.setItem(DISPLAY_NAME_LS_KEY, next);
      }
    } catch (err) {
      setErrorByField((prev) => ({
        ...prev,
        [field]: err instanceof Error ? err.message : "Save failed",
      }));
    }
  }

  if (status === "loading" || !profile) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted">
        Loading your profile…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted">
        Couldn&apos;t load profile. Refresh to try again.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your profile</h1>
        <Link
          href="/"
          className="text-sm text-muted underline-offset-2 hover:text-foreground hover:underline"
        >
          ← Back to the coach
        </Link>
      </div>

      <IdentityCard
        identity={profile.identity}
        savedField={savedField}
        savedTrigger={savedTrigger}
        onSave={onSave}
        errorByField={errorByField}
      />

      <StyleSnapshot snapshot={profile.style_snapshot} />

      <CoachSnapshot snapshot={profile.coach_snapshot} />

      <TrainingContextForm
        context={profile.training_context}
        savedField={savedField}
        savedTrigger={savedTrigger}
        onSave={onSave}
        errorByField={errorByField}
      />

      <NotesForm
        notes={profile.notes}
        savedField={savedField}
        savedTrigger={savedTrigger}
        onSave={onSave}
        errorByField={errorByField}
      />
    </div>
  );
}

function currentValueFor(profile: ProfileResponse | null, field: EditableProfileField): string | null {
  if (!profile) return null;
  switch (field) {
    case "display_name":
      return profile.identity.display_name;
    case "email":
      return profile.identity.email;
    case "gym":
      return profile.training_context.gym;
    case "trainer":
      return profile.training_context.trainer;
    case "started_boxing_at":
      return profile.training_context.started_boxing_at;
    case "goals":
      return profile.training_context.goals;
    case "notes":
      return profile.notes;
  }
}

function applyPatch(
  profile: ProfileResponse,
  field: EditableProfileField,
  value: string
): ProfileResponse {
  const cleaned = value === "" ? null : value;
  const storedDate =
    field === "started_boxing_at" && cleaned && /^\d{4}-\d{2}$/.test(cleaned)
      ? `${cleaned}-01`
      : cleaned;

  switch (field) {
    case "display_name":
      return { ...profile, identity: { ...profile.identity, display_name: cleaned } };
    case "email":
      return { ...profile, identity: { ...profile.identity, email: cleaned } };
    case "gym":
      return { ...profile, training_context: { ...profile.training_context, gym: cleaned } };
    case "trainer":
      return { ...profile, training_context: { ...profile.training_context, trainer: cleaned } };
    case "started_boxing_at":
      return {
        ...profile,
        training_context: { ...profile.training_context, started_boxing_at: storedDate },
      };
    case "goals":
      return { ...profile, training_context: { ...profile.training_context, goals: cleaned } };
    case "notes":
      return { ...profile, notes: cleaned };
  }
}
```

- [ ] **Step 2: Create /me page**

Create `src/app/me/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { ProfileView } from "@/components/profile/profile-view";

const USER_ID_LS_KEY = "punch-doctor-user-id";

function readOrCreateUserId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(USER_ID_LS_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(USER_ID_LS_KEY, id);
  }
  return id;
}

export default function MePage() {
  const [userId, setUserId] = useState<string>("");

  useEffect(() => {
    setUserId(readOrCreateUserId());
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 pt-4 pb-3 sm:px-6">
          <span className="text-xl" role="img" aria-label="Boxing glove">
            🥊
          </span>
          <h1 className="text-lg font-semibold leading-tight">Boxing Coach AI</h1>
        </div>
      </header>
      <main>
        <ErrorBoundary label="Profile">
          {userId && <ProfileView userId={userId} />}
        </ErrorBoundary>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify lint passes**

Run: `npm run lint`
Expected: no errors on new files.

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/profile-view.tsx src/app/me/page.tsx
git commit -m "feat(profile): /me route with ProfileView orchestrator"
```

---

## Task 10: Header avatar button + `?tab=` deep-link support

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add `?tab=` handling and avatar button to the home page**

Open `src/app/page.tsx`. Find the existing `useEffect` that reads `?q=`:

```tsx
  useEffect(() => {
    // Pre-seed from `?q=…` — used by /pd when Alex clicks a seed question. We
    // read/remove the param synchronously so the rest of the app behaves as a
    // fresh cold load, and strip it from the URL so a refresh doesn't re-fire.
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const seed = params.get("q");
    if (seed) {
      setCoachQuery(seed);
      params.delete("q");
      const newUrl = window.location.pathname + (params.toString() ? `?${params}` : "");
      window.history.replaceState(null, "", newUrl);
    }
  }, []);
```

Replace with:

```tsx
  useEffect(() => {
    // Pre-seed from `?q=…` (from /pd) and/or `?tab=…` (from /me deep-links).
    // Both are consumed synchronously and stripped from the URL.
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const seed = params.get("q");
    const tab = params.get("tab");
    let changed = false;
    if (seed) {
      setCoachQuery(seed);
      params.delete("q");
      changed = true;
    }
    if (tab && (tabs as readonly { id: string }[]).some((t) => t.id === tab)) {
      setActiveTab(tab as TabId);
      params.delete("tab");
      changed = true;
    }
    if (changed) {
      const newUrl = window.location.pathname + (params.toString() ? `?${params}` : "");
      window.history.replaceState(null, "", newUrl);
    }
  }, []);
```

- [ ] **Step 2: Add the avatar button next to the About link**

In the same file, locate the header block:

```tsx
      <header className="border-b border-border">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <span className="text-xl" role="img" aria-label="Boxing glove">🥊</span>
            <h1 className="text-lg font-semibold leading-tight">Boxing Coach AI</h1>
          </div>
          <Link
            href="/about"
            className="text-xs text-muted hover:text-foreground underline-offset-2 hover:underline"
          >
            About & limitations
          </Link>
        </div>
```

Replace the `<Link href="/about" ...>` with a two-child flex container holding the About link + a new avatar button:

```tsx
      <header className="border-b border-border">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <span className="text-xl" role="img" aria-label="Boxing glove">🥊</span>
            <h1 className="text-lg font-semibold leading-tight">Boxing Coach AI</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/about"
              className="text-xs text-muted hover:text-foreground underline-offset-2 hover:underline"
            >
              About & limitations
            </Link>
            <ProfileAvatarLink />
          </div>
        </div>
```

- [ ] **Step 3: Add the `ProfileAvatarLink` component at the bottom of the file**

First, add an import for the shared initials helper near the other `@/lib/...` imports at the top of `src/app/page.tsx`:

```tsx
import { initialsFrom } from "@/lib/profile-initials";
```

Then, at the bottom of `src/app/page.tsx`, above `export default function Home()`, add:

```tsx
function ProfileAvatarLink() {
  const [initials, setInitials] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const name = window.localStorage.getItem("punch-doctor-display-name");
    setInitials(initialsFrom(name));
  }, []);

  return (
    <Link
      href="/me"
      aria-label="Your profile"
      className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-accent text-xs font-semibold hover:bg-accent/20"
    >
      {initials || <User size={14} aria-hidden />}
    </Link>
  );
}
```

- [ ] **Step 4: Add the `User` icon to the existing lucide import**

At the top of `src/app/page.tsx`, the import currently reads:

```tsx
import {
  MessageSquare,
  ClipboardList,
  User,
  Dumbbell,
  Zap,
  Flame,
  GitBranch,
  RotateCw,
  Shield,
  Target,
  Timer,
} from "lucide-react";
```

`User` is already imported (it's used in the tabs array as the Style tab icon), so no change needed. Just verify it's there.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Smoke-test locally**

Run: `npm run dev`
Open `http://localhost:3000/` (or whatever port Next uses). Verify:
- Top-right shows "About & limitations" link + a small circular button with a user icon.
- Clicking the avatar navigates to `/me`.
- Visiting `/?tab=style` lands on the Style Finder tab and the `?tab=` param disappears from the URL.

Kill the dev server when done.

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(header): avatar link to /me + ?tab= deep-link handling"
```

---

## Task 11: Playwright e2e smoke

**Files:**
- Create: `tests/e2e/profile.spec.ts`

- [ ] **Step 1: Write the spec**

Create `tests/e2e/profile.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test.describe("/me — personal profile", () => {
  test("empty state → name persists across reload → initials show in header", async ({ page }) => {
    // Anonymous first-visit: no prior data anywhere.
    await page.goto("/me");

    // Identity card renders with empty inputs.
    await expect(page.getByRole("heading", { name: /your profile/i })).toBeVisible();
    await expect(page.getByPlaceholder(/your name/i)).toBeVisible();

    // Style + coach sections render their empty states.
    await expect(page.getByText(/take the style finder quiz/i)).toBeVisible();
    await expect(page.getByText(/log your first session in my coach/i)).toBeVisible();

    // Type a name and blur to save.
    const nameField = page.getByPlaceholder(/your name/i);
    await nameField.fill("Alex Rivera");
    await nameField.blur();

    // Wait for the Saved indicator to flash.
    await expect(page.getByText(/^Saved$/).first()).toBeVisible();

    // Reload — the value should still be there.
    await page.reload();
    await expect(page.getByPlaceholder(/your name/i)).toHaveValue("Alex Rivera");

    // Back to the main app — header avatar should show initials "AR".
    await page.getByRole("link", { name: /back to the coach/i }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: /your profile/i })).toContainText(/AR/);
  });

  test("all editable fields persist across reload", async ({ page }) => {
    await page.goto("/me");

    await page.getByPlaceholder(/you@example\.com/i).fill("alex@example.com");
    await page.getByPlaceholder(/you@example\.com/i).blur();

    await page.getByPlaceholder(/silverback/i).fill("Silverback BC");
    await page.getByPlaceholder(/silverback/i).blur();

    await page.getByPlaceholder(/coach joe/i).fill("Coach Joe");
    await page.getByPlaceholder(/coach joe/i).blur();

    await page.getByPlaceholder(/what are you working toward/i).fill("Amateur debut by summer");
    await page.getByPlaceholder(/what are you working toward/i).blur();

    await page
      .getByPlaceholder(/things about how you box/i)
      .fill("Left hook has been slow the last two weeks.");
    await page.getByPlaceholder(/things about how you box/i).blur();

    await page.waitForTimeout(500); // let the last PATCH settle
    await page.reload();

    await expect(page.getByPlaceholder(/you@example\.com/i)).toHaveValue("alex@example.com");
    await expect(page.getByPlaceholder(/silverback/i)).toHaveValue("Silverback BC");
    await expect(page.getByPlaceholder(/coach joe/i)).toHaveValue("Coach Joe");
    await expect(page.getByPlaceholder(/what are you working toward/i)).toHaveValue(
      "Amateur debut by summer"
    );
    await expect(page.getByPlaceholder(/things about how you box/i)).toHaveValue(
      "Left hook has been slow the last two weeks."
    );
  });

  test("invalid email is rejected with inline error", async ({ page }) => {
    await page.goto("/me");

    const emailField = page.getByPlaceholder(/you@example\.com/i);
    await emailField.fill("not-an-email");
    await emailField.blur();

    // Inline error near the email field.
    await expect(page.getByText(/email must contain @/i)).toBeVisible();
  });

  test("no horizontal scroll on any section", async ({ page }) => {
    await page.goto("/me");

    // Fill every text field with realistic content so sections at their tallest render.
    await page.getByPlaceholder(/your name/i).fill("Alex Rivera");
    await page.getByPlaceholder(/your name/i).blur();
    await page.getByPlaceholder(/silverback/i).fill("Silverback Boxing Club — East Side Branch");
    await page.getByPlaceholder(/silverback/i).blur();

    // Compare document width vs. viewport width. Any positive diff → horizontal overflow.
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth - document.documentElement.clientWidth;
    });
    expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run the spec**

Run: `npm run test:e2e -- profile.spec.ts`
Expected: all tests pass on both `desktop-chromium` and `mobile-safari` projects.

Note: this spec assumes a reachable Supabase. If the suite is being run against a fresh local env with no `SUPABASE_URL`, tests will fail — same constraint as the existing `/api/coach` hitting DB in tests. If that turns out to be a problem, gate the spec behind `process.env.E2E_SUPABASE_READY` or add an API stub under `tests/e2e/helpers/`. Don't pre-emptively stub — try real DB first.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/profile.spec.ts
git commit -m "test(e2e): /me profile — empty state, persistence, invalid email"
```

---

## Task 12: Full verification + wrap-up

- [ ] **Step 1: Run the full unit suite**

Run: `npm test`
Expected: all tests pass (including new `profile-aggregator.test.ts` and `profile-patch.test.ts`).

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Run full e2e suite**

Run: `npm run test:e2e`
Expected: all existing specs still pass alongside the new `profile.spec.ts`.

- [ ] **Step 4: Manual smoke pass**

Run: `npm run dev`

Walk through:
1. `/` → click avatar → lands on `/me`.
2. Type name → blur → navigate back → avatar shows initials.
3. "Update via Style Finder →" on `/me` → lands on Style tab on `/`.
4. "Open My Coach →" on `/me` → lands on Coach tab on `/`.
5. Refresh `/me` → all typed values persist.

Kill the dev server.

- [ ] **Step 5: No standalone commit**

All work committed per-task. Verify with `git log --oneline` — the feature should span ~11 commits from `009 migration` through `/me smoke spec`.

---

## Rollout

Single branch, single PR. Migration `009_profile_fields.sql` runs on deploy. No feature flag — the header avatar ships visible for all users on merge. Existing `/profile/[id]` shared-style-result route is untouched.
