# Coach Context Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the coach's context (style profile + neglected focus areas + drill follow-up observability), then shrink the coach system prompt to rely on that context instead of a scripted coaching script.

**Architecture:** Four pieces, sequenced so the prompt rewrite lands last on top of richer context:
1. Add observability columns (`followed_up_at`, `followed_up_session_id`) to `drill_prescriptions` and populate them — the matching logic already exists in `src/lib/drill-matching.ts`.
2. Extend `training_sessions.summary` with canonical `focus_areas_worked_keys` derived from `focus_area_updates.dimension` + `knowledge_node_slug`.
3. Inject style profile (from `style_profiles` table or `boxing-coach-style-profile` localStorage) and neglected focus areas into the coach system prompt.
4. Replace the numbered "How to Coach This Session" + "Rules" blocks with a single terse "How to Use This Context" block.

**Tech Stack:** Next.js 16 App Router API routes, Supabase (pgvector/jsonb), Anthropic SDK (claude-sonnet-4), zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-04-20-coach-context-enrichment-design.md`

---

## File Structure

**New files:**
- `supabase/migrations/006_drill_followup_observability.sql` — additive migration for two nullable columns.
- `src/lib/focus-area-keys.ts` — pure helper: derive `"dimension::slug"` canonical keys from `focus_area_updates[]`.
- `src/lib/focus-area-keys.test.ts`
- `src/lib/neglected-focus-areas.ts` — pure helpers: `focusAreaKey`, `computeNeglected`.
- `src/lib/neglected-focus-areas.test.ts`
- `src/lib/style-profile-context.ts` — pure formatter: style profile → prompt string block.
- `src/lib/style-profile-context.test.ts`

**Modified files:**
- `src/app/api/coach/save-session/route.ts` — populate observability columns, write `focus_areas_worked_keys` to summary.
- `src/app/api/coach/session/route.ts` — style profile query + injection, neglected computation + injection, request-body validation, prompt shrink.
- `src/lib/validation.ts` — extend `styleProfileSchema.matched_fighters` to include `overlappingDimensions`.
- `src/components/coach-session.tsx` — read style profile from localStorage, include in POST body.

**Untouched (spec explicitly excludes):** Technique tab, Drills tab, Style Finder tab, clip review, RAG pipeline.

---

### Task 1: Migration — add drill follow-up observability columns

**Files:**
- Create: `supabase/migrations/006_drill_followup_observability.sql`

Why 006 and not 005: slot 005 is already taken by `ambient_focus_foundation.sql`. Both columns are nullable so the migration is non-breaking — existing rows simply have NULL until a subsequent session flips them.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/006_drill_followup_observability.sql`:

