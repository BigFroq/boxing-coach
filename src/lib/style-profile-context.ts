import { DIMENSION_KEYS } from "./dimensions";

/** Prompt-facing labels for the 8 style dimensions.
 * These intentionally differ from DIMENSION_LABELS in fighter-profiles.ts which
 * uses "Ring IQ & Adaptation", "Output & Pressure", "Deception & Setup" for UI display.
 * The prompt-facing labels use "/" separators for brevity and readability in system prompts.
 */
const PROMPT_LABELS: Record<string, string> = {
  powerMechanics: "Power Mechanics",
  positionalReadiness: "Positional Readiness",
  rangeControl: "Range Control",
  defensiveIntegration: "Defensive Integration",
  ringIQ: "Ring IQ",
  outputPressure: "Output / Pressure",
  deceptionSetup: "Deception / Setup",
  killerInstinct: "Killer Instinct",
};

export interface StyleProfileInput {
  style_name?: string;
  dimension_scores?: Record<string, number>;
  matched_fighters?: Array<{
    name: string;
    overlappingDimensions?: string[];
  }>;
}

/**
 * Format a user's style-finder profile as a prompt block for the coach.
 * Returns an empty string if there are no dimension scores to inject.
 * Callers concatenate this block into the system prompt; empty means "skip".
 */
export function formatStyleProfileBlock(profile: StyleProfileInput | null): string {
  if (!profile) return "";
  const scores = profile.dimension_scores;
  if (!scores || Object.keys(scores).length === 0) return "";

  const lines: string[] = ["## Style Profile"];

  if (profile.style_name) {
    lines.push(`Style: ${profile.style_name}`);
  }

  lines.push("Dimension scores (0-100):");
  for (const key of DIMENSION_KEYS) {
    const label = PROMPT_LABELS[key] ?? key;
    const value = typeof scores[key] === "number" ? scores[key] : 0;
    lines.push(`- ${label}: ${value}`);
  }

  const top = profile.matched_fighters?.[0];
  if (top) {
    const overlap = top.overlappingDimensions ?? [];
    const suffix = overlap.length > 0 ? ` (overlapping dimensions: ${overlap.join(", ")})` : "";
    lines.push(`Top matched fighter: ${top.name}${suffix}`);
  }

  return lines.join("\n");
}
