# Matchup / Kryptonite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship "Fighters Strongest Against You" as a new section on the Style Finder results page — deterministic counter-ranking by attack-vector math + vault-grounded per-counter paragraphs with drill recommendations and citations.

**Architecture:** Pure ranking module (`matchCounters`) feeds the existing `/api/style-finder` route, which gathers per-counter vault content + graph-RAG chunks and extends the single Anthropic call to produce a new `counter_explanations` field. Results render as a new card list between "Fighter Matches" and "Strengths/Growth" sections of the results page. Persistence via a new `counter_fighters` jsonb column (migration 007) + parallel localStorage treatment for anonymous users.

**Tech Stack:** Next.js 16 App Router, Supabase (jsonb), Anthropic SDK (`claude-sonnet-4-20250514`), Voyage + Cohere via existing `retrieveContext`, Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-04-21-matchup-kryptonite-design.md`

---

## File Structure

**New files:**
- `supabase/migrations/007_style_counter_fighters.sql` — additive column.
- `src/lib/fighter-counter-matching.ts` — pure ranking module.
- `src/lib/fighter-counter-matching.test.ts` — vitest unit tests.
- `src/components/style-finder/fighter-counter-card.tsx` — UI card component.

**Modified files:**
- `src/app/api/style-finder/route.ts` — compute counters, gather per-counter context, extend prompt + response shape, validate drill slugs.
- `src/components/style-finder-tab.tsx` — forward `counter_fighters` to localStorage + DB persistence.
- `src/components/style-finder/results-profile.tsx` — extend `StyleProfileResult` type, render new section after Fighter Matches.

**Untouched:** Coach tab, Technique/Drills tabs, existing `src/lib/fighter-matching.ts` (counters do NOT reuse `matchFighters`).

---

### Task 1: Migration 007 — counter_fighters column

**Files:**
- Create: `supabase/migrations/007_style_counter_fighters.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/007_style_counter_fighters.sql` with exactly:

```sql
-- 007_style_counter_fighters.sql
-- Add counter_fighters jsonb column to style_profiles for "Fighters Strongest Against You".
-- Nullable; legacy rows stay NULL. Written alongside matched_fighters at insert time.

ALTER TABLE style_profiles
  ADD COLUMN counter_fighters jsonb;
```

- [ ] **Step 2: Apply via Supabase MCP (or dashboard)**

If a `supabase db push` command exists in `package.json` scripts, run it. Otherwise apply through the Supabase dashboard SQL editor or (if the controller has MCP access) via `mcp__claude_ai_Supabase__apply_migration` with `name: "style_counter_fighters"` and the SQL body above.

Verify by running:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'style_profiles' AND column_name = 'counter_fighters';
```
Expected: one row, data_type `jsonb`, is_nullable `YES`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/007_style_counter_fighters.sql
git commit -m "feat(db): add style_profiles.counter_fighters jsonb column

Stores the Fighters Strongest Against You list alongside matched_fighters.
Nullable so legacy rows are unaffected until they're overwritten by a retake."
```

---

### Task 2: `matchCounters` pure function + tests (TDD)

**Files:**
- Create: `src/lib/fighter-counter-matching.ts`
- Test: `src/lib/fighter-counter-matching.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/fighter-counter-matching.test.ts` with this exact content:

```ts
import { describe, it, expect } from "vitest";
import { matchCounters, ATTACK_VECTORS } from "./fighter-counter-matching";
import type { DimensionScores } from "@/data/fighter-profiles";

// Helper: build a DimensionScores with defaults of 50 unless overridden.
function scores(overrides: Partial<DimensionScores> = {}): DimensionScores {
  return {
    powerMechanics: 50,
    positionalReadiness: 50,
    rangeControl: 50,
    defensiveIntegration: 50,
    ringIQ: 50,
    outputPressure: 50,
    deceptionSetup: 50,
    killerInstinct: 50,
    ...overrides,
  };
}

describe("ATTACK_VECTORS", () => {
  it("defines exactly four attack vectors", () => {
    expect(ATTACK_VECTORS.length).toBe(4);
  });

  it("each vector has attacker_dims and defender_dims non-empty", () => {
    for (const v of ATTACK_VECTORS) {
      expect(v.attackerDims.length).toBeGreaterThan(0);
      expect(v.defenderDims.length).toBeGreaterThan(0);
    }
  });
});