```sql
-- 006_drill_followup_observability.sql
-- Enrich drill_prescriptions with timestamp + session reference when followed_up flips.
-- Both columns are nullable: legacy rows have NULL, new follow-ups populate them.

ALTER TABLE drill_prescriptions
  ADD COLUMN followed_up_at timestamptz,
  ADD COLUMN followed_up_session_id uuid REFERENCES training_sessions(id) ON DELETE SET NULL;

-- Index to support "when did this drill get followed up" queries from the UI if needed.
CREATE INDEX idx_drill_prescriptions_followed_up_at
  ON drill_prescriptions (user_id, followed_up_at DESC)
  WHERE followed_up = true;
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db push` (or whatever the project uses — check `package.json` scripts first; if there isn't one, apply via the Supabase dashboard SQL editor).

Expected: migration applies cleanly. Verify with:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'drill_prescriptions'
  AND column_name IN ('followed_up_at', 'followed_up_session_id');
```

Expected output: two rows, both `is_nullable = YES`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/006_drill_followup_observability.sql
git commit -m "feat(db): add drill_prescriptions observability columns

Adds followed_up_at and followed_up_session_id for tracking when and
in which session a prescription got flipped to followed_up=true."
```

---

### Task 2: Populate observability columns in save-session

**Files:**
- Modify: `src/app/api/coach/save-session/route.ts:244-268` (the "4a" block that flips `followed_up`).

- [ ] **Step 1: Update the flip-followed-up call**

Replace the existing block (the `.update({ followed_up: true, follow_up_notes: "Auto-flipped from session report" })` call) with one that also writes the two new columns. Full block:

```ts
// 4a. Flip followed_up on pending prescriptions matching drills_done
if (extracted.drills_done && Array.isArray(extracted.drills_done) && extracted.drills_done.length > 0) {
  const { data: pending } = await supabase
    .from("drill_prescriptions")
    .select("id, drill_name")
    .eq("user_id", userId)
    .eq("followed_up", false);

  const pendingList = (pending ?? []) as { id: string; drill_name: string }[];
  const flipIds = new Set<string>();
  const reportedDrills = (extracted.drills_done as unknown[]).filter(
    (d): d is string => typeof d === "string"
  );
  for (const reported of reportedDrills) {
    const matched = matchReportedDrill(reported, pendingList);
    if (matched) flipIds.add(matched.id);
  }

  if (flipIds.size > 0) {
    await supabase
      .from("drill_prescriptions")
      .update({
        followed_up: true,
        follow_up_notes: "Auto-flipped from session report",
        followed_up_at: new Date().toISOString(),
        followed_up_session_id: session.id,
      })
      .in("id", Array.from(flipIds));
  }
}
```

The only functional change is adding two fields to the `.update()` payload. `session.id` is the id of the training session just inserted above at line 122-138.

- [ ] **Step 2: Smoke test**

No new unit test is needed — `matchReportedDrill` has its own tests and the DB update is a one-liner. Manual verification in Task 10.

Run `npm run build` to catch TypeScript issues.

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/coach/save-session/route.ts
git commit -m "feat(coach): populate drill follow-up observability columns

When save-session flips a prescription to followed_up=true, also records
followed_up_at and followed_up_session_id so the UI and history views
can tell when/where each drill got marked done."
```

---

### Task 3: Pure helper — deriveFocusAreaKeys

**Files:**
- Create: `src/lib/focus-area-keys.ts`
- Test: `src/lib/focus-area-keys.test.ts`

Why a separate module: the key-derivation logic is used in two places (save-session writes keys into summary; future code may want to re-derive them). Keeping it pure + tested lets save-session stay thin and lets us unit-test without Supabase/Anthropic mocks.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/focus-area-keys.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveFocusAreaKeys } from "./focus-area-keys";

describe("deriveFocusAreaKeys", () => {
  it("returns empty array for empty input", () => {
    expect(deriveFocusAreaKeys([])).toEqual([]);
  });

  it("returns empty array when input is undefined", () => {
    expect(deriveFocusAreaKeys(undefined)).toEqual([]);
  });

  it("maps a valid dimension + slug into a canonical key", () => {
    const keys = deriveFocusAreaKeys([
      { dimension: "powerMechanics", knowledge_node_slug: "hip-rotation" },
    ]);
    expect(keys).toEqual(["powerMechanics::hip-rotation"]);
  });

  it("uses empty-string slug when knowledge_node_slug is null", () => {
    const keys = deriveFocusAreaKeys([
      { dimension: "defensiveIntegration", knowledge_node_slug: null },
    ]);
    expect(keys).toEqual(["defensiveIntegration::"]);
  });

  it("uses empty-string slug when knowledge_node_slug is missing", () => {
    const keys = deriveFocusAreaKeys([
      { dimension: "ringIQ" },
    ]);
    expect(keys).toEqual(["ringIQ::"]);
  });

  it("coerces an unknown slug to empty string so it matches the (dim, null) bucket", () => {
    const keys = deriveFocusAreaKeys([
      { dimension: "outputPressure", knowledge_node_slug: "not-a-real-slug" },
    ]);
    expect(keys).toEqual(["outputPressure::"]);
  });

  it("accepts a human label and maps it to the canonical dimension key", () => {
    // DIMENSION_LABELS maps 'Power Mechanics' → 'powerMechanics' etc.
    const keys = deriveFocusAreaKeys([
      { dimension: "Power Mechanics", knowledge_node_slug: "jab" },
    ]);
    expect(keys).toEqual(["powerMechanics::jab"]);
  });

  it("drops updates with unrecognised dimensions", () => {
    const keys = deriveFocusAreaKeys([
      { dimension: "nonsense", knowledge_node_slug: "jab" },
      { dimension: "powerMechanics", knowledge_node_slug: "jab" },
    ]);
    expect(keys).toEqual(["powerMechanics::jab"]);
  });

  it("deduplicates identical keys", () => {
    const keys = deriveFocusAreaKeys([
      { dimension: "powerMechanics", knowledge_node_slug: "jab" },
      { dimension: "powerMechanics", knowledge_node_slug: "jab" },
    ]);
    expect(keys).toEqual(["powerMechanics::jab"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/focus-area-keys.test.ts`
Expected: FAIL with "Cannot find module './focus-area-keys'" or similar.

- [ ] **Step 3: Write the implementation**

Create `src/lib/focus-area-keys.ts`:

```ts
import { VAULT_SLUGS, dimensionLabelToKey, isDimensionKey, type DimensionKey } from "./dimensions";

export interface FocusAreaUpdateLike {
  dimension?: unknown;
  knowledge_node_slug?: unknown;
}

/**
 * Derive canonical "dimension::slug" keys from LLM-emitted focus_area_updates.
 *
 * Skips updates whose dimension can't be resolved. Coerces unknown slugs to "" so
 * they collapse into the (dim, null) bucket instead of creating phantom keys.
 * De-duplicates the output.
 */
export function deriveFocusAreaKeys(
  updates: FocusAreaUpdateLike[] | undefined
): string[] {
  if (!updates || updates.length === 0) return [];

  const out = new Set<string>();
  for (const u of updates) {
    const rawDim = u.dimension;
    const dim: DimensionKey | null = isDimensionKey(rawDim)
      ? rawDim
      : dimensionLabelToKey(String(rawDim ?? ""));
    if (!dim) continue;

    const rawSlug = typeof u.knowledge_node_slug === "string" ? u.knowledge_node_slug : "";
    const slug = rawSlug.length > 0 && (VAULT_SLUGS as readonly string[]).includes(rawSlug) ? rawSlug : "";

    out.add(`${dim}::${slug}`);
  }
  return Array.from(out);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/focus-area-keys.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/focus-area-keys.ts src/lib/focus-area-keys.test.ts
git commit -m "feat(lib): focus-area-keys helper for canonical dimension::slug keys

Pure helper that turns LLM-emitted focus_area_updates into deduplicated
canonical keys, matching the (dimension, knowledge_node_slug) tuple the
focus_areas unique index uses. Reused by save-session to persist keys
into training_sessions.summary for later avoidance detection."
```

---

### Task 4: Wire focus_areas_worked_keys into session summary

**Files:**
- Modify: `src/app/api/coach/save-session/route.ts` — around the `summary: { ... }` block at lines 129-134.

- [ ] **Step 1: Import and use deriveFocusAreaKeys**

At the top of `src/app/api/coach/save-session/route.ts`, add the import alongside the existing `@/lib/` imports:

```ts
import { deriveFocusAreaKeys } from "@/lib/focus-area-keys";
```

Then modify the session insert. Replace lines ~122-138 (the `.from("training_sessions").insert({ ... })` block) — just the `summary` field — to include the new canonical keys:

```ts
// 1. Save training session
const { data: session, error: sessionError } = await supabase
  .from("training_sessions")
  .insert({
    user_id: userId,
    session_type: extracted.session_type ?? "mixed",
    rounds: extracted.rounds ?? null,
    transcript: messages,
    summary: {
      breakthroughs: extracted.breakthroughs ?? [],
      struggles: extracted.struggles ?? [],
      focus_areas_worked: extracted.focus_areas_worked ?? [],
      focus_areas_worked_keys: deriveFocusAreaKeys(extracted.focus_area_updates),
      drills_done: extracted.drills_done ?? [],
    },
    prescriptions_given: extracted.drills_prescribed ?? [],
  })
  .select("id")
  .single();
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/coach/save-session/route.ts
git commit -m "feat(coach): persist focus_areas_worked_keys in session summary

Adds a canonical-key parallel field to training_sessions.summary so future
coach sessions can detect neglected focus areas by (dimension, slug) rather
than fragile free-text name matching."
```

---

### Task 5: Pure helpers — focusAreaKey + computeNeglected

**Files:**
- Create: `src/lib/neglected-focus-areas.ts`
- Test: `src/lib/neglected-focus-areas.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/neglected-focus-areas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { focusAreaKey, computeNeglected } from "./neglected-focus-areas";

describe("focusAreaKey", () => {
  it("returns null when dimension is null", () => {
    expect(focusAreaKey(null, "hip-rotation")).toBeNull();
  });

  it("uses empty-string slug when slug is null", () => {
    expect(focusAreaKey("powerMechanics", null)).toBe("powerMechanics::");
  });

  it("joins dimension and slug with '::'", () => {
    expect(focusAreaKey("powerMechanics", "hip-rotation")).toBe("powerMechanics::hip-rotation");
  });
});

describe("computeNeglected", () => {
  it("returns empty list when no focus areas", () => {
    expect(computeNeglected([], [])).toEqual([]);
  });

  it("excludes focus areas worked in recent sessions (by canonical key)", () => {
    const focusAreas = [
      { name: "Hip Rotation", dimension: "powerMechanics", knowledge_node_slug: "hip-rotation", status: "active" },
    ];
    const recentSessions = [
      { summary: { focus_areas_worked_keys: ["powerMechanics::hip-rotation"] } },
    ];
    expect(computeNeglected(focusAreas, recentSessions)).toEqual([]);
  });

  it("excludes focus areas with status='improving'", () => {
    const focusAreas = [
      { name: "Foo", dimension: "ringIQ", knowledge_node_slug: null, status: "improving" },
    ];
    expect(computeNeglected(focusAreas, [])).toEqual([]);
  });

  it("excludes focus areas with status='resolved'", () => {
    const focusAreas = [
      { name: "Foo", dimension: "ringIQ", knowledge_node_slug: null, status: "resolved" },
    ];
    expect(computeNeglected(focusAreas, [])).toEqual([]);
  });

  it("includes an 'active' focus area with no matching key in recent sessions", () => {
    const focusAreas = [
      { name: "Head Movement", dimension: "defensiveIntegration", knowledge_node_slug: null, status: "active" },
    ];
    const recentSessions = [
      { summary: { focus_areas_worked_keys: ["powerMechanics::hip-rotation"] } },
    ];
    expect(computeNeglected(focusAreas, recentSessions)).toEqual(["Head Movement"]);
  });

  it("includes a 'new' focus area that hasn't been touched", () => {
    const focusAreas = [
      { name: "Killer Instinct", dimension: "killerInstinct", knowledge_node_slug: null, status: "new" },
    ];
    expect(computeNeglected(focusAreas, [])).toEqual(["Killer Instinct"]);
  });

  it("skips legacy focus areas (dimension=null) — they can't be keyed", () => {
    const focusAreas = [
      { name: "Legacy Thing", dimension: null, knowledge_node_slug: null, status: "active" },
    ];
    expect(computeNeglected(focusAreas, [])).toEqual([]);
  });

  it("treats a session missing focus_areas_worked_keys as contributing nothing", () => {
    const focusAreas = [
      { name: "Power", dimension: "powerMechanics", knowledge_node_slug: null, status: "active" },
    ];
    const recentSessions = [
      { summary: { breakthroughs: ["something"] } }, // no focus_areas_worked_keys
      { summary: undefined },
      {},
    ];
    expect(computeNeglected(focusAreas, recentSessions)).toEqual(["Power"]);
  });

  it("dedups across multiple matching sessions (same key seen twice)", () => {
    const focusAreas = [
      { name: "Power", dimension: "powerMechanics", knowledge_node_slug: null, status: "active" },
    ];
    const recentSessions = [
      { summary: { focus_areas_worked_keys: ["powerMechanics::"] } },
      { summary: { focus_areas_worked_keys: ["powerMechanics::"] } },
    ];
    expect(computeNeglected(focusAreas, recentSessions)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/neglected-focus-areas.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/neglected-focus-areas.ts`:

```ts
export function focusAreaKey(
  dimension: string | null | undefined,
  slug: string | null | undefined
): string | null {
  if (!dimension) return null;
  return `${dimension}::${slug ?? ""}`;
}

export interface FocusAreaRow {
  name: string;
  dimension: string | null;
  knowledge_node_slug: string | null;
  status: string;
}

export interface RecentSessionRow {
  summary?: { focus_areas_worked_keys?: string[] } | null;
}

/**
 * Given a user's active/new focus areas and their last few session summaries,
 * return the names of focus areas that do NOT appear (by canonical key) in any
 * of the recent sessions' focus_areas_worked_keys. These are the "avoidance"
 * items surfaced to the coach.
 *
 * Rules:
 *  - Only 'new' and 'active' focus areas are considered. 'improving' means
 *    progress is happening; 'resolved' is done.
 *  - Focus areas with dimension=null are legacy pre-canonical-key rows and are
 *    skipped — they'll be superseded as the user touches them again.
 *  - Sessions that predate the keys-in-summary change contribute nothing (their
 *    focus_areas_worked_keys is missing). Acceptable degradation: the window
 *    rolls forward in ~3 sessions.
 */
export function computeNeglected(
  focusAreas: FocusAreaRow[],
  recentSessions: RecentSessionRow[]
): string[] {
  const workedKeys = new Set<string>();
  for (const s of recentSessions) {
    const keys = s.summary?.focus_areas_worked_keys ?? [];
    for (const k of keys) workedKeys.add(k);
  }

  return focusAreas
    .filter((f) => f.status === "new" || f.status === "active")
    .filter((f) => {
      const key = focusAreaKey(f.dimension, f.knowledge_node_slug);
      return key !== null && !workedKeys.has(key);
    })
    .map((f) => f.name);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/neglected-focus-areas.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/neglected-focus-areas.ts src/lib/neglected-focus-areas.test.ts
git commit -m "feat(lib): computeNeglected + focusAreaKey helpers

Pure functions that derive the list of focus areas a user has been
avoiding in recent sessions, using canonical dimension::slug keys
instead of free-text name matching."
```

---

### Task 6: Style profile formatter + validation schema extension

**Files:**
- Modify: `src/lib/validation.ts` — extend `matched_fighters` inner schema.
- Create: `src/lib/style-profile-context.ts`
- Test: `src/lib/style-profile-context.test.ts`

- [ ] **Step 1: Extend the validation schema**

In `src/lib/validation.ts`, replace the `matched_fighters` field in `styleProfileSchema` (currently `z.array(z.object({ name: z.string().max(100) })).max(10).optional()`) with one that also accepts `overlappingDimensions`:

```ts
matched_fighters: z
  .array(
    z.object({
      name: z.string().max(100),
      slug: z.string().max(100).optional(),
      overlappingDimensions: z.array(z.string().max(50)).max(8).optional(),
    })
  )
  .max(10)
  .optional(),
```

No other fields change. `passthrough()` on the outer object is already there.

- [ ] **Step 2: Write the failing tests**

Create `src/lib/style-profile-context.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatStyleProfileBlock } from "./style-profile-context";

describe("formatStyleProfileBlock", () => {
  it("returns empty string when profile is null", () => {
    expect(formatStyleProfileBlock(null)).toBe("");
  });

  it("returns empty string when profile has no dimension_scores", () => {
    expect(formatStyleProfileBlock({ style_name: "Puncher" })).toBe("");
  });

  it("formats all 8 dimensions with human labels and scores", () => {
    const block = formatStyleProfileBlock({
      style_name: "Counter-Puncher",
      dimension_scores: {
        powerMechanics: 72,
        positionalReadiness: 85,
        rangeControl: 80,
        defensiveIntegration: 90,
        ringIQ: 88,
        outputPressure: 55,
        deceptionSetup: 78,
        killerInstinct: 60,
      },
      matched_fighters: [
        { name: "Floyd Mayweather Jr.", overlappingDimensions: ["positionalReadiness", "defensiveIntegration"] },
      ],
    });

    expect(block).toContain("## Style Profile");
    expect(block).toContain("Style: Counter-Puncher");
    expect(block).toContain("Power Mechanics: 72");
    expect(block).toContain("Positional Readiness: 85");
    expect(block).toContain("Range Control: 80");
    expect(block).toContain("Defensive Integration: 90");
    expect(block).toContain("Ring IQ: 88");
    expect(block).toContain("Output / Pressure: 55");
    expect(block).toContain("Deception / Setup: 78");
    expect(block).toContain("Killer Instinct: 60");
    expect(block).toContain("Top matched fighter: Floyd Mayweather Jr.");
    expect(block).toContain("positionalReadiness, defensiveIntegration");
  });

  it("omits the matched-fighter line when matched_fighters is empty", () => {
    const block = formatStyleProfileBlock({
      dimension_scores: {
        powerMechanics: 50, positionalReadiness: 50, rangeControl: 50, defensiveIntegration: 50,
        ringIQ: 50, outputPressure: 50, deceptionSetup: 50, killerInstinct: 50,
      },
      matched_fighters: [],
    });
    expect(block).not.toContain("Top matched fighter");
  });

  it("omits the style name line when style_name missing", () => {
    const block = formatStyleProfileBlock({
      dimension_scores: {
        powerMechanics: 50, positionalReadiness: 50, rangeControl: 50, defensiveIntegration: 50,
        ringIQ: 50, outputPressure: 50, deceptionSetup: 50, killerInstinct: 50,
      },
    });
    expect(block).not.toContain("Style:");
    expect(block).toContain("## Style Profile");
  });

  it("handles missing overlappingDimensions gracefully", () => {
    const block = formatStyleProfileBlock({
      dimension_scores: {
        powerMechanics: 50, positionalReadiness: 50, rangeControl: 50, defensiveIntegration: 50,
        ringIQ: 50, outputPressure: 50, deceptionSetup: 50, killerInstinct: 50,
      },
      matched_fighters: [{ name: "Mike Tyson" }],
    });
    expect(block).toContain("Top matched fighter: Mike Tyson");
    expect(block).not.toContain("overlapping dimensions:");
  });

  it("uses 0 when a dimension score is missing", () => {
    const block = formatStyleProfileBlock({
      dimension_scores: {
        powerMechanics: 72,
        // others missing
      },
    });
    expect(block).toContain("Power Mechanics: 72");
    expect(block).toContain("Positional Readiness: 0");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/style-profile-context.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 4: Write the implementation**

Create `src/lib/style-profile-context.ts`:

```ts
import { DIMENSION_KEYS } from "./dimensions";
import { DIMENSION_LABELS } from "@/data/fighter-profiles";

export interface StyleProfileInput {
  style_name?: string;
  dimension_scores?: Record<string, number>;
  matched_fighters?: Array<{
    name: string;
    overlappingDimensions?: string[];
  }>;
}

/**
 * Format a user's style-finder profile as a prompt block for the coach.
 * Returns an empty string if there are no dimension scores to inject.
 * Callers concatenate this block into the system prompt; empty means "skip".
 */
export function formatStyleProfileBlock(profile: StyleProfileInput | null): string {
  if (!profile) return "";
  const scores = profile.dimension_scores;
  if (!scores || Object.keys(scores).length === 0) return "";

  const lines: string[] = ["## Style Profile"];

  if (profile.style_name) {
    lines.push(`Style: ${profile.style_name}`);
  }

  lines.push("Dimension scores (0-100):");
  for (const key of DIMENSION_KEYS) {
    const label = DIMENSION_LABELS[key];
    const value = typeof scores[key] === "number" ? scores[key] : 0;
    lines.push(`- ${label}: ${value}`);
  }

  const top = profile.matched_fighters?.[0];
  if (top) {
    const overlap = top.overlappingDimensions ?? [];
    const suffix = overlap.length > 0 ? ` (overlapping dimensions: ${overlap.join(", ")})` : "";
    lines.push(`Top matched fighter: ${top.name}${suffix}`);
  }

  return lines.join("\n");
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/style-profile-context.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/validation.ts src/lib/style-profile-context.ts src/lib/style-profile-context.test.ts
git commit -m "feat(lib): style-profile-context formatter + schema extension

formatStyleProfileBlock turns a style profile into a prompt block with
all 8 dimensions and the top matched fighter. Also extends the shared
styleProfileSchema to accept overlappingDimensions on matched_fighters."
```

---

### Task 7: Session route — request validation + style profile query

**Files:**
- Modify: `src/app/api/coach/session/route.ts`

- [ ] **Step 1: Add imports**

At the top of `src/app/api/coach/session/route.ts`, add:

```ts
import { z } from "zod";
import { styleProfileSchema } from "@/lib/validation";
import { formatStyleProfileBlock } from "@/lib/style-profile-context";
import { computeNeglected } from "@/lib/neglected-focus-areas";
```

- [ ] **Step 2: Define the request schema**

Near the other top-of-file declarations (after the Anthropic client init), add:

```ts
const coachSessionRequestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
    .min(1)
    .max(100),
  userId: z.string().max(128),
  styleProfile: styleProfileSchema.optional(),
});
```

- [ ] **Step 3: Replace the request parsing in POST**

In the `POST` handler, replace `const { messages, userId } = await request.json();` and the subsequent `if (!messages || !Array.isArray(messages))` guard with:

```ts
const rawBody = await request.json();
const parsed = coachSessionRequestSchema.safeParse(rawBody);
if (!parsed.success) {
  return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400 });
}
const { messages, userId, styleProfile: bodyStyleProfile } = parsed.data;
```

- [ ] **Step 4: Extend loadUserContext with style_profiles query and focus-area column expansion**

Replace the existing `loadUserContext` function (around lines 117-133) with:

```ts
async function loadUserContext(userId: string) {
  const supabase = createServerClient();

  const [profileRes, focusRes, sessionsRes, drillsRes, styleRes] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("tendencies, skill_levels, preferences, onboarding_complete")
      .eq("id", userId)
      .single(),
    supabase
      .from("focus_areas")
      .select("name, status, description, dimension, knowledge_node_slug")
      .eq("user_id", userId)
      .in("status", ["new", "active", "improving"])
      .order("updated_at", { ascending: false }),
    supabase
      .from("training_sessions")
      .select("session_type, summary, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("drill_prescriptions")
      .select("drill_name, details")
      .eq("user_id", userId)
      .eq("followed_up", false),
    supabase
      .from("style_profiles")
      .select("dimension_scores, matched_fighters, ai_result")
      .eq("user_id", userId)
      .eq("is_current", true)
      .maybeSingle(),
  ]);

  const dbStyle = styleRes.data;
  const styleProfile = dbStyle
    ? {
        style_name: (dbStyle.ai_result as { style_name?: string } | null)?.style_name,
        dimension_scores: dbStyle.dimension_scores as Record<string, number>,
        matched_fighters: dbStyle.matched_fighters as Array<{
          name: string;
          slug?: string;
          overlappingDimensions?: string[];
        }>,
      }
    : null;

  return {
    profile: profileRes.data ?? { tendencies: {}, skill_levels: {}, preferences: {}, onboarding_complete: false },
    focusAreas: focusRes.data ?? [],
    recentSessions: sessionsRes.data ?? [],
    pendingDrills: drillsRes.data ?? [],
    styleProfile,
  };
}
```

Note: `focus_areas.knowledge_node_slug` was added in migration 003 (the original coach tables migration); `dimension` was added in 005. Both exist in the schema now.

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/coach/session/route.ts
git commit -m "feat(coach): validate request body + load style profile

Adds zod validation for the POST body (including optional styleProfile
from anonymous localStorage users) and queries the current style profile
from style_profiles as part of the parallel context load."
```

