import type { DimensionScores } from "@/data/fighter-profiles";
import { scoringMap, sliderScoring, multiselectScoring } from "@/data/scoring-map";

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

const CONTEXT_ONLY_QUESTIONS = new Set([
  "stance",
  "height",
  "build",
  "reach",
  "experience",
  "goal",
]);

// Slider questions must be listed explicitly because `sliderScoring` is a
// function, not a data map — there's no way to introspect its signature.
// Keep this in sync with sliderScoring in scoring-map.ts.
const SLIDER_QUESTION_IDS = ["power_speed"];

// Reference-scale anchor: fighter profiles in fighter-profiles.ts peak at 95
// (Pereira, powerMechanics). A user who picks every dimension-optimal answer
// would otherwise hit 100 by construction. Dividing by 1.2× the theoretical
// max caps a "perfect" quiz around 83, leaving 100 genuinely unreachable and
// matching the elite-ceiling-at-95 scale used elsewhere.
const CEILING_SLACK = 1.2;

/**
 * Compute dimension scores deterministically from quiz answers.
 * Returns normalized 0-100 scores for each of the 8 dimensions.
 */
export function computeDimensionScores(
  answers: Record<string, string | string[] | number>
): DimensionScores {
  const raw: Record<string, number> = {};
  for (const key of DIMENSION_KEYS) raw[key] = 0;

  for (const [questionId, answer] of Object.entries(answers)) {
    if (CONTEXT_ONLY_QUESTIONS.has(questionId)) continue;

    if (typeof answer === "number") {
      const contributions = sliderScoring(questionId, answer);
      for (const [dim, value] of Object.entries(contributions)) {
        raw[dim] = (raw[dim] ?? 0) + value;
      }
      continue;
    }

    if (Array.isArray(answer)) {
      const msMap = multiselectScoring[questionId];
      if (msMap) {
        for (const selected of answer) {
          const contributions = msMap[selected];
          if (contributions) {
            for (const [dim, value] of Object.entries(contributions)) {
              raw[dim] = (raw[dim] ?? 0) + value;
            }
          }
        }
      }
      continue;
    }

    const questionMap = scoringMap[questionId];
    if (questionMap) {
      const contributions = questionMap[answer];
      if (contributions) {
        for (const [dim, value] of Object.entries(contributions)) {
          raw[dim] = (raw[dim] ?? 0) + value;
        }
      }
    }
  }

  return normalize(raw);
}

/**
 * Per-dimension upper bound = sum across questions of the single
 * dimension-optimal answer per question.
 *
 * Aggregation rules:
 * - MC question: max positive contribution per dimension across options.
 * - Multiselect (preferred_punches, pick 2): sum of top-2 positive contributions.
 * - Slider: evaluate at endpoints (0, 100), take per-dim max.
 * - Negative contributions are ignored — they can only lower scores, never
 *   raise the ceiling.
 *
 * Exported for the snapshot test in dimension-scoring.test.ts.
 */
export const THEORETICAL_MAXIMA: Record<string, number> = computeTheoreticalMaxima();

function computeTheoreticalMaxima(): Record<string, number> {
  const maxima: Record<string, number> = {};
  for (const key of DIMENSION_KEYS) maxima[key] = 0;

  for (const question of Object.values(scoringMap)) {
    const perDimMax: Record<string, number> = {};
    for (const option of Object.values(question)) {
      for (const [dim, value] of Object.entries(option)) {
        if (value <= 0) continue;
        if (value > (perDimMax[dim] ?? 0)) perDimMax[dim] = value;
      }
    }
    for (const [dim, value] of Object.entries(perDimMax)) {
      maxima[dim] = (maxima[dim] ?? 0) + value;
    }
  }

  for (const question of Object.values(multiselectScoring)) {
    const perDimContribs: Record<string, number[]> = {};
    for (const option of Object.values(question)) {
      for (const [dim, value] of Object.entries(option)) {
        if (value <= 0) continue;
        (perDimContribs[dim] ??= []).push(value);
      }
    }
    for (const [dim, values] of Object.entries(perDimContribs)) {
      const top2 = values.sort((a, b) => b - a).slice(0, 2);
      maxima[dim] = (maxima[dim] ?? 0) + top2.reduce((s, v) => s + v, 0);
    }
  }

  for (const qid of SLIDER_QUESTION_IDS) {
    const perDimMax: Record<string, number> = {};
    for (const v of [0, 100]) {
      for (const [dim, value] of Object.entries(sliderScoring(qid, v))) {
        if (value <= 0) continue;
        if (value > (perDimMax[dim] ?? 0)) perDimMax[dim] = value;
      }
    }
    for (const [dim, value] of Object.entries(perDimMax)) {
      maxima[dim] = (maxima[dim] ?? 0) + value;
    }
  }

  return maxima;
}

function normalize(raw: Record<string, number>): DimensionScores {
  const result: Record<string, number> = {};
  for (const key of DIMENSION_KEYS) {
    const rawVal = raw[key] ?? 0;
    const max = (THEORETICAL_MAXIMA[key] ?? 100) * CEILING_SLACK;
    result[key] = Math.max(0, Math.min(100, Math.round((rawVal / max) * 100)));
  }
  return result as unknown as DimensionScores;
}
