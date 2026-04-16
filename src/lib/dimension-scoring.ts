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

/**
 * Compute dimension scores deterministically from quiz answers.
 * Returns normalized 0-100 scores for each of the 8 dimensions.
 *
 * @param answers - map of questionId → answer value(s)
 *   MC questions: string value
 *   Slider questions: number (0-100)
 *   Multiselect questions: string[] of selected values
 */
export function computeDimensionScores(
  answers: Record<string, string | string[] | number>
): DimensionScores {
  const raw: Record<string, number> = {};
  for (const key of DIMENSION_KEYS) {
    raw[key] = 0;
  }

  for (const [questionId, answer] of Object.entries(answers)) {
    // Skip context-only questions (Part A except weakness)
    if (["stance", "height", "build", "reach", "experience", "goal"].includes(questionId)) {
      continue;
    }

    // Slider scoring
    if (typeof answer === "number") {
      const contributions = sliderScoring(questionId, answer);
      for (const [dim, value] of Object.entries(contributions)) {
        raw[dim] = (raw[dim] ?? 0) + value;
      }
      continue;
    }

    // Multiselect scoring
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

    // Standard MC scoring
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

  // Normalize to 0-100
  return normalize(raw);
}

/**
 * Normalize raw scores to 0-100.
 *
 * We use a theoretical max based on the maximum possible positive contribution
 * per dimension. Negative scores clamp to 0.
 */
function normalize(raw: Record<string, number>): DimensionScores {
  // Approximate max raw scores per dimension (sum of highest possible positive contributions)
  // These are calibrated so a "maxed out" profile in one dimension scores ~95-100
  const maxRaw: Record<string, number> = {
    powerMechanics: 90,
    positionalReadiness: 70,
    rangeControl: 90,
    defensiveIntegration: 85,
    ringIQ: 90,
    outputPressure: 95,
    deceptionSetup: 85,
    killerInstinct: 80,
  };

  const result: Record<string, number> = {};
  for (const key of DIMENSION_KEYS) {
    const rawVal = raw[key] ?? 0;
    const max = maxRaw[key] ?? 80;
    // Clamp to 0-100
    result[key] = Math.max(0, Math.min(100, Math.round((rawVal / max) * 100)));
  }

  return result as unknown as DimensionScores;
}