---

### Task 8: Session route — inject style profile + neglected focus areas into prompt

**Files:**
- Modify: `src/app/api/coach/session/route.ts` — `buildCoachSystemPrompt` + the POST body call.

- [ ] **Step 1: Extend buildCoachSystemPrompt signature and inject blocks**

Replace `buildCoachSystemPrompt` (around lines 16-115) — note that this task only adjusts the signature and injects the style profile block and the "Been avoiding" line. The Piece 4 prompt shrink happens in Task 10. For now, the existing `## How to Coach This Session` + `## Rules` block stays:

```ts
function buildCoachSystemPrompt(
  userContext: {
    profile: {
      tendencies: Record<string, string>;
      skill_levels: Record<string, string>;
      preferences: Record<string, string>;
      onboarding_complete: boolean;
    };
    focusAreas: {
      name: string;
      status: string;
      description: string | null;
      dimension: string | null;
      knowledge_node_slug: string | null;
    }[];
    recentSessions: { session_type: string; summary: Record<string, unknown>; created_at: string }[];
    pendingDrills: { drill_name: string; details: string | null }[];
    styleProfile: {
      style_name?: string;
      dimension_scores?: Record<string, number>;
      matched_fighters?: Array<{ name: string; overlappingDimensions?: string[] }>;
    } | null;
    neglected: string[];
  },
  ragContext: string
): string {
  const { profile, focusAreas, recentSessions, pendingDrills, styleProfile, neglected } = userContext;

  const phasesText = FOUR_PHASES.join("\n");
  const principlesText = CORE_PRINCIPLES.join("\n");
  const mythsText = buildMythsText();

  let userSection = "";

  if (!profile.onboarding_complete) {
    userSection = `\n## New User
