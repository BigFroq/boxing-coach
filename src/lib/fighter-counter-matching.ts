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
      const primary = vectorScores.reduce((max, cur) => (cur.threat > max.threat ? cur : max));
      const oneShots = oneShotDims(userScores, fighter.scores);

      return {
        fighter,
        threatScore: primary.threat,
        primaryAttackVector: primary.vector.id,
        exploitedDimensions: topExploitedDims(userScores, fighter.scores),
        oneShotDominance: oneShots,
      };
    });

  candidates.sort((a, b) => b.threatScore - a.threatScore);
  return candidates.slice(0, count);
}
