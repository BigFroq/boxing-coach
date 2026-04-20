import { DIMENSION_KEYS } from "./dimensions";
import { DIMENSION_LABELS } from "@/data/fighter-profiles";

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
    const label = DIMENSION_LABELS[key as keyof typeof DIMENSION_LABELS] ?? key;
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