describe("matchCounters", () => {
  it("returns empty array for a balanced user (all 60) — gate fails", () => {
    const result = matchCounters(scores({
      powerMechanics: 60, positionalReadiness: 60, rangeControl: 60, defensiveIntegration: 60,
      ringIQ: 60, outputPressure: 60, deceptionSetup: 60, killerInstinct: 60,
    }));
    expect(result).toEqual([]);
  });

  it("returns power punchers in top counters for a low-defence user", () => {
    // Defence severely weak → high-power fighters should counter
    const result = matchCounters(scores({
      powerMechanics: 40,
      defensiveIntegration: 25,
      positionalReadiness: 35,
    }));
    const slugs = result.map((c) => c.fighter.slug);
    // Alex Pereira (95 power, 88 killer) and Mike Tyson (92 power, 90 killer) are the canonical power punchers
    expect(slugs).toContain("alex-pereira");
  });

  it("respects excludeSlugs — listed fighters never appear", () => {
    const userScores = scores({ defensiveIntegration: 25, positionalReadiness: 35, powerMechanics: 30 });
    const result = matchCounters(userScores, ["alex-pereira", "mike-tyson"]);
    const slugs = result.map((c) => c.fighter.slug);
    expect(slugs).not.toContain("alex-pereira");
    expect(slugs).not.toContain("mike-tyson");
  });

  it("returns at most `count` results (default 3)", () => {
    const userScores = scores({ defensiveIntegration: 25, positionalReadiness: 30 });
    const result = matchCounters(userScores);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("honours count parameter", () => {
    const userScores = scores({ defensiveIntegration: 25, positionalReadiness: 30 });
    const result = matchCounters(userScores, [], 5);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("sorts by threatScore descending", () => {
    const userScores = scores({ defensiveIntegration: 25, positionalReadiness: 30 });
    const result = matchCounters(userScores);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].threatScore).toBeGreaterThanOrEqual(result[i].threatScore);
    }
  });

  it("flags one-shot dominance when fighter dim >= 85 and user dim <= 40", () => {
    // Wilder (88 power, 80 killer) vs low-power user
    const userScores = scores({ powerMechanics: 35, defensiveIntegration: 30 });
    const result = matchCounters(userScores);
    const wilder = result.find((c) => c.fighter.slug === "deontay-wilder");
    if (wilder) {
      expect(wilder.oneShotDominance).toContain("powerMechanics");
    }
  });

  it("does not flag one-shot for users with mid scores", () => {
    const userScores = scores({ powerMechanics: 60, defensiveIntegration: 50 });
    const result = matchCounters(userScores);
    for (const c of result) {
      expect(c.oneShotDominance.length).toBe(0);
    }
  });

  it("each result's exploitedDimensions has at most 3 entries sorted by gap desc", () => {
    const userScores = scores({ defensiveIntegration: 25, positionalReadiness: 30, powerMechanics: 35 });
    const result = matchCounters(userScores);
    for (const c of result) {
      expect(c.exploitedDimensions.length).toBeLessThanOrEqual(3);
      for (let i = 1; i < c.exploitedDimensions.length; i++) {
        expect(c.exploitedDimensions[i - 1].gap).toBeGreaterThanOrEqual(c.exploitedDimensions[i].gap);
      }
    }
  });

  it("primaryAttackVector is one of the four canonical ids", () => {
    const userScores = scores({ defensiveIntegration: 25, positionalReadiness: 30 });
    const result = matchCounters(userScores);
    const valid = ["power", "pressure", "technical", "defensive-sniper"];
    for (const c of result) {
      expect(valid).toContain(c.primaryAttackVector);
    }
  });

  it("is deterministic — same inputs produce same outputs", () => {
    const userScores = scores({ defensiveIntegration: 25, positionalReadiness: 30, powerMechanics: 35 });
    const a = matchCounters(userScores);
    const b = matchCounters(userScores);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/fighter-counter-matching.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/fighter-counter-matching.ts` with this exact content:

```ts
import type { DimensionScores, FighterProfile } from "@/data/fighter-profiles";
import { fighterProfiles } from "@/data/fighter-profiles";

export type AttackVectorId = "power" | "pressure" | "technical" | "defensive-sniper";

export interface AttackVector {
  id: AttackVectorId;
  label: string;
  attackerDims: (keyof DimensionScores)[];
  defenderDims: (keyof DimensionScores)[];
}

export const ATTACK_VECTORS: AttackVector[] = [
  {
    id: "power",
    label: "Power Puncher",
    attackerDims: ["powerMechanics", "killerInstinct"],
    defenderDims: ["defensiveIntegration", "positionalReadiness"],
  },
  {
    id: "pressure",
    label: "Pressure Fighter",
    attackerDims: ["outputPressure", "positionalReadiness"],
    defenderDims: ["defensiveIntegration", "ringIQ", "rangeControl"],
  },
  {
    id: "technical",
    label: "Technical Boxer",
    attackerDims: ["deceptionSetup", "rangeControl", "ringIQ"],
    defenderDims: ["ringIQ", "defensiveIntegration", "rangeControl"],
  },
  {
    id: "defensive-sniper",
    label: "Defensive Sniper",
    attackerDims: ["defensiveIntegration", "positionalReadiness", "ringIQ"],
    defenderDims: ["deceptionSetup", "outputPressure", "rangeControl"],
  },
];

const DIMENSION_KEYS: (keyof DimensionScores)[] = [
  "powerMechanics",
  "positionalReadiness",
  "rangeControl",
  "defensiveIntegration",
  "ringIQ",
  "outputPressure",
  "deceptionSetup",
  "killerInstinct",
];

const ONE_SHOT_FIGHTER_THRESHOLD = 85;
const ONE_SHOT_USER_THRESHOLD = 40;
const ONE_SHOT_BONUS = 25;
const GATE_FIGHTER_THRESHOLD = 75;
const GATE_USER_THRESHOLD = 40;

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function vectorThreat(
  user: DimensionScores,
  fighter: DimensionScores,
  vector: AttackVector
): number {
  const attackerAvg = mean(vector.attackerDims.map((d) => fighter[d]));
  const defenderAvg = mean(vector.defenderDims.map((d) => user[d]));
  return Math.max(0, attackerAvg - defenderAvg);
}

function oneShotDims(user: DimensionScores, fighter: DimensionScores): (keyof DimensionScores)[] {
  return DIMENSION_KEYS.filter(
    (d) => fighter[d] >= ONE_SHOT_FIGHTER_THRESHOLD && user[d] <= ONE_SHOT_USER_THRESHOLD
  );
}

function passesGate(user: DimensionScores, fighter: DimensionScores): boolean {
  return DIMENSION_KEYS.some(
    (d) => fighter[d] >= GATE_FIGHTER_THRESHOLD && user[d] <= GATE_USER_THRESHOLD
  );
}

function topExploitedDims(
  user: DimensionScores,
  fighter: DimensionScores
): Array<{
  dimension: keyof DimensionScores;
  user_score: number;
  fighter_score: number;
  gap: number;
}> {
  return DIMENSION_KEYS
    .map((d) => ({
      dimension: d,
      user_score: user[d],
      fighter_score: fighter[d],
      gap: fighter[d] - user[d],
    }))
    .filter((e) => e.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 3);
}

export interface CounterMatch {
  fighter: FighterProfile;
  threatScore: number;
  primaryAttackVector: AttackVectorId;
  exploitedDimensions: Array<{
    dimension: keyof DimensionScores;
    user_score: number;
    fighter_score: number;
    gap: number;
  }>;
  oneShotDominance: (keyof DimensionScores)[];
}

/**
 * Match user scores against pre-scored fighter profiles for threatening matchups.
 * Returns up to `count` fighters whose attack vectors exploit the user's defensive weaknesses.
 * Returns empty array if no fighter passes the exploitable-dim gate.
 * Fighters listed in `excludeSlugs` are never returned.
 */
export function matchCounters(
  userScores: DimensionScores,
  excludeSlugs: string[] = [],
  count: number = 3
): CounterMatch[] {
  const excluded = new Set(excludeSlugs);

  const candidates = fighterProfiles
    .filter((f) => !excluded.has(f.slug))
    .filter((f) => passesGate(userScores, f.scores))
    .map((fighter) => {
      const vectorScores = ATTACK_VECTORS.map((v) => ({
        vector: v,
        threat: vectorThreat(userScores, fighter.scores, v),
      }));
      const vectorSum = vectorScores.reduce((acc, v) => acc + v.threat, 0);
      const primary = vectorScores.reduce((max, cur) => (cur.threat > max.threat ? cur : max));
      const oneShots = oneShotDims(userScores, fighter.scores);
      const oneShotBonus = oneShots.length * ONE_SHOT_BONUS;

      return {
        fighter,
        threatScore: vectorSum + oneShotBonus,
        primaryAttackVector: primary.vector.id,
        exploitedDimensions: topExploitedDims(userScores, fighter.scores),
        oneShotDominance: oneShots,
      };
    });

  candidates.sort((a, b) => b.threatScore - a.threatScore);
  return candidates.slice(0, count);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/fighter-counter-matching.test.ts`
Expected: PASS (13 tests: 2 in ATTACK_VECTORS describe + 11 in matchCounters describe).

Run the full suite: `npm run test`
Expected: all tests pass, count increases by 13.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fighter-counter-matching.ts src/lib/fighter-counter-matching.test.ts
git commit -m "feat(lib): matchCounters deterministic threat-ranking

Adds fighter-counter-matching module: attack-vector model (power/
pressure/technical/defensive-sniper), one-shot dominance bonus,
and exploitable-dim gate so uniform users return empty. Pure function,
full unit coverage, does not depend on matchFighters."
```

---

### Task 3: Vault file reader helper

**Files:**
- Create: `src/lib/vault-reader.ts`
- Test: `src/lib/vault-reader.test.ts`

Why: The API route needs to read `vault/fighters/<slug>.md` for each counter. A thin helper isolates filesystem access (one responsibility) so the route stays focused on orchestration and the function is unit-testable.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/vault-reader.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFighterVaultEntry } from "./vault-reader";

describe("readFighterVaultEntry", () => {
  it("returns the content for a known fighter slug", async () => {
    const content = await readFighterVaultEntry("mike-tyson");
    expect(content).not.toBeNull();
    expect(content!.length).toBeGreaterThan(100);
  });

  it("returns null for an unknown slug", async () => {
    const content = await readFighterVaultEntry("not-a-real-fighter-xyzzy");
    expect(content).toBeNull();
  });

  it("rejects path-traversal attempts in the slug", async () => {
    const content = await readFighterVaultEntry("../../etc/passwd");
    expect(content).toBeNull();
  });

  it("rejects slugs with suspicious characters", async () => {
    const content = await readFighterVaultEntry("mike/../tyson");
    expect(content).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/vault-reader.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/vault-reader.ts`:

```ts
import { readFile } from "fs/promises";
import path from "path";

const VAULT_ROOT = path.join(process.cwd(), "vault", "fighters");
const SAFE_SLUG_RE = /^[a-z0-9-]+$/;

/**
 * Read a fighter vault markdown entry by slug.
 * Returns the raw file content, or null if the file does not exist
 * or the slug contains disallowed characters.
 */
export async function readFighterVaultEntry(slug: string): Promise<string | null> {
  if (!SAFE_SLUG_RE.test(slug)) return null;
  const filePath = path.join(VAULT_ROOT, `${slug}.md`);
  // Defence in depth: ensure the resolved path stays inside VAULT_ROOT.
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(VAULT_ROOT + path.sep)) return null;

  try {
    return await readFile(normalized, "utf-8");
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/vault-reader.test.ts`
Expected: PASS (4 tests).

Run: `npm run test`
Expected: full suite passes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vault-reader.ts src/lib/vault-reader.test.ts
git commit -m "feat(lib): vault-reader for fighter markdown entries

Thin helper that reads vault/fighters/<slug>.md with slug validation
(rejects path traversal + non-snake-case slugs). Used by the style-finder
route to pull per-counter vault content for matchup analysis."
```

---

### Task 4: Extend style-finder API route with counters

**Files:**
- Modify: `src/app/api/style-finder/route.ts`

This task does three things:
1. Compute counters server-side from the request's `dimension_scores` and received `matched_fighters` slugs (exclusion list).
2. For each counter, in parallel: read the vault entry and run a targeted `retrieveContext` call.
3. Extend the system prompt to include the counter context, expand `max_tokens` to 4096, extend the JSON response schema to include `counter_explanations`, validate drill slugs against `VAULT_SLUGS`, and echo `counter_fighters` in the final response.

- [ ] **Step 1: Add imports and helper for counter context**

At the top of `src/app/api/style-finder/route.ts`, alongside existing imports, add:

```ts
import { matchCounters, ATTACK_VECTORS, type CounterMatch, type AttackVectorId } from "@/lib/fighter-counter-matching";
import { readFighterVaultEntry } from "@/lib/vault-reader";
import { VAULT_SLUGS } from "@/lib/dimensions";
```

After the `buildSearchQuery` helper (around line 59), add a helper that builds a focused RAG query per counter:

```ts
function buildCounterQuery(fighterName: string, vectorLabel: string, exploitedLabels: string[]): string {
  const dims = exploitedLabels.join(", ").toLowerCase();
  return `${vectorLabel.toLowerCase()} ${fighterName} exploits ${dims} defensive vulnerability drills training counter`;
}

function attackVectorLabel(id: AttackVectorId): string {
  const v = ATTACK_VECTORS.find((a) => a.id === id);
  return v ? v.label : id;
}
```

- [ ] **Step 2: Extend `buildPrompt` signature + body**

Replace the existing `buildPrompt` function. The new signature takes an extra `counterContext` argument (may be empty array). The body adds a Counter Analysis section when non-empty and extends the JSON schema description.

Replace the entire function with:

```ts
interface CounterContext {
  counter: CounterMatch;
  vaultEntry: string | null;
  ragContext: string;
}

function buildPrompt(
  dimensionScores: DimensionScores,
  topDimensions: { key: keyof DimensionScores; label: string; score: number }[],
  bottomDimensions: { key: keyof DimensionScores; label: string; score: number }[],
  matchedFighters: { name: string; slug: string; overlappingDimensions: string[] }[],
  counterContexts: CounterContext[],
  physical: { height: string; build: string; reach: string; stance: string },
  experienceLevel: string,
  ragContext: string
): string {
  const experienceNote =
    experienceLevel === "beginner" || experienceLevel === "none"
      ? `The user is a BEGINNER. Use language like "natural tendencies", "instincts", "your body wants to...". Avoid jargon. Frame everything as potential to develop.`
      : `The user is EXPERIENCED (${experienceLevel}). Use language like "strengths", "your game", "you excel at...". Be specific about mechanics and strategy.`;

  const allScoresFormatted = (Object.entries(dimensionScores) as [keyof DimensionScores, number][])
    .map(([key, score]) => `  ${DIMENSION_LABELS[key]}: ${score}/100`)
    .join("\n");

  const topFormatted = topDimensions.map((d) => `  ${d.label}: ${d.score}/100`).join("\n");
  const bottomFormatted = bottomDimensions.map((d) => `  ${d.label}: ${d.score}/100`).join("\n");

  const fighterList = matchedFighters
    .map((f) => `  - ${f.name} (overlapping dimensions: ${f.overlappingDimensions.join(", ")})`)
    .join("\n");

  // ---- Counter analysis block (only when counters exist) ----
  let counterBlock = "";
  if (counterContexts.length > 0) {
    counterBlock =
      `\n\n## Counter Matchups (these fighters exploit the user's weaknesses)\n` +
      `DO NOT pick or reorder counters — the ranking is deterministic. Write one \`counter_explanations\` entry per counter, in the order given.\n\n` +
      counterContexts.map((ctx, i) => {
        const c = ctx.counter;
        const exploited = c.exploitedDimensions
          .map((d) => `${DIMENSION_LABELS[d.dimension]} (user ${d.user_score}, fighter ${d.fighter_score}, gap +${d.gap})`)
          .join("\n  - ");
        const oneShots = c.oneShotDominance.length > 0
          ? c.oneShotDominance.map((d) => DIMENSION_LABELS[d]).join(", ")
          : "none";
        return `### Counter ${i + 1}: ${c.fighter.name} (${attackVectorLabel(c.primaryAttackVector)})

Threat score: ${c.threatScore.toFixed(1)}
Exploited dimensions:
  - ${exploited}
One-shot dominance (fighter ≥85 AND user ≤40 on same dim): ${oneShots}

Vault entry for ${c.fighter.name}:
${ctx.vaultEntry ?? "(vault entry unavailable — rely on retrieved context only)"}

Retrieved concepts and drills relevant to this matchup:
${ctx.ragContext || "(no additional chunks retrieved)"}`;
      }).join("\n\n---\n\n");
  }

  // ---- Counter schema injection into the JSON output ----
  const counterSchema = counterContexts.length > 0
    ? `,
  "counter_explanations": [
    {
      "name": "Fighter Name (echo from Counter ${counterContexts.length === 1 ? "1" : "N"} above)",
      "slug": "fighter-slug",
      "attack_vector": "Power Puncher | Pressure Fighter | Technical Boxer | Defensive Sniper",
      "paragraph": "150-200 words. Analytical, specific. Cite Alex's vault teachings. Explain HOW this archetype attacks, WHY it exploits this user's profile, WHAT happens tactically in the exchange, and END with a concrete training direction tied to the user's weakest defensive counterpart.",
      "exploited_dimensions": [{ "dimension": "Power Mechanics", "user_score": 35, "fighter_score": 92, "gap": 57 }],
      "one_shot_notes": "If any one-shot dims exist for this counter, describe the kill-shot dynamic in one sentence. Otherwise null.",
      "recommended_drills": [
        { "slug": "hip-rotation-drill", "name": "Hip Rotation Drill", "why": "Single sentence tying the drill to the exploited gap. MUST use a slug from the provided VAULT_SLUGS list." }
      ],
      "citations": [{ "title": "Vault source title", "url_or_path": "vault/path/or/url" }]
    }
  ]`
    : "";

  return `You are Dr. Alex Wiant's AI style advisor. You help people find their fighting style based on his Power Punching Blueprint methodology.

## Alex's Core Principles
${CORE_PRINCIPLES.map((p) => `- ${p}`).join("\n")}

## Retrieved Vault Content (style-level)
${ragContext}

## User Profile
Physical: ${physical.height}, ${physical.build} build, ${physical.reach} reach, ${physical.stance} stance
Experience: ${experienceLevel}

## Pre-Computed Dimension Scores (DO NOT recalculate — use these exactly)
${allScoresFormatted}

Top 3 dimensions:
${topFormatted}

Bottom 3 dimensions:
${bottomFormatted}

## Matched Fighters (DO NOT pick different ones — explain these)
${fighterList}${counterBlock}

## Experience-Aware Language
${experienceNote}

## Your Task
Generate ONLY the qualitative content below. The dimension scores, fighter matches, and counter matchups are already decided — your job is to explain and advise.

Return a JSON object with this exact shape:
{
  "style_name": "Creative style name (e.g., 'Counter-Punching Sniper', 'Pressure Destroyer')",
  "description": "2-3 sentences describing this style and why it fits the user. Ground in Alex's methodology.",
  "fighter_explanations": [
    { "name": "Fighter Name", "explanation": "Why this fighter is a model for the user — reference Alex's specific analysis from the vault content" }
  ],
  "strengths": ["Top strength description 1", "Top strength description 2", "Top strength description 3", "Top strength description 4"],
  "growth_areas": [
    { "dimension": "Dimension Name", "advice": "Specific actionable advice grounded in Alex's methodology" }
  ],
  "punches_to_master": ["Punch 1", "Punch 2", "..."],
  "stance_recommendation": "Specific stance advice based on their physical attributes and style",
  "training_priorities": ["Priority 1", "Priority 2", "Priority 3", "Priority 4"],
  "punch_doctor_insight": "A specific insight from Alex's vault content that's particularly relevant for this user"${counterSchema}
}

Rules:
- fighter_explanations: one entry per matched fighter (${matchedFighters.length} total). Reference specific things Alex said.
- strengths: exactly 4, based on top dimensions.
- growth_areas: exactly 3, based on bottom dimensions. Each must have actionable advice.
- training_priorities: exactly 4 items.
- Ground recommendations in the retrieved vault content. Reference specific analyses.${counterContexts.length > 0 ? `
- counter_explanations: exactly ${counterContexts.length} entries, in the SAME ORDER as the Counter Matchups above. Never skip, reorder, or invent fighters.
- Each counter paragraph: 150-200 words, vault-grounded. Cite specific teachings from the fighter's vault entry AND the retrieved chunks. No invented facts.
- Each recommended_drills slug MUST appear in this list: ${VAULT_SLUGS.join(", ")}. Drills not in this list will be dropped.` : ""}
- Return ONLY valid JSON. No markdown fences, no preamble.`;
}
```

- [ ] **Step 3: Wire the counter computation into POST handler**

In the `POST` function, after the existing `const bottomDimensions = getBottomDimensions(scores, 3);` line, add:

```ts
    // Compute counters (server-side from the passed-in matches as exclusion)
    const matchedSlugs = (matched_fighters as Array<{ slug: string }>).map((m) => m.slug);
    const counters: CounterMatch[] = matchCounters(scores, matchedSlugs, 3);

    // Gather per-counter context in parallel: vault entry + targeted RAG
    const counterContexts: CounterContext[] = await Promise.all(
      counters.map(async (c) => {
        const vectorLabel = attackVectorLabel(c.primaryAttackVector);
        const exploitedLabels = c.exploitedDimensions.map((d) => DIMENSION_LABELS[d.dimension]);
        const query = buildCounterQuery(c.fighter.name, vectorLabel, exploitedLabels);

        const [vaultEntry, ragResult] = await Promise.all([
          readFighterVaultEntry(c.fighter.slug),
          withRetry(() =>
            retrieveContext(query, { count: 6, categories: ["analysis", "mechanics", "drill"] })
          ).catch(() => ({ chunks: [], citations: [] })),
        ]);

        return {
          counter: c,
          vaultEntry,
          ragContext: formatChunksForPrompt(ragResult.chunks),
        };
      })
    );
```

- [ ] **Step 4: Update `buildPrompt` call and `max_tokens`**

Replace the `buildPrompt(...)` call with:

```ts
    const systemPrompt = buildPrompt(
      scores,
      topDimensions,
      bottomDimensions,
      matched_fighters,
      counterContexts,
      physical_context,
      experience_level,
      ragContext
    );
```

Then replace the Anthropic call's `max_tokens: 2048` line with `max_tokens: 4096`:

```ts
    const response = await withRetry(() =>
      anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: "Generate the style analysis JSON based on the profile and vault content above.",
          },
        ],
      })
    );
```

- [ ] **Step 5: Validate `counter_explanations` and extend response**

After the existing `result = JSON.parse(jsonStr);` try/catch block, add a validation + sanitisation pass, and change the final `NextResponse.json({...})` to include `counter_fighters`:

```ts
    // Validate counter_explanations: drop drills with unknown slugs; tolerate missing array.
    const rawCounters = Array.isArray(result.counter_explanations) ? result.counter_explanations : [];
    const validatedCounters = rawCounters.map((entry: unknown) => {
      const e = entry as Record<string, unknown>;
      const drills = Array.isArray(e.recommended_drills) ? e.recommended_drills : [];
      const validDrills = drills.filter((d: unknown) => {
        const drill = d as { slug?: unknown };
        return typeof drill.slug === "string" && (VAULT_SLUGS as readonly string[]).includes(drill.slug);
      });
      return {
        name: typeof e.name === "string" ? e.name : "",
        slug: typeof e.slug === "string" ? e.slug : "",
        attack_vector: typeof e.attack_vector === "string" ? e.attack_vector : "",
        paragraph: typeof e.paragraph === "string" ? e.paragraph : "",
        exploited_dimensions: Array.isArray(e.exploited_dimensions) ? e.exploited_dimensions : [],
        one_shot_notes: typeof e.one_shot_notes === "string" ? e.one_shot_notes : null,
        recommended_drills: validDrills,
        citations: Array.isArray(e.citations) ? e.citations : [],
      };
    });
```

Then replace the final response JSON with:

```ts
    return NextResponse.json({
      style_name: result.style_name,
      description: result.description,
      dimension_scores: scores,
      fighter_explanations: result.fighter_explanations,
      strengths: result.strengths,
      growth_areas: result.growth_areas,
      punches_to_master: result.punches_to_master,
      stance_recommendation: result.stance_recommendation,
      training_priorities: result.training_priorities,
      punch_doctor_insight: result.punch_doctor_insight,
      counter_fighters: validatedCounters,
      citations,
    });
```

- [ ] **Step 6: Typecheck + tests**

Run: `npm run build`
Expected: clean.

Run: `npm run test`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/style-finder/route.ts
git commit -m "feat(style-finder): compute + explain counter matchups

Extends the style-finder route to compute top-3 counters deterministically,
read each counter's vault entry + retrieve targeted RAG chunks, and ask
Claude to produce a new counter_explanations array. Max tokens bumped to
4096 to fit the extended output. Drill slugs validated against VAULT_SLUGS;
unknown slugs dropped silently."
```

---

### Task 5: Persist and hydrate `counter_fighters`

**Files:**
- Modify: `src/components/style-finder-tab.tsx`
- Modify: `src/components/style-finder/results-profile.tsx`

The API already returns `counter_fighters` (Task 4). This task wires it through the component state, localStorage, and Supabase insert so retakes and anonymous reloads show the counter section.

- [ ] **Step 1: Extend `StyleProfileResult` type**

In `src/components/style-finder/results-profile.tsx`, find the `StyleProfileResult` interface (around line 22) and replace it with:

```ts
export interface CounterExplanation {
  name: string;
  slug: string;
  attack_vector: string;
  paragraph: string;
  exploited_dimensions: Array<{
    dimension: string;
    user_score: number;
    fighter_score: number;
    gap: number;
  }>;
  one_shot_notes: string | null;
  recommended_drills: Array<{ slug: string; name: string; why: string }>;
  citations: Array<{ title: string; url_or_path: string }>;
}

export interface StyleProfileResult {
  style_name: string;
  description: string;
  dimension_scores: DimensionScores;
  fighter_explanations: { name: string; explanation: string }[];
  matched_fighters: { name: string; slug: string; overlappingDimensions: (keyof DimensionScores)[] }[];
  counter_fighters: CounterExplanation[];
  strengths: string[];
  growth_areas: { dimension: string; advice: string }[];
  punches_to_master: string[];
  stance_recommendation: string;
  training_priorities: string[];
  punch_doctor_insight: string;
}
```

- [ ] **Step 2: Wire counter_fighters into component state + persistence**

In `src/components/style-finder-tab.tsx`, inside `handleQuizComplete`, replace the `profileResult` construction (lines 117-133 currently) with:

```ts
      const profileResult: StyleProfileResult = {
        style_name: data.style_name,
        description: data.description,
        dimension_scores: dimensionScores,
        fighter_explanations: data.fighter_explanations,
        matched_fighters: matches.map((m) => ({
          name: m.fighter.name,
          slug: m.fighter.slug,
          overlappingDimensions: m.overlappingDimensions,
        })),
        counter_fighters: Array.isArray(data.counter_fighters) ? data.counter_fighters : [],
        strengths: data.strengths,
        growth_areas: data.growth_areas,
        punches_to_master: data.punches_to_master,
        stance_recommendation: data.stance_recommendation,
        training_priorities: data.training_priorities,
        punch_doctor_insight: data.punch_doctor_insight,
      };
```

Then, in the Supabase insert block (around line 168), add `counter_fighters` to the insert payload so it persists:

```ts
          const { data: newProfile } = await (supabase.from("style_profiles") as any)
            .insert({
              user_id: authData.user.id,
              answers,
              dimension_scores: dimensionScores,
              physical_context: physical,
              ai_result: data,
              matched_fighters: matches.map((m) => ({
                name: m.fighter.name,
                slug: m.fighter.slug,
                overlappingDimensions: m.overlappingDimensions,
              })),
              counter_fighters: Array.isArray(data.counter_fighters) ? data.counter_fighters : [],
            })
            .select("id")
            .single();
```

- [ ] **Step 3: Hydrate counter_fighters on load (authed path)**

Still in `src/components/style-finder-tab.tsx`, in the `useEffect` that loads the profile from Supabase (lines 31-75), replace the `setResult({...})` call inside the `if (data)` block (around line 44) with:

```ts
          if (data) {
            setResult({
              ...(data.ai_result as Omit<StyleProfileResult, "dimension_scores" | "matched_fighters" | "counter_fighters">),
              dimension_scores: data.dimension_scores as DimensionScores,
              matched_fighters: data.matched_fighters as StyleProfileResult["matched_fighters"],
              counter_fighters: (data.counter_fighters as StyleProfileResult["counter_fighters"]) ?? [],
            });
```

The localStorage fallback path (`setResult(parsed.result)`) doesn't need changes — localStorage already stores the full `result` object which now includes `counter_fighters`.

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: clean. If TypeScript errors appear about `counter_fighters` being required on places that still use the old shape, check that no other files import `StyleProfileResult` — the UI component in Task 6 is the only other consumer.

- [ ] **Step 5: Commit**

```bash
git add src/components/style-finder-tab.tsx src/components/style-finder/results-profile.tsx
git commit -m "feat(style-finder): hydrate and persist counter_fighters

Extends StyleProfileResult with counter_fighters, persists it to Supabase
alongside matched_fighters, and hydrates it from both DB and localStorage.
Anonymous users get their counters restored from the same boxing-coach-style-profile
localStorage blob they already use."
```

---

### Task 6: Fighter-counter card UI component

**Files:**
- Create: `src/components/style-finder/fighter-counter-card.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/style-finder/fighter-counter-card.tsx` with this exact content:

```tsx
"use client";

import { AlertTriangle, Zap, Target } from "lucide-react";
import type { CounterExplanation } from "./results-profile";
import { DIMENSION_LABELS, type DimensionScores } from "@/data/fighter-profiles";

interface FighterCounterCardProps {
  rank: number;
  counter: CounterExplanation;
  onAskMatchup?: (query: string) => void;
}

export function FighterCounterCard({ rank, counter, onAskMatchup }: FighterCounterCardProps) {
  const threatLabel = rank === 1 ? "High Threat" : "Moderate Threat";
  const threatTone = rank === 1 ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300";

  const handleAsk = () => {
    if (onAskMatchup) {
      onAskMatchup(
        `How do I train to survive a matchup against a ${counter.attack_vector.toLowerCase()} like ${counter.name} given my profile?`
      );
    }
  };

  return (
    <div className="bg-surface border border-red-500/30 rounded-xl p-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center">
          <AlertTriangle className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-foreground">{counter.name}</h3>
            <span className="inline-block rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-400">
              {counter.attack_vector}
            </span>
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${threatTone}`}>
              {threatLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Exploited-dimensions mini chart */}
      {counter.exploited_dimensions.length > 0 && (
        <div className="mt-4 space-y-2">
          {counter.exploited_dimensions.map((d) => {
            const label = DIMENSION_LABELS[d.dimension as keyof DimensionScores] ?? d.dimension;
            return (
              <div key={d.dimension}>
                <div className="flex justify-between text-xs text-muted mb-1">
                  <span>{label}</span>
                  <span>
                    You {d.user_score} · {counter.name.split(" ")[0]} {d.fighter_score} (+{d.gap})
                  </span>
                </div>
                <div className="relative h-2 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-blue-400/60"
                    style={{ width: `${d.user_score}%` }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 bg-red-400/60"
                    style={{ width: `${d.fighter_score}%`, mixBlendMode: "screen" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* One-shot callout */}
      {counter.one_shot_notes && (
        <div className="mt-4 flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <Zap className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-200">{counter.one_shot_notes}</p>
        </div>
      )}

      {/* Paragraph body */}
      <p className="mt-4 text-sm text-muted leading-relaxed">{counter.paragraph}</p>

      {/* Recommended drills */}
      {counter.recommended_drills.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Target className="w-3.5 h-3.5 text-accent" />
            <span className="text-xs font-semibold text-accent">Train to close the gap</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {counter.recommended_drills.map((drill) => (
              <span
                key={drill.slug}
                title={drill.why}
                className="inline-block rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent"
              >
                {drill.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Citations */}
      {counter.citations.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs text-muted mb-1">Sources:</p>
          <ul className="space-y-0.5">
            {counter.citations.map((c, i) => (
              <li key={i} className="text-xs text-muted">
                · {c.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* CTA */}
      {onAskMatchup && (
        <button
          onClick={handleAsk}
          className="mt-4 w-full rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-3 transition-colors"
        >
          Ask about this matchup
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/style-finder/fighter-counter-card.tsx
git commit -m "feat(style-finder): FighterCounterCard component

Renders a single counter matchup: fighter name + attack-vector badge + threat
tag, exploited-dimensions mini bars, optional one-shot callout, the LLM
analysis paragraph, drill chips, citations, and an Ask about this matchup
CTA that pre-fills the embedded style chat."
```

---

### Task 7: Insert "Fighters Strongest Against You" section

**Files:**
- Modify: `src/components/style-finder/results-profile.tsx`

- [ ] **Step 1: Import the new card**

At the top of `src/components/style-finder/results-profile.tsx`, alongside the existing `FighterMatchCard` import, add:

```ts
import { FighterCounterCard } from "./fighter-counter-card";
```

- [ ] **Step 2: Render the counter section after Fighter Matches**

In `results-profile.tsx`, immediately after the closing `</div>` of the `Fighter Matches` section (currently at line 232) and before the opening of the `Strengths vs Growth Areas` section (line 234), insert:

```tsx
        {/* Fighters Strongest Against You */}
        {result.counter_fighters.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-red-400 mb-1">Fighters Strongest Against You</h3>
            <p className="text-xs text-muted mb-4">
              Archetypes that exploit your lowest dimensions. Train the gap, not the headline.
            </p>
            <div className="space-y-4">
              {result.counter_fighters.map((counter, i) => (
                <FighterCounterCard
                  key={counter.slug}
                  rank={i + 1}
                  counter={counter}
                  onAskMatchup={onAskCoach}
                />
              ))}
            </div>
          </div>
        )}
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: clean.

Run: `npm run test`
Expected: existing tests pass; no new unit tests added for this pure-JSX integration (covered by Task 9's smoke).

- [ ] **Step 4: Commit**

```bash
git add src/components/style-finder/results-profile.tsx
git commit -m "feat(style-finder): render Fighters Strongest Against You section

New section between Fighter Matches and Strengths/Growth. Hidden entirely
when counter_fighters is empty (balanced user). Wires the embedded chat CTA
through the existing onAskCoach prop."
```

---

### Task 8: API integration test for counters

**Files:**
- Create: `src/app/api/style-finder/route.test.ts`

A lightweight integration test that mocks Anthropic + retrieveContext and verifies:
- `counter_fighters` is included in the response
- Unknown drill slugs are dropped
- Empty counters path returns `counter_fighters: []`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/style-finder/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@anthropic-ai/sdk", () => {
  const create = vi.fn();
  class Anthropic {
    messages = { create };
  }
  return { default: Anthropic };
});

vi.mock("@/lib/graph-rag", () => ({
  retrieveContext: vi.fn().mockResolvedValue({ chunks: [], citations: [] }),
  formatChunksForPrompt: vi.fn().mockReturnValue(""),
}));

vi.mock("@/lib/vault-reader", () => ({
  readFighterVaultEntry: vi.fn().mockResolvedValue("# Mock vault entry"),
}));

async function callPost(body: unknown) {
  const { POST } = await import("./route");
  const req = new Request("http://test/api/style-finder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return POST(req as any);
}

function mockAnthropicResponse(json: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sdk = require("@anthropic-ai/sdk");
  sdk.default.prototype.messages = { create: vi.fn().mockResolvedValue({
    content: [{ type: "text", text: JSON.stringify(json) }],
  })};
}

describe("style-finder POST with counters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns counter_fighters in the response, with unknown drill slugs dropped", async () => {
    mockAnthropicResponse({
      style_name: "Test",
      description: "x",
      fighter_explanations: [{ name: "Mike Tyson", explanation: "y" }],
      strengths: ["a", "b", "c", "d"],
      growth_areas: [{ dimension: "Defensive Integration", advice: "z" }],
      punches_to_master: ["jab"],
      stance_recommendation: "orthodox",
      training_priorities: ["a", "b", "c", "d"],
      punch_doctor_insight: "insight",
      counter_explanations: [
        {
          name: "Mike Tyson",
          slug: "mike-tyson",
          attack_vector: "Power Puncher",
          paragraph: "Tyson exploits your low defence.",
          exploited_dimensions: [{ dimension: "defensiveIntegration", user_score: 25, fighter_score: 60, gap: 35 }],
          one_shot_notes: null,
          recommended_drills: [
            { slug: "hip-rotation-drill", name: "Hip Rotation Drill", why: "builds defence" },
            { slug: "not-a-real-drill", name: "Fake", why: "should be dropped" },
          ],
          citations: [{ title: "vault/fighters/mike-tyson.md", url_or_path: "vault/fighters/mike-tyson.md" }],
        },
      ],
    });

    const res = await callPost({
      dimension_scores: {
        powerMechanics: 40, positionalReadiness: 35, rangeControl: 50, defensiveIntegration: 25,
        ringIQ: 50, outputPressure: 50, deceptionSetup: 50, killerInstinct: 50,
      },
      physical_context: { height: "5'10", build: "medium", reach: "72", stance: "orthodox" },
      matched_fighters: [
        { name: "Terence Crawford", slug: "terence-crawford", overlappingDimensions: ["deceptionSetup"] },
      ],
      experience_level: "intermediate",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.counter_fighters)).toBe(true);
    expect(body.counter_fighters.length).toBeGreaterThanOrEqual(1);
    const drills = body.counter_fighters[0].recommended_drills;
    const slugs = drills.map((d: { slug: string }) => d.slug);
    expect(slugs).toContain("hip-rotation-drill");
    expect(slugs).not.toContain("not-a-real-drill");
  });

  it("returns counter_fighters: [] when user is balanced (gate fails)", async () => {
    mockAnthropicResponse({
      style_name: "Test",
      description: "x",
      fighter_explanations: [{ name: "a", explanation: "y" }],
      strengths: ["a", "b", "c", "d"],
      growth_areas: [{ dimension: "x", advice: "z" }],
      punches_to_master: ["jab"],
      stance_recommendation: "orthodox",
      training_priorities: ["a", "b", "c", "d"],
      punch_doctor_insight: "insight",
      // counter_explanations intentionally omitted
    });

    const res = await callPost({
      dimension_scores: {
        powerMechanics: 60, positionalReadiness: 60, rangeControl: 60, defensiveIntegration: 60,
        ringIQ: 60, outputPressure: 60, deceptionSetup: 60, killerInstinct: 60,
      },
      physical_context: { height: "5'10", build: "medium", reach: "72", stance: "orthodox" },
      matched_fighters: [{ name: "a", slug: "alex-pereira", overlappingDimensions: [] }],
      experience_level: "intermediate",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.counter_fighters)).toBe(true);
    expect(body.counter_fighters.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (then passes after Task 4 is applied)**

Run: `npx vitest run src/app/api/style-finder/route.test.ts`
Expected: If Task 4 is already landed, tests should PASS. If Task 4 isn't landed, the counter_fighters field won't exist in the response and the test fails as expected.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/style-finder/route.test.ts
git commit -m "test(style-finder): integration tests for counter_fighters

Mocks Anthropic, retrieveContext, and vault-reader. Verifies counter_fighters
is returned, unknown drill slugs are dropped by the server-side validator,
and balanced users get an empty counters list."
```

---

### Task 9: Manual smoke test + migration apply

**Files:** none modified — verification only.

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Expected: server starts on port 3000 or an available port.

- [ ] **Step 2: Ensure migration 007 is applied**

Confirm via the Supabase dashboard SQL editor (or MCP `list_migrations`) that `007_style_counter_fighters` appears in the applied list. If not, apply it before continuing (see Task 1 Step 2).

- [ ] **Step 3: Seed a test profile via Playwright or direct quiz**

Open the dev URL, go to Find Your Style, complete the quiz with answers that produce a low-defence profile (e.g. pick "I'd rather out-punch them" repeatedly, "I don't like moving my head much"). Let results render.

Expected:
- The "Fighters Strongest Against You" section appears between "Fighter Matches" and "Strengths/Growth".
- 2-3 counter cards render, each with a non-empty paragraph, attack-vector badge, threat tag (first is "High Threat", others "Moderate"), exploited-dims mini chart, and at least one drill chip.
- Clicking "Ask about this matchup" on any counter card opens the embedded chat with a pre-filled query.

- [ ] **Step 4: Verify persistence**

In the Supabase SQL editor:
```sql
SELECT counter_fighters
FROM style_profiles
WHERE is_current = true
ORDER BY created_at DESC
LIMIT 1;
```
Expected: a JSON array of 2-3 objects matching the `CounterExplanation` shape.

- [ ] **Step 5: Verify balanced-user empty state**

Retake the quiz with balanced/moderate answers (aim for ~60 across all dims). Expected: the "Fighters Strongest Against You" section is NOT in the DOM.

- [ ] **Step 6: No commit needed**

This is pure verification. Any debug logging added during smoke should be removed.

---

## Self-Review Checklist

**Spec coverage:**
- Ranking math (attack vectors + one-shot + gate + exclusion): Task 2 ✓
- Vault reader: Task 3 ✓
- Per-counter RAG retrieval: Task 4 ✓
- Single Anthropic call extension + 4096 tokens: Task 4 ✓
- Drill-slug validation against VAULT_SLUGS: Task 4 + Task 8 ✓
- Migration 007 + persistence: Task 1 + Task 5 ✓
- UI component + section insertion: Task 6 + Task 7 ✓
- Playwright smoke: Task 9 ✓
- API integration test: Task 8 ✓

**Type consistency:**
- `CounterMatch` (lib) distinct from `CounterExplanation` (UI) — intentional: lib is pure-math, UI is post-LLM. Both shapes are defined explicitly in tasks 2 and 5.
- `AttackVectorId` union type matches `counter.primaryAttackVector` and is used consistently by `attackVectorLabel()`.
- `StyleProfileResult.counter_fighters: CounterExplanation[]` is the canonical client shape.

**Migration numbering:** 007 (006 is taken by `drill_followup_observability.sql`).

**No placeholders:** scan shows no TBD/TODO/etc.
