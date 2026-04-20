export function focusAreaKey(
  dimension: string | null | undefined,
  slug: string | null | undefined
): string | null {
  if (!dimension) return null;
  return `${dimension}::${slug ?? ""}`;
}

export interface FocusAreaRow {
  name: string;
  dimension: string | null;
  knowledge_node_slug: string | null;
  status: string;
}

export interface RecentSessionRow {
  summary?: { focus_areas_worked_keys?: string[] } | null;
}

/**
 * Given a user's active/new focus areas and their last few session summaries,
 * return the names of focus areas that do NOT appear (by canonical key) in any
 * of the recent sessions' focus_areas_worked_keys. These are the "avoidance"
 * items surfaced to the coach.
 *
 * Rules:
 *  - Only 'new' and 'active' focus areas are considered. 'improving' means
 *    progress is happening; 'resolved' is done.
 *  - Focus areas with dimension=null are legacy pre-canonical-key rows and are
 *    skipped — they'll be superseded as the user touches them again.
 *  - Sessions that predate the keys-in-summary change contribute nothing (their
 *    focus_areas_worked_keys is missing). Acceptable degradation: the window
 *    rolls forward in ~3 sessions.
 */
export function computeNeglected(
  focusAreas: FocusAreaRow[],
  recentSessions: RecentSessionRow[]
): string[] {
  const workedKeys = new Set<string>();
  for (const s of recentSessions) {
    const keys = s.summary?.focus_areas_worked_keys ?? [];
    for (const k of keys) workedKeys.add(k);
  }

  return focusAreas
    .filter((f) => f.status === "new" || f.status === "active")
    .filter((f) => {
      const key = focusAreaKey(f.dimension, f.knowledge_node_slug);
      return key !== null && !workedKeys.has(key);
    })
    .map((f) => f.name);
}
