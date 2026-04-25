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
