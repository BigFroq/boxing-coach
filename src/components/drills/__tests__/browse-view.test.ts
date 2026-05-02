import { describe, it, expect } from "vitest";
import type { DrillEntry, DrillProgram } from "@/lib/drill-program-types";

// Pure filtering logic extracted from BrowseView — tested independently of DOM.
function filterDrills(
  program: DrillProgram,
  intensity: DrillEntry["intensity"][number],
  context: DrillEntry["context"][number],
  timeMin: number
): DrillEntry[] {
  return program.drills
    .filter(
      (d) =>
        d.intensity.includes(intensity) &&
        d.context.includes(context) &&
        d.duration_min <= timeMin + 5
    )
    .sort((a, b) => a.duration_min - b.duration_min);
}

const makeDrill = (overrides: Partial<DrillEntry> & { id: string }): DrillEntry => ({
  name: "Test Drill",
  vault_ref: null,
  duration_min: 10,
  intensity: ["medium"],
  context: ["bag"],
  why_fits_you: "fits",
  cues: [],
  rounds_or_dose: "3x2min",
  ...overrides,
});

const emptyProgram: DrillProgram = {
  generated_at: "2024-01-01T00:00:00Z",
  axis_values: {
    intensity: ["light", "medium", "heavy"],
    context: ["bag", "shadow", "gym", "mitts"],
    time_min: [10, 20, 30, 45],
  },
  drills: [],
  sessions: [],
};

describe("BrowseView filter logic", () => {
  it("returns drills matching all three axes", () => {
    const program = {
      ...emptyProgram,
      drills: [
        makeDrill({ id: "a", intensity: ["medium"], context: ["bag"], duration_min: 10 }),
        makeDrill({ id: "b", intensity: ["heavy"], context: ["bag"], duration_min: 10 }),
        makeDrill({ id: "c", intensity: ["medium"], context: ["shadow"], duration_min: 10 }),
      ],
    };
    const result = filterDrills(program, "medium", "bag", 20);
    expect(result.map((d) => d.id)).toEqual(["a"]);
  });

  it("excludes drills where duration_min > timeMin + 5", () => {
    const program = {
      ...emptyProgram,
      drills: [
        makeDrill({ id: "short", intensity: ["light"], context: ["shadow"], duration_min: 14 }),
        makeDrill({ id: "exact", intensity: ["light"], context: ["shadow"], duration_min: 15 }),
        makeDrill({ id: "over", intensity: ["light"], context: ["shadow"], duration_min: 16 }),
      ],
    };
    const result = filterDrills(program, "light", "shadow", 10);
    expect(result.map((d) => d.id)).toEqual(["short", "exact"]);
  });

  it("sorts results by duration_min ascending", () => {
    const program = {
      ...emptyProgram,
      drills: [
        makeDrill({ id: "long", intensity: ["heavy"], context: ["mitts"], duration_min: 20 }),
        makeDrill({ id: "short", intensity: ["heavy"], context: ["mitts"], duration_min: 10 }),
        makeDrill({ id: "mid", intensity: ["heavy"], context: ["mitts"], duration_min: 15 }),
      ],
    };
    const result = filterDrills(program, "heavy", "mitts", 45);
    expect(result.map((d) => d.id)).toEqual(["short", "mid", "long"]);
  });

  it("returns empty array when no drills match", () => {
    const program = {
      ...emptyProgram,
      drills: [
        makeDrill({ id: "a", intensity: ["heavy"], context: ["bag"], duration_min: 10 }),
      ],
    };
    const result = filterDrills(program, "light", "bag", 20);
    expect(result).toHaveLength(0);
  });

  it("includes drill whose intensity array contains the selected value (multi-intensity drill)", () => {
    const program = {
      ...emptyProgram,
      drills: [
        makeDrill({ id: "multi", intensity: ["light", "medium", "heavy"], context: ["gym"], duration_min: 10 }),
      ],
    };
    expect(filterDrills(program, "light", "gym", 20)).toHaveLength(1);
    expect(filterDrills(program, "medium", "gym", 20)).toHaveLength(1);
    expect(filterDrills(program, "heavy", "gym", 20)).toHaveLength(1);
  });
});
