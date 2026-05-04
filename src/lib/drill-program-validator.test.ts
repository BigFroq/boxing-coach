import { describe, it, expect } from "vitest";
import { validateDrillProgram } from "./drill-program-validator";
import { INTENSITY_VALUES, CONTEXT_VALUES, TIME_MIN_VALUES } from "./drill-program-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDrill(overrides: Record<string, unknown> = {}) {
  return {
    id: "jab-extension",
    name: "Jab Extension",
    vault_ref: "barbell-punch",
    duration_min: 15,
    intensity: ["medium"],
    context: ["bag"],
    why_fits_you: "Develops your power mechanics.",
    cues: ["Extend fully", "Snap back"],
    rounds_or_dose: "4x 2-min rounds",
    ...overrides,
  };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    intensity: "medium",
    context: "bag",
    time_min: 20,
    intro: "A focused bag session.",
    drill_ids: ["jab-extension"],
    ...overrides,
  };
}

/** Build a full 48-cell session grid for the happy-path test. */
function allSessions(drillId: string) {
  const sessions = [];
  for (const intensity of INTENSITY_VALUES) {
    for (const context of CONTEXT_VALUES) {
      for (const time_min of TIME_MIN_VALUES) {
        sessions.push({ intensity, context, time_min, intro: "Session intro.", drill_ids: [drillId] });
      }
    }
  }
  return sessions;
}

