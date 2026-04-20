# Ambient Focus Areas — Phase 1: Schema + Matching Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `focus_areas` the canonical shared state layer across surfaces, with deterministic dedup, source attribution, and drill follow-up flip — unlocking every subsequent trajectory/memory feature.

**Architecture:** Three new columns on `focus_areas` (`dimension`, `source`, `last_surfaced_at`), replace fragile name-based dedup with functional unique index on `(user_id, dimension, COALESCE(knowledge_node_slug, ''))`, rewrite the `save-session` LLM extraction to emit dimension + slug against a known vault taxonomy, and flip `drill_prescriptions.followed_up` when reported drills match pending prescriptions.

**Tech Stack:** Supabase (Postgres + pgvector), Next.js 16 App Router, TypeScript, Anthropic SDK (claude-sonnet-4-20250514), Vitest.

---

## Scope

**In:** `focus_areas` schema migration, two new pure-function helper modules (`src/lib/dimensions.ts`, `src/lib/drill-matching.ts`), rewrite of `src/app/api/coach/save-session/route.ts`. Unit tests for both helpers.

**Out (future phases):** Quiz → focus_areas bridge (Phase 2), auth (Phase 3), piping context into `/api/chat` (Phase 4), behavioral summary (Phase 5), kryptonite feature (Phase 6).

## File Structure

- **Create:** `src/lib/dimensions.ts` — dimension taxonomy: keys, label↔key mapping, all vault slugs, safe lookup helpers.
- **Create:** `src/lib/dimensions.test.ts` — unit tests for dimension helpers.
- **Create:** `src/lib/drill-matching.ts` — fuzzy matcher: given a reported drill name and a list of pending prescriptions, find the matching prescription (or null).
- **Create:** `src/lib/drill-matching.test.ts` — unit tests for matching.
- **Create:** `supabase/migrations/005_ambient_focus_foundation.sql` — schema changes.
- **Modify:** `src/app/api/coach/save-session/route.ts` — use helpers, new dedup key, drill follow-up flip, updated extraction prompt.

## Parallelism

Tasks 1, 2, 3 are fully independent and should be dispatched in parallel. Task 4 depends on 1, 2, 3. Task 5 is final verification.

---

## Task 1: Dimension Taxonomy Module [PARALLEL]

**Files:**
- Create: `src/lib/dimensions.ts`
- Create: `src/lib/dimensions.test.ts`

- [ ] **Step 1.1: Write failing tests**

Create `src/lib/dimensions.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  DIMENSION_KEYS,
  DIMENSION_LABEL_TO_KEY,
  VAULT_SLUGS,
  dimensionLabelToKey,
  isDimensionKey,
} from "./dimensions";

describe("dimension taxonomy", () => {
  it("has exactly 8 canonical dimension keys", () => {
    expect(DIMENSION_KEYS).toHaveLength(8);
    expect(new Set(DIMENSION_KEYS).size).toBe(8);
  });

  it("DIMENSION_LABEL_TO_KEY covers every key", () => {
    const keysFromMap = new Set(Object.values(DIMENSION_LABEL_TO_KEY));
    for (const key of DIMENSION_KEYS) {
      expect(keysFromMap.has(key)).toBe(true);
    }
  });

  it("dimensionLabelToKey handles canonical labels", () => {
    expect(dimensionLabelToKey("Power Mechanics")).toBe("powerMechanics");
    expect(dimensionLabelToKey("Ring IQ & Adaptation")).toBe("ringIQ");
    expect(dimensionLabelToKey("Defensive Integration")).toBe("defensiveIntegration");
  });

  it("dimensionLabelToKey is case-insensitive and trims whitespace", () => {
    expect(dimensionLabelToKey("  power mechanics  ")).toBe("powerMechanics");
    expect(dimensionLabelToKey("RING IQ & ADAPTATION")).toBe("ringIQ");
  });

  it("dimensionLabelToKey accepts snake/camel aliases", () => {
    expect(dimensionLabelToKey("power_mechanics")).toBe("powerMechanics");
    expect(dimensionLabelToKey("powerMechanics")).toBe("powerMechanics");
    expect(dimensionLabelToKey("ring_iq")).toBe("ringIQ");
  });

  it("dimensionLabelToKey returns null for unknown labels", () => {
    expect(dimensionLabelToKey("foot speed")).toBeNull();
    expect(dimensionLabelToKey("")).toBeNull();
  });

  it("isDimensionKey narrows strings correctly", () => {
    expect(isDimensionKey("powerMechanics")).toBe(true);
    expect(isDimensionKey("nonsense")).toBe(false);
  });

  it("VAULT_SLUGS includes known concept/technique/drill slugs", () => {
    expect(VAULT_SLUGS).toContain("kinetic-chains");
    expect(VAULT_SLUGS).toContain("jab-mechanics");
    expect(VAULT_SLUGS).toContain("barbell-punch");
    expect(VAULT_SLUGS.length).toBeGreaterThan(40);
  });

  it("VAULT_SLUGS has no duplicates", () => {
    expect(new Set(VAULT_SLUGS).size).toBe(VAULT_SLUGS.length);
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `npx vitest run src/lib/dimensions.test.ts`
Expected: FAIL with "Cannot find module './dimensions'" or similar import error.

- [ ] **Step 1.3: Implement the module**

Create `src/lib/dimensions.ts`:

```typescript
import type { DimensionScores } from "@/data/fighter-profiles";
import { DIMENSION_LABELS } from "@/data/fighter-profiles";

