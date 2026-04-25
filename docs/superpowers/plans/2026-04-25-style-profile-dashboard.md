# Style Profile Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform `/?tab=style` post-quiz into a persistent style dashboard with bundled refinement-on-content-update, clickable dimension explainer drawers, and silent fighter re-rank.

**Architecture:** One new `narrative_stale` boolean column on `style_profiles`. A pure `profile-freshness` lib diffs current question/dimension/fighter sets against a saved profile (no version metadata stored). A `RefinementModal` runs only the unanswered questions; merge + recompute + INSERT happens **client-side** (matches existing `/api/style-finder` flow where the server returns AI output and the client INSERTs). A `DimensionDrawer` renders fully static editorial content keyed by `DimensionKey`. `narrative_stale=true` rows display a "Refresh my analysis" CTA that hits the existing `/api/style-finder` endpoint.

**Tech Stack:** Next.js 16.2.3 (App Router), React 19, Supabase (`@supabase/supabase-js` browser client, authed user), Tailwind v4, lucide-react icons, Vitest (`environment: "node"`, `src/**/*.test.ts` only — no React Testing Library; component-level testing is via Playwright e2e), Playwright for e2e.

**Spec:** [docs/superpowers/specs/2026-04-25-style-profile-dashboard-design.md](docs/superpowers/specs/2026-04-25-style-profile-dashboard-design.md)

## Spec deviation (one)

The spec proposes a new `/api/style-finder/refine` endpoint that does the merge + recompute + INSERT server-side. The plan **does not** create this endpoint. Reason: the existing `/api/style-finder/route.ts` does **not** insert into `style_profiles` — the client does (`src/components/style-finder-tab.tsx:173-188`). `computeDimensionScores()` and `matchFighters()` are pure functions already running client-side. Adding a new server endpoint that does what client-side code already does would be a new pattern and dead weight. The plan keeps merge + recompute + INSERT on the client, mirroring how the original quiz path works. **Server impact:** zero new endpoints; just one column added.

If a server-side endpoint is later wanted (e.g., for stricter validation or to centralize merge logic), it's a clean future add — the client merge code is small enough to lift.

---

## File layout

```
src/
  app/
    api/
      style-finder/
        route.ts                            # Task 9 — set narrative_stale: false on regen INSERT (client side; no route change)
  components/
    style-finder/
      dashboard-view.tsx                    # Task 2 — renamed from results-profile.tsx
      dimension-drawer.tsx                  # Task 4 — new
      refinement-modal.tsx                  # Task 7 — new
      radar-chart.tsx                       # Task 5 — modified to accept onDimensionClick
      fighter-match-card.tsx                # Task 10 — placeholder branch for missing explanation
    style-finder-tab.tsx                    # Tasks 8, 9, 11 — view state, freshness, refinement, regen, re-rank
    profile/
      style-snapshot.tsx                    # Task 12 — "Refresh available" pill
  data/
    dimension-explainers.ts                 # Task 3 — static editorial content
  lib/
    profile-freshness.ts                    # Task 6 — diff helpers
    profile-freshness.test.ts               # Task 6
    style-profile-storage.ts                # Task 8 — extracted INSERT helper (shared between regen + refine)
    style-profile-storage.test.ts           # Task 8 — pure helpers only (no Supabase)
supabase/
  migrations/
    010_style_profile_dashboard.sql         # Task 1
tests/
  e2e/
    style-dashboard.spec.ts                 # Task 13 — Playwright smoke
```

Naming notes used throughout this plan (lock these in early — Task 6 forward depends on them):
- Lib name is `profile-freshness` (not `style-freshness`).
- Drawer component is `<DimensionDrawer>`.
- Modal component is `<RefinementModal>`.
- Renamed dashboard component is `<DashboardView>` (export from `dashboard-view.tsx`); interface stays `StyleProfileResult`.
- Helper module for INSERTs is `style-profile-storage.ts` exporting `insertStyleProfileRow()`.

---

## Stage 1 — Visual reframe (ships independently)

### Task 1: Migration 010 — `narrative_stale` column

**Files:**
- Create: `supabase/migrations/010_style_profile_dashboard.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 010_style_profile_dashboard.sql
-- Adds narrative_stale flag to style_profiles. True when refinement updated
-- dimension_scores without regenerating the AI narrative; false otherwise.
-- Default false so existing rows (whose ai_result was generated alongside their scores) stay correct.

ALTER TABLE style_profiles
  ADD COLUMN narrative_stale boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db push` (or `supabase db push` if linked). If the project uses local-only migrations, the next step (`db reset` or local apply) will be project-specific — confirm by inspecting `supabase/.temp/linked-project.json`.

Expected: column added, no errors. Verify with `psql` or Supabase studio:
```
\d style_profiles
```
should show `narrative_stale | boolean | not null default false`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/010_style_profile_dashboard.sql
git commit -m "feat(style-dashboard): add narrative_stale column to style_profiles"
```

---

### Task 2: Rename results-profile → dashboard-view; demote retake to footer link

**Files:**
- Rename: `src/components/style-finder/results-profile.tsx` → `src/components/style-finder/dashboard-view.tsx`
- Modify: `src/components/style-finder-tab.tsx` — update import + usage
- Modify (search-and-replace any other importers): grep first

- [ ] **Step 1: Find all importers of `results-profile`**

Run: `grep -rn "results-profile\|ResultsProfile" src/ tests/`

Expected: hits in `src/components/style-finder-tab.tsx` (importing `ResultsProfile` and `StyleProfileResult` type). No other importers expected. If grep finds others, include them in step 3.

- [ ] **Step 2: Rename the file**

```bash
git mv src/components/style-finder/results-profile.tsx src/components/style-finder/dashboard-view.tsx
```

- [ ] **Step 3: Rename the exported component inside the file**

In `src/components/style-finder/dashboard-view.tsx`:
- Rename function `ResultsProfile` → `DashboardView` at the export site.
- Keep the `StyleProfileResult` interface name and all other exports unchanged (they're consumed by `style-finder-tab.tsx` and the type system).
- Rename the `ResultsProfileProps` interface → `DashboardViewProps`.

- [ ] **Step 4: Update the importers**

In `src/components/style-finder-tab.tsx:6-7`:

```typescript
import { DashboardView } from "./style-finder/dashboard-view";
import type { StyleProfileResult } from "./style-finder/dashboard-view";
```

In the JSX render (currently around line 232):

```tsx
return (
  <DashboardView
    result={result}
    physicalContext={physicalContext}
    experienceLevel={experienceLevel}
    previousScores={previousScores}
    onRetake={handleRetake}
    onAskCoach={onSwitchToChat}
    profileId={profileId}
  />
);
```

The local `view: "quiz" | "loading" | "results"` type stays unchanged in this task — view-state widening to `"dashboard"` happens in Task 8 once refinement state requires the distinction. (For Stage 1, `"results"` is the dashboard.)

- [ ] **Step 5: Demote the "Retake quiz" button to a footer link**

Inside `dashboard-view.tsx`, the existing primary "Retake quiz" button (currently rendered prominently with `<RotateCcw>` icon — find it via `grep onRetake src/components/style-finder/dashboard-view.tsx`) should be replaced with:

1. Remove the prominent button from wherever it currently sits (likely top-right of the header area).
2. Add at the bottom of the dashboard, just before any close container `</div>`:

```tsx
<footer className="mt-8 pt-4 border-t border-border text-center">
  <button
    type="button"
    onClick={() => {
      if (window.confirm("Start over from a blank quiz? You'll lose your refinement progress on this profile.")) {
        onRetake();
      }
    }}
    className="text-xs text-muted hover:text-foreground underline-offset-2 hover:underline"
  >
    Start over with a blank quiz
  </button>