This is a new user. Start with an onboarding conversation:
- Welcome them warmly
- Ask about their boxing experience (beginner, intermediate, advanced)
- Ask what they're currently working on or struggling with
- Ask about their training setup (gym, home, bag, sparring partners)
- Build their initial profile from the answers
After 3-4 exchanges, summarize what you've learned and set their first focus areas.`;
  } else {
    const tendenciesText = Object.entries(profile.tendencies)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");
    const skillsText = Object.entries(profile.skill_levels)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");
    const focusText = focusAreas
      .map((f) => `- ${f.name} (${f.status}): ${f.description ?? "No notes yet"}`)
      .join("\n");
    const sessionsText = recentSessions
      .map((s) => {
        const summary = s.summary as { breakthroughs?: string[]; struggles?: string[] };
        return `- ${s.created_at.split("T")[0]}: ${s.session_type} — breakthroughs: ${(summary.breakthroughs ?? []).join(", ") || "none"}, struggles: ${(summary.struggles ?? []).join(", ") || "none"}`;
      })
      .join("\n");
    const drillsText = pendingDrills
      .map((d) => `- ${d.drill_name}: ${d.details ?? ""}`)
      .join("\n");

    const avoidingBlock =
      neglected.length > 0
        ? `\n\n**Been avoiding (focus areas not touched in recent sessions):**\n${neglected.map((n) => `- ${n}`).join("\n")}`
        : "";

    userSection = `\n## This Fighter's Profile
**Known tendencies:**
${tendenciesText || "None recorded yet"}

**Skill levels:**
${skillsText || "Not assessed yet"}

**Active focus areas:**
${focusText || "None set yet"}

**Recent sessions:**
${sessionsText || "No sessions logged yet"}

**Pending drills (not yet followed up on):**
${drillsText || "None pending"}${avoidingBlock}`;
  }

  const styleBlock = formatStyleProfileBlock(styleProfile);
  const styleSection = styleBlock ? `\n\n${styleBlock}` : "";

  return `You are a boxing coach powered by Dr. Alex Wiant's Power Punching Blueprint methodology. You guide fighters through post-training reflection using a structured conversation.

## Your Framework
${phasesText}

## Core Principles
${principlesText}

## Myth Corrections
${mythsText}
${userSection}${styleSection}

## Relevant Knowledge Base Content
${ragContext || "No specific content retrieved for this exchange."}

## How to Coach This Session
1. If new user: run onboarding (see above)
2. If returning user: greet them with context from their last session and active focus areas
3. Ask 3-5 guided questions, one at a time:
   - What they worked on today
   - How their active focus areas felt
   - Whether they did prescribed drills
   - Any breakthroughs or frustrations
   - What they want to focus on next
4. Provide coaching context inline — connect their experience to Alex's framework
5. When the conversation feels complete, wrap up with a summary

## Rules
- Ask ONE question at a time. Wait for their response.
- Use Alex's exact terminology (kinetic chains, phases, loading, hip explosion, etc.)
- Be encouraging but honest. Don't sugarcoat.
- When prescribing drills, be specific: name, reps, sets, cues.
- Keep responses concise — 2-4 sentences per turn, max.
- Plain prose. NO markdown headings, NO section labels, NO bolded subheadings.
- When you close out a session with a drill, finish with ONE drill — not a list.
- Never fabricate information. If you don't know something, say so.`;
}
```

- [ ] **Step 2: Wire the new context fields into the POST handler**

Inside the POST handler, replace the call to `buildCoachSystemPrompt`. After the existing `const userContext = await loadUserContext(userId);` line, add the precedence + neglected computation and update the `systemPrompt` assignment:

```ts
const userContext = await loadUserContext(userId);