export type DimensionKey = keyof DimensionScores;

export const DIMENSION_KEYS: readonly DimensionKey[] = [
  "powerMechanics",
  "positionalReadiness",
  "rangeControl",
  "defensiveIntegration",
  "ringIQ",
  "outputPressure",
  "deceptionSetup",
  "killerInstinct",
] as const;

/** Canonical human label → key. Built from DIMENSION_LABELS so it stays in sync. */
export const DIMENSION_LABEL_TO_KEY: Record<string, DimensionKey> = Object.fromEntries(
  (Object.entries(DIMENSION_LABELS) as [DimensionKey, string][]).map(
    ([key, label]) => [label.toLowerCase().trim(), key]
  )
);

/** Additional aliases: snake_case, camelCase-as-string, short forms. */
const ALIASES: Record<string, DimensionKey> = {
  "power_mechanics": "powerMechanics",
  "powermechanics": "powerMechanics",
  "positional_readiness": "positionalReadiness",
  "positionalreadiness": "positionalReadiness",
  "range_control": "rangeControl",
  "rangecontrol": "rangeControl",
  "defensive_integration": "defensiveIntegration",
  "defensiveintegration": "defensiveIntegration",
  "ring_iq": "ringIQ",
  "ringiq": "ringIQ",
  "output_pressure": "outputPressure",
  "outputpressure": "outputPressure",
  "deception_setup": "deceptionSetup",
  "deceptionsetup": "deceptionSetup",
  "killer_instinct": "killerInstinct",
  "killerinstinct": "killerInstinct",
};

export function isDimensionKey(value: unknown): value is DimensionKey {
  return typeof value === "string" && (DIMENSION_KEYS as readonly string[]).includes(value);
}

export function dimensionLabelToKey(label: string): DimensionKey | null {
  if (!label) return null;
  const normalized = label.toLowerCase().trim();
  return DIMENSION_LABEL_TO_KEY[normalized] ?? ALIASES[normalized] ?? null;
}

/**
 * All vault slugs that the session-extraction LLM can reference for knowledge_node_slug.
 * Kept in sync manually with the vault/ directory. Adding a vault file means adding it here.
 */
export const VAULT_SLUGS: readonly string[] = [
  // concepts
  "arc-trajectory",
  "cross-body-chains",
  "edge-of-the-bubble",
  "four-phases-of-punching",
  "four-phases-of-the-punch",
  "frame",
  "front-functional-line",
  "ground-reaction-force",
  "hip-rotation",
  "kinetic-chains",
  "kinetic-integrated-mechanics",
  "knuckle-landing-pattern",
  "lateral-hip-muscles",
  "linear-style-mechanics",
  "oblique-to-serratus-connection",
  "positional-readiness",
  "ring-iq",
  "shearing-force",
  "spiral-line",
  "strategic-cheating",
  "stretch-shortening-cycle",
  "telegraphing",
  "throw-vs-push-mechanics",
  "throw-vs-push",
  "torque",
  "weight-transfer",
  "wrist-position-at-impact",
  // techniques
  "cross-mechanics",
  "cross",
  "hook-mechanics",
  "hook",
  "jab-mechanics",
  "jab",
  "left-hook",
  "one-inch-punch",
  "overhand-mechanics",
  "pull-counter",
  "roundhouse-kick",
  "straight-punch-mechanics",
  "uppercut-mechanics",
  "uppercut",
  // drills
  "barbell-punch",
  "bounce-step",
  "club-bell-training",
  "heavy-weight-visualization",
  "hip-rotation-drill",
  "kinetic-power-training",
  "lateral-foot-push-drill",
  "power-punching-blueprint",
] as const;
```

- [ ] **Step 1.4: Run test to verify it passes**

Run: `npx vitest run src/lib/dimensions.test.ts`
Expected: all 8 tests PASS.

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/dimensions.ts src/lib/dimensions.test.ts
git commit -m "feat(lib): dimension taxonomy — canonical keys, label↔key map, vault slug list"
```

