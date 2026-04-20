import type { DimensionScores } from "@/data/fighter-profiles";
import { DIMENSION_LABELS } from "@/data/fighter-profiles";

export type DimensionKey = keyof DimensionScores;

export const DIMENSION_KEYS: readonly DimensionKey[] = Object.keys(
  DIMENSION_LABELS
) as DimensionKey[];

/** Canonical human label → key. Built from DIMENSION_LABELS so it stays in sync. */
export const DIMENSION_LABEL_TO_KEY: Record<string, DimensionKey> = Object.fromEntries(
  (Object.entries(DIMENSION_LABELS) as [DimensionKey, string][]).map(
    ([key, label]) => [label.toLowerCase().trim(), key]
  )
);

/** Auto-derived aliases: lowercase and snake_case forms of every camelCase key. */
const ALIASES: Record<string, DimensionKey> = Object.fromEntries(
  DIMENSION_KEYS.flatMap((key) => [
    [key.toLowerCase(), key],
    [key.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase(), key],
  ])
);

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
