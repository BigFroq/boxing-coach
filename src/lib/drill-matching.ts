export interface DrillPrescriptionLike {
  id: string;
  drill_name: string;
}

export function normalizeDrillName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .join(" ");
}

/**
 * Match a reported drill name to the most likely pending prescription.
 * Strategy: normalize both, prefer exact match, then bidirectional substring containment.
 */
export function matchReportedDrill<T extends DrillPrescriptionLike>(
  reportedName: string,
  pending: T[]
): T | null {
  const reported = normalizeDrillName(reportedName);
  if (!reported) return null;
  if (pending.length === 0) return null;

  // 1. Exact normalized match wins.
  for (const p of pending) {
    if (normalizeDrillName(p.drill_name) === reported) return p;
  }

  // 2. Substring containment either direction (handles "barbell" → "barbell punch"
  //    and "the lateral foot push drill i was shown" → "lateral foot push drill").
  for (const p of pending) {
    const norm = normalizeDrillName(p.drill_name);
    if (!norm) continue;
    if (reported.includes(norm) || norm.includes(reported)) return p;
  }

  return null;
}