const styleProfile = userContext.styleProfile ?? bodyStyleProfile ?? null;
const neglected = computeNeglected(userContext.focusAreas, userContext.recentSessions);

const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === "user");
let ragContext = "";
let citations: SourceCitation[] = [];

if (lastUserMsg) {
  const { chunks, citations: ragCitations } = await retrieveContext(lastUserMsg.content, { count: 6 });
  ragContext = formatChunksForPrompt(chunks);
  citations = ragCitations;
}

const systemPrompt = buildCoachSystemPrompt(
  { ...userContext, styleProfile, neglected },
  ragContext
);
```

Notes:
- `focus_areas_worked_keys` only exists on sessions saved AFTER Task 4 lands; `computeNeglected` already handles missing keys gracefully (Task 5 test "treats a session missing focus_areas_worked_keys as contributing nothing").
- The server's DB-loaded style profile takes precedence over the client-supplied one — authed users always get DB truth; anonymous users get their localStorage copy.

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/coach/session/route.ts
git commit -m "feat(coach): inject style profile + neglected focus areas into prompt

The coach system prompt now includes the user's 8-dimension style scores
and top matched fighter (when available) plus a list of focus areas that
haven't been touched in any of the last 3 sessions."
```

---

### Task 9: Frontend — send style profile from localStorage

