import { describe, it, expect } from "vitest";
import { buildPickerPrompt, validateLLMPick } from "./today-drill-picker";
import type { DiagnosisInputs } from "./today-drill-types";
import type { DrillProgram, DrillEntry } from "./drill-program-types";

function makeDrill(id: string, name: string): DrillEntry {
  return {
    id,
    name,
    vault_ref: null,
    duration_min: 20,
    intensity: ["medium"],
    context: ["bag"],
    why_fits_you: `because ${name}`,
    cues: ["cue 1", "cue 2"],
    rounds_or_dose: "4x 2-min rounds",
  };
}

function makeProgram(drills: DrillEntry[]): DrillProgram {
  return {
    generated_at: "2026-05-07T00:00:00Z",
    axis_values: {
      intensity: ["light", "medium", "heavy"] as const,
      context: ["bag", "shadow", "gym", "mitts"] as const,
      time_min: [10, 20, 30, 45] as const,
    },
    drills,
    sessions: [],
  };
}

describe("buildPickerPrompt", () => {
  it("includes all drill ids in validDrillIds", () => {
    const inputs: DiagnosisInputs = {
      drillProgram: makeProgram([makeDrill("d1", "Jab"), makeDrill("d2", "Hook")]),
      recentClipHistory: null,
      neglectedFocusAreas: [],
      styleSummary: null,
    };
    const result = buildPickerPrompt(inputs);
    expect(result.validDrillIds).toEqual(["d1", "d2"]);
  });

  it("references the user's clip score trend in userPayload when present", () => {
    const inputs: DiagnosisInputs = {
      drillProgram: makeProgram([makeDrill("d1", "Jab")]),
      recentClipHistory: {
        windowDays: 14,
        totalClips: 10,
        trend: {
          last5Avg: { loading: 7, hipExplosion: 5, energyTransfer: 7, followThrough: 6, overall: 6.3 },
          prior5Avg: { loading: 7, hipExplosion: 7, energyTransfer: 7, followThrough: 7, overall: 7 },
        },
        mostRecent: { daysAgo: 1, summary: "good jab, hip late" },
      },
      neglectedFocusAreas: [],
      styleSummary: null,
    };
    const result = buildPickerPrompt(inputs);
    expect(result.userPayload).toContain("hipExplosion");
    expect(result.userPayload).toContain("totalClips");
  });

  it("references neglected focus areas in userPayload when present", () => {
    const inputs: DiagnosisInputs = {
      drillProgram: makeProgram([makeDrill("d1", "Jab")]),
      recentClipHistory: null,
      neglectedFocusAreas: ["lateral footwork", "guard discipline"],
      styleSummary: null,
    };
    const result = buildPickerPrompt(inputs);
    expect(result.userPayload).toContain("lateral footwork");
    expect(result.userPayload).toContain("guard discipline");
  });

  it("references styleSummary in userPayload when present", () => {
    const inputs: DiagnosisInputs = {
      drillProgram: makeProgram([makeDrill("d1", "Jab")]),
      recentClipHistory: null,
      neglectedFocusAreas: [],
      styleSummary: "aggressive inside fighter",
    };
    const result = buildPickerPrompt(inputs);
    expect(result.userPayload).toContain("aggressive inside fighter");
  });

  it("instructs the LLM to return strict JSON in systemPrompt", () => {
    const inputs: DiagnosisInputs = {
      drillProgram: makeProgram([makeDrill("d1", "Jab")]),
      recentClipHistory: null,
      neglectedFocusAreas: [],
      styleSummary: null,
    };
    const result = buildPickerPrompt(inputs);
    expect(result.systemPrompt).toContain("JSON");
    expect(result.systemPrompt).toContain("drill_id");
    expect(result.systemPrompt).toContain("diagnosis");
  });
});

describe("validateLLMPick", () => {
  const validIds = ["d1", "d2", "d3"];

  it("accepts a well-formed result with a valid drill_id", () => {
    const raw = { drill_id: "d2", diagnosis: "this targets your hip rotation" };
    const result = validateLLMPick(raw, validIds);
    expect(result).toEqual({
      status: "ok",
      drillId: "d2",
      diagnosis: "this targets your hip rotation",
    });
  });

  it("rejects a result with an unknown drill_id", () => {
    const raw = { drill_id: "d99", diagnosis: "..." };
    const result = validateLLMPick(raw, validIds);
    expect(result.status).toBe("invalid-drill");
  });

  it("rejects a result missing drill_id", () => {
    const raw = { diagnosis: "..." };
    const result = validateLLMPick(raw, validIds);
    expect(result.status).toBe("missing-fields");
  });

  it("rejects a result missing diagnosis", () => {
    const raw = { drill_id: "d1" };
    const result = validateLLMPick(raw, validIds);
    expect(result.status).toBe("missing-fields");
  });

  it("rejects null or non-object input", () => {
    expect(validateLLMPick(null, validIds).status).toBe("missing-fields");
    expect(validateLLMPick("string", validIds).status).toBe("missing-fields");
    expect(validateLLMPick(42, validIds).status).toBe("missing-fields");
  });

  it("rejects empty diagnosis string", () => {
    const raw = { drill_id: "d1", diagnosis: "" };
    const result = validateLLMPick(raw, validIds);
    expect(result.status).toBe("missing-fields");
  });
});