</footer>
```

Update the page header: change any "Your Style Results" or quiz-output framing to "Your fighting style". Look for headings inside `dashboard-view.tsx` (likely `<h1>` or `<h2>` near the top of the JSX) and adjust copy.

- [ ] **Step 6: Run typecheck + tests + lint**

Run: `npm run lint && npx tsc --noEmit && npm run test`

Expected: all pass. Lint may flag unused imports — clean them up if so.

- [ ] **Step 7: Manual smoke**

Run: `npm run dev`, take the quiz, land on the dashboard. Confirm:
- Page is titled "Your fighting style" (or your chosen reframe).
- "Retake quiz" is a small footer link, not a prominent button.
- Clicking it shows the confirm dialog.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(style-dashboard): rename results-profile → dashboard-view, demote retake"
```

---

## Stage 2 — Dimension explainers

### Task 3: Static dimension explainer content

**Files:**
- Create: `src/data/dimension-explainers.ts`
- Create: `src/data/dimension-explainers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/data/dimension-explainers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { DIMENSION_KEYS } from "@/lib/dimensions";
import { DIMENSION_EXPLAINERS } from "./dimension-explainers";

describe("DIMENSION_EXPLAINERS", () => {
  it("has an entry for every DimensionKey", () => {
    for (const key of DIMENSION_KEYS) {
      expect(DIMENSION_EXPLAINERS[key], `missing entry for ${key}`).toBeDefined();
    }
  });

  it("each entry has definition, bands, and drills", () => {
    for (const key of DIMENSION_KEYS) {
      const e = DIMENSION_EXPLAINERS[key];
      expect(e.definition.length, `${key} definition empty`).toBeGreaterThan(0);
      expect(Object.keys(e.bands).sort(), `${key} bands incomplete`).toEqual(
        ["below_avg", "average", "strong", "elite", "peak"].sort()
      );
      expect(e.drills.length, `${key} has no drills`).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- dimension-explainers`
Expected: FAIL — `Cannot find module './dimension-explainers'`.

- [ ] **Step 3: Implement with placeholder copy**

Create `src/data/dimension-explainers.ts`:

```typescript
import type { DimensionKey } from "@/lib/dimensions";

export type ScoreBand = "below_avg" | "average" | "strong" | "elite" | "peak";

export interface DimensionExplainer {
  /** ~80–100 words. What this dimension means in Alex's framework. */
  definition: string;
  /** Per-band one-line interpretation. */
  bands: Record<ScoreBand, string>;
  /** 2–3 short drill suggestions. */
  drills: string[];
}

export function bandFor(score: number): ScoreBand {
  if (score < 40) return "below_avg";
  if (score < 60) return "average";
  if (score < 75) return "strong";
  if (score < 90) return "elite";
  return "peak";
}

export const BAND_LABELS: Record<ScoreBand, string> = {
  below_avg: "Below average",
  average: "Average",
  strong: "Strong",
  elite: "Elite",
  peak: "Peak",
};

// PLACEHOLDER copy — to be replaced with Alex-authored content before launch.
// Engineering scaffolding only. Each `definition` ≈ 80–100 words; `bands` = one
// sentence per band; `drills` = 2–3 short strings.
export const DIMENSION_EXPLAINERS: Record<DimensionKey, DimensionExplainer> = {
  powerMechanics: {
    definition:
      "Power Mechanics measures how efficiently your body transfers ground reaction force into your fist. It's not about raw strength — it's about kinetic-chain integration: weight shift, hip rotation, oblique-to-serratus connection, and wrist alignment at impact. High scorers generate concussive force from compact movements; low scorers arm-punch and lose energy through breaks in the chain.",
    bands: {
      below_avg: "Punches are arm-driven; minimal hip and ground engagement.",
      average: "Some kinetic chain present; lacks consistency under fatigue.",
      strong: "Solid weight transfer most of the time; gaps in compound combinations.",
      elite: "Reliable through the full kinetic chain; transfers across angles.",
      peak: "Force transfer is automatic; punches feel light to throw, heavy to receive.",
    },
    drills: [
      "Bag work focused on hip-rotation lead with relaxed shoulders",
      "Heavy bag single-shot drills emphasizing weight transfer over speed",
      "Shadow-boxing with foot-stomp markers to feel ground reaction force",
    ],
  },
  positionalReadiness: {
    definition:
      "Positional Readiness is your ability to stay in a position from which you can attack, defend, or move at any moment. High scorers maintain stance integrity through exchanges; low scorers crash forward, square up, or get caught flat-footed. This is the foundation Alex calls 'always being ready to throw the next punch'.",
    bands: {
      below_avg: "Frequently out of stance after combinations.",
      average: "Holds stance early but breaks down under pressure.",
      strong: "Stance integrity through most exchanges; recovers quickly.",
      elite: "Always in position to throw; balanced across feints and slips.",
      peak: "Stance is the default — every action returns to a ready posture.",
    },
    drills: [
      "Shadow-boxing with a focus on returning hands and weight to stance after every combo",
      "3-punch combinations with mandatory pivot or step before the next combination",
      "Mirror work — partner mirrors your stance, you reset between every action",
    ],
  },
  rangeControl: {
    definition:
      "Range Control measures how well you dictate the distance of the fight. High scorers stay where their punches land and their opponent's don't — they own the edge of the bubble. Low scorers either crash inside without setup or drift to the perimeter without committing.",
    bands: {
      below_avg: "Distance is reactive; opponent dictates when exchanges happen.",
      average: "Can hold range against same-stance opponents; struggles vs. southpaws.",
      strong: "Imposes range against most styles; cuts the ring deliberately.",
      elite: "Owns the edge of the bubble; opponent fights at your distance.",
      peak: "Distance manipulation is itself a weapon — feints land like punches.",
    },
    drills: [
      "Jab-and-pivot drills with partner stepping in and out",
      "Footwork-only sparring rounds (no contact) focused on maintaining/changing range",
      "Long-bag work emphasizing the in-and-out without committing to combinations",
    ],
  },
  defensiveIntegration: {
    definition:
      "Defensive Integration is whether your defense flows naturally into your offense. High scorers slip-counter, parry-jab, roll-hook in single rhythm; low scorers either turtle (defense-only) or trade (offense-only). Alex frames this as 'the punch that lands is the one that follows the slip'.",
    bands: {
      below_avg: "Defense and offense are separate phases.",
      average: "Counter happens but with a delay; rhythm break is visible.",
      strong: "Slip-counter and parry-counter integrated against straight punches.",
      elite: "Defense-into-offense across all punch types; counters land in rhythm.",
      peak: "Defensive movement IS offensive setup — every block is a feint.",
    },
    drills: [
      "Partner slow-jab → slip + counter, repeated until it's reflexive",
      "Pad work with the coach mixing defensive cues into offensive sequences",
      "Sparring rounds with explicit rule: no offense without preceding defense",
    ],
  },
  ringIQ: {
    definition:
      "Ring IQ is your ability to read and adapt mid-fight. High scorers diagnose patterns within the first round and adjust their game plan; low scorers run the same script regardless of feedback. This is what separates technicians from athletes — the willingness and skill to change tools mid-exchange.",
    bands: {
      below_avg: "Same approach all three rounds, regardless of result.",
      average: "Adjusts between rounds; struggles to adjust mid-round.",
      strong: "Mid-round adjustments visible; reads opponent's primary tells.",
      elite: "Reads multiple layers (range, rhythm, intent); adjusts tools dynamically.",
      peak: "Several plans deep; sets up the opponent's adjustment with a counter-plan.",
    },
    drills: [
      "Sparring with self-imposed constraints (only jab; only southpaw; only counters) to expand toolkit",
      "Post-round verbal de-brief: identify one thing the opponent did and one thing you'll change",
      "Watch and break down 3 rounds of an opponent type you struggle against",
    ],
  },
  outputPressure: {
    definition:
      "Output & Pressure measures how much you make the opponent fight. High scorers force exchanges, punish breathing room, and turn passive moments into combinations. Low scorers wait — they fight reactively and let the opponent breathe.",
    bands: {
      below_avg: "Reactive; rarely initiates exchanges.",
      average: "Initiates in flurries with long gaps between.",
      strong: "Sustained pressure for 2–3 rounds; output drops late.",
      elite: "Consistent pressure across rounds; opponent never gets clean rest.",
      peak: "Pressure is suffocating — opponent's reads break down under volume.",
    },
    drills: [
      "Round-clock work: continuous output for the full 3 minutes, technique secondary",
      "Pad rounds with a 'no rest' rule — every breath is followed by a punch",
      "Combination cards: pull a random 4-punch sequence every 30s and execute on the bag",
    ],
  },
  deceptionSetup: {
    definition:
      "Deception & Setup is how well you make the opponent expect the wrong thing. High scorers use feints, broken rhythm, and posture changes to set up real punches. Low scorers telegraph — every punch arrives unmasked.",
    bands: {
      below_avg: "Punches are telegraphed; opponent reads intent early.",
      average: "Some basic feints; setups are repetitive.",
      strong: "Multiple feint families; commits are mostly disguised.",
      elite: "Feints and real punches are indistinguishable until late.",
      peak: "Pattern manipulation — opponent reacts to phantom commitments.",
    },
    drills: [
      "Shadow-boxing where 50% of punches are feints, 50% are real, identical setup",
      "Partner drill: throw 3-punch combos where the first one is a feint and partner must guess which",
      "Rhythm-breaking pad work — coach varies the call timing, you maintain composure",
    ],
  },
  killerInstinct: {
    definition:
      "Killer Instinct is the willingness and skill to escalate when the opponent is hurt. High scorers recognize the moment and finish; low scorers either miss it (no recognition) or hesitate (no commitment). Alex frames this as 'the difference between winning rounds and ending fights'.",
    bands: {
      below_avg: "Doesn't recognize hurt opponents; fights at the same intensity throughout.",
      average: "Recognizes the moment but hesitates to commit.",
      strong: "Commits when opponent is clearly hurt; can over-commit and gas.",
      elite: "Reads and exploits hurt windows efficiently without abandoning structure.",
      peak: "Stalks the kill — every exchange is set up to convert if the opportunity opens.",
    },
    drills: [
      "Sparring with explicit 'pressure round' rules — when the bell rings, escalate intent",
      "Heavy-bag finishing combos: 8–12 punches at full output to simulate finishing sequences",
      "Pad work with a coach yelling 'GO' randomly — you immediately commit a 5-punch finish",
    ],
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- dimension-explainers`
Expected: PASS, both tests green.