**Files:**
- Modify: `src/components/coach-session.tsx`

- [ ] **Step 1: Read the style profile before each send**

Inside the existing `sendToCoach` callback, replace the `body: JSON.stringify({ userId, messages: allMessages })` line with one that also reads localStorage. Full replacement for the fetch block:

```ts
let styleProfile: unknown = null;
if (typeof window !== "undefined") {
  try {
    const raw = window.localStorage.getItem("boxing-coach-style-profile");
    if (raw) {
      const parsed = JSON.parse(raw) as { result?: unknown };
      styleProfile = parsed?.result ?? null;
    }
  } catch {
    // malformed localStorage — server will treat missing as null
  }
}

const response = await fetch("/api/coach/session", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    userId,
    messages: allMessages,
    ...(styleProfile ? { styleProfile } : {}),
  }),
});
```

Why read per-send rather than once on mount: the user may take the Style Finder quiz in another tab between coach sends, and we want the next message to pick that up immediately. The read is cheap (a small localStorage lookup and JSON parse).

Zod on the server will silently coerce malformed values into `null`, so the client doesn't need to validate defensively.

- [ ] **Step 2: Typecheck + run tests**

Run: `npm run build && npm run test`
Expected: build succeeds, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/coach-session.tsx
git commit -m "feat(coach-ui): forward style profile from localStorage