---

## Task 2: Drill Matching Module [PARALLEL]

**Files:**
- Create: `src/lib/drill-matching.ts`
- Create: `src/lib/drill-matching.test.ts`

- [ ] **Step 2.1: Write failing tests**

Create `src/lib/drill-matching.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { matchReportedDrill, normalizeDrillName } from "./drill-matching";

type Prescription = { id: string; drill_name: string };

const pending: Prescription[] = [
  { id: "p1", drill_name: "Hip rotation drill" },
  { id: "p2", drill_name: "Barbell punch" },
  { id: "p3", drill_name: "Lateral foot push drill" },
];

describe("normalizeDrillName", () => {
  it("lowercases, strips punctuation, collapses whitespace", () => {
    expect(normalizeDrillName("  Hip-Rotation Drill!  ")).toBe("hip rotation drill");
  });

  it("strips filler words (drill, exercise)", () => {
    expect(normalizeDrillName("Hip rotation drill")).toBe("hip rotation drill");
    expect(normalizeDrillName("Hip rotation")).toBe("hip rotation");
  });
});

describe("matchReportedDrill", () => {
  it("exact match", () => {
    const m = matchReportedDrill("Hip rotation drill", pending);
    expect(m?.id).toBe("p1");
  });

  it("case-insensitive", () => {
    const m = matchReportedDrill("HIP ROTATION DRILL", pending);
    expect(m?.id).toBe("p1");
  });

  it("matches when 'drill' suffix is omitted", () => {
    const m = matchReportedDrill("hip rotation", pending);
    expect(m?.id).toBe("p1");
  });

  it("matches partial phrases (reported name is substring of prescription name)", () => {
    const m = matchReportedDrill("barbell", pending);
    expect(m?.id).toBe("p2");
  });

  it("matches when prescription name is substring of reported name", () => {
    const m = matchReportedDrill("the lateral foot push drill i was shown", pending);
    expect(m?.id).toBe("p3");
  });

  it("returns null when nothing matches", () => {
    expect(matchReportedDrill("shadowboxing", pending)).toBeNull();
  });

  it("returns null for empty input or empty prescription list", () => {
    expect(matchReportedDrill("", pending)).toBeNull();
    expect(matchReportedDrill("hip rotation", [])).toBeNull();
  });

  it("prefers exact match over substring when both available", () => {
    const p: Prescription[] = [
      { id: "a", drill_name: "Barbell punch" },
      { id: "b", drill_name: "Barbell punch drill variation" },
    ];
    expect(matchReportedDrill("Barbell punch", p)?.id).toBe("a");
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `npx vitest run src/lib/drill-matching.test.ts`
Expected: FAIL with import error.

- [ ] **Step 2.3: Implement the module**

Create `src/lib/drill-matching.ts`:

```typescript
export interface DrillPrescriptionLike {
  id: string;
  drill_name: string;
}

const FILLER_WORDS = new Set(["drill", "exercise", "the", "a", "an"]);

export function normalizeDrillName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !FILLER_WORDS.has(w))
    .join(" ");
}

/**
 * Match a reported drill name to the most likely pending prescription.
 * Strategy: normalize both, prefer exact match, then bidirectional substring containment.
 * Returns null if nothing is a confident match.
 */
