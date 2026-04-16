import { DimensionScores, FighterProfile, fighterProfiles, DIMENSION_LABELS } from "@/data/fighter-profiles";

export interface FighterMatch {
  fighter: FighterProfile;
  distance: number;
  overlappingDimensions: (keyof DimensionScores)[];
}

const DIMENSION_KEYS = Object.keys(DIMENSION_LABELS) as (keyof DimensionScores)[];

function euclideanDistance(a: DimensionScores, b: DimensionScores): number {
  let sum = 0;
  for (const key of DIMENSION_KEYS) {
    const diff = a[key] - b[key];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Match user scores against pre-scored fighter profiles using Euclidean distance.
 * Returns the top `count` closest fighters with overlapping high-scoring dimensions.
 */
export function matchFighters(
  userScores: DimensionScores,
  count: number = 3
): FighterMatch[] {
  const matches = fighterProfiles.map((fighter) => {
    const distance = euclideanDistance(userScores, fighter.scores);
    const overlappingDimensions = DIMENSION_KEYS.filter(
      (key) => userScores[key] >= 70 && fighter.scores[key] >= 70
    );
    return { fighter, distance, overlappingDimensions };
  });

  matches.sort((a, b) => a.distance - b.distance);
  return matches.slice(0, count);
}
