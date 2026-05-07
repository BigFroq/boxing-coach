// Pure logic for Today's Drill: build the LLM prompt, validate the LLM's
// response. No DB, no LLM, no Date.now() — all inputs explicit. Both halves
// are exported separately so the API route can call them around the LLM
// boundary in today-drill-llm.ts.

import type {
  DiagnosisInputs,
  PromptResult,
  ValidationResult,
} from "./today-drill-types";

const SYSTEM_PROMPT = `You are picking the single best drill for a boxer to do today, given their data.

You will receive:
- drills: an array of available drills (each with id, name, why_fits_you, cues, rounds_or_dose, duration_min, intensity, context)
- recentClipHistory: their score trends (Loading, Hip Explosion, Energy Transfer, Follow Through). May be null.
- neglectedFocusAreas: areas they haven't worked recently. May be empty.
- styleSummary: brief description of their fighting style. May be null.

Return strict JSON:
{
  "drill_id": "<id from drills[]>",
  "diagnosis": "1-2 sentences explaining why THIS drill TODAY based on their data"
}

The drill_id MUST be one of the ids in the drills array. The diagnosis should reference the user's data — e.g. "Your hip explosion has dropped from 7.0 to 5.0 over your last 5 clips — this targets the loading-phase weight shift you've been skipping."

If the user has no clip data, ground the diagnosis in their style or neglected areas instead.

Be honest, specific, and concrete. Don't pad. Don't recommend a drill that doesn't exist in the array.`;

export function buildPickerPrompt(inputs: DiagnosisInputs): PromptResult {
  const validDrillIds = inputs.drillProgram.drills.map((d) => d.id);

  const userPayload = JSON.stringify(
    {
      drills: inputs.drillProgram.drills.map((d) => ({
        id: d.id,
        name: d.name,
        why_fits_you: d.why_fits_you,
        cues: d.cues,
        rounds_or_dose: d.rounds_or_dose,
        duration_min: d.duration_min,
        intensity: d.intensity,
        context: d.context,
      })),
      recentClipHistory: inputs.recentClipHistory,
      neglectedFocusAreas: inputs.neglectedFocusAreas,
      styleSummary: inputs.styleSummary,
    },
    null,
    2
  );

  return {
    systemPrompt: SYSTEM_PROMPT,
    userPayload,
    validDrillIds,
  };
}

export function validateLLMPick(
  raw: unknown,
  validDrillIds: string[]
): ValidationResult {
  if (typeof raw !== "object" || raw === null) {
    return { status: "missing-fields", reason: "not an object" };
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.drill_id !== "string" || r.drill_id.length === 0) {
    return { status: "missing-fields", reason: "drill_id missing or empty" };
  }
  if (typeof r.diagnosis !== "string" || r.diagnosis.length === 0) {
    return { status: "missing-fields", reason: "diagnosis missing or empty" };
  }
  if (!validDrillIds.includes(r.drill_id)) {
    return {
      status: "invalid-drill",
      reason: `drill_id "${r.drill_id}" not in pool`,
    };
  }
  return { status: "ok", drillId: r.drill_id, diagnosis: r.diagnosis };
}
