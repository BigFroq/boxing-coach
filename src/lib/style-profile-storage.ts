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
