export interface FocusAreaWithKey {
  id: string;
  dimension: string | null;
  knowledge_node_slug: string | null;
}

export interface SessionLite {
  created_at: string;
  summary: { focus_areas_worked_keys?: string[] } | null | undefined;
}

/**
 * For each focus area, return the ISO timestamp of the most recent session
 * whose summary.focus_areas_worked_keys contains the focus area's canonical
 * `dimension::slug` key. Returns null for focus areas that were never worked
 * or that are legacy (dimension === null).
 */
export function computeLastWorkedMap(
  focusAreas: FocusAreaWithKey[],
  sessions: SessionLite[]
): Record<string, string | null> {
  // Build session list sorted newest-first so the first match is the latest.
  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const result: Record<string, string | null> = {};
  for (const area of focusAreas) {
    if (!area.dimension) {
      result[area.id] = null;
      continue;
    }
    const key = `${area.dimension}::${area.knowledge_node_slug ?? ""}`;
    const hit = sortedSessions.find((s) => {
      const keys = s.summary?.focus_areas_worked_keys ?? [];
      return keys.includes(key);
    });
    result[area.id] = hit ? hit.created_at : null;
  }
  return result;
}