const ALLOWED = new Set(["barbell-punch", "hip-rotation-drill"]);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("validateDrillProgram", () => {
  it("happy path: valid program with 48 sessions, all vault refs valid — no warnings", () => {
    const raw = {
      generated_at: "2026-05-01T00:00:00.000Z",
      drills: [makeDrill()],
      sessions: allSessions("jab-extension"),
    };
    const { program, warnings } = validateDrillProgram(raw, ALLOWED);
    expect(warnings).toHaveLength(0);
    expect(program.drills).toHaveLength(1);
    expect(program.drills[0].vault_ref).toBe("barbell-punch");
    expect(program.sessions).toHaveLength(48);
    // generated_at is set by the route; validator always returns the epoch sentinel
    expect(program.generated_at).toBe(new Date(0).toISOString());
  });

  it("vault_ref not in allowedSlugs → set to null, drill kept", () => {
    const raw = {
      drills: [makeDrill({ vault_ref: "unknown-slug" })],
      sessions: [],
    };
    const { program, warnings } = validateDrillProgram(raw, ALLOWED);
    expect(program.drills).toHaveLength(1);
    expect(program.drills[0].vault_ref).toBeNull();
    expect(program.drills[0].id).toBe("jab-extension");
    // fewer than 48 cells → one warning about coverage
    expect(warnings.some((w) => w.includes("missing"))).toBe(true);
  });

  it("drill missing id → drill dropped", () => {
    const raw = {
      drills: [makeDrill({ id: undefined }), makeDrill({ id: "good-drill" })],
      sessions: [],
    };
    const { program } = validateDrillProgram(raw, ALLOWED);
    expect(program.drills).toHaveLength(1);
    expect(program.drills[0].id).toBe("good-drill");
  });

  it("drill with non-string id → drill dropped", () => {
    const raw = {
      drills: [makeDrill({ id: 42 })],
      sessions: [],
    };
    const { program } = validateDrillProgram(raw, ALLOWED);
    expect(program.drills).toHaveLength(0);
  });

  it("session references unknown drill_id → that id filtered from session.drill_ids", () => {
    const raw = {
      drills: [makeDrill()],
      sessions: [
        makeSession({ drill_ids: ["jab-extension", "nonexistent-drill"] }),
        ...allSessions("jab-extension").slice(1),
      ],
    };
    const { program } = validateDrillProgram(raw, ALLOWED);
    const firstSession = program.sessions.find(
      (s) => s.intensity === "medium" && s.context === "bag" && s.time_min === 20
    );
    expect(firstSession?.drill_ids).toEqual(["jab-extension"]);
  });

  it("session has unknown intensity → session dropped entirely", () => {
    const raw = {
      drills: [makeDrill()],
      sessions: [makeSession({ intensity: "extreme" })],
    };
    const { program } = validateDrillProgram(raw, ALLOWED);
    expect(program.sessions).toHaveLength(0);
  });

  it("session has unknown context → session dropped entirely", () => {
    const raw = {
      drills: [makeDrill()],
      sessions: [makeSession({ context: "street" })],
    };
    const { program } = validateDrillProgram(raw, ALLOWED);
    expect(program.sessions).toHaveLength(0);
  });

  it("session has unknown time_min → session dropped entirely", () => {
    const raw = {
      drills: [makeDrill()],
      sessions: [makeSession({ time_min: 60 })],
    };
    const { program } = validateDrillProgram(raw, ALLOWED);
    expect(program.sessions).toHaveLength(0);
  });

  it("fewer than 48 cells → warning emitted, program still returned", () => {
    const raw = {
      drills: [makeDrill()],
      sessions: [makeSession()], // only 1 of 48 cells
    };
    const { program, warnings } = validateDrillProgram(raw, ALLOWED);
    expect(program.sessions).toHaveLength(1);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/missing 47/);
  });

  it("empty drills array → returns empty program, no crash", () => {
    const raw = { drills: [], sessions: [] };
    const { program, warnings } = validateDrillProgram(raw, ALLOWED);
    expect(program.drills).toHaveLength(0);
    expect(program.sessions).toHaveLength(0);
    // 48 missing cells warning expected
    expect(warnings.some((w) => w.includes("missing"))).toBe(true);
  });

  it("filters out invalid intensity/context values from drill arrays", () => {
    const raw = {
      drills: [
        makeDrill({ intensity: ["medium", "extreme"], context: ["bag", "moon"] }),
      ],
      sessions: [],
    };
    const { program } = validateDrillProgram(raw, ALLOWED);
    expect(program.drills[0].intensity).toEqual(["medium"]);
    expect(program.drills[0].context).toEqual(["bag"]);
  });

  it("raw is not an object → returns empty program with a warning", () => {
    const { program, warnings } = validateDrillProgram("not an object", ALLOWED);
    expect(program.drills).toHaveLength(0);
    expect(program.sessions).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/not a JSON object/);
  });

  it("drops drill_ids from sessions where drill.intensity does not include session.intensity", () => {
    const raw = {
      drills: [
        makeDrill({ id: "light-only", intensity: ["light"], context: ["bag"] }),
        makeDrill({ id: "heavy-drill", intensity: ["heavy"], context: ["bag"] }),
      ],
      sessions: [
        makeSession({ intensity: "heavy", context: "bag", time_min: 10, drill_ids: ["light-only", "heavy-drill"] }),
      ],
    };
    const { program } = validateDrillProgram(raw, ALLOWED);
    expect(program.sessions[0].drill_ids).toEqual(["heavy-drill"]);
  });

  it("drops drill_ids from sessions where drill.context does not include session.context", () => {
    const raw = {
      drills: [
        makeDrill({ id: "shadow-only", intensity: ["medium"], context: ["shadow"] }),
        makeDrill({ id: "bag-drill", intensity: ["medium"], context: ["bag"] }),
      ],
      sessions: [
        makeSession({ intensity: "medium", context: "bag", time_min: 10, drill_ids: ["shadow-only", "bag-drill"] }),
      ],
    };
    const { program } = validateDrillProgram(raw, ALLOWED);
    expect(program.sessions[0].drill_ids).toEqual(["bag-drill"]);
  });

  it("emits a warning when a drill in pool is referenced by zero sessions", () => {
    const raw = {
      drills: [
        makeDrill({ id: "used", intensity: ["medium"], context: ["bag"] }),
        makeDrill({ id: "orphan", intensity: ["medium"], context: ["bag"] }),
      ],
      sessions: [
        makeSession({ intensity: "medium", context: "bag", time_min: 10, drill_ids: ["used"] }),
      ],
    };
    const { warnings } = validateDrillProgram(raw, ALLOWED);
    expect(warnings.some((w) => w.toLowerCase().includes("orphan"))).toBe(true);
  });

  it("drops drill_ids whose drill.duration_min exceeds session.time_min + 5", () => {
    const raw = {
      drills: [
        makeDrill({ id: "fits", duration_min: 8, intensity: ["medium"], context: ["bag"] }),
        makeDrill({ id: "borderline", duration_min: 14, intensity: ["medium"], context: ["bag"] }),
        makeDrill({ id: "way-too-long", duration_min: 17, intensity: ["medium"], context: ["bag"] }),
      ],
      sessions: [
        makeSession({ intensity: "medium", context: "bag", time_min: 10, drill_ids: ["fits", "borderline", "way-too-long"] }),
      ],
    };
    const { program } = validateDrillProgram(raw, ALLOWED);
    // borderline (14) ≤ 10+5; way-too-long (17) > 10+5 → dropped
    expect(program.sessions[0].drill_ids).toEqual(["fits", "borderline"]);
  });

  it("does not warn about orphan drills when every drill is referenced", () => {
    const raw = {
      drills: [
        makeDrill({ id: "a", intensity: ["medium"], context: ["bag"] }),
        makeDrill({ id: "b", intensity: ["medium"], context: ["bag"] }),
      ],
      sessions: [
        makeSession({ intensity: "medium", context: "bag", time_min: 10, drill_ids: ["a", "b"] }),
      ],
    };
    const { warnings } = validateDrillProgram(raw, ALLOWED);
    expect(warnings.some((w) => w.toLowerCase().includes("orphan"))).toBe(false);
  });
});
