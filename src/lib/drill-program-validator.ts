import type { DrillProgram, DrillEntry, DrillSession, Intensity, Context, TimeMin } from "./drill-program-types";
import { INTENSITY_VALUES, CONTEXT_VALUES, TIME_MIN_VALUES } from "./drill-program-types";

export type ValidatorResult = {
  program: DrillProgram;
  warnings: string[];
};

const ALLOWED_INTENSITIES = new Set<string>(INTENSITY_VALUES);
const ALLOWED_CONTEXTS = new Set<string>(CONTEXT_VALUES);
const ALLOWED_TIME_MINS = new Set<number>(TIME_MIN_VALUES);

const EXPECTED_CELLS = INTENSITY_VALUES.length * CONTEXT_VALUES.length * TIME_MIN_VALUES.length; // 48

/**
 * Validate and sanitise a raw LLM-emitted DrillProgram.
 *
 * - vault_ref not in allowedSlugs → set to null (drill kept).
 * - drill missing id (or non-string id) → drill dropped.
 * - session.drill_ids containing unknown ids → those ids filtered out.
 * - session with bogus intensity/context/time_min axis values → session dropped.
 * - fewer than 48 (intensity × context × time_min) cells → warning emitted.
 *
 * If `raw` is not an object, returns an empty program with a warning instead of throwing.
 */
export function validateDrillProgram(raw: unknown, allowedSlugs: Set<string>): ValidatorResult {
  const warnings: string[] = [];

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    warnings.push("LLM output is not a JSON object — returning empty program.");
    return { program: emptyProgram(), warnings };
  }

  const obj = raw as Record<string, unknown>;

  // --- Drills ---
  const rawDrills = Array.isArray(obj.drills) ? (obj.drills as unknown[]) : [];
  const validDrills: DrillEntry[] = [];

  for (const item of rawDrills) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const d = item as Record<string, unknown>;

    if (typeof d.id !== "string" || d.id.trim() === "") continue; // drop — no id

    const vaultRef =
      typeof d.vault_ref === "string" && allowedSlugs.has(d.vault_ref) ? d.vault_ref : null;

    validDrills.push({
      id: d.id as string,
      name: typeof d.name === "string" ? d.name : "",
      vault_ref: vaultRef,
      duration_min: typeof d.duration_min === "number" ? d.duration_min : 0,
      intensity: Array.isArray(d.intensity)
        ? (d.intensity as unknown[]).filter((v): v is Intensity =>
            typeof v === "string" && ALLOWED_INTENSITIES.has(v))
        : [],
      context: Array.isArray(d.context)
        ? (d.context as unknown[]).filter((v): v is Context =>
            typeof v === "string" && ALLOWED_CONTEXTS.has(v))
        : [],
      why_fits_you: typeof d.why_fits_you === "string" ? d.why_fits_you : "",
      cues: Array.isArray(d.cues) ? (d.cues as string[]) : [],
      rounds_or_dose: typeof d.rounds_or_dose === "string" ? d.rounds_or_dose : "",
    });
  }

  const validDrillIds = new Set(validDrills.map((d) => d.id));
  const drillById = new Map(validDrills.map((d) => [d.id, d]));

  // --- Sessions ---
  const rawSessions = Array.isArray(obj.sessions) ? (obj.sessions as unknown[]) : [];
  const validSessions: DrillSession[] = [];
  const coveredTuples = new Set<string>();

  for (const item of rawSessions) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const s = item as Record<string, unknown>;

    if (!ALLOWED_INTENSITIES.has(s.intensity as string)) continue;
    if (!ALLOWED_CONTEXTS.has(s.context as string)) continue;
    if (!ALLOWED_TIME_MINS.has(s.time_min as number)) continue;

    const sessionIntensity = s.intensity as Intensity;
    const sessionContext = s.context as Context;

    // Tag-consistency filter: drop any drill_id whose drill.intensity[]/context[]
    // doesn't include the session's own intensity/context. Prevents the LLM from
    // stuffing light/shadow drills into heavy/bag sessions, which makes Session
    // and Browse modes return divergent results for the same filter.
    const filteredIds = Array.isArray(s.drill_ids)
      ? (s.drill_ids as unknown[]).filter((id): id is string => {
          if (typeof id !== "string" || !validDrillIds.has(id)) return false;
          const drill = drillById.get(id);
          if (!drill) return false;
          return drill.intensity.includes(sessionIntensity)
              && drill.context.includes(sessionContext);
        })
      : [];

    coveredTuples.add(`${s.intensity}|${s.context}|${s.time_min}`);

    validSessions.push({
      intensity: sessionIntensity,
      context: sessionContext,
      time_min: s.time_min as TimeMin,
      intro: typeof s.intro === "string" ? s.intro : "",
      drill_ids: filteredIds,
    });
  }

  // --- Orphan-drill warning ---
  const referencedDrillIds = new Set<string>();
  for (const session of validSessions) {
    for (const id of session.drill_ids) referencedDrillIds.add(id);
  }
  const orphans = validDrills.filter((d) => !referencedDrillIds.has(d.id));
  if (orphans.length > 0) {
    warnings.push(
      `Drill pool has ${orphans.length} orphan drill(s) never referenced by any session: ${orphans.map((d) => d.id).join(", ")}`
    );
  }

  if (coveredTuples.size < EXPECTED_CELLS) {
    const missing = EXPECTED_CELLS - coveredTuples.size;
    warnings.push(`Cell coverage: ${coveredTuples.size}/${EXPECTED_CELLS} — missing ${missing} (intensity × context × time_min) combinations.`);
    console.warn(`[drill-program-validator] ${EXPECTED_CELLS - coveredTuples.size} axis cells missing from generated program.`);
  }

  const program: DrillProgram = {
    // generated_at is set by the route after validation. The validator returns
    // the epoch as a sentinel; tests that exercise the validator in isolation
    // should not rely on this field.
    generated_at: new Date(0).toISOString(),
    axis_values: {
      intensity: [...INTENSITY_VALUES],
      context: [...CONTEXT_VALUES],
      time_min: [...TIME_MIN_VALUES],
    },
    drills: validDrills,
    sessions: validSessions,
  };

  return { program, warnings };
}

function emptyProgram(): DrillProgram {
  return {
    generated_at: new Date(0).toISOString(),
    axis_values: {
      intensity: [...INTENSITY_VALUES],
      context: [...CONTEXT_VALUES],
      time_min: [...TIME_MIN_VALUES],
    },
    drills: [],
    sessions: [],
  };
}
