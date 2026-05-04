import { type DimensionScores, DIMENSION_LABELS } from "@/data/fighter-profiles";
import { CORE_PRINCIPLES } from "@/lib/framework";
import { getTopDimensions, getBottomDimensions } from "@/lib/dimension-helpers";
import { INTENSITY_VALUES, CONTEXT_VALUES, TIME_MIN_VALUES } from "@/lib/drill-program-types";

export type MatchedFighterForPrompt = {
  name: string;
  slug: string;
  overlappingDimensions: string[];
  source?: "alex" | "public";
};

export type PhysicalContext = {
  height: string;
  build: string;
  reach: string;
  stance: string;
};

export type DrillProgramPromptInput = {
  dimensionScores: DimensionScores;
  matchedFighters: MatchedFighterForPrompt[];
  physicalContext: PhysicalContext;
  experienceLevel: string;
  vaultDrills: Array<{ slug: string; content: string }>;
};

// ---------------------------------------------------------------------------
// File-local helpers
// ---------------------------------------------------------------------------

function formatDimensionScores(scores: DimensionScores): string {
  return (Object.entries(scores) as [keyof DimensionScores, number][])
    .map(([key, score]) => `  ${DIMENSION_LABELS[key]}: ${score}/100`)
    .join("\n");
}

function formatTopBottom(dims: { label: string; score: number }[]): string {
  return dims.map((d) => `  ${d.label}: ${d.score}/100`).join("\n");
}

function formatFighterList(fighters: MatchedFighterForPrompt[]): string {
  return fighters
    .map((f) => {
      const tag =
        f.source === "public"
          ? " [public-knowledge — describe archetype generally without 'Alex said' attribution]"
          : "";
      return `  - ${f.name}${tag} (overlapping dimensions: ${f.overlappingDimensions.join(", ")})`;
    })
    .join("\n");
}

function formatDrillLibrary(drills: Array<{ slug: string; content: string }>): string {
  return drills.map((d) => `### ${d.slug}\n\n${d.content}`).join("\n\n---\n\n");
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function buildDrillProgramPrompt(input: DrillProgramPromptInput): string {
  const { dimensionScores, matchedFighters, physicalContext, experienceLevel, vaultDrills } = input;

  const topDimensions = getTopDimensions(dimensionScores, 3);
  const bottomDimensions = getBottomDimensions(dimensionScores, 3);

  const experienceNote =
    experienceLevel === "beginner" || experienceLevel === "none"
      ? `The user is a BEGINNER. Use language like "natural tendencies", "instincts", "your body wants to...". Avoid jargon. Frame everything as potential to develop.`
      : `The user is EXPERIENCED (${experienceLevel}). Use language like "your game", "you excel at...", "strengths". Be specific about mechanics and strategy.`;

  const vaultSlugs = vaultDrills.map((d) => d.slug);

  return `You are Dr. Alex Wiant's AI drill curator. Based on his Power Punching Blueprint methodology, you assemble drill programs tailored to a fighter's style.

## Alex's Core Principles
${CORE_PRINCIPLES.map((p) => `- ${p}`).join("\n")}

## User Profile
Physical: ${physicalContext.height}, ${physicalContext.build} build, ${physicalContext.reach} reach, ${physicalContext.stance} stance
Experience: ${experienceLevel}

## Pre-Computed Dimension Scores (DO NOT recalculate — use these exactly)
${formatDimensionScores(dimensionScores)}

Top 3 dimensions:
${formatTopBottom(topDimensions)}

Bottom 3 dimensions:
${formatTopBottom(bottomDimensions)}

## Matched Fighters (DO NOT pick different ones — build drill selections around these archetypes)
${formatFighterList(matchedFighters)}

## Experience-Aware Language
${experienceNote}

## Vault Drill Library (your canonical pool — prefer these over invented drills)
${formatDrillLibrary(vaultDrills)}

## Axis Values
- intensity: ${INTENSITY_VALUES.join(" | ")}
- context: ${CONTEXT_VALUES.join(" | ")}
- time_min: ${TIME_MIN_VALUES.join(" | ")}

## Your Task
Produce a DrillProgram JSON for this fighter's profile. Return a JSON object with this exact shape:

{
  "generated_at": "ISO timestamp",
  "axis_values": {
    "intensity": ${JSON.stringify([...INTENSITY_VALUES])},
    "context": ${JSON.stringify([...CONTEXT_VALUES])},
    "time_min": ${JSON.stringify([...TIME_MIN_VALUES])}
  },
  "drills": [
    {
      "id": "kebab-case-or-uuid",
      "name": "Drill name",
      "vault_ref": "barbell-punch | null",
      "duration_min": 15,
      "intensity": ["medium", "heavy"],
      "context": ["bag"],
      "why_fits_you": "1-2 sentences grounded in this user's top dimensions / matched fighters",
      "cues": ["Cue 1", "Cue 2", "Cue 3"],
      "rounds_or_dose": "4x 2-min rounds, 30s rest"
    }
  ],
  "sessions": [
    {
      "intensity": "medium",
      "context": "bag",
      "time_min": 20,
      "intro": "1-sentence framing for this session",
      "drill_ids": ["kebab-case-or-uuid"]
    }
  ]
}

Rules:
- Produce one sessions[] entry for EVERY (intensity × context × time_min) combination — 3 × 4 × 4 = 48 sessions total. Every cell must be covered.
- Each session has 1-4 drills, scaled by time_min: 10 min = 1-2 drills, 20 min = 2-3 drills, 30 min = 3-4 drills, 45 min = 3-4 drills.
- Drill pool: prefer vault drills (set vault_ref to the slug from the library above). Invent new drills only when no vault drill fits the cell.
- vault_ref MUST be one of these slugs OR null: ${vaultSlugs.join(", ")}.
- Each drill needs why_fits_you grounded in the user's actual top dimensions / matched fighters — not generic.
- cues: 2-4 short, actionable cue lines per drill.
- drill_ids in each session must reference drills[].id exactly.
- INTERNAL CONSISTENCY (critical):
  - duration_min MUST equal the total wall-clock minutes implied by rounds_or_dose (work + rest combined). Example: "3x 3-min rounds, 1 min rest" = 3*3 + 2*1 = 11, so duration_min = 11. Don't pick round-number durations that contradict the dose.
  - intensity[] tags MUST match what the cues and dose actually prescribe. If cues describe ~60% load / rhythm work / light intent, do NOT tag the drill "heavy". If a session's bucket is "heavy" and a drill's cues are light-rhythm, that drill does NOT belong in the heavy session.
  - context[] tags MUST match what the cues actually require. Don't tag a drill "bag" if the cues describe shadow-only movement.
- SESSION-DRILL TAG MATCH: every drill_id in a session MUST point to a drill whose intensity[] includes the session's intensity AND whose context[] includes the session's context. The validator drops mismatches; emitting them wastes tokens and risks empty sessions.
- VERBOSITY CAPS (must obey to fit max_tokens budget):
  - why_fits_you: ONE sentence, ≤140 chars. Cite a specific dimension or fighter; no preamble like "This drill is great because…".
  - cues: ≤3 cues per drill, each ≤80 chars. Imperative voice.
  - intro (per session): ONE sentence, ≤120 chars.
- ORPHAN PREVENTION: every drill in drills[] MUST appear in at least one sessions[].drill_ids. If you can't fit a drill into any session, don't include it in the pool.
- If experienceLevel is "beginner" or "none", frame all why_fits_you and intros in beginner language (natural tendencies, instincts, your body wants to…).
- Return ONLY valid JSON. No markdown fences, no preamble.`;
}
