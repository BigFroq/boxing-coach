// Axis values — single source of truth for the intensity/context/time taxonomy.
export const INTENSITY_VALUES = ["light", "medium", "heavy"] as const;
export const CONTEXT_VALUES = ["bag", "shadow", "gym", "mitts"] as const;
export const TIME_MIN_VALUES = [10, 20, 30, 45] as const;

export type Intensity = (typeof INTENSITY_VALUES)[number];
export type Context = (typeof CONTEXT_VALUES)[number];
export type TimeMin = (typeof TIME_MIN_VALUES)[number];

export const DEFAULT_INTENSITY: Intensity = "medium";
export const DEFAULT_CONTEXT: Context = "bag";
export const DEFAULT_TIME_MIN: TimeMin = 20;

// A single drill in the program's drill pool.
export type DrillEntry = {
  id: string;                  // stable identifier for cross-references in sessions
  name: string;
  vault_ref: string | null;    // slug from vault/drills/*.md, or null if invented by the LLM
  duration_min: number;        // approximate, for browse-mode filtering
  intensity: Intensity[];      // which intensity buckets this drill suits
  context: Context[];          // which contexts (bag, shadow, ...) this drill suits
  why_fits_you: string;        // 1-2 sentences grounding the drill in the user's profile
  cues: string[];              // 2-4 short cue lines
  rounds_or_dose: string;      // free-text dosage, e.g. "4x 2-min rounds, 30s rest"
};

// A pre-built session for a specific (intensity, context, time_min) cell.
export type DrillSession = {
  intensity: Intensity;
  context: Context;
  time_min: TimeMin;
  intro: string;               // 1 sentence framing the session
  drill_ids: string[];         // refs into DrillProgram.drills[].id
};

// The cached JSONB payload stored on style_profiles.drill_program.
export type DrillProgram = {
  generated_at: string;        // ISO timestamp
  axis_values: {
    intensity: typeof INTENSITY_VALUES;
    context: typeof CONTEXT_VALUES;
    time_min: typeof TIME_MIN_VALUES;
  };
  drills: DrillEntry[];
  sessions: DrillSession[];
};
