import { describe, it, expect } from "vitest";
import type { DrillEntry, DrillProgram, DrillSession } from "@/lib/drill-program-types";

// Pure session-matching logic extracted from SessionView.
function findSession(
  program: DrillProgram,
  intensity: DrillEntry["intensity"][number],
  context: DrillEntry["context"][number],
  timeMin: number
): DrillSession | undefined {
  return program.sessions.find(
    (s) => s.intensity === intensity && s.context === context && s.time_min === timeMin
  );
}

function resolveSessionDrills(program: DrillProgram, session: DrillSession): DrillEntry[] {
  const map = new Map<string, DrillEntry>(program.drills.map((d) => [d.id, d]));
  return session.drill_ids.map((id) => map.get(id)).filter((d): d is DrillEntry => !!d);
}

const makeDrill = (id: string, overrides: Partial<DrillEntry> = {}): DrillEntry => ({
  id,
  name: `Drill ${id}`,
  vault_ref: null,
  duration_min: 10,
  intensity: ["medium"],
  context: ["bag"],
  why_fits_you: "fits",
  cues: [],
  rounds_or_dose: "3x2min",
  ...overrides,
});

const baseProgram: DrillProgram = {
  generated_at: "2024-01-01T00:00:00Z",
  axis_values: {
    intensity: ["light", "medium", "heavy"],
    context: ["bag", "shadow", "gym", "mitts"],
    time_min: [10, 20, 30, 45],
  },
  drills: [makeDrill("d1"), makeDrill("d2"), makeDrill("d3")],
  sessions: [
    {
      intensity: "medium",
      context: "bag",
      time_min: 20,
      intro: "Session intro text",
      drill_ids: ["d1", "d2"],
    },
  ],
};

describe("SessionView matching logic", () => {
  it("finds the session matching all three axes", () => {
    const session = findSession(baseProgram, "medium", "bag", 20);
    expect(session).toBeDefined();
    expect(session?.intro).toBe("Session intro text");
  });

  it("returns undefined when no session matches", () => {
    expect(findSession(baseProgram, "heavy", "bag", 20)).toBeUndefined();
    expect(findSession(baseProgram, "medium", "shadow", 20)).toBeUndefined();
    expect(findSession(baseProgram, "medium", "bag", 10)).toBeUndefined();
  });

  it("resolves drill_ids to drills in order", () => {
    const session = findSession(baseProgram, "medium", "bag", 20)!;
    const drills = resolveSessionDrills(baseProgram, session);
    expect(drills).toHaveLength(2);
    expect(drills[0].id).toBe("d1");
    expect(drills[1].id).toBe("d2");
  });

  it("skips unresolvable drill_ids defensively", () => {
    const program: DrillProgram = {
      ...baseProgram,
      sessions: [
        {
          intensity: "medium",
          context: "bag",
          time_min: 20,
          intro: "intro",
          drill_ids: ["d1", "missing-id", "d2"],
        },
      ],
    };
    const session = findSession(program, "medium", "bag", 20)!;
    const drills = resolveSessionDrills(program, session);
    expect(drills).toHaveLength(2);
    expect(drills.map((d) => d.id)).toEqual(["d1", "d2"]);
  });
});