export function matchReportedDrill<T extends DrillPrescriptionLike>(
  reportedName: string,
  pending: T[]
): T | null {
  const reported = normalizeDrillName(reportedName);
  if (!reported) return null;
  if (pending.length === 0) return null;

  // 1. Exact normalized match wins.
  for (const p of pending) {
    if (normalizeDrillName(p.drill_name) === reported) return p;
  }

  // 2. Substring containment either direction.
  for (const p of pending) {
    const norm = normalizeDrillName(p.drill_name);
    if (!norm) continue;
    if (reported.includes(norm) || norm.includes(reported)) return p;
  }

  return null;
}
```

- [ ] **Step 2.4: Run test to verify it passes**

Run: `npx vitest run src/lib/drill-matching.test.ts`
Expected: all tests PASS.

- [ ] **Step 2.5: Commit**

```bash
git add src/lib/drill-matching.ts src/lib/drill-matching.test.ts
git commit -m "feat(lib): drill matching helper — normalize + exact + substring fallback"
```

---

## Task 3: Migration 005 — schema foundation [PARALLEL]

**Files:**
- Create: `supabase/migrations/005_ambient_focus_foundation.sql`

- [ ] **Step 3.1: Write the migration**

Create `supabase/migrations/005_ambient_focus_foundation.sql`:

```sql
-- 005_ambient_focus_foundation.sql
-- Phase 1 of ambient trajectory: add dimension/source/last_surfaced_at to focus_areas,
-- replace fragile name-based dedup with a functional unique index.

-- Dimension taxonomy: one of the 8 canonical style-finder dimensions.
-- Nullable for legacy rows written before this migration.
ALTER TABLE focus_areas
  ADD COLUMN dimension text
    CHECK (dimension IS NULL OR dimension IN (
      'powerMechanics',
      'positionalReadiness',
      'rangeControl',
      'defensiveIntegration',
      'ringIQ',
      'outputPressure',
      'deceptionSetup',
      'killerInstinct'
    ));

-- Attribution: did this come from the quiz, a session extraction, or manual entry?
-- Legacy rows get 'session_extraction' since the quiz bridge didn't exist yet.
ALTER TABLE focus_areas
  ADD COLUMN source text NOT NULL DEFAULT 'session_extraction'
    CHECK (source IN ('quiz', 'session_extraction', 'manual'));

-- Throttle support: when did the coach last surface this focus area in a response?
ALTER TABLE focus_areas
  ADD COLUMN last_surfaced_at timestamptz;

-- Dedup: a user can have at most one focus area per (dimension, knowledge_node_slug) tuple.
-- Legacy rows with dimension IS NULL are excluded from the constraint — they'll be
-- superseded the next time the extraction runs, at which point dimension gets set.
-- COALESCE on slug ensures (dim, NULL) and (dim, '') don't collide as separate buckets.
CREATE UNIQUE INDEX idx_focus_areas_dedup
  ON focus_areas (user_id, dimension, COALESCE(knowledge_node_slug, ''))
  WHERE dimension IS NOT NULL;
```

- [ ] **Step 3.2: Apply migration to the Supabase project**

Apply via Supabase CLI (`supabase db push`) or paste the SQL into the Supabase dashboard SQL editor. Confirm success by running:

```sql
\d focus_areas
```

Expected: new columns `dimension`, `source`, `last_surfaced_at` present; check constraints visible; `idx_focus_areas_dedup` listed in indexes.

Also verify existing rows were preserved:

```sql
SELECT id, name, source, dimension FROM focus_areas LIMIT 5;
```

Expected: existing rows show `source='session_extraction'`, `dimension=NULL`.

- [ ] **Step 3.3: Commit**

```bash
git add supabase/migrations/005_ambient_focus_foundation.sql
git commit -m "feat(db): add dimension, source, last_surfaced_at to focus_areas + dedup index"
```

---

## Task 4: Rewrite save-session route [SEQUENTIAL — depends on Tasks 1, 2, 3]

**Files:**
- Modify: `src/app/api/coach/save-session/route.ts`

This task combines three related changes in one file: updated extraction prompt (emits dimension + slug), new dedup key in the upsert, and drill follow-up flip.

- [ ] **Step 4.1: Update imports and extraction prompt**

Open `src/app/api/coach/save-session/route.ts`. Replace the top of the file through `EXTRACTION_PROMPT` with:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { DIMENSION_KEYS, VAULT_SLUGS, dimensionLabelToKey, isDimensionKey } from "@/lib/dimensions";
import { matchReportedDrill } from "@/lib/drill-matching";

async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  throw new Error("Unreachable");
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const EXTRACTION_PROMPT = `You are extracting structured data from a boxing coaching conversation. The conversation is between a coach AI and a fighter logging their training session.