For anonymous users (who don't have a style_profiles row because user_id
references auth.users), the coach session component now reads the
boxing-coach-style-profile localStorage key and forwards the result
field as styleProfile in the POST body."
```

---

### Task 10: Piece 4 — shrink the coach system prompt

**Files:**
- Modify: `src/app/api/coach/session/route.ts` — `buildCoachSystemPrompt` final return.

- [ ] **Step 1: Replace the "How to Coach This Session" + "Rules" blocks**

Inside `buildCoachSystemPrompt`, in the returned template literal, replace the final two sections (`## How to Coach This Session` numbered list AND `## Rules` bullet list, as set up in Task 8) with a single `## How to Use This Context` block. The rest of the prompt stays unchanged. The final `return ...` should now end with:

```ts
  return `You are a boxing coach powered by Dr. Alex Wiant's Power Punching Blueprint methodology. You guide fighters through post-training reflection using a structured conversation.

## Your Framework
${phasesText}

## Core Principles
${principlesText}

## Myth Corrections
${mythsText}
${userSection}${styleSection}

## Relevant Knowledge Base Content
${ragContext || "No specific content retrieved for this exchange."}

## How to Use This Context
You have this fighter's profile, style, recent sessions, active focus areas, pending drills, and what they've been avoiding. Use it. Prioritise their gaps and avoidance over whatever they raise first — surface those before answering. Be direct. Plain prose, no markdown, no bolded subheadings. Ask one question at a time. End with one drill, never a list. Never fabricate — if the knowledge base content doesn't cover it, say so.`;
}
```

The onboarding branch (`if (!profile.onboarding_complete)`) is unchanged — new users still get the explicit scaffolding in `userSection`.

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/coach/session/route.ts
git commit -m "feat(coach): replace coaching-script prompt with context-reliant block

Drops the numbered 'How to Coach This Session' and 8-bullet Rules
sections in favour of a single terse 'How to Use This Context' block.
Now that profile, style, neglected focus areas, and pending drills
are all in-prompt, the model doesn't need a scripted step-by-step."
```

---

### Task 11: Manual integration smoke test