- [ ] **Step 5: Commit**

```bash
git add src/data/dimension-explainers.ts src/data/dimension-explainers.test.ts
git commit -m "feat(style-dashboard): add static dimension explainer content (placeholder copy)"
```

---

### Task 4: DimensionDrawer component

**Files:**
- Create: `src/components/style-finder/dimension-drawer.tsx`

No unit test for this component — Vitest is `environment: "node"` and there's no RTL setup. Behavior verified via Task 13 e2e.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { X } from "lucide-react";
import type { DimensionKey } from "@/lib/dimensions";
import { DIMENSION_LABELS } from "@/data/fighter-profiles";
import {
  DIMENSION_EXPLAINERS,
  BAND_LABELS,
  bandFor,
} from "@/data/dimension-explainers";

interface DimensionDrawerProps {
  dimensionKey: DimensionKey | null; // null = closed
  score: number;
  onClose: () => void;
  onAskCoach?: (query: string) => void;
}

export function DimensionDrawer({
  dimensionKey,
  score,
  onClose,
  onAskCoach,
}: DimensionDrawerProps) {
  if (!dimensionKey) return null;

  const explainer = DIMENSION_EXPLAINERS[dimensionKey];
  const band = bandFor(score);
  const label = DIMENSION_LABELS[dimensionKey];

  return (
    <div
      className="fixed inset-0 z-40 flex items-stretch justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={`${label} details`}
      onClick={onClose}
    >
      <aside
        className="w-full max-w-md h-full overflow-y-auto bg-surface border-l border-border p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">{label}</h2>
            <p className="text-sm text-muted mt-1">
              Your score: <span className="text-foreground font-medium">{score}</span>{" "}
              <span className="text-muted">— {BAND_LABELS[band]}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md border border-border p-1 hover:bg-background"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <section className="mb-5">
          <h3 className="text-xs uppercase text-muted mb-1">What this is</h3>
          <p className="text-sm leading-relaxed">{explainer.definition}</p>
        </section>

        <section className="mb-5">
          <h3 className="text-xs uppercase text-muted mb-1">What your score means</h3>
          <p className="text-sm leading-relaxed">{explainer.bands[band]}</p>
        </section>

        <section className="mb-5">
          <h3 className="text-xs uppercase text-muted mb-2">Drills to develop this</h3>
          <ul className="space-y-2">
            {explainer.drills.map((drill, i) => (
              <li key={i} className="text-sm leading-snug pl-3 border-l border-border">
                {drill}
              </li>
            ))}
          </ul>
        </section>

        {onAskCoach && (
          <button
            type="button"
            onClick={() =>
              onAskCoach(`Help me develop my ${label}. My score is ${score}.`)
            }
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-surface"
          >
            Ask the coach about your {label} →
          </button>
        )}
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/style-finder/dimension-drawer.tsx
git commit -m "feat(style-dashboard): add DimensionDrawer component"
```

---

### Task 5: Wire DimensionDrawer into RadarChart and DashboardView

**Files:**
- Modify: `src/components/style-finder/radar-chart.tsx` — accept optional `onDimensionClick` prop
- Modify: `src/components/style-finder/dashboard-view.tsx` — own drawer state, pass click handler

- [ ] **Step 1: Modify RadarChart to support click**

In `src/components/style-finder/radar-chart.tsx`:

Update the props interface and the label rendering:

```tsx
import type { DimensionScores } from "@/data/fighter-profiles";

interface RadarChartProps {
  scores: DimensionScores;
  onDimensionClick?: (key: keyof DimensionScores) => void;
}

// ... (CHART_LABELS, polarToCartesian etc. unchanged)

export function RadarChart({ scores, onDimensionClick }: RadarChartProps) {
  // ... unchanged setup ...

  return (
    <div className="w-full max-w-sm mx-auto aspect-square">
      <svg viewBox="0 0 300 300" className="w-full h-full overflow-visible">
        {/* ... rings, axes, polygon, dots — unchanged ... */}

        {/* Axis labels — now clickable when onDimensionClick is provided */}
        {DIMENSIONS.map((dim, i) => {
          const angle = startAngle + i * angleStep;
          const pos = polarToCartesian(angle, 100, LABEL_RADIUS);

          let anchor: "start" | "middle" | "end" = "middle";
          if (pos.x < CENTER - 10) anchor = "end";
          else if (pos.x > CENTER + 10) anchor = "start";

          let dy = "0.35em";
          if (pos.y < CENTER - 30) dy = "0em";
          if (pos.y > CENTER + 30) dy = "0.8em";

          const labelEl = (
            <text
              x={pos.x}
              y={pos.y}
              textAnchor={anchor}
              dy={dy}
              fill="currentColor"
              className={onDimensionClick ? "text-foreground cursor-pointer underline-offset-2 hover:underline" : "text-foreground"}
              fontSize={10}
              fontWeight={500}
            >
              {CHART_LABELS[dim]}
            </text>
          );

          if (!onDimensionClick) {
            return <g key={dim}>{labelEl}</g>;
          }

          return (
            <g
              key={dim}
              role="button"
              tabIndex={0}
              onClick={() => onDimensionClick(dim)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onDimensionClick(dim);
                }
              }}
              style={{ cursor: "pointer" }}
            >
              {labelEl}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Wire drawer state into DashboardView**

In `src/components/style-finder/dashboard-view.tsx`, near the top of the function component (find the function body that starts after the `function buildStyleSuggestions` helper):

Add imports:
```tsx
import { useState } from "react";
import { DimensionDrawer } from "./dimension-drawer";
import type { DimensionKey } from "@/lib/dimensions";
```

Add state at the top of the component:
```tsx
const [drawerKey, setDrawerKey] = useState<DimensionKey | null>(null);
```

Find the existing `<RadarChart scores={result.dimension_scores} />` call and replace with:
```tsx
<RadarChart
  scores={result.dimension_scores}
  onDimensionClick={(k) => setDrawerKey(k as DimensionKey)}
/>
```

Just before the closing tag of the dashboard's outermost `<div>`, render the drawer:
```tsx
<DimensionDrawer
  dimensionKey={drawerKey}
  score={drawerKey ? result.dimension_scores[drawerKey] : 0}
  onClose={() => setDrawerKey(null)}
  onAskCoach={onAskCoach}
/>
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 4: Manual smoke**

Run: `npm run dev`. On the dashboard, hover the radar labels — they show as clickable. Click "Power" → drawer opens with the placeholder content. Close. Click another dimension. Press Enter on a focused label — drawer should still open (keyboard accessible).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(style-dashboard): clickable radar dimensions + drawer wiring"
```

---

## Stage 3 — Refinement + freshness

### Task 6: profile-freshness lib (diff helpers)

**Files:**
- Create: `src/lib/profile-freshness.ts`
- Create: `src/lib/profile-freshness.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/profile-freshness.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  getMissingQuestionIds,
  getMissingDimensions,
  compareTopFighters,
} from "./profile-freshness";

describe("profile-freshness", () => {
  describe("getMissingQuestionIds", () => {
    it("returns IDs in current set but not in answers", () => {
      const result = getMissingQuestionIds(
        { stance: "orthodox", height: "tall" },
        ["stance", "height", "build", "reach"]
      );
      expect(result.sort()).toEqual(["build", "reach"]);
    });

    it("ignores stored answers for IDs no longer present", () => {
      // 'deprecated_q' was removed from the question set
      const result = getMissingQuestionIds(
        { stance: "orthodox", deprecated_q: "x" },
        ["stance", "build"]
      );
      expect(result).toEqual(["build"]);
    });

    it("returns empty when all current IDs are answered", () => {
      const result = getMissingQuestionIds(
        { a: "x", b: "y" },
        ["a", "b"]
      );
      expect(result).toEqual([]);
    });
  });

  describe("getMissingDimensions", () => {
    it("returns dimension keys not present in scores", () => {
      const result = getMissingDimensions({
        powerMechanics: 50,
        positionalReadiness: 60,
      });
      expect(result).toContain("rangeControl");
      expect(result).not.toContain("powerMechanics");
    });

    it("returns empty when all 8 dimensions are present", () => {
      const result = getMissingDimensions({
        powerMechanics: 50,
        positionalReadiness: 60,
        rangeControl: 70,
        defensiveIntegration: 55,
        ringIQ: 65,
        outputPressure: 50,
        deceptionSetup: 60,
        killerInstinct: 70,
      });
      expect(result).toEqual([]);
    });
  });

  describe("compareTopFighters", () => {
    it("returns changed=false when slugs and order match", () => {
      const stored = [{ slug: "mike-tyson" }, { slug: "alex-pereira" }];
      const fresh = [{ slug: "mike-tyson" }, { slug: "alex-pereira" }];
      expect(compareTopFighters(stored, fresh).changed).toBe(false);
    });

    it("returns changed=true when slugs differ", () => {
      const stored = [{ slug: "mike-tyson" }, { slug: "alex-pereira" }];
      const fresh = [{ slug: "mike-tyson" }, { slug: "lomachenko" }];
      expect(compareTopFighters(stored, fresh).changed).toBe(true);
    });

    it("returns changed=true when order differs", () => {
      const stored = [{ slug: "mike-tyson" }, { slug: "alex-pereira" }];
      const fresh = [{ slug: "alex-pereira" }, { slug: "mike-tyson" }];
      expect(compareTopFighters(stored, fresh).changed).toBe(true);
    });

    it("returns changed=true when lengths differ", () => {
      const stored = [{ slug: "mike-tyson" }];
      const fresh = [{ slug: "mike-tyson" }, { slug: "alex-pereira" }];
      expect(compareTopFighters(stored, fresh).changed).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- profile-freshness`
Expected: FAIL — `Cannot find module './profile-freshness'`.

- [ ] **Step 3: Implement**

Create `src/lib/profile-freshness.ts`:

```typescript
import type { DimensionScores } from "@/data/fighter-profiles";
import { DIMENSION_KEYS, type DimensionKey } from "./dimensions";

/**
 * Returns the IDs from `currentQuestionIds` that are missing from `answers`.
 * Stored answers for IDs no longer in the current set are ignored — we only
 * surface forward-facing gaps.
 */
export function getMissingQuestionIds(
  answers: Record<string, unknown>,
  currentQuestionIds: readonly string[]
): string[] {
  return currentQuestionIds.filter((id) => !(id in answers));
}

/** Returns dimension keys that are missing from a stored scores object. */
export function getMissingDimensions(
  scores: Partial<DimensionScores>
): DimensionKey[] {
  return DIMENSION_KEYS.filter((k) => !(k in scores));
}

interface MinimalFighter {
  slug: string;
}

/**
 * Compare a stored top-N fighter list (from style_profiles.matched_fighters)
 * against a freshly computed list (from matchFighters()). Order matters —
 * a re-rank where slug set is identical but order differs is also a change.
 */
export function compareTopFighters(
  stored: readonly MinimalFighter[],
  fresh: readonly MinimalFighter[]
): { changed: boolean } {
  if (stored.length !== fresh.length) return { changed: true };
  for (let i = 0; i < stored.length; i++) {
    if (stored[i].slug !== fresh[i].slug) return { changed: true };
  }
  return { changed: false };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- profile-freshness`
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/profile-freshness.ts src/lib/profile-freshness.test.ts
git commit -m "feat(style-dashboard): profile-freshness diff helpers"
```

---

### Task 7: RefinementModal component

**Files:**
- Create: `src/components/style-finder/refinement-modal.tsx`

A focused modal that iterates only the unanswered question IDs. We don't reuse the full `<Questionnaire>` because it owns its own progress saving and full sequence; this is a stripped-down version. Behavior verified in Task 13 e2e.

- [ ] **Step 1: Create the modal**

```tsx
"use client";

import { useState } from "react";
import { X, ChevronRight } from "lucide-react";
import { allQuestions } from "@/data/questions";
import type { Question } from "@/data/questions";

interface RefinementModalProps {
  questionIds: string[];
  onSubmit: (newAnswers: Record<string, string | string[] | number>) => void;
  onClose: () => void;
}

function getQuestion(id: string): Question | undefined {
  return allQuestions.find((q) => q.id === id);
}

export function RefinementModal({
  questionIds,
  onSubmit,
  onClose,
}: RefinementModalProps) {
  const [answers, setAnswers] = useState<Record<string, string | string[] | number>>({});
  const [index, setIndex] = useState(0);

  const questions = questionIds
    .map(getQuestion)
    .filter((q): q is Question => q !== undefined);

  const total = questions.length;
  const current = questions[index];
  const isLast = index === total - 1;
  const allAnswered = questions.every((q) => q.id in answers);

  if (total === 0) {
    // Defensive — should not be opened with an empty list.
    return null;
  }

  function chooseSingle(qId: string, value: string) {
    const next = { ...answers, [qId]: value };
    setAnswers(next);
    if (!isLast) {
      setTimeout(() => setIndex((i) => i + 1), 200);
    }
  }

  function toggleMulti(qId: string, value: string, max: number) {
    const cur = (answers[qId] as string[] | undefined) ?? [];
    let next: string[];
    if (cur.includes(value)) {
      next = cur.filter((v) => v !== value);
    } else if (cur.length < max) {
      next = [...cur, value];
    } else {
      return;
    }
    setAnswers({ ...answers, [qId]: next });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Refine your profile"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-surface border border-border p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Refine your profile</h2>
            <p className="text-xs text-muted mt-0.5">
              Question {index + 1} of {total}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md border border-border p-1 hover:bg-background"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm font-medium mb-3">{current.question}</p>
        {current.honestPrompt && (
          <p className="text-xs text-muted italic mb-3">{current.honestPrompt}</p>
        )}

        <div className="space-y-2 mb-4">
          {current.format === "multiselect"
            ? current.options.map((opt) => {
                const cur = (answers[current.id] as string[] | undefined) ?? [];
                const checked = cur.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      toggleMulti(current.id, opt.value, current.maxSelections ?? 3)
                    }
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                      checked ? "border-accent bg-accent/10" : "border-border"
                    }`}
                  >
                    <div className="font-medium">{opt.label}</div>
                    {opt.description && (
                      <div className="text-xs text-muted">{opt.description}</div>
                    )}
                  </button>
                );
              })
            : current.options.map((opt) => {
                const cur = answers[current.id];
                const selected = cur === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => chooseSingle(current.id, opt.value)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                      selected ? "border-accent bg-accent/10" : "border-border"
                    }`}
                  >
                    <div className="font-medium">{opt.label}</div>
                    {opt.description && (
                      <div className="text-xs text-muted">{opt.description}</div>
                    )}
                  </button>
                );
              })}
        </div>

        <div className="flex justify-between items-center">
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            className="text-xs text-muted disabled:opacity-50"
          >
            ← Back
          </button>
          {isLast ? (
            <button
              type="button"
              disabled={!allAnswered}
              onClick={() => onSubmit(answers)}
              className="rounded-md bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              Refine
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
              disabled={!(current.id in answers)}
              className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Next <ChevronRight className="inline h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/style-finder/refinement-modal.tsx
git commit -m "feat(style-dashboard): add RefinementModal component"
```

---

### Task 8: Refinement banner + client-side merge + INSERT helper

**Files:**
- Create: `src/lib/style-profile-storage.ts`
- Create: `src/lib/style-profile-storage.test.ts`
- Modify: `src/components/style-finder-tab.tsx`
- Modify: `src/components/style-finder/dashboard-view.tsx`

This task introduces refinement end-to-end. The merge + INSERT logic is extracted to a small storage helper so it can be unit-tested without Supabase.

- [ ] **Step 1: Write failing tests for the merge helper**

Create `src/lib/style-profile-storage.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { mergeAnswersForRefinement } from "./style-profile-storage";

describe("mergeAnswersForRefinement", () => {
  it("merges new answers on top of existing ones", () => {
    const result = mergeAnswersForRefinement(
      { stance: "orthodox", height: "tall" },
      { build: "lean", reach: "long" }
    );
    expect(result).toEqual({
      stance: "orthodox",
      height: "tall",
      build: "lean",
      reach: "long",
    });
  });

  it("new answers overwrite existing ones for same key", () => {
    const result = mergeAnswersForRefinement(
      { stance: "orthodox" },
      { stance: "southpaw" }
    );
    expect(result).toEqual({ stance: "southpaw" });
  });

  it("does not mutate the inputs", () => {
    const prev = { stance: "orthodox" };
    const newOnes = { build: "lean" };
    mergeAnswersForRefinement(prev, newOnes);
    expect(prev).toEqual({ stance: "orthodox" });
    expect(newOnes).toEqual({ build: "lean" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- style-profile-storage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `src/lib/style-profile-storage.ts`:

```typescript
import type { DimensionScores } from "@/data/fighter-profiles";

export type AnswerValue = string | string[] | number;

/** Pure merge — new answers shadow prev. Does not mutate inputs. */
export function mergeAnswersForRefinement(
  prev: Record<string, AnswerValue>,
  newOnes: Record<string, AnswerValue>
): Record<string, AnswerValue> {
  return { ...prev, ...newOnes };
}

/**
 * Shape of the row we INSERT into style_profiles for a refinement event.
 * `ai_result`, `fighter_explanations` (inside ai_result), and `counter_fighters`
 * are carried forward from the previous row; `narrative_stale` is set true.
 */
export interface RefinementInsertPayload {
  user_id: string;
  answers: Record<string, AnswerValue>;
  dimension_scores: DimensionScores;
  physical_context: { height: string; build: string; reach: string; stance: string };
  experience_level: string;
  ai_result: unknown; // carried forward from previous current row
  matched_fighters: Array<{ name: string; slug: string; overlappingDimensions: string[] }>;
  counter_fighters: unknown[]; // carried forward
  narrative_stale: true;
}

/**
 * Shape of the row we INSERT after an explicit narrative regen (POST /api/style-finder).
 * narrative_stale is explicit false (not relying on the column default — see spec).
 */
export interface RegenInsertPayload {
  user_id: string;
  answers: Record<string, AnswerValue>;
  dimension_scores: DimensionScores;
  physical_context: { height: string; build: string; reach: string; stance: string };
  experience_level: string;
  ai_result: unknown;
  matched_fighters: Array<{ name: string; slug: string; overlappingDimensions: string[] }>;
  counter_fighters: unknown[];
  narrative_stale: false;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- style-profile-storage`
Expected: PASS.

- [ ] **Step 5: Widen the view-state union and add the dashboard view alias**

In `src/components/style-finder-tab.tsx`, around line 13:

```typescript
type ViewState = "quiz" | "loading" | "dashboard";
```

Then everywhere that compared `view === "results"` or set `setView("results")`, change to `"dashboard"`. Use grep to find: `grep -n '"results"' src/components/style-finder-tab.tsx`. There's at least one in `handleQuizComplete` and one in the `useEffect` load path.

- [ ] **Step 6: Add freshness state in StyleFinderTab**

In `src/components/style-finder-tab.tsx`, near the existing `useState` block at the top of the component:

```tsx
import { allQuestions } from "@/data/questions";
import { getMissingQuestionIds } from "@/lib/profile-freshness";
import { computeDimensionScores } from "@/lib/dimension-scoring";
import { matchFighters } from "@/lib/fighter-matching";
import { mergeAnswersForRefinement } from "@/lib/style-profile-storage";
import { RefinementModal } from "./style-finder/refinement-modal";

// existing imports above already include some of these; keep one copy each.

// ...inside the component:
const [storedAnswers, setStoredAnswers] = useState<Record<string, string | string[] | number>>({});
const [narrativeStale, setNarrativeStale] = useState(false);
const [refinementOpen, setRefinementOpen] = useState(false);
```

In the load path (the `useEffect` that fetches the saved profile), capture `data.answers` and `data.narrative_stale`:

```tsx
if (data) {
  setResult({ /* ...existing... */ });
  setPhysicalContext(data.physical_context as typeof physicalContext);
  setExperienceLevel((data.experience_level as string) ?? "beginner");
  setProfileId(data.id as string);
  setStoredAnswers((data.answers as Record<string, string | string[] | number>) ?? {});
  setNarrativeStale(Boolean(data.narrative_stale));
  setView("dashboard");
  return;
}
```

For the localStorage fallback path, the saved blob currently doesn't store `answers` — extend the localStorage shape:

```tsx
// when SAVING (in handleQuizComplete around line 144):
localStorage.setItem("boxing-coach-style-profile", JSON.stringify({
  result: profileResult,
  physicalContext: physical,
  experienceLevel: expLevel,
  answers,
  narrativeStale: false,
}));

// when LOADING (in the localStorage fallback around line 62):
const parsed = JSON.parse(saved);
setResult({ ...parsed.result, counter_fighters: parsed.result?.counter_fighters ?? [] });
setPhysicalContext(parsed.physicalContext);
setExperienceLevel(parsed.experienceLevel);
setStoredAnswers(parsed.answers ?? {});
setNarrativeStale(Boolean(parsed.narrativeStale));
setView("dashboard");
```

Note the `setView("dashboard")` replaces the existing `setView("results")`.

- [ ] **Step 7: Compute missing question IDs and add the refinement handler**

Still in `src/components/style-finder-tab.tsx`, after the `setStoredAnswers` state but before the `return` JSX:

```tsx
const missingQuestionIds = getMissingQuestionIds(
  storedAnswers,
  allQuestions.map((q) => q.id)
);

async function handleRefinementSubmit(newAnswers: Record<string, string | string[] | number>) {
  const merged = mergeAnswersForRefinement(storedAnswers, newAnswers);
  const dimensionScores = computeDimensionScores(merged);
  const matches = matchFighters(dimensionScores, 3);
  const matchedPayload = matches.map((m) => ({
    name: m.fighter.name,
    slug: m.fighter.slug,
    overlappingDimensions: m.overlappingDimensions,
  }));

  // Update local state immediately
  setStoredAnswers(merged);
  setResult((prev) =>
    prev
      ? {
          ...prev,
          dimension_scores: dimensionScores,
          matched_fighters: matchedPayload,
        }
      : prev
  );
  setNarrativeStale(true);
  setRefinementOpen(false);

  // Persist — Supabase if authed, else localStorage
  try {
    const supabase = createBrowserClient();
    const { data: authData } = await supabase.auth.getUser();
    if (authData.user && result) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: newRow } = await (supabase.from("style_profiles") as any)
        .insert({
          user_id: authData.user.id,
          answers: merged,
          dimension_scores: dimensionScores,
          physical_context: physicalContext,
          experience_level: experienceLevel,
          // Carry forward the AI fields verbatim. Supabase JSON column accepts the existing object.
          ai_result: {
            style_name: result.style_name,
            description: result.description,
            fighter_explanations: result.fighter_explanations,
            strengths: result.strengths,
            growth_areas: result.growth_areas,
            punches_to_master: result.punches_to_master,
            stance_recommendation: result.stance_recommendation,
            training_priorities: result.training_priorities,
            punch_doctor_insight: result.punch_doctor_insight,
          },
          matched_fighters: matchedPayload,
          counter_fighters: result.counter_fighters,
          narrative_stale: true,
        })
        .select("id")
        .single();
      if (newRow) setProfileId(newRow.id);
      return;
    }
  } catch {
    // fall through to localStorage
  }

  // localStorage path — overwrite the saved blob with new merged answers + narrativeStale
  try {
    if (result) {
      localStorage.setItem(
        "boxing-coach-style-profile",
        JSON.stringify({
          result: {
            ...result,
            dimension_scores: dimensionScores,
            matched_fighters: matchedPayload,
          },
          physicalContext,
          experienceLevel,
          answers: merged,
          narrativeStale: true,
        })
      );
    }
  } catch {
    // ignore
  }
}
```

- [ ] **Step 8: Render the banner + modal in DashboardView**

Pass new props down. In `style-finder-tab.tsx`, replace the `<DashboardView ...>` render block from Task 2 with:

```tsx
return (
  <>
    <DashboardView
      result={result}
      physicalContext={physicalContext}
      experienceLevel={experienceLevel}
      previousScores={previousScores}
      onRetake={handleRetake}
      onAskCoach={onSwitchToChat}
      profileId={profileId}
      missingQuestionCount={missingQuestionIds.length}
      onRefineClick={() => setRefinementOpen(true)}
      narrativeStale={narrativeStale}
      onRefreshNarrative={() => undefined /* wired in Task 9 */}
    />
    {refinementOpen && (
      <RefinementModal
        questionIds={missingQuestionIds}
        onSubmit={handleRefinementSubmit}
        onClose={() => setRefinementOpen(false)}
      />
    )}
  </>
);
```

In `src/components/style-finder/dashboard-view.tsx`, extend `DashboardViewProps`:

```tsx
interface DashboardViewProps {
  result: StyleProfileResult;
  physicalContext: { height: string; build: string; reach: string; stance: string };
  experienceLevel: string;
  previousScores?: DimensionScores;
  onRetake: () => void;
  onAskCoach?: (query: string) => void;
  profileId?: string;
  missingQuestionCount: number;
  onRefineClick: () => void;
  narrativeStale: boolean;
  onRefreshNarrative: () => void;
}
```

Render the refinement banner near the top of the dashboard JSX (above the radar):

```tsx
{missingQuestionCount > 0 && !narrativeStale && (
  <div className="mb-4 flex items-center justify-between rounded-lg border border-accent/40 bg-accent/5 px-3 py-2">
    <div>
      <p className="text-sm font-medium">
        {missingQuestionCount === 1
          ? "1 new question available"
          : `${missingQuestionCount} new questions available`}
      </p>
      <p className="text-xs text-muted">
        Refine your profile (~{Math.max(1, Math.round(missingQuestionCount * 0.3))} min)
      </p>
    </div>
    <button
      type="button"
      onClick={onRefineClick}
      className="rounded-md bg-accent px-3 py-1.5 text-sm text-white"
    >
      Refine
    </button>
  </div>
)}
```

(The narrative-stale variant is rendered in Task 9.)

- [ ] **Step 9: Typecheck + lint + run tests**

Run: `npx tsc --noEmit && npm run lint && npm run test`
Expected: all PASS.

- [ ] **Step 10: Manual smoke**

Run: `npm run dev`. Take the quiz. Land on the dashboard. To simulate a "new question" without modifying the question set, you can temporarily delete one key from the saved `answers` blob:
1. Open DevTools → Application → Local Storage → `boxing-coach-style-profile`.
2. Edit the JSON: remove one entry from `answers` (e.g., delete `"reach": "long"`).
3. Reload the page.
4. Banner should appear: "1 new question available". Click → modal renders the deleted question. Answer → modal closes → radar updates → banner is gone (and replaced by the narrative-stale CTA in Task 9).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(style-dashboard): refinement modal, banner, and merge+INSERT flow"
```

---

### Task 9: Narrative_stale CTA — "Refresh my analysis"

**Files:**
- Modify: `src/components/style-finder-tab.tsx` — implement `handleRefreshNarrative`
- Modify: `src/components/style-finder/dashboard-view.tsx` — render the CTA when `narrativeStale=true`
- Modify: `src/app/api/style-finder/route.ts` — no API change; the existing endpoint is reused. The client INSERT below sets `narrative_stale: false` explicitly.

- [ ] **Step 1: Implement `handleRefreshNarrative` in `style-finder-tab.tsx`**

Just below `handleRefinementSubmit`:

```tsx
async function handleRefreshNarrative() {
  if (!result) return;
  setView("loading");
  setError(null);

  // Hit the same endpoint the original quiz uses, with the merged answer set.
  try {
    const res = await fetch("/api/style-finder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers: storedAnswers,
        dimension_scores: result.dimension_scores,
        physical_context: physicalContext,
        matched_fighters: result.matched_fighters.map((m) => ({
          name: m.name,
          slug: m.slug,
          overlappingDimensions: m.overlappingDimensions,
        })),
        experience_level: experienceLevel,
      }),
    });

    if (!res.ok) throw new Error("regen failed");
    const data = await res.json();

    const next: StyleProfileResult = {
      style_name: data.style_name,
      description: data.description,
      dimension_scores: result.dimension_scores,
      fighter_explanations: data.fighter_explanations,
      matched_fighters: result.matched_fighters,
      counter_fighters: Array.isArray(data.counter_fighters) ? data.counter_fighters : [],
      strengths: data.strengths,
      growth_areas: data.growth_areas,
      punches_to_master: data.punches_to_master,
      stance_recommendation: data.stance_recommendation,
      training_priorities: data.training_priorities,
      punch_doctor_insight: data.punch_doctor_insight,
    };

    setResult(next);
    setNarrativeStale(false);

    // Persist — Supabase if authed, else localStorage
    try {
      const supabase = createBrowserClient();
      const { data: authData } = await supabase.auth.getUser();
      if (authData.user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newRow } = await (supabase.from("style_profiles") as any)
          .insert({
            user_id: authData.user.id,
            answers: storedAnswers,
            dimension_scores: result.dimension_scores,
            physical_context: physicalContext,
            experience_level: experienceLevel,
            ai_result: data,
            matched_fighters: result.matched_fighters,
            counter_fighters: next.counter_fighters,
            narrative_stale: false,
          })
          .select("id")
          .single();
        if (newRow) setProfileId(newRow.id);
      } else {
        localStorage.setItem(
          "boxing-coach-style-profile",
          JSON.stringify({
            result: next,
            physicalContext,
            experienceLevel,
            answers: storedAnswers,
            narrativeStale: false,
          })
        );
      }
    } catch {
      // fall through — UI state still has the regenerated result
    }

    setView("dashboard");
  } catch {
    setError("Failed to refresh analysis. Please try again.");
    setView("dashboard");
  }
}
```

Replace the `() => undefined /* wired in Task 9 */` placeholder at the `<DashboardView>` callsite with `handleRefreshNarrative`.

- [ ] **Step 2: Render the CTA in DashboardView**

Below the refinement banner block (or instead of it), in `dashboard-view.tsx`:

```tsx
{narrativeStale && (
  <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2">
    <div>
      <p className="text-sm font-medium">Your analysis is out of date</p>
      <p className="text-xs text-muted">
        Your scores have changed since this analysis was generated.
      </p>
    </div>
    <button
      type="button"
      onClick={onRefreshNarrative}
      className="rounded-md bg-amber-500 px-3 py-1.5 text-sm text-white"
    >
      Refresh my analysis
    </button>
  </div>
)}
```

Note: when both `narrativeStale=true` AND there are still missing question IDs (a user refined some but not all), the narrative-stale banner takes precedence (the missing-questions banner is hidden by the `!narrativeStale` guard added in Task 8). After they refresh, the missing-questions banner reappears if any IDs are still unanswered.

- [ ] **Step 3: Typecheck + lint + tests**

Run: `npx tsc --noEmit && npm run lint && npm run test`
Expected: all PASS.

- [ ] **Step 4: Manual smoke**

Run: `npm run dev`. Take the quiz. Use the localStorage trick from Task 8 step 10 to delete an answer. Refine via the modal → narrative-stale CTA appears → click "Refresh my analysis" → loading spinner → dashboard reloads with new style_name / description / training_priorities. CTA is gone.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(style-dashboard): refresh-my-analysis CTA wired to /api/style-finder regen"
```

---

### Task 10: Stale fighter card — placeholder + "Generate analysis" CTA

**Files:**
- Modify: `src/components/style-finder/fighter-match-card.tsx` — handle missing explanation
- Modify: `src/components/style-finder/dashboard-view.tsx` — pass through

The case: silent re-rank (Task 11) puts a fighter in the top 3 whose slug isn't in `fighter_explanations`. The card should render the basic match info with a placeholder explanation and a button that triggers the same regen as "Refresh my analysis".

- [ ] **Step 1: Identify the existing card props**

Run: `grep -n "explanation\|fighter_explanations\|FighterMatchCard" src/components/style-finder/fighter-match-card.tsx | head -20`. The current card likely takes `fighter` + `explanation` + match info. Confirm by reading the file.

- [ ] **Step 2: Make the explanation prop nullable + render placeholder when null**

In `src/components/style-finder/fighter-match-card.tsx`, change the `explanation: string` prop type to `explanation: string | null` and add an `onGenerateAnalysis?: () => void` prop. When `explanation` is null, render:

```tsx
<div className="text-sm italic text-muted">
  Analysis not yet generated for this fighter.
</div>
{onGenerateAnalysis && (
  <button
    type="button"
    onClick={onGenerateAnalysis}
    className="mt-2 rounded-md border border-border px-2 py-1 text-xs hover:bg-surface"
  >
    Generate analysis →
  </button>
)}
```

When `explanation` is non-null, render existing prose unchanged.

- [ ] **Step 3: Wire up at the call site**

In `dashboard-view.tsx`, the loop that renders fighter cards (find with `grep -n FighterMatchCard src/components/style-finder/dashboard-view.tsx`) needs to lookup the explanation per matched fighter slug:

```tsx
{result.matched_fighters.map((mf) => {
  const explanation =
    result.fighter_explanations.find((fe) => fe.name === mf.name)?.explanation ?? null;
  return (
    <FighterMatchCard
      key={mf.slug}
      fighter={mf}
      explanation={explanation}
      onGenerateAnalysis={onRefreshNarrative}
    />
  );
})}
```

(Replaces the existing card-render loop. The exact existing call shape may differ — preserve any other props the existing card needs; just add the new `onGenerateAnalysis` and switch `explanation` to allow null.)

- [ ] **Step 4: Typecheck + tests + lint**

Run: `npx tsc --noEmit && npm run test && npm run lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(style-dashboard): placeholder + generate-analysis CTA on stale fighter cards"
```

---

### Task 11: Silent fighter re-rank on dashboard mount

**Files:**
- Modify: `src/components/style-finder-tab.tsx` — re-rank effect

Behavior: every time the dashboard view mounts with a saved profile, run `matchFighters(profile.dimension_scores, 3)` against the current code-side roster. If `compareTopFighters(stored, fresh).changed`, silently UPDATE `matched_fighters` (and refresh local state). No UI banner. The Task 10 placeholder card flow handles the case where a new top fighter has no explanation.

- [ ] **Step 1: Add the re-rank effect**

In `src/components/style-finder-tab.tsx`, after the existing load `useEffect` (the one that fetches Supabase or localStorage):

```tsx
import { compareTopFighters } from "@/lib/profile-freshness";

// inside the component, after the load effect:
useEffect(() => {
  if (!result) return;
  const fresh = matchFighters(result.dimension_scores, 3);
  const freshPayload = fresh.map((m) => ({
    name: m.fighter.name,
    slug: m.fighter.slug,
    overlappingDimensions: m.overlappingDimensions,
  }));
  if (!compareTopFighters(result.matched_fighters, freshPayload).changed) return;

  // Updated rankings — apply locally and persist silently.
  setResult((prev) =>
    prev ? { ...prev, matched_fighters: freshPayload } : prev
  );

  // Best-effort persist; failure is non-fatal.
  (async () => {
    try {
      const supabase = createBrowserClient();
      const { data: authData } = await supabase.auth.getUser();
      if (authData.user && profileId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("style_profiles") as any)
          .update({ matched_fighters: freshPayload })
          .eq("id", profileId);
      }
    } catch {
      // ignore
    }
  })();
  // run only when the result first lands or its dimension_scores change
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [result?.dimension_scores]);
```

(Note the linter-disable: we deliberately exclude `profileId` and `result.matched_fighters` from deps because we're computing freshness from the dimension_scores only and don't want to re-fire on our own setResult.)

- [ ] **Step 2: Manual smoke (requires a roster change to fully exercise)**

Without a real roster change, the re-rank effect is a no-op (top-3 already matches). To smoke: temporarily edit `src/data/fighter-profiles.ts` and manually swap two fighters' positions in the array, then reload the dashboard. Top-3 may shift; one card should show a placeholder if the new top fighter wasn't in the previous explanations. Revert the edit before committing.

- [ ] **Step 3: Typecheck + lint + tests**

Run: `npx tsc --noEmit && npm run lint && npm run test`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(style-dashboard): silent fighter re-rank on dashboard mount"
```

---

### Task 12: StyleSnapshot freshness pill on /me

**Files:**
- Modify: `src/lib/profile-types.ts` — add `narrative_stale` to `ProfileStyleSnapshot`
- Modify: `src/lib/profile-aggregator.ts` — include `narrative_stale` in the snapshot
- Modify: `src/components/profile/style-snapshot.tsx` — render the pill

- [ ] **Step 1: Extend the type**

In `src/lib/profile-types.ts:21-32`, add the field:

```typescript
export type ProfileStyleSnapshot = {
  style_name: string;
  description: string;
  stance: string;
  experience_level: ExperienceLevel;
  height: string;
  reach: string;
  build: string;
  top_fighters: Array<{ slug: string; name: string; match_pct: number }>;
  profile_id: string;
  narrative_stale: boolean;
};
```

- [ ] **Step 2: Update the aggregator**

In `src/lib/profile-aggregator.ts`, look at `buildStyleSnapshot` (around line 72). The function reads from a `StyleProfileRow` — find the row type definition (likely in the same file) and add `narrative_stale: boolean | null` to it. In the build function, set `narrative_stale: Boolean(row.narrative_stale)`.

If there's an existing test in `src/lib/profile-aggregator.test.ts`, run it: `npm run test -- profile-aggregator`. If it fails because fixtures don't have the new column, update fixtures with `narrative_stale: false`.

- [ ] **Step 3: Render the pill**

In `src/components/profile/style-snapshot.tsx`, near the heading "Your style":

```tsx
<section className="rounded-xl border border-border bg-surface p-5">
  <div className="flex items-center justify-between mb-1">
    <h2 className="text-sm font-semibold">Your style</h2>
    {snapshot.narrative_stale && (
      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
        Refresh available
      </span>
    )}
  </div>
  {/* ...existing content... */}
</section>
```

- [ ] **Step 4: Typecheck + tests**

Run: `npx tsc --noEmit && npm run test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(style-dashboard): refresh-available pill on /me StyleSnapshot"
```

---

### Task 13: E2E test + final verification

**Files:**
- Create: `tests/e2e/style-dashboard.spec.ts`

- [ ] **Step 1: Write the e2e spec**

Create `tests/e2e/style-dashboard.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test.describe("style profile dashboard", () => {
  test("quiz → dashboard → no banner when fresh", async ({ page }) => {
    await page.goto("/?tab=style");

    // Take the quiz fast — pick the first option for every step. Robust to
    // the auto-advance pattern (300ms delay after each click).
    // The Questionnaire renders one question at a time; we click the first
    // button that has a value-bearing label until the dashboard shows up.
    let safety = 80;
    while (safety-- > 0) {
      const dashboardHeader = page.getByRole("heading", { name: /your fighting style/i });
      if (await dashboardHeader.isVisible().catch(() => false)) break;

      const firstOption = page.locator('[class*="border-border"]').filter({ hasText: /./ }).first();
      const next = page.getByRole("button", { name: /^next/i });
      if (await next.isVisible().catch(() => false)) {
        await firstOption.click().catch(() => undefined);
        await next.click();
      } else {
        await firstOption.click();
      }
      await page.waitForTimeout(350);
    }

    await expect(page.getByRole("heading", { name: /your fighting style/i })).toBeVisible();
    await expect(page.getByText(/new question.* available/i)).not.toBeVisible();
    await expect(page.getByText(/refresh my analysis/i)).not.toBeVisible();
  });

  test("simulated missing answer → banner → refine → narrative-stale CTA", async ({ page }) => {
    // Reuses the same quiz path, then mutates localStorage to simulate a new question.
    // (This avoids needing to add a real new question to the codebase mid-test.)
    await page.goto("/?tab=style");

    let safety = 80;
    while (safety-- > 0) {
      const dashboardHeader = page.getByRole("heading", { name: /your fighting style/i });
      if (await dashboardHeader.isVisible().catch(() => false)) break;
      const firstOption = page.locator('[class*="border-border"]').filter({ hasText: /./ }).first();
      const next = page.getByRole("button", { name: /^next/i });
      if (await next.isVisible().catch(() => false)) {
        await firstOption.click().catch(() => undefined);
        await next.click();
      } else {
        await firstOption.click();
      }
      await page.waitForTimeout(350);
    }

    await expect(page.getByRole("heading", { name: /your fighting style/i })).toBeVisible();

    // Mutate localStorage to delete the 'reach' answer — this simulates "reach is a new question".
    await page.evaluate(() => {
      const raw = localStorage.getItem("boxing-coach-style-profile");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      delete parsed.answers.reach;
      localStorage.setItem("boxing-coach-style-profile", JSON.stringify(parsed));
    });

    await page.reload();

    await expect(page.getByText(/1 new question available|new questions available/i)).toBeVisible();

    await page.getByRole("button", { name: /^refine$/i }).click();
    await expect(page.getByRole("dialog", { name: /refine your profile/i })).toBeVisible();

    // Pick the first option in the modal.
    const modalOption = page.getByRole("dialog", { name: /refine/i }).locator('[class*="border-border"]').first();
    await modalOption.click();
    await page.waitForTimeout(300);

    const refineBtn = page.getByRole("button", { name: /^refine$/i });
    if (await refineBtn.isVisible().catch(() => false)) {
      await refineBtn.click();
    }

    await expect(page.getByText(/your analysis is out of date/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: /refresh my analysis/i })).toBeVisible();
  });

  test("dimension drawer opens on radar label click", async ({ page }) => {
    // Re-run a quick quiz to land on the dashboard.
    await page.goto("/?tab=style");
    let safety = 80;
    while (safety-- > 0) {
      const dashboardHeader = page.getByRole("heading", { name: /your fighting style/i });
      if (await dashboardHeader.isVisible().catch(() => false)) break;
      const firstOption = page.locator('[class*="border-border"]').filter({ hasText: /./ }).first();
      const next = page.getByRole("button", { name: /^next/i });
      if (await next.isVisible().catch(() => false)) {
        await firstOption.click().catch(() => undefined);
        await next.click();
      } else {
        await firstOption.click();
      }
      await page.waitForTimeout(350);
    }

    // Click the "Power" axis label (rendered as text inside the SVG).
    await page.getByText(/^Power$/, { exact: true }).first().click();
    await expect(page.getByRole("dialog", { name: /power mechanics details/i })).toBeVisible();
    await expect(page.getByText(/what this is/i)).toBeVisible();
    await expect(page.getByText(/drills to develop this/i)).toBeVisible();
  });
});
```

The e2e tests intentionally mutate localStorage to fake "new question added" rather than requiring a real schema change mid-test. This is the simulation pattern the spec suggests.

- [ ] **Step 2: Run the e2e tests**

Run: `npm run test:e2e -- style-dashboard`
Expected: all 3 tests PASS. If a test times out finding the dashboard heading, lengthen the safety loop or adjust selectors based on the actual rendered copy.

- [ ] **Step 3: Run the full unit suite + typecheck + lint**

Run: `npm run test && npx tsc --noEmit && npm run lint`
Expected: all PASS.

- [ ] **Step 4: Manual personas**

Run: `npm run dev`. Take the quiz with three deliberate persona patterns (consistent with the roster-expansion plan's verification):

1. **Pure pressure fighter** — pick high-output, high-power, low-deception answers. Top fighters should include Tyson / Pereira / Wilder.
2. **Slick counter** — pick high-defense, high-IQ, low-power answers. Top fighters should include Mayweather / Bivol.
3. **Rangy technician** — pick high-range, high-position, average-power answers. Top fighters should include Crawford.

For each persona: confirm the dashboard reads sensibly, the radar is clickable, the drawer renders matching content.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(style-dashboard): e2e — quiz → dashboard → refinement → narrative-stale flow"
```

---

## Final commit message recommendations

If using `subagent-driven-development`, each task above commits independently. For a single squashed merge, the trailer:

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Self-review notes

**Spec coverage:** every section of [the spec](docs/superpowers/specs/2026-04-25-style-profile-dashboard-design.md) is implemented:
- Architecture (view state, ID-set diff, schema): Tasks 1, 6, 8
- Refinement flow: Tasks 7, 8, 9
- Dimension drawer: Tasks 3, 4, 5
- Stale fighter cards: Task 10
- Silent re-rank: Task 11
- StyleSnapshot pill: Task 12
- Testing: Task 13 (+ unit tests in 3, 6, 8)
- Spec deviation (no /api/style-finder/refine): documented at the top of this plan; Task 8 keeps merge client-side.

**Type consistency check:**
- `DashboardViewProps` is defined in Task 2 (base shape) and extended in Task 8 (refinement props). Final shape lives in `dashboard-view.tsx` after Task 8.
- `DimensionKey` is imported from `@/lib/dimensions` consistently in Tasks 3, 4, 5, 6.
- `mergeAnswersForRefinement` signature in Task 8 step 3 matches its usage in step 7.
- `RefinementInsertPayload` / `RegenInsertPayload` are documentary only — they describe the shape inserted directly via Supabase client (which is `any`-cast); no runtime use of these types is required, but they'd make a clean refactor target if a server-side endpoint is later added.
- `compareTopFighters` returns `{ changed: boolean }` — used identically in Tasks 6 and 11.

**No placeholders:** every task contains either runnable shell commands or complete code blocks. The dimension explainer copy is explicitly marked PLACEHOLDER in Task 3 with a note that Alex authors final copy before launch — this is editorial scope, not engineering placeholder.

**Test coverage gaps:** component-level unit tests for `<DashboardView>`, `<RefinementModal>`, `<DimensionDrawer>` are intentionally omitted (no RTL setup in the repo) and are covered by the Playwright e2e in Task 13.