Extract the following as JSON:
{
  "session_type": "bag_work" | "shadow_boxing" | "sparring" | "drills" | "mixed",
  "rounds": <number or null>,
  "breakthroughs": ["specific breakthrough noted"],
  "struggles": ["specific struggle or ongoing issue"],
  "focus_areas_worked": ["name of focus area discussed"],
  "drills_done": ["drill name they reported doing"],
  "drills_prescribed": [{"name": "drill name", "details": "reps, sets, cues"}],
  "focus_area_updates": [{
    "name": "human-readable label",
    "dimension": "powerMechanics | positionalReadiness | rangeControl | defensiveIntegration | ringIQ | outputPressure | deceptionSetup | killerInstinct",
    "knowledge_node_slug": "<optional slug from the list below, or null>",
    "status": "new | active | improving | resolved",
    "description": "current state"
  }],
  "profile_updates": {
    "tendencies": {"key": "observation"},
    "skill_levels": {"key": "level"}
  },
  "onboarding_complete": true | false
}

## Dimension keys (REQUIRED for every focus_area_update)

Always pick the single best-fit dimension:
- powerMechanics — kinetic chain quality, how the punch is thrown
- positionalReadiness — stance, base, ability to fire from anywhere
- rangeControl — distance management, footwork for distance
- defensiveIntegration — defence + offence in one motion, head movement, blocking
- ringIQ — adaptation, reading opponents, pattern recognition
- outputPressure — volume, work rate, sustaining pace
- deceptionSetup — feints, combinations, misdirection
- killerInstinct — finishing, closing the show when they're hurt

## Knowledge node slugs (optional — only if the focus area maps to a specific vault node)

If the focus area is about a specific technique/drill/concept from the list below, include its slug. Otherwise set knowledge_node_slug to null.

Available slugs: ${VAULT_SLUGS.join(", ")}

## Rules
- Only include data explicitly discussed in the conversation
- For focus_area_updates, only include areas that were actively discussed
- Every focus_area_update MUST include a dimension from the 8 keys above
- knowledge_node_slug is optional; use null when no specific vault node applies
- Set onboarding_complete to true if this was an onboarding conversation and the user shared enough info
- Be conservative — don't infer things not stated
- Return ONLY valid JSON, no markdown fences`;
```

- [ ] **Step 4.2: Update the upsert block for focus_areas**

Replace the `// 3. Upsert focus areas` block (the whole `if (extracted.focus_area_updates ...)` block) with:

```typescript
    // 3. Upsert focus areas — dedup by (user_id, dimension, knowledge_node_slug)
    if (extracted.focus_area_updates && Array.isArray(extracted.focus_area_updates)) {
      for (const update of extracted.focus_area_updates) {
        // Require a valid dimension. If the LLM emitted something unrecognised, try the label
        // mapper as a fallback before skipping the update.
        const rawDim = update.dimension;
        const dimension = isDimensionKey(rawDim) ? rawDim : dimensionLabelToKey(String(rawDim ?? ""));
        if (!dimension) {
          console.warn("Skipping focus area update with unrecognised dimension:", update);
          continue;
        }

        const slug: string | null =
          typeof update.knowledge_node_slug === "string" && update.knowledge_node_slug.length > 0
            ? update.knowledge_node_slug
            : null;

        // NULL-safe slug match: use .is() for null, .eq() for a value.
        const baseQuery = supabase
          .from("focus_areas")
          .select("id, history")
          .eq("user_id", userId)
          .eq("dimension", dimension);
        const { data: existing } = await (slug === null
          ? baseQuery.is("knowledge_node_slug", null)
          : baseQuery.eq("knowledge_node_slug", slug)
        ).maybeSingle();

        if (existing) {
          const history = [...((existing.history as Array<{ date: string; note: string }>) ?? [])];
          history.push({ date: new Date().toISOString().split("T")[0], note: update.description });

          await supabase
            .from("focus_areas")
            .update({
              name: update.name,
              status: update.status,
              description: update.description,
              history,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        } else {
          await supabase.from("focus_areas").insert({
            user_id: userId,
            name: update.name,
            dimension,
            knowledge_node_slug: slug,
            source: "session_extraction",
            status: update.status ?? "new",
            description: update.description,
            history: [{ date: new Date().toISOString().split("T")[0], note: update.description }],
          });
        }
      }
    }
```

- [ ] **Step 4.3: Add drill follow-up flip**

Replace the `// 4. Save drill prescriptions` block with:

```typescript
    // 4a. Flip followed_up on pending prescriptions matching drills_done
    if (extracted.drills_done && Array.isArray(extracted.drills_done) && extracted.drills_done.length > 0) {
      const { data: pending } = await supabase
        .from("drill_prescriptions")
        .select("id, drill_name")
        .eq("user_id", userId)
        .eq("followed_up", false);

      const pendingList = (pending ?? []) as { id: string; drill_name: string }[];
      const flipIds = new Set<string>();
      for (const reported of extracted.drills_done as string[]) {
        const matched = matchReportedDrill(reported, pendingList);
        if (matched) flipIds.add(matched.id);
      }

      if (flipIds.size > 0) {
        await supabase
          .from("drill_prescriptions")
          .update({ followed_up: true, follow_up_notes: "Auto-flipped from session report" })
          .in("id", Array.from(flipIds));
      }
    }

    // 4b. Save new drill prescriptions from this session
    if (extracted.drills_prescribed && Array.isArray(extracted.drills_prescribed)) {
      for (const drill of extracted.drills_prescribed) {
        await supabase.from("drill_prescriptions").insert({
          user_id: userId,
          focus_area_id: null,
          session_id: session.id,
          drill_name: drill.name,
          details: drill.details ?? null,
        });
      }
    }
```

- [ ] **Step 4.4: Run type-check and lint**

Run: `npx tsc --noEmit`
Expected: no errors in `src/app/api/coach/save-session/route.ts`.

Run: `npm run lint`
Expected: no new lint errors.

- [ ] **Step 4.5: Run the full test suite**

Run: `npm test`
Expected: all existing tests still PASS (chat route test + new dimension + drill-matching tests).

- [ ] **Step 4.6: Commit**

```bash
git add src/app/api/coach/save-session/route.ts
git commit -m "feat(coach): dimension+slug extraction, dedup upsert, drill follow-up flip"
```

---

## Task 5: End-to-end verification [SEQUENTIAL]

**Files:** no code changes — this is a manual smoke test against a running dev server.

- [ ] **Step 5.1: Verify dev server boots cleanly**

Run: `npm run dev`
Expected: Next.js starts on port 3000 with no errors, no type errors in the console.

- [ ] **Step 5.2: Run a coaching session end-to-end**

In a browser at `http://localhost:3000`:
1. Click "My Coach" tab → "Log Session"
2. Have a short coaching exchange where you (as the user) mention working on a specific focus area (e.g., "I was drilling hip rotation today and my defensive head movement still feels slow"). Accept a drill prescription if the coach offers one.
3. Click "Finish & save session"

- [ ] **Step 5.3: Inspect the database**

In the Supabase SQL editor, run:

```sql
SELECT id, name, dimension, knowledge_node_slug, source, status
FROM focus_areas
WHERE user_id = '<your anonymous user id from localStorage punch-doctor-user-id>'
ORDER BY updated_at DESC
LIMIT 5;
```

Expected: at least one focus area with `dimension` set to one of the 8 keys, `source='session_extraction'`, and (if the session discussed a specific technique) `knowledge_node_slug` populated.

- [ ] **Step 5.4: Verify dedup works on a second session**

1. Log a second coaching session that touches the SAME focus area (same dimension, same or null slug).
2. Rerun the SQL query.

Expected: NO duplicate focus area for that (dimension, slug) — the existing row was updated in place, with a new entry in its `history` jsonb.

- [ ] **Step 5.5: Verify drill flip works**

If a drill was prescribed in session 1 and reported as done in session 2, run:

```sql
SELECT id, drill_name, followed_up, follow_up_notes
FROM drill_prescriptions
WHERE user_id = '<id>'
ORDER BY created_at DESC
LIMIT 5;
```

Expected: the drill from session 1 now has `followed_up=true` with `follow_up_notes='Auto-flipped from session report'`.

- [ ] **Step 5.6: Final commit if any follow-up tweaks were needed**

If any issues surfaced in 5.1–5.5 and required code tweaks, commit with an explanatory message. Otherwise this task is complete with no commit.

---

## Success Criteria

Phase 1 is complete when all of the following are true:

1. Migration 005 is applied; `focus_areas` has `dimension`, `source`, `last_surfaced_at` columns and `idx_focus_areas_dedup`.
2. `src/lib/dimensions.ts` and `src/lib/drill-matching.ts` exist with passing unit tests.
3. `save-session` extraction emits `dimension` + optional `knowledge_node_slug` for every focus area.
4. Focus areas are deduplicated by `(user_id, dimension, knowledge_node_slug)` — no duplicates on repeat sessions.
5. Reported drills (`drills_done`) flip matching pending prescriptions to `followed_up=true`.
6. End-to-end smoke test confirms the above against a real Supabase instance.

After this phase, Phases 2 (quiz bridge), 4 (ambient context), and 5 (behavioral summary) all become straightforward because `focus_areas` is now a trustworthy canonical source of truth.