**Files:** None modified — this is verification only.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Seed a test user via the Supabase SQL editor**

Pick a UUID (e.g. `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`) and seed in this order:

```sql
-- Profile (must exist before focus areas reference it via RLS-free policy)
INSERT INTO user_profiles (id, tendencies, skill_levels, onboarding_complete)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '{"prefers": "power over speed"}',
  '{"stance": "intermediate"}',
  true
);

-- Pending drill
INSERT INTO drill_prescriptions (user_id, drill_name, details, followed_up)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Hip rotation drill',
  '3x10, focus on closing-hip for the cross',
  false
);

-- Stale active focus area in one dimension
INSERT INTO focus_areas (user_id, name, dimension, knowledge_node_slug, status, description, source, history)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Hip rotation',
  'powerMechanics',
  'hip-rotation',
  'active',
  'Hip rotation on the cross is still linear',
  'session_extraction',
  '[{"date": "2026-04-15", "note": "First noticed"}]'::jsonb
);

-- Recent session that worked a DIFFERENT dimension — so 'Hip rotation' stays neglected
INSERT INTO training_sessions (user_id, session_type, summary, prescriptions_given)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bag_work',
  '{"breakthroughs":["felt my jab tighten"],"struggles":[],"focus_areas_worked":["Jab mechanics"],"focus_areas_worked_keys":["powerMechanics::jab"],"drills_done":[]}'::jsonb,
  '[]'::jsonb
);
```

- [ ] **Step 3: Set the localStorage user id and style profile in the browser**

Open the app in a browser, open DevTools Console, run:

```js
localStorage.setItem("punch-doctor-user-id", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
localStorage.setItem("boxing-coach-style-profile", JSON.stringify({
  result: {
    style_name: "Pressure Puncher",
    dimension_scores: {
      powerMechanics: 82, positionalReadiness: 55, rangeControl: 48, defensiveIntegration: 40,
      ringIQ: 52, outputPressure: 78, deceptionSetup: 45, killerInstinct: 72,
    },
    matched_fighters: [
      { name: "Mike Tyson", slug: "mike-tyson", overlappingDimensions: ["powerMechanics", "killerInstinct"] },
    ],
  },
}));
```

Reload the page. Go to the My Coach tab → Log Session.

- [ ] **Step 4: Verify the system prompt (via server logs)**

Temporarily add `console.log("SYSTEM_PROMPT:", systemPrompt);` in `src/app/api/coach/session/route.ts` right before `anthropic.messages.stream(...)`. Send any message in the coach UI (e.g., "I trained today").

Check the Next.js dev-server stdout. Confirm:
- The `## Style Profile` block is present with all 8 dimensions and `Top matched fighter: Mike Tyson`.
- The `Been avoiding` bullet lists `Hip rotation`.
- The `Pending drills` block lists the hip rotation drill.
- The `## How to Use This Context` block is present and the old `## How to Coach This Session` + `## Rules` are NOT present.

Remove the `console.log` once verified.

- [ ] **Step 5: Verify drill follow-up flipping**

In the coach UI, continue the session with a message like "Yeah I did the hip rotation drill today, ten reps, felt good." Click "Finish & save session". Back in the Supabase SQL editor:

```sql
SELECT id, drill_name, followed_up, followed_up_at, followed_up_session_id
FROM drill_prescriptions
WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
```

Expected: `followed_up = true`, `followed_up_at` populated with a recent timestamp, `followed_up_session_id` populated with a UUID.

Also check the saved session:

```sql
SELECT summary->'focus_areas_worked_keys' AS keys
FROM training_sessions
WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
ORDER BY created_at DESC
LIMIT 1;
```

Expected: a JSON array containing `"powerMechanics::hip-rotation"` (because the save-session extraction should have identified Hip rotation as a focus area worked on and emitted a matching `focus_area_update`).

- [ ] **Step 6: Verify avoidance clears**

Reload the coach and open another Log Session. Re-enable the `console.log` from Step 4 temporarily. Confirm: the `Been avoiding` block no longer contains `Hip rotation` (because the latest session has its key).

Remove the `console.log` again.

- [ ] **Step 7: Cleanup**

```sql
DELETE FROM drill_prescriptions WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
DELETE FROM training_sessions WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
DELETE FROM focus_areas WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
DELETE FROM user_profiles WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
```

No commit needed for this task — the point is verification, and any debug logging should already have been removed.

---

## Self-Review Checklist

Run through this before handing to execution:

1. **Spec coverage:**
   - Piece 1 (drill observability): Tasks 1–2 ✓
   - Piece 2 (style profile injection): Tasks 6, 7, 8, 9 ✓
   - Piece 3 (neglected focus areas): Tasks 3, 4, 5, 8 ✓
   - Piece 4 (prompt shrink): Task 10 ✓
   - Smoke test: Task 11 ✓
2. **Type consistency:** `FocusAreaRow` in Task 5 matches the `focus_areas` select columns in Task 7. `StyleProfileInput` in Task 6 matches the shape `loadUserContext` returns in Task 7 and what the frontend sends in Task 9. `coachSessionRequestSchema.styleProfile` (Task 7) and the client body shape (Task 9) both use the shared `styleProfileSchema` from `validation.ts`.
3. **Migration numbering:** 006, not 005 (conflict with existing `ambient_focus_foundation.sql`).
4. **No rebuild of Piece 1 matching:** the existing deterministic `matchReportedDrill` in `src/lib/drill-matching.ts` is preserved; Task 2 only adds columns to the `.update()` payload.
